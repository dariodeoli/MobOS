#!/usr/bin/env node

// Prueba de restauración de backups. Verifica que un pg_dump -Fc de la base
// activa se restaura en un cluster PostgreSQL nuevo y que los conteos del
// tenant sintético coinciden (API vs psql del origen vs psql del restaurado).
//
// Uso: node backend/tests/backup-restore.mjs <baseUrl> <adminToken> <pgBin> <databaseUrl> <backupDir>

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const [baseUrl, adminToken, pgBin, databaseUrl, backupDir] = process.argv.slice(2)
if (!baseUrl || !adminToken || !pgBin || !databaseUrl || !backupDir) {
  console.error('Uso: backup-restore.mjs <baseUrl> <adminToken> <pgBin> <databaseUrl> <backupDir>')
  process.exit(2)
}

const bin = (name) => path.join(pgBin, name)
const TENANT = 'tenant-a-it'
const TENANT_B = 'tenant-b-it'

function fail(message) {
  console.error('backup-restore: FALLÓ - ' + message)
  process.exit(1)
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...opts })
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || '').split('\n').slice(-8).join('\n')
    throw new Error(`${command} ${args.join(' ')} salió con ${result.status}\n${tail}`)
  }
  return (result.stdout || '').trim()
}

// pg_ctl deja al postmaster heredando los pipes de spawnSync, lo que bloquea
// a spawnSync aun después de que pg_ctl termina. Se ignora su stdio.
const pgCtl = (...args) => run(bin('pg_ctl'), args, { stdio: 'ignore' })

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('puerto libre no disponible'))
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

async function apiCount(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': TENANT } })
  if (response.status !== 200) fail(`${pathname} devolvió HTTP ${response.status}`)
  const rows = await response.json()
  if (!Array.isArray(rows)) fail(`${pathname} no devolvió una lista`)
  return rows.filter((row) => row.tenantId === TENANT).length
}

const psqlCount = (url, sql) => Number(run(bin('psql'), [url, '-At', '-c', sql]))

const cleanupCluster = (dataDir) => {
  spawnSync(bin('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
  fs.rmSync(dataDir, { recursive: true, force: true })
}

async function main() {
  fs.mkdirSync(backupDir, { recursive: true })

  // 1. Conteos por API y por psql sobre la base activa. El listado por defecto
  // de la API excluye los pedidos cancelados (anulados), así que la
  // comparación usa los cancelados solo para la restauración.
  const apiProducts = await apiCount('/api/products')
  const apiOrders = await apiCount('/api/orders')
  const sourceProducts = psqlCount(databaseUrl, `SELECT COUNT(*) FROM "Product" WHERE "tenantId" = '${TENANT}';`)
  const sourceOrders = psqlCount(databaseUrl, `SELECT COUNT(*) FROM "Order" WHERE "tenantId" = '${TENANT}';`)
  const sourceActiveOrders = psqlCount(databaseUrl, `SELECT COUNT(*) FROM "Order" WHERE "tenantId" = '${TENANT}' AND "status" <> 'CANCELLED';`)
  if (apiProducts !== sourceProducts) fail(`API devolvió ${apiProducts} productos pero la base tiene ${sourceProducts}`)
  if (apiOrders !== sourceActiveOrders) fail(`API devolvió ${apiOrders} órdenes activas pero la base tiene ${sourceActiveOrders}`)

  // 2. pg_dump -Fc de la base activa.
  const dumpPath = path.join(backupDir, `backup-restore-${Date.now()}.dump`)
  run(bin('pg_dump'), ['--format=custom', `--file=${dumpPath}`, databaseUrl])
  if (!fs.existsSync(dumpPath) || fs.statSync(dumpPath).size === 0) fail('el dump quedó vacío')

  // 3. Cluster NUEVO con initdb en un puerto libre y restauración. El cluster
  // vive debajo de backupDir (dentro del RUN_ROOT del arnés) para que la
  // limpieza del arnés siga cubriendo solo su directorio temporal.
  const restorePort = await freePort()
  const dataDir = fs.mkdtempSync(path.join(backupDir, 'restore-cluster-'))
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-'))
  const restoreUrl = `postgresql://postgres@127.0.0.1:${restorePort}/mobos_restore`
  let clusterStarted = false
  try {
    run(bin('initdb'), ['-D', dataDir, '--username=postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'])
    pgCtl('-D', dataDir, '-o', `-h 127.0.0.1 -p ${restorePort} -k ${socketDir}`, '-w', 'start')
    clusterStarted = true
    run(bin('createdb'), ['-h', '127.0.0.1', '-p', String(restorePort), '-U', 'postgres', 'mobos_restore'])
    run(bin('pg_restore'), ['--clean', '--if-exists', `--dbname=${restoreUrl}`, dumpPath])

    // 4. Conteos por psql sobre el restaurado y comparación.
    const restoredProducts = psqlCount(restoreUrl, `SELECT COUNT(*) FROM "Product" WHERE "tenantId" = '${TENANT}';`)
    const restoredOrders = psqlCount(restoreUrl, `SELECT COUNT(*) FROM "Order" WHERE "tenantId" = '${TENANT}';`)
    const foreignProducts = psqlCount(restoreUrl, `SELECT COUNT(*) FROM "Product" WHERE "tenantId" = '${TENANT_B}';`)
    const seededRow = psqlCount(restoreUrl, `SELECT COUNT(*) FROM "Product" WHERE "id" = 'prod-a-order-it';`)
    if (restoredProducts !== sourceProducts) fail(`restaurado: ${restoredProducts} productos vs ${sourceProducts} del origen`)
    if (restoredOrders !== sourceOrders) fail(`restaurado: ${restoredOrders} órdenes vs ${sourceOrders} del origen`)
    if (foreignProducts < 1) fail('el dump no conservó los datos del otro tenant')
    if (seededRow !== 1) fail('falta una fila sintética conocida en el restaurado')
  } finally {
    if (clusterStarted) cleanupCluster(dataDir)
    else fs.rmSync(dataDir, { recursive: true, force: true })
    fs.rmSync(dumpPath, { force: true })
    fs.rmSync(socketDir, { recursive: true, force: true })
  }

  console.log(`backup-restore: OK (${sourceProducts} productos, ${sourceOrders} órdenes restaurados e idénticos).`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
