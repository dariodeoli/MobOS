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

test('el portapapeles sale del objeto compartido', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/portapapeles.js') && contenido.includes('navigator.clipboard'))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const helper = readFileSync(join(RAIZ, 'utils/portapapeles.js'), 'utf8')
  assert.match(helper, /export async function copiarAlPortapapeles/, 'falta copiarAlPortapapeles')
  assert.match(helper, /execCommand\('copy'\)/, 'el helper conserva el respaldo sin Clipboard API')
  // Las pantallas migradas lo importan en vez de copiar el bloque try/catch.
  for (const ruta of ['components/control/Config.jsx', 'components/control/Inventario.jsx', 'components/ventas/SellerQuotes.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /import \{ copiarAlPortapapeles \} from '@\/utils\/portapapeles'/, `${ruta}: falta el objeto de portapapeles`)
  }
})

test('las descargas del navegador salen de utils/descargarArchivo', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/descargarArchivo.js') && contenido.includes('createObjectURL(new Blob('))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const helper = readFileSync(join(RAIZ, 'utils/descargarArchivo.js'), 'utf8')
  assert.match(helper, /export function descargarArchivo/, 'falta descargarArchivo')
  assert.match(helper, /export function descargarCsvCliente/, 'falta el atajo de CSV')
  for (const ruta of ['components/customers/ClientesTabla.jsx', 'components/control/Reportes.jsx', 'utils/descargarCsv.js']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /descargar(Archivo|CsvCliente)\(/, `${ruta}: la descarga va con el objeto compartido`)
  }
})

test('la vista lista/cuadrícula se recuerda con el hook compartido', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('hooks/useVistaListaGrid.js') && /localStorage\.(getItem|setItem)\('mobos:[a-z-]*-vista'/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const hook = readFileSync(join(RAIZ, 'hooks/useVistaListaGrid.js'), 'utf8')
  assert.match(hook, /export function useVistaListaGrid/, 'falta useVistaListaGrid')
  assert.match(hook, /mobos:\$\{clave\}-vista/, 'la clave persistida no cambia de forma')
  for (const ruta of ['components/control/Inventario.jsx', 'components/ventas/SellerCatalog.jsx', 'components/ventas/SellerCustomers.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /useVistaListaGrid\(/, `${ruta}: la vista va con el hook`)
  }
})

test('el id de dispositivo se genera una sola vez en lib/deviceId', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('lib/deviceId.js') && contenido.includes('mobos:device-id'))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  for (const ruta of ['pages/Login.jsx', 'pages/AceptarInvitacion.jsx', 'components/control/Config.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /import \{ deviceId \} from '@\/lib\/deviceId'/, `${ruta}: falta deviceId`)
  }
})

test('los montos de pantalla salen de utils/moneda', () => {
  // `ui/Money` es el objeto canónico: PYG sin decimales y USD en-US. Nadie más
  // arma el texto con toLocaleString.
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/moneda.js') && !ruta.endsWith('components/ui/index.jsx') && /US\$ \$\{[^}]*toLocaleString\('en-US'/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const moneda = readFileSync(join(RAIZ, 'utils/moneda.js'), 'utf8')
  for (const nombre of ['montoGs', 'montoUsd', 'montoTexto']) {
    assert.match(moneda, new RegExp(`export function ${nombre}\\(`), `falta ${nombre}`)
  }
  for (const ruta of ['components/control/Inventario.jsx', 'components/inventory/UnidadDetalle.jsx', 'components/ventas/SellerCatalog.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /monto(Texto|Usd|Gs)\(/, `${ruta}: el monto va con el helper compartido`)
  }
})

test('los vacíos van con EmptyState, no con una caja propia', () => {
  const culpables = archivosFuente()
    .filter(({ contenido }) => /text-center text-sm text-mute">(?:No hay|Sin )/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  for (const ruta of ['components/ventas/SellerData.jsx', 'components/ventas/SellerOrders.jsx', 'components/productos/KardexProducto.jsx', 'components/ventas/PanelColaOffline.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<EmptyState\b/, `${ruta}: el vacío va con EmptyState`)
  }
})

test('escapeHtml se define una sola vez (plantillas de impresión)', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/printHtml.js') && /(function|const) escapeHtml/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  assert.match(readFileSync(join(RAIZ, 'utils/printHtml.js'), 'utf8'), /export function escapeHtml\(/, 'falta escapeHtml compartido')
  for (const ruta of ['components/shared/OrderReceipt.jsx', 'components/shared/reporteEjecutivo.js', 'components/control/Comisiones.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /import \{ printHtml, escapeHtml \} from '@\/utils\/printHtml'/, `${ruta}: escapeHtml va del módulo compartido`)
  }
})

test('las celdas de dato y de número salen de shared/tabla', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/shared/tabla.js') && (contenido.includes('className="truncate text-xs text-mute"') || contenido.includes('className="truncate text-xs text-mute ') || contenido.includes('className="text-right tabular-nums"')))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const tabla = readFileSync(join(RAIZ, 'components/shared/tabla.js'), 'utf8')
  for (const nombre of ['CELDA_DATO', 'CELDA_NUMERO']) {
    assert.match(tabla, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
  for (const ruta of ['components/customers/ClientesTabla.jsx', 'components/control/Reportes.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /CELDA_(DATO|NUMERO)|CeldaMoneda/, `${ruta}: la celda va con el objeto compartido`)
  }
  // El dinero va con `CeldaMoneda` (el objeto de DSN), no con una clase.
  for (const ruta of ['components/customers/CustomerProfile.jsx', 'components/control/Reportes.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<CeldaMoneda\b/, `${ruta}: el monto va con CeldaMoneda`)
  }
})

test('el interruptor tiene un solo objeto: Switch (#186)', () => {
  const ui = readFileSync(join(RAIZ, 'components/ui/index.jsx'), 'utf8')
  assert.ok(!/function Toggle\(/.test(ui), 'ui no debe exportar Toggle: el canónico es shared/Switch')
  const culpables = archivosFuente()
    .filter(({ contenido }) => /import \{[^}]*\bToggle\b[^}]*\} from '@\/components\/ui'/.test(contenido) || /<Toggle\b/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  const config = readFileSync(join(RAIZ, 'components/control/Config.jsx'), 'utf8')
  assert.match(config, /<Switch[\s\S]{0,80}seguro-toggle/, 'Config usa el interruptor canónico')
})

test('las barras de avance usan BarraProgreso', () => {
  for (const ruta of ['components/ventas/PagosPedido.jsx', 'components/control/Creditos.jsx', 'pages/GarantiaPublica.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<BarraProgreso\b/, `${ruta}: el avance va con BarraProgreso`)
  }
})

test('el enlace de WhatsApp se arma una sola vez en utils/telefono', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/telefono.js') && contenido.includes('https://wa.me/'))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  assert.match(readFileSync(join(RAIZ, 'utils/telefono.js'), 'utf8'), /export function whatsappUrl\(/, 'falta whatsappUrl')
  for (const ruta of ['components/ventas/PagosPedido.jsx', 'components/ventas/FormularioVenta.jsx', 'pages/GarantiaPublica.jsx', 'components/customers/CampanasClientes.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /whatsappUrl/, `${ruta}: el enlace va con whatsappUrl`)
  }
})

test('los estados de pedido del cliente se definen una sola vez', () => {
  const pagina = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')
  for (const ruta of ['pages/PortalCliente.jsx', 'pages/CuentaPublica.jsx', 'pages/PedidoPublico.jsx', 'pages/GarantiaPublica.jsx']) {
    const codigo = pagina(ruta)
    assert.doesNotMatch(codigo, /const (ESTADO_PEDIDO|ORDER_STATUS|FULFILLMENT|WARRANTY_STATUS) = \{/, `${ruta}: los estados salen de lib/estadosPedido`)
    assert.match(codigo, /from '@\/lib\/estadosPedido'/, `${ruta}: falta el módulo compartido`)
  }
  const estados = readFileSync(join(RAIZ, 'lib/estadosPedido.js'), 'utf8')
  for (const nombre of ['ESTADO_PEDIDO', 'ESTADO_ENTREGA', 'ESTADO_GARANTIA', 'tonoPedido', 'tonoGarantia']) {
    assert.match(estados, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
})

test('Aviso cubre warn y el aviso con estructura', () => {
  const ui = readFileSync(join(RAIZ, 'components/ui/index.jsx'), 'utf8')
  assert.match(ui, /warn: 'border-warn\/30 bg-warn\/10 text-warn'/, 'Aviso debe tener tono warn')
  assert.match(ui, /como === 'div' \? 'div' : 'p'/, 'Aviso debe permitir contenedor para el aviso con acción')
  // No queda ningún banner con las clases del aviso armado a mano.
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/ui/index.jsx') && /(?:<p|<div)[^>]*rounded-(?:lg|xl)[^>]*border-(?:bad|ok|warn)\/30 bg-(?:bad|ok|warn)\/10[^"]*text-(?:bad|ok|warn)/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  for (const ruta of ['pages/Login.jsx', 'components/ventas/SellerData.jsx', 'components/productos/KardexProducto.jsx', 'components/landing/ImeiVerificador.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<Aviso\b/, `${ruta}: el aviso va con Aviso`)
  }
})

test('las cargas usan Skeleton en vez de bloques animate-pulse', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/ui/index.jsx') && /animate-pulse[^"]*rounded-(?:lg|xl|2xl)/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  for (const ruta of ['components/ventas/SellerData.jsx', 'components/customerPortal/PortalUI.jsx', 'components/customers/CampanasClientes.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<Skeleton\b/, `${ruta}: la carga va con Skeleton`)
  }
})
