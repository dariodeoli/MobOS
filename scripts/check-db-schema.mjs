// Conciliación base ↔ modelo: compara la base apuntada por DATABASE_URL contra
// backend/prisma/schema.prisma y falla si hay diferencias (columnas que faltan,
// tipos, nullability, índices). Es la red que evita el error de clase: una
// migración con CREATE TABLE IF NOT EXISTS que se vuelve no-op y deja la base
// sin lo que el código espera (clientes, pedidos, stock, inventario, etc.).
//
// Uso:  node scripts/check-db-schema.mjs
// Sale 0 cuando la base coincide con el modelo; sale 1 mostrando el SQL que
// falta aplicar.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = resolve(raiz, 'backend')
const schema = resolve(backend, 'prisma/schema.prisma')
const envFile = resolve(backend, '.env')

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (!existsSync(envFile)) return ''
  const linea = readFileSync(envFile, 'utf8').split('\n').find(item => item.startsWith('DATABASE_URL='))
  return linea ? linea.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '') : ''
}

const url = databaseUrl()
if (!url) {
  console.error('check-db-schema: falta DATABASE_URL (definila por entorno o en backend/.env).')
  process.exit(1)
}

let diff = ''
try {
  diff = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', schema, '--script'], { cwd: backend, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] })
} catch (error) {
  console.error('check-db-schema: no se pudo comparar la base con el modelo.')
  console.error(String(error?.stderr || error?.message || error).trim())
  process.exit(1)
}

const pendiente = diff.split('\n').filter(linea => linea.trim() && !linea.trim().startsWith('--')).join('\n').trim()
if (!pendiente) {
  console.log('check-db-schema: la base coincide con prisma/schema.prisma.')
  process.exit(0)
}

console.error('check-db-schema: la base NO coincide con el modelo. SQL pendiente:')
console.error(pendiente)
console.error('\nAgregá una migración correctiva (aditiva e idempotente, con IF NOT EXISTS) y volvé a correr este chequeo.')
process.exit(1)
