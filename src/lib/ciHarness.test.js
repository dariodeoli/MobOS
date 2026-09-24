import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

// Guardas del contrato del harness/CI (#245): la suite corre sin reintentos ni
// cuarentena y los shards están balanceados y completos. Si algo flapea, se
// aísla y se corrige la raíz; no se habilita un re-run ciego.

const RAIZ = new URL('../../', import.meta.url)
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8')

test('el workflow no tiene cuarentena ni reintentos por spec', () => {
  const workflow = leer('.github/workflows/ci.yml')
  assert.doesNotMatch(workflow, /MOBOS_E2E_CUARENTENA/, 'la cuarentena se retiró (#245)')
  assert.match(workflow, /node scripts\/e2e-shards\.mjs --shard \${{ matrix\.shard }}/, 'los shards salen de la distribución versionada')
  assert.match(workflow, /shard:\s*\[1,\s*2,\s*3\]/, 'falta la matriz de 3 shards')
  assert.match(workflow, /MOBOS_E2E_BACKEND:\s*prod/, 'el job E2E tiene que usar el backend prod')
  assert.match(workflow, /reporte-flaky/, 'los artifacts tienen que incluir el reporte de flakiness')
  const config = leer('playwright.config.js')
  assert.match(config, /retries:\s*0/, 'la suite corre sin reintentos')
  for (const archivo of readdirSync(new URL('e2e/', RAIZ)).filter((nombre) => nombre.endsWith('.spec.js'))) {
    assert.doesNotMatch(leer(`e2e/${archivo}`), /habilitarRetrySiCuarentena|retries:\s*[1-9]/, `${archivo} no puede habilitar retries propios`)
  }
})

test('la distribución de shards está completa y balanceada', () => {
  const salida = execFileSync('node', ['scripts/e2e-shards.mjs', '--check'], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 120000,
  })
  assert.match(salida, /Shards OK/)
})

test('la documentación del harness existe y describe los shards', () => {
  const doc = leer('docs/CI-HARNESS.md')
  assert.match(doc, /sharding\.json/)
  assert.match(doc, /MOBOS_E2E_BACKEND/)
  assert.match(doc, /--shard|--shards/)
  assert.doesNotMatch(doc, /MOBOS_E2E_CUARENTENA/)
})
