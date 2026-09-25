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

test('las piezas de formulario salen de shared/formulario', () => {
  const formulario = readFileSync(join(RAIZ, 'components/shared/formulario.js'), 'utf8')
  for (const nombre of ['GRILLA_DOS_COLUMNAS', 'PIE_ACCIONES', 'PIE_ACCIONES_REVERSO']) {
    assert.match(formulario, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/shared/formulario.js') && /className="[^"]*(grid gap-3 sm:grid-cols-2|flex flex-wrap justify-end gap-2|flex flex-col-reverse gap-2 sm:flex-row sm:justify-end)/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
})

test('los impresos de servicio usan los helpers compartidos', () => {
  const codigo = readFileSync(join(RAIZ, 'lib/servicioImpresion.js'), 'utf8')
  // Imports relativos: este módulo se testea con node --test (sin alias).
  assert.match(codigo, /from '\.\.\/utils\/printHtml\.js'/, 'el escapado va con escapeHtml')
  assert.match(codigo, /from '\.\.\/utils\/fecha\.js'/, 'la fecha va con fechaDia')
  assert.match(codigo, /from '\.\.\/utils\/moneda\.js'/, 'el monto va con formatGs')
  assert.ok(!/const gs = /.test(codigo), 'sin formateador de dinero propio')
})

test('la celda de identidad y los textarea salen de los objetos', () => {
  const identidad = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/shared/tabla.js') && /truncate text-(?:\[13px\]|sm) font-semibold/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(identidad, [])
  const tabla = readFileSync(join(RAIZ, 'components/shared/tabla.js'), 'utf8')
  for (const nombre of ['CELDA_IDENTIDAD', 'CELDA_IDENTIDAD_GRANDE']) {
    assert.match(tabla, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
  const textareas = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/ui/index.jsx') && /<textarea\b/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(textareas, [])
  for (const ruta of ['components/ventas/PedidoDetalle.jsx', 'pages/RemitoPublico.jsx', 'pages/CotizacionPublica.jsx', 'components/shared/WhatsAppMenu.jsx', 'components/control/WhatsAppTemplates.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<Textarea\b/, `${ruta}: el texto largo va con Textarea`)
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

test('los colores de pantalla salen de tokens (#176)', () => {
  const paletaDefault = /(text|bg|border|border-l|from|to)-(sky|amber|slate|red|blue|green|emerald|violet|purple|orange|yellow|pink|indigo)-[0-9]{2,3}/
  for (const ruta of [
    'components/shared/CalendarioGanancias.jsx',
    'pages/Status.jsx',
    'pages/Celulares.jsx',
    'components/app/PantallaBloqueada.jsx',
    'pages/RemitoPublico.jsx',
    'components/control/Inventario.jsx',
    'components/inventory/UnidadDetalle.jsx',
  ]) {
    assert.doesNotMatch(readFileSync(join(RAIZ, ruta), 'utf8'), paletaDefault, `${ruta}: color de paleta default en vez de token`)
  }
  assert.ok(!/#0c8876/.test(readFileSync(join(RAIZ, 'pages/RemitoPublico.jsx'), 'utf8')), 'RemitoPublico no usa el verde viejo')
  assert.match(readFileSync(join(RAIZ, 'components/control/Inventario.jsx'), 'utf8'), /border-reserved\/30 bg-reserved\/10/, 'la reserva usa el token reserved')
})

test('las barras de avance usan BarraProgreso', () => {
  for (const ruta of ['components/ventas/PagosPedido.jsx', 'components/control/Creditos.jsx', 'pages/GarantiaPublica.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<BarraProgreso\b/, `${ruta}: el avance va con BarraProgreso`)
  }
  // Lote 10: ninguna pantalla arma la barra a mano (ancho por estilo inline).
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/ui/index.jsx') && /style=\{\{ width: `\$\{[^}]*\}%` \}\}/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [])
  for (const ruta of ['components/ventas/AnalyticsPos.jsx', 'components/control/ImpresionGraficos.jsx', 'components/control/Resumen.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<BarraProgreso\b/, `${ruta}: el avance va con BarraProgreso`)
  }
})

test('las notas warn y los estados con badge salen de los objetos compartidos (lote 10)', () => {
  const ui = readFileSync(join(RAIZ, 'components/ui/index.jsx'), 'utf8')
  assert.match(ui, /export function Nota\(/, 'falta el objeto Nota')
  assert.match(ui, /const NOTAS = \{/, 'los tonos de la nota viven en el objeto')

  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/ui/index.jsx') && /(?:<p|<div)[^>]*border-warn\/(?:25|30)[^"]*text-mute/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [], 'las notas con borde warn van con <Nota>')

  const conMapaPropio = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('lib/estadosPedido.js') && /const (ORDER_STATUS|FULFILLMENT_STATUS|WARRANTY_STATUS|ESTADO_GARANTIA) = \{/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(conMapaPropio, [], 'los mapas con badge salen de lib/estadosPedido')
  const estados = readFileSync(join(RAIZ, 'lib/estadosPedido.js'), 'utf8')
  for (const nombre of ['ESTADO_PEDIDO_BADGE', 'ESTADO_ENTREGA_BADGE', 'ESTADO_GARANTIA_BADGE']) {
    assert.match(estados, new RegExp(`export const ${nombre} =`), `falta ${nombre}`)
  }
  assert.match(readFileSync(join(RAIZ, 'components/shared/EstadoBadge.jsx'), 'utf8'), /export default function EstadoBadge\(/, 'falta EstadoBadge')
  assert.match(readFileSync(join(RAIZ, 'components/customers/CustomerProfile.jsx'), 'utf8'), /<EstadoBadge\b/, 'la ficha usa EstadoBadge')
})

test('los montos dentro de frases usan el formateador compartido (lote 10)', () => {
  for (const ruta of ['components/control/Caja.jsx', 'components/delivery/DriverOrders.jsx', 'components/delivery/StoreDelivery.jsx']) {
    const codigo = readFileSync(join(RAIZ, ruta), 'utf8')
    assert.ok(!codigo.includes("toLocaleString('es-PY')"), `${ruta}: el monto va con montoTexto/formatGs`)
  }
  // Los impresos arman HTML autónomo (el color literal viaja en el documento) y
  // `utils/colores.js` es el catálogo de colores de producto.
  const HEX_PERMITIDOS = ['utils/colores.js', 'components/shared/OrderReceipt.jsx', 'components/shared/reporteEjecutivo.js', 'components/control/Comisiones.jsx', 'components/control/Inventario.jsx']
  const hex = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.startsWith('lib/') && !HEX_PERMITIDOS.some((permitido) => ruta.endsWith(permitido)) && /#8b5cf6|#0c8876/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(hex, [], 'los hex viejos de marca salen de tokens')
  const paleta = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/auth/GoogleButton.jsx') && /(text|bg|border|border-l|from|to)-(sky|amber|slate|red|blue|green|emerald|violet|purple|orange|yellow|pink|indigo)-[0-9]{2,3}/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(paleta, [], 'la paleta default sale de tokens (#176)')
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

// Lote 18: las etiquetas de entrega del listado, el POS y los impresos salen del
// mapa con badge compartido; `constants.js` no las vuelve a copiar.
test('las etiquetas de entrega salen del mapa con badge (lote 18)', async () => {
  const constantes = readFileSync(join(RAIZ, 'lib/constants.js'), 'utf8')
  assert.match(constantes, /import \{ ESTADO_ENTREGA_BADGE \} from '\.\/estadosPedido\.js'/, 'constants deriva del mapa compartido')
  assert.ok(!/PENDING: 'Pendiente'/.test(constantes), 'las etiquetas de entrega no se copian a mano')

  const { ESTADO_ENTREGA_BADGE } = await import('./estadosPedido.js')
  const { FULFILLMENT_LABELS } = await import('./constants.js')
  for (const [clave, { label }] of Object.entries(ESTADO_ENTREGA_BADGE)) {
    assert.equal(FULFILLMENT_LABELS[clave], label, `${clave} tiene que decir lo mismo en las dos casas`)
  }
  assert.equal(FULFILLMENT_LABELS.CANCELLED, 'Cancelado', 'el único estado sin badge se conserva')

  const entrega = readFileSync(join(RAIZ, 'components/ventas/venta/entrega.js'), 'utf8')
  assert.match(entrega, /FULFILLMENT_LABELS/, 'el flujo de entrega usa las etiquetas compartidas')
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

// Épica #240 (PhoneCheck): checklist, locks, batería y grado. Los objetos viven
// en `shared/` y los estados en `lib/estadoEquipo.js`; ninguna pantalla copia
// las etiquetas ni arma el % de batería por su cuenta.
test('los objetos de inspección del equipo salen de shared/ y lib/estadoEquipo (#240)', () => {
  for (const ruta of ['components/shared/SemaforoItem.jsx', 'components/shared/ChipsLocks.jsx', 'components/shared/MedidorBateria.jsx', 'components/shared/GradoBadge.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /export default function /, `falta ${ruta}`)
  }
  const estado = readFileSync(join(RAIZ, 'lib/estadoEquipo.js'), 'utf8')
  for (const nombre of ['ESTADOS_ITEM', 'LOCKS_DISPOSITIVO', 'ESTADOS_LOCK', 'GRADOS_CONDICION', 'tonoBateria', 'gradoCondicion']) {
    assert.match(estado, new RegExp(`export (const|function) ${nombre}`), `falta ${nombre}`)
  }

  // El % de batería se dibuja con el objeto (chip o barra), no con un span suelto.
  const sueltos = archivosFuente()
    .filter(({ ruta, contenido }) => /batteryHealth/.test(contenido)
      && !ruta.endsWith('components/shared/MedidorBateria.jsx')
      && !ruta.endsWith('lib/estadoEquipo.js')
      && /\{unit\.batteryHealth\}%|\$\{unit\.batteryHealth\}%/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(sueltos, [], 'el % de batería va con MedidorBateria')
  for (const ruta of ['components/inventory/UnidadDetalle.jsx', 'components/control/Inventario.jsx', 'components/inventory/SerialUnitPicker.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<MedidorBateria\b/, `${ruta}: la batería va con MedidorBateria`)
  }

  // Las etiquetas propias del checklist y del grado no se re-escriben por
  // pantalla ('Sin verificar' se comparte con otros dominios, no se controla).
  const etiquetasPropias = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('lib/estadoEquipo.js') && /('Con observación'|'Grado A'|'Grado B'|'Grado C')/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(etiquetasPropias, [], 'las etiquetas de inspección salen de lib/estadoEquipo')
})

// #242: los glifos de categoría (mobile/laptop/tablet/watch/buds/cable) y el
// mapa categoría→icono viven en un solo objeto; el POS y el catálogo los usan.
test('los iconos de categoría salen del objeto compartido (#242)', () => {
  const objeto = readFileSync(join(RAIZ, 'components/shared/IconoCategoria.jsx'), 'utf8')
  for (const glifo of ['mobile', 'laptop', 'tablet', 'watch', 'buds', 'cable']) {
    assert.match(objeto, new RegExp(`\\n  ${glifo}: 'M`), `falta el glifo ${glifo}`)
  }
  const categorias = readFileSync(join(RAIZ, 'lib/categorias.js'), 'utf8')
  for (const nombre of ['CATEGORIAS_PRODUCTO', 'ICONO_CATEGORIA', 'normalizarCategoria', 'categoriaDe', 'iconoDeCategoria']) {
    assert.match(categorias, new RegExp(`export (const|function) ${nombre}`), `falta ${nombre}`)
  }
  const copiados = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/shared/IconoCategoria.jsx') && contenido.includes('M8 2h8a2 2 0 0 1 2 2v16'))
    .map(({ ruta }) => ruta)
  assert.deepEqual(copiados, [], 'los glifos de categoría no se copian por pantalla')
})

// Lote 14: la vista previa del papel (ancho real por formato) es un objeto; las
// pantallas no vuelven a copiar el mapa de anchos ni las clases del iframe.
test('la vista previa del papel sale de shared/VistaPreviaPapel (#241)', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('components/shared/VistaPreviaPapel.jsx') && /ANCHO_VISTA|ANCHOS_PAPEL/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [], 'los anchos de papel viven en el objeto')
  for (const ruta of ['components/shared/ComprobantePreview.jsx', 'components/shared/ReportePreview.jsx']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /<VistaPreviaPapel\b/, `${ruta}: usa la vista previa compartida`)
  }
  const objeto = readFileSync(join(RAIZ, 'components/shared/VistaPreviaPapel.jsx'), 'utf8')
  assert.match(objeto, /export const ANCHOS_PAPEL =/)
  assert.match(objeto, /'thermal-80': 'max-w-\[302px\]'/)
  assert.match(objeto, /a4: 'max-w-\[794px\]'/)
})

// Lote 13: el estado/condición de la unidad se lee igual en la lista y en la
// ficha; ninguna pantalla vuelve a definir su mapa de tonos.
test('el tono de la unidad vive en utils/inventario (#217)', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('utils/inventario.js') && /const badgeTone = \{|const statusLabel = \{/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [], 'el tono de estado sale de utils/inventario')
  for (const ruta of ['components/control/Inventario.jsx', 'components/inventory/UnidadDetalle.jsx']) {
    const codigo = readFileSync(join(RAIZ, ruta), 'utf8')
    assert.match(codigo, /from '@\/utils\/inventario'/, `${ruta}: importa las reglas compartidas`)
    assert.match(codigo, /estadoInventario\(unit\)\.tone/, `${ruta}: el badge usa el tono compartido`)
  }
  const inventario = readFileSync(join(RAIZ, 'utils/inventario.js'), 'utf8')
  for (const nombre of ['tonoInventario', 'colorInventario', 'etiquetaCondicionUnidad', 'colorCondicionUnidad', 'puntoCondicionUnidad', 'CONDICION_UNIDAD']) {
    assert.match(inventario, new RegExp(`export (const|function) ${nombre}`), `falta ${nombre}`)
  }
})

// Lote 17: la página pública del informe usa los objetos y reglas compartidas.
test('el informe público usa MedidorBateria y la condición compartida (#240)', () => {
  const pagina = readFileSync(join(RAIZ, 'pages/InformePublico.jsx'), 'utf8')
  assert.match(pagina, /<MedidorBateria porcentaje=\{unit\.batteryHealth\}/)
  assert.match(pagina, /etiquetaCondicionUnidad\(unit\)/)
  assert.ok(!/const CONDICION = \{/.test(pagina), 'la condición sale de utils/inventario')
  assert.ok(!/batteryHealth\) >= 85/.test(pagina), 'los umbrales de batería salen de MedidorBateria')
})

// Ayuda: el cheat-sheet visual de atajos vive en un solo objeto; el diálogo
// «?» del shell lo reutiliza y nadie vuelve a copiar la lista a mano.
test('el cheat-sheet de atajos vive en app/CheatSheetAtajos (#241)', () => {
  const hoja = readFileSync(join(RAIZ, 'components/app/CheatSheetAtajos.jsx'), 'utf8')
  for (const accion of ['Búsqueda global', 'Nueva venta', 'Buscar producto', 'Crear cliente', 'Cotizar equipo (Trade-In)', 'Guardar venta', 'Cerrar diálogos', 'Cambiar vendedor', 'Bloquear pantalla']) {
    assert.match(hoja, new RegExp(accion.replace(/[()]/g, '\\$&')), `falta «${accion}» en el cheat-sheet`)
  }
  assert.match(hoja, /Fn\+F1/, 'la nota de Mac explica Fn+F1…F4')
  const panel = readFileSync(join(RAIZ, 'pages/PanelVendedor.jsx'), 'utf8')
  assert.match(panel, /import CheatSheetAtajos from '@\/components\/app\/CheatSheetAtajos'/, 'el panel importa el objeto')
  assert.match(panel, /<CheatSheetAtajos\b/, 'el diálogo de atajos usa el objeto compartido')
  assert.ok(!panel.includes("'Ctrl+K', 'Búsqueda global'"), 'la lista de atajos no se copia en el panel')
})

// Lote 15 / paso 4 (#241): el rack del piloto delega el grado y la batería en
// el objeto compartido `TileEquipo`, que compone GradoBadge y MedidorBateria.
test('el modo taller usa el tile compartido para grado y batería (#240)', () => {
  const rack = readFileSync(join(RAIZ, 'components/inventory/TallerRack.jsx'), 'utf8')
  assert.match(rack, /from 'owncoding-ui'/, 'los objetos del taller salen de la biblioteca')
  assert.match(rack, /<TileEquipo[\s\S]*?grado=\{grado\}[\s\S]*?bateria=\{bateria\}/)
  assert.ok(!rack.includes('COLOR_GRADO'), 'el color del grado sale del objeto')
  assert.ok(!/bateria >= 90 \? 'green'/.test(rack), 'el tono de la batería sale del objeto')
  assert.ok(!/<MedidorBateria/.test(rack), 'la batería la dibuja el tile compartido')
  const medidor = readFileSync(join(RAIZ, 'components/shared/MedidorBateria.jsx'), 'utf8')
  assert.match(medidor, /mostrarEtiqueta = false/, 'el chip puede mostrar la palabra')
})
// Lote 30 (#240/#250): la recepción de equipos y repuestos usa el buscador
// dependiente de la biblioteca (modelo → capacidad/color) y el puente de
// etiquetas vive en lib/dispositivos.
test('la recepción usa el buscador dependiente de dispositivos (#240/#250)', () => {
  const servicio = readFileSync(join(RAIZ, 'components/control/ServicioTecnico.jsx'), 'utf8')
  assert.match(servicio, /import \{ BuscadorDispositivo, etiquetaDispositivo \} from 'owncoding-ui'/)
  assert.match(servicio, /<BuscadorDispositivo[^>]*tipo="servicio"/)
  assert.match(servicio, /partesDispositivo\(row\.device\)/, 'al editar se reabre la etiqueta')
  assert.ok(!/<Input id="dispositivo"/.test(servicio), 'el campo de equipo ya no es texto libre suelto')
  const garantias = readFileSync(join(RAIZ, 'components/control/Garantias.jsx'), 'utf8')
  assert.match(garantias, /<BuscadorDispositivo[^>]*tipo="accesorios"/)
  assert.match(garantias, /agregarRepuesto/, 'lo elegido se suma a la lista de repuestos')
  const tablero = readFileSync(join(RAIZ, 'components/control/TableroServicioGarantias.jsx'), 'utf8')
  assert.match(tablero, /partesDispositivo\(fila\.equipo\)/)
  // La etiqueta se arma y se abre en un solo módulo.
  const puente = readFileSync(join(RAIZ, 'lib/dispositivos.js'), 'utf8')
  for (const nombre of ['partesDispositivo', 'varianteDispositivo', 'tipoDeDispositivo']) {
    assert.match(puente, new RegExp(`export function ${nombre}\\(`), `falta ${nombre}`)
  }
  assert.ok(!/const SEPARADOR/.test(servicio), 'el separador de la etiqueta vive en lib/dispositivos')
})

// Lote #240/#220: compartir un documento imprimible como imagen sale del objeto
// compartido (`shared/CompartirImagen` + `lib/printing/compartirDocumento`); las
// pantallas no repiten iframe/canvas/navigator.
test('compartir documentos como imagen sale del objeto compartido (#240/#220)', () => {
  const pantallas = [
    'components/inventory/DocumentoUnidadModal.jsx',
    'components/shared/EtiquetasProductoModal.jsx',
    'components/inventory/TallerRack.jsx',
  ]
  for (const ruta of pantallas) {
    assert.match(
      readFileSync(join(RAIZ, ruta), 'utf8'),
      /import CompartirImagen from '@\/components\/shared\/CompartirImagen'/,
      `${ruta} comparte por el objeto`,
    )
  }
  const modulo = readFileSync(join(RAIZ, 'lib/printing/compartirDocumento.js'), 'utf8')
  for (const nombre of ['documentoAPng', 'compartirArchivo', 'copiarImagen', 'nombreImagenDocumento']) {
    assert.match(modulo, new RegExp(`export (async )?function ${nombre}\\(`), `falta ${nombre}`)
  }
  const componente = readFileSync(join(RAIZ, 'components/shared/CompartirImagen.jsx'), 'utf8')
  assert.ok(!/navigator\.|ClipboardItem/.test(componente), 'el navegador se toca solo en el módulo compartido')
  assert.ok(!/toPng/.test(componente), 'el rasterizado vive en el módulo, no en la pantalla')
})

// Lote 12: el QR y la ficha del informe público salen de los objetos; ninguna
// pantalla vuelve a llamar a `qrcode` por su cuenta.
test('el QR del informe sale de lib/qr y shared/CodigoQr (#240)', () => {
  const culpables = archivosFuente()
    .filter(({ ruta, contenido }) => !ruta.endsWith('lib/qr.js') && /from 'qrcode'|QRCode\.toDataURL/.test(contenido))
    .map(({ ruta }) => ruta)
  assert.deepEqual(culpables, [], 'el QR se genera solo en lib/qr.js')
  const qr = readFileSync(join(RAIZ, 'lib/qr.js'), 'utf8')
  assert.match(qr, /export async function qrDataUrl\(/)
  assert.match(qr, /export const QR_OPCIONES =/)
  assert.match(readFileSync(join(RAIZ, 'components/shared/CodigoQr.jsx'), 'utf8'), /export default function CodigoQr\(/)
  const ficha = readFileSync(join(RAIZ, 'components/shared/FichaCertificado.jsx'), 'utf8')
  for (const objeto of ['ChipEstado', 'ChipsLocks', 'CodigoQr', 'GradoBadge', 'MedidorBateria']) {
    assert.match(ficha, new RegExp(`<${objeto}\\b`), `la ficha de certificado compone ${objeto}`)
  }
})
