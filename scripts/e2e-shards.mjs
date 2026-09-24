#!/usr/bin/env node
// Sharding balanceado y determinista de la suite e2e (#245).
//
// Playwright reparte los shards por archivo con una heurística que deja cargas
// muy dispares (135/73/99 con 3 shards). Acá la distribución se calcula una
// vez contando los tests reales por archivo, se versiona en `e2e/sharding.json`
// y el workflow corre los archivos de cada shard. La guarda de
// `src/lib/ciHarness.test.js` exige que estén todos y balanceados.
//
// Uso:
//   node scripts/e2e-shards.mjs --generar     recalcula e2e/sharding.json
//   node scripts/e2e-shards.mjs --shard 1     imprime los archivos del shard 1
//   node scripts/e2e-shards.mjs --check       valida (sale 1 si algo no cierra)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const DISTRIBUCION = join(RAIZ, 'e2e/sharding.json')
export const TOTAL_SHARDS = 3
// El shard más cargado no puede superar 25% del promedio.
export const TOLERANCIA = 1.25

/** Cantidad de tests por archivo según el listado real de Playwright (respeta
 *  los proyectos y sus testMatch: lo que no corre no entra en la cuenta). */
export function testsPorArchivo() {
  const salida = execFileSync(
    'node',
    [join(RAIZ, 'node_modules/.bin/playwright'), 'test', '--list', '--reporter=json'],
    { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const json = JSON.parse(salida.slice(salida.indexOf('{')))
  const porArchivo = new Map()
  const recorrer = (suite) => {
    for (const spec of suite.specs || []) {
      const archivo = String(spec.file || '').replace(/^.*\/e2e\//, '')
      if (archivo) porArchivo.set(archivo, (porArchivo.get(archivo) || 0) + 1)
    }
    for (const hija of suite.suites || []) recorrer(hija)
  }
  for (const suite of json.suites || []) recorrer(suite)
  return porArchivo
}

/** Reparte los archivos (más pesados primero) al shard menos cargado. */
export function calcularDistribucion(porArchivo, total = TOTAL_SHARDS) {
  const shards = Array.from({ length: total }, () => ({ archivos: [], tests: 0 }))
  const entradas = [...porArchivo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  for (const [archivo, tests] of entradas) {
    const destino = shards.reduce((min, shard) => (shard.tests < min.tests ? shard : min), shards[0])
    destino.archivos.push(archivo)
    destino.tests += tests
  }
  for (const shard of shards) shard.archivos.sort()
  return { total, shards, generado: new Date().toISOString() }
}

/** Problemas de una distribución; vacío = está bien. */
export function problemasDe(distribucion, porArchivo) {
  const problemas = []
  if (!distribucion?.shards?.length) return ['sin shards']
  const asignados = new Set()
  for (const shard of distribucion.shards) {
    for (const archivo of shard.archivos || []) {
      if (asignados.has(archivo)) problemas.push(`repetido: ${archivo}`)
      asignados.add(archivo)
      if (!existsSync(join(RAIZ, 'e2e', archivo))) problemas.push(`no existe: ${archivo}`)
    }
  }
  for (const archivo of porArchivo.keys()) if (!asignados.has(archivo)) problemas.push(`sin asignar: ${archivo}`)
  const cargas = distribucion.shards.map((shard) => (shard.archivos || []).reduce((suma, archivo) => suma + (porArchivo.get(archivo) || 0), 0))
  const promedio = cargas.reduce((a, b) => a + b, 0) / distribucion.shards.length
  for (const carga of cargas) {
    if (promedio && carga > promedio * TOLERANCIA) problemas.push(`desbalanceado: ${carga} > ${Math.round(promedio * TOLERANCIA)}`)
  }
  return problemas
}

function leerDistribucion() {
  if (!existsSync(DISTRIBUCION)) return null
  try { return JSON.parse(readFileSync(DISTRIBUCION, 'utf8')) } catch { return null }
}

function main() {
  const args = process.argv.slice(2)
  const esEjecutable = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  if (!esEjecutable) return

  if (args.includes('--generar')) {
    const porArchivo = testsPorArchivo()
    const distribucion = calcularDistribucion(porArchivo)
    writeFileSync(DISTRIBUCION, `${JSON.stringify(distribucion, null, 2)}\n`)
    console.log(`Distribución escrita en ${DISTRIBUCION}`)
    for (const [indice, shard] of distribucion.shards.entries()) {
      console.log(`  shard ${indice + 1}: ${shard.archivos.length} archivos · ${shard.tests} tests`)
    }
    return
  }

  const indiceShard = args.indexOf('--shard')
  if (indiceShard >= 0) {
    const numero = Number(args[indiceShard + 1])
    const distribucion = leerDistribucion()
    const shard = distribucion?.shards?.[numero - 1]
    if (!shard?.archivos?.length) {
      console.error(`Shard ${numero} sin archivos: corré node scripts/e2e-shards.mjs --generar`)
      process.exit(1)
    }
    process.stdout.write(shard.archivos.map((archivo) => `e2e/${archivo}`).join(' '))
    return
  }

  if (args.includes('--check')) {
    const porArchivo = testsPorArchivo()
    const distribucion = leerDistribucion()
    const problemas = problemasDe(distribucion, porArchivo)
    if (problemas.length) {
      console.error(`Distribución de shards inválida:\n- ${problemas.join('\n- ')}`)
      process.exit(1)
    }
    const cargas = distribucion.shards.map((shard) => shard.tests)
    console.log(`Shards OK: ${cargas.join(' / ')} tests (${[...porArchivo.values()].reduce((a, b) => a + b, 0)} en total)`)
    return
  }

  console.error('Uso: node scripts/e2e-shards.mjs --generar | --shard <n> | --check')
  process.exit(1)
}

main()
