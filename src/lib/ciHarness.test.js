import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import config from '../../playwright.config.js'

// Guardas del contrato del harness/CI (#245, #326): la suite local corre sin
// reintentos; **en CI hay un único reintento global** (ruido del runner) que el
// reporter de flakiness deja registrado en el artifact. No hay cuarentena ni
// reintentos por spec: lo que falla dos veces sigue siendo un fallo real.

const RAIZ = new URL('../../', import.meta.url)
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8')

test('el workflow no tiene cuarentena y los reintentos viven solo en CI (#245/#326)', () => {
  const workflow = leer('.github/workflows/ci.yml')
  assert.doesNotMatch(workflow, /MOBOS_E2E_CUARENTENA/, 'la cuarentena se retiró (#245)')
  assert.match(workflow, /node scripts\/e2e-shards\.mjs --shard \${{ matrix\.shard }}/, 'los shards salen de la distribución versionada')
  assert.match(workflow, /shard:\s*\[1,\s*2,\s*3,\s*4\]/, 'falta la matriz de 4 shards')
  assert.match(workflow, /MOBOS_E2E_BACKEND:\s*prod/, 'el job E2E tiene que usar el backend prod')
  assert.match(workflow, /reporte-flaky/, 'los artifacts tienen que incluir el reporte de flakiness')
  const config = leer('playwright.config.js')
  // #326: un reintento global y condicional (solo CI); local cero.
  assert.match(config, /const REINTENTOS = CI \? 1 : 0/, 'un único reintento, solo en CI')
  assert.match(config, /retries:\s*REINTENTOS/, 'la suite usa el reintento condicional')
  assert.doesNotMatch(config, /retries:\s*[1-9]/, 'ningún reintento fijo en el config')
  for (const archivo of readdirSync(new URL('e2e/', RAIZ)).filter((nombre) => nombre.endsWith('.spec.js'))) {
    assert.doesNotMatch(leer(`e2e/${archivo}`), /habilitarRetrySiCuarentena|retries:\s*[1-9]/, `${archivo} no puede habilitar retries propios`)
  }
})

// Specs históricos que nunca se cablearon a un proyecto (no corren). La lista
// no puede crecer: cada spec nuevo tiene que matchear el testMatch de alguna
// proyecto, si no queda corriendo en el vacío sin que nadie se entere.
const SPECS_SIN_PROYECTO = [
  'cobranzas-whatsapp.spec.js',
  'dsn-176-prod.spec.js',
  'dsn-modal-prod.spec.js',
  'marketing-recompra.spec.js',
  'pos-precios-lista.spec.js',
  'qr-unificado.spec.js',
]

test('todos los specs del directorio matchean algún proyecto (#245)', () => {
  const archivos = readdirSync(new URL('e2e/', RAIZ)).filter((nombre) => nombre.endsWith('.spec.js'))
  const proyectos = (config.default || config).projects || []
  const huerfanos = archivos.filter(
    (archivo) => !proyectos.some((proyecto) => proyecto.testMatch && proyecto.testMatch.test(archivo))
      && !SPECS_SIN_PROYECTO.includes(archivo),
  )
  assert.deepEqual(huerfanos, [], 'estos specs no matchean ningún proyecto')
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

test('el navegador del harness corre en el día paraguayo', () => {
  // Causa raíz de la noche del 23/09: el reloj del navegador en UTC hacía que
  // "hoy" no coincidiera con el día comercial (Asunción) y specs de días
  // fallaran de noche. El harness fija la zona.
  const config = leer('playwright.config.js')
  assert.match(config, /timezoneId:\s*'America\/Asuncion'/, 'el harness tiene que fijar America/Asuncion')
})
