import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Aserción de fuente del Lote 1 del rediseño (docs/REDISENO.md): el shell y el
// topbar son la única fuente de identidad y de acciones secundarias. Si una
// pantalla vuelve a dibujar su propia cabecera, un avatar a mano o un diálogo
// nativo, este test falla y obliga a reutilizar los objetos compartidos.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const SHELL = 'components/app/AppShell.jsx'

const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')
const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

function archivosFuente() {
  return readdirSync(RAIZ, { recursive: true })
    .filter((ruta) => /\.(jsx?|mjs)$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(RAIZ, ruta), 'utf8') }))
}

test('el shell dibuja un solo h1 y expone la miga de sección', () => {
  const codigo = leer(SHELL)
  const h1 = codigo.match(/<h1\b/g) || []
  assert.equal(h1.length, 1, 'el shell debe dibujar un solo h1: el título de la vista')
  assert.match(codigo, /data-testid="shell-breadcrumb"/, 'la cabecera debe exponer la miga de sección')
})

test('las personas del shell se muestran con el Avatar compartido', () => {
  const codigo = leer(SHELL)
  assert.match(codigo, /<Avatar\b/, 'la persona de la barra lateral usa el Avatar compartido')
  assert.ok(!/<img[^>]*rounded-full/.test(codigo), 'sin fotos de personas a mano')
  assert.ok(!/charAt\(0\)\.toUpperCase\(\)/.test(codigo), 'sin iniciales a mano')
})

test('las acciones secundarias viven en el menú del shell', () => {
  const codigo = leer(SHELL)
  assert.match(codigo, /data-testid="shell-drawer-acciones"/, 'el menú debe exponer el bloque de acciones')
  for (const texto of ['Buscar en toda la tienda', 'Tema claro / oscuro', 'Atajos de teclado', 'Cerrar sesión']) {
    assert.ok(codigo.includes(texto), `la acción «${texto}» debe vivir en el menú del shell`)
  }
})

test('la búsqueda global conserva el contrato de combobox', () => {
  const codigo = leer('components/app/GlobalSearch.jsx')
  for (const atributo of ['role="combobox"', 'aria-activedescendant', 'aria-controls="global-search-listbox"', 'role="listbox"', '<EmptyState']) {
    assert.ok(codigo.includes(atributo), `falta ${atributo}`)
  }
})

test('las pantallas no usan diálogos nativos del navegador', () => {
  const culpables = archivosFuente()
    .filter((archivo) => /\b(?:window\s*\.\s*)?(?:alert|confirm)\s*\(/.test(sinComentarios(archivo.contenido)))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el PIN se enmascara: texto oculto y máscara propia', () => {
  // #124: el enmascarado dependía de `-webkit-text-security: asterisk`, un
  // valor inexistente (solo none|circle|disc|square) → el navegador descartaba
  // la regla y el PIN quedaba a la vista. Ahora el input no dibuja el texto y
  // PinInput pinta un punto por dígito.
  const css = leer('index.css')
  assert.match(css, /\.pin-oculto\s*\{[^}]*color:\s*transparent/, 'el input del PIN debe ocultar el texto')
  const valores = [...css.matchAll(/-webkit-text-security:\s*([a-z-]+)/g)].map((m) => m[1])
  for (const valor of valores) {
    assert.ok(['none', 'circle', 'disc', 'square'].includes(valor), `valor inválido de -webkit-text-security: ${valor}`)
  }
})

test('PinInput pinta la máscara de puntos y no muestra los dígitos', () => {
  const codigo = leer('components/ui/index.jsx')
  assert.match(codigo, /pin-oculto/, 'el input de PIN debe usar la clase que oculta el texto')
  const mascara = codigo.slice(codigo.indexOf('export function PinInput'))
  assert.match(mascara, /aria-hidden="true"[\s\S]{0,400}rounded-full/, 'la máscara debe ser decorativa y de puntos')
  assert.ok(!/placeholder="••••"/.test(mascara), 'los puntos no pueden depender del placeholder del input')
})

test('los campos de dinero y porcentaje del barrido usan las primitivas', () => {
  // #136: no volver a inputs crudos en los campos unificados.
  const crudos = [
    ['components/control/Caja.jsx', 'setCounted(formatGsInput(e.target.value))'],
    ['components/control/Caja.jsx', 'setContadoAjeno(formatGsInput(e.target.value))'],
    ['components/customers/CustomerProfile.jsx', "setSolicitudLimite(event.target.value.replace(/\\D/g, '')"],
    ['components/inventory/UnidadDetalle.jsx', "setConsignadorMonto(event.target.value.replace(/\\D/g, '')"],
    ['components/control/Config.jsx', "setLimiteBajoLista(event.target.value.replace(/\\D/g, '')"],
    ['components/control/Config.jsx', "setLimiteFidelizacion(event.target.value.replace(/\\D/g, '')"],
  ]
  for (const [ruta, patron] of crudos) {
    assert.ok(!leer(ruta).includes(patron), `${ruta} volvió al input crudo: ${patron}`)
  }
  // Los campos siguen existiendo con la primitiva correspondiente.
  for (const [ruta, patron] of [
    ['components/control/Caja.jsx', /MoneyInput[\s\S]{0,200}id="counted"/],
    ['components/control/Caja.jsx', /MoneyInput[\s\S]{0,200}id="counted-ajeno"/],
    ['components/inventory/UnidadDetalle.jsx', /MoneyInput[\s\S]{0,160}consignadorMonto/],
    ['components/control/Config.jsx', /PercentField[\s\S]{0,200}id="limite-fidelizacion"/],
  ]) {
    assert.match(leer(ruta), patron, `${ruta}: falta la primitiva en el campo`)
  }
})

test('la biblioteca de objetos: búsquedas, toggles y segmentados compartidos', () => {
  // #147: los objetos canónicos existen, cubren el patrón y no se reimplementan
  // sueltos en las pantallas del barrido.
  for (const ruta of ['components/shared/SearchField.jsx', 'components/shared/Switch.jsx', 'components/shared/SegmentedField.jsx']) {
    assert.ok(leer(ruta).length > 0, `falta ${ruta}`)
  }
  // SearchField en las búsquedas del barrido.
  for (const ruta of [
    'components/ventas/ListaVentasDia.jsx',
    'components/ventas/SellerCatalog.jsx',
    'components/ventas/SellerOrders.jsx',
    'components/ventas/SellerCustomers.jsx',
    'components/ventas/SellerQuotes.jsx',
    'components/control/Compras.jsx',
    'components/control/Garantias.jsx',
    'components/control/Auditoria.jsx',
    'components/control/ServicioTecnico.jsx',
    'components/control/TradeInPipeline.jsx',
  ]) {
    assert.match(leer(ruta), /<SearchField[\s\S]{0,200}(placeholder|ariaLabel)=/, `${ruta}: la búsqueda va con SearchField`)
  }
  // Toggle estilo iPhone en los booleanos (no en selección múltiple).
  for (const ruta of ['components/control/PaymentAccounts.jsx', 'components/control/Precios.jsx', 'components/control/Inventario.jsx']) {
    assert.match(leer(ruta), /<Switch[\s\S]{0,160}checked=/, `${ruta}: el booleano va con Switch`)
  }
  // Segmentado y subtabs compartidos.
  assert.match(leer('components/control/Ganancias.jsx'), /SegmentedField[\s\S]{0,120}options=\{PERIODOS\}/, 'Ganancias: el período va con SegmentedField')
  assert.match(leer('components/control/ListaVentasDia.jsx'.replace('control', 'ventas')), /<SegmentedField/, 'ListaVentasDia: los filtros van con SegmentedField')
  assert.ok(leer('components/ui/index.jsx').includes('export function Subtabs'), 'Subtabs vive en la UI compartida')
  assert.ok(!/function Subtabs\(/.test(leer('pages/PanelVendedor.jsx')), 'PanelVendedor no redefine Subtabs')
  // Estándar de tamaños de monto (#148 §9) en el campo compartido.
  assert.match(leer('components/ui/index.jsx'), /excedeMonto\(value, max\)/, 'MoneyInput debe marcar el monto que supera el límite')
  assert.match(leer('utils/moneda.js'), /LIMITE_MONTO_VENTAS = 99_000_000_000/, 'falta el límite de ventas')
})
