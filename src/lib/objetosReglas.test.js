import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Aserción de fuente de la biblioteca de objetos (docs/PLANTILLA-OBJETOS.md):
// los objetos transversales se escriben una sola vez. Si una pantalla vuelve a
// copiar la clase del aviso, del encabezado de tabla o el helper de fecha,
// este test falla y obliga a reutilizar el objeto compartido.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

function archivosFuente() {
  return readdirSync(RAIZ, { recursive: true })
    .filter((ruta) => /\.(jsx?|mjs)$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(RAIZ, ruta), 'utf8') }))
}

test('los objetos de tabla viven en un solo módulo', () => {
  const codigo = readFileSync(join(RAIZ, 'components/shared/tabla.js'), 'utf8')
  for (const nombre of ['ROTULO_DATO', 'CELDA_ENCABEZADO', 'ROTULO_SECCION']) {
    assert.match(codigo, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
  assert.match(codigo, /truncate \$\{ROTULO_DATO\}/, 'la celda de encabezado se deriva del rótulo de dato')
})

test('las pantallas no copian a mano las clases de tabla ni el aviso inline', () => {
  const literales = [
    'text-[10px] font-bold uppercase tracking-wider text-mute',
    'text-xs font-bold uppercase tracking-wider text-mute',
  ]
  const culpables = []
  for (const { ruta, contenido } of archivosFuente()) {
    if (ruta === 'components/shared/tabla.js') continue
    for (const literal of literales) {
      if (contenido.includes(`className="${literal}"`) || contenido.includes(`className="truncate ${literal}"`) || contenido.includes(`= '${literal}'`) || contenido.includes(`= "truncate ${literal}"`)) {
        culpables.push(`${ruta} · ${literal}`)
      }
    }
  }
  assert.deepEqual(culpables, [])
})

test('el aviso inline usa el objeto Aviso, no un párrafo con el borde copiado', () => {
  const culpables = archivosFuente()
    .filter(({ contenido }) => /<p[^>]*rounded-lg border border-(bad|ok)\/30 bg-(bad|ok)\/10/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  // El objeto existe y anuncia según el tono.
  const ui = readFileSync(join(RAIZ, 'components/ui/index.jsx'), 'utf8')
  assert.match(ui, /export function Aviso\(/, 'falta el objeto Aviso')
  assert.match(ui, /tono === 'error' \? 'alert' : 'status'/, 'Aviso anuncia error con role="alert"')
  // Las pantallas que tenían el aviso copiado lo adoptan.
  for (const ruta of ['components/control/Inventario.jsx', 'pages/VerificarCorreo.jsx', 'components/delivery/StoreDelivery.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<Aviso\b/, `${ruta}: el aviso va con Aviso`)
  }
})

test('las fechas de pantalla salen de utils/fecha (sin duplicar el formato)', () => {
  // Los comprobantes y reportes tienen su propio helper de impresión; el
  // formato de pantalla es único en utils/fecha.js.
  const permitidos = ['lib/printing/', 'lib/imeiComprobante.js', 'lib/customerReport.js']
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !permitidos.some((p) => ruta.startsWith(p)) && ruta !== 'utils/fecha.js' && contenido.includes("dateStyle: 'short', timeStyle: 'short'"))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  // Las pantallas migradas importan el helper compartido.
  for (const [ruta, patron] of [
    ['components/shared/Cronologia.jsx', /import \{ fechaHora \} from '@\/utils\/fecha'/],
    ['pages/CuentaPublica.jsx', /import \{ fechaDia as fecha, fechaHora \} from '@\/utils\/fecha'/],
    ['components/control/Conciliacion.jsx', /import \{ fechaCorta \} from '@\/utils\/fecha'/],
  ]) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), patron, `${ruta}: falta el helper compartido`)
  }
})
