import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

// Guardas del contrato del harness/CI (#CI): la lista de cuarentena vive en el
// workflow y los specs la declaran; si se desincronizan, el retry deja de
// aplicar en silencio (o queda un spec con retry fuera de la lista).

const RAIZ = new URL('../../', import.meta.url)
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8')

test('la cuarentena del workflow coincide con los specs que la declaran', () => {
  const workflow = leer('.github/workflows/ci.yml')
  const declarada = workflow.match(/MOBOS_E2E_CUARENTENA:\s*(\S+)/)
  assert.ok(declarada, 'el workflow tiene que declarar MOBOS_E2E_CUARENTENA')
  const enWorkflow = declarada[1].split(',').map((item) => item.trim()).filter(Boolean).sort()
  const enSpecs = readdirSync(new URL('e2e/', RAIZ))
    .filter((archivo) => archivo.endsWith('.spec.js'))
    .filter((archivo) => /habilitarRetrySiCuarentena\(/.test(leer(`e2e/${archivo}`)))
    .map((archivo) => archivo.replace(/\.spec\.js$/, ''))
    .sort()
  assert.deepEqual(enWorkflow, enSpecs, 'la lista del workflow y los specs con retry deben coincidir')
})

test('el job E2E está shardeado y usa el backend prod', () => {
  const workflow = leer('.github/workflows/ci.yml')
  assert.match(workflow, /shard:\s*\[1,\s*2,\s*3\]/, 'falta la matriz de 3 shards')
  assert.match(workflow, /--shard=\$\{\{\s*matrix\.shard\s*\}\}\/3/, 'falta el --shard en la corrida')
  assert.match(workflow, /MOBOS_E2E_BACKEND:\s*prod/, 'el job E2E tiene que usar el backend prod')
  assert.match(workflow, /reporte-flaky/, 'los artifacts tienen que incluir el reporte de flakiness')
})

test('la documentación del harness existe y nombra la cuarentena', () => {
  const doc = leer('docs/CI-HARNESS.md')
  assert.match(doc, /MOBOS_E2E_CUARENTENA/)
  assert.match(doc, /MOBOS_E2E_BACKEND/)
  assert.match(doc, /--shard/)
})
