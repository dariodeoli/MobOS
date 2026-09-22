import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { REGLAS, analizarContenido } from '../../scripts/audit-logs.mjs'

// Guarda de fuente de la higiene de logs (#232): build y deploy no imprimen
// variables de entorno ni secretos. La auditoría completa vive en
// `npm run audit:logs`; acá se fijan los archivos que construyen/despliegan.

const RAIZ = new URL('../../', import.meta.url)
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8')

const ARCHIVOS_CRITICOS = [
  'backend/Dockerfile',
  '.github/workflows/ci.yml',
  'e2e/bin/start-backend.sh',
  'e2e/bin/start-frontend.sh',
  'backend/tests/integration-http.sh',
  'scripts/release.mjs',
  'scripts/db-backup.sh',
  'print-agent/install.sh',
  'print-agent/install-macos.sh',
]

test('las reglas de higiene cubren xtrace, volcados de env y build-args', () => {
  const ids = REGLAS.map((regla) => regla.id)
  for (const esperado of ['shell-xtrace', 'env-dump', 'console-env', 'echo-secreto', 'dockerfile-env-secreto', 'build-arg-secreto']) {
    assert.ok(ids.includes(esperado), `falta la regla ${esperado}`)
  }
})

test('los archivos de build/deploy no imprimen env ni secretos', () => {
  const hallazgos = []
  for (const ruta of ARCHIVOS_CRITICOS) {
    const url = new URL(ruta, RAIZ)
    if (!existsSync(url)) continue
    hallazgos.push(...analizarContenido(ruta, leer(ruta)))
  }
  assert.deepEqual(hallazgos, [], `Hallazgos de higiene de logs: ${JSON.stringify(hallazgos, null, 2)}`)
})
