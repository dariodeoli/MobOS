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
// Los objetos migrados viven en la biblioteca y la app deja un puente: las
// aserciones de sus internals leen la fuente canónica (lote 38).
const LIB = fileURLToPath(new URL('../../node_modules/owncoding-ui/src/components', import.meta.url))
const leerBiblioteca = (ruta) => readFileSync(join(LIB, ruta), 'utf8')

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

test('las personas del shell se muestran con el objeto de identidad compartido', () => {
  // #211: la identidad es un solo objeto (PersonaChip, que envuelve al Avatar
  // y resuelve la foto subida → Google → iniciales). El shell no dibuja fotos
  // ni iniciales a mano.
  const codigo = leer(SHELL)
  assert.match(codigo, /<PersonaChip\b/, 'la persona de la barra lateral usa PersonaChip')
  assert.match(codigo, /from '@\/components\/shared\/PersonaChip'/, 'el objeto viene de la biblioteca compartida')
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

test('la búsqueda global delega el contrato de combobox en la paleta de la biblioteca', () => {
  // Lote 33 (#241): la paleta del shell es `PaletaComandos`; la app solo aporta
  // la consulta. El contrato combobox (rol, activedescendant, listbox) vive en
  // la biblioteca y no se vuelve a dibujar acá.
  const codigo = leer('components/app/GlobalSearch.jsx')
  assert.match(codigo, /import \{ PaletaComandos \} from 'owncoding-ui'/, 'la paleta sale de la biblioteca')
  assert.match(codigo, /ariaLabel="Buscar en toda la tienda"/, 'el campo conserva su etiqueta')
  assert.match(codigo, /conAtajo=\{false\}/, 'el atajo Ctrl+K lo maneja el shell')
  for (const atributo of ['role="combobox"', 'aria-activedescendant', 'role="listbox"', 'ArrowDown']) {
    assert.ok(!codigo.includes(atributo), `la app no debe reimplementar ${atributo}`)
  }
  const paleta = readFileSync(join(RAIZ, '../node_modules/owncoding-ui/src/components/PaletaComandos.jsx'), 'utf8')
  for (const atributo of ['role="combobox"', 'aria-activedescendant', 'role="listbox"', 'aria-autocomplete="list"']) {
    assert.ok(paleta.includes(atributo), `la paleta de la biblioteca debe exponer ${atributo}`)
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
  // Segmentado y subtabs compartidos. El período vive en PeriodoTabs
  // (#171: un solo objeto para Ganancias/Ganadores) y por dentro usa
  // SegmentedField; las pantallas no reimplementan pestañas.
  assert.match(leerBiblioteca('PeriodoTabs.jsx'), /SegmentedField[\s\S]{0,120}options=\{periodos\}/, 'PeriodoTabs: el período va con SegmentedField')
  assert.match(leer('components/shared/PeriodoTabs.jsx'), /PeriodoTabs as default/, 'PeriodoTabs delega en la biblioteca (lote 38)')
  for (const ruta of ['components/control/Ganancias.jsx', 'components/control/Ganadores.jsx']) {
    assert.match(leer(ruta), /<PeriodoTabs[\s\S]{0,120}(periodo|setPeriodo)=/, `${ruta}: el período va con PeriodoTabs`)
  }
  assert.match(leer('components/control/ListaVentasDia.jsx'.replace('control', 'ventas')), /<SegmentedField/, 'ListaVentasDia: los filtros van con SegmentedField')
  assert.ok(leer('components/ui/index.jsx').includes('export function Subtabs'), 'Subtabs vive en la UI compartida')
  assert.ok(!/function Subtabs\(/.test(leer('pages/PanelVendedor.jsx')), 'PanelVendedor no redefine Subtabs')
  // Estándar de tamaños de monto (#148 §9) en el campo compartido: marca el
  // monto que supera el límite del contexto, acotado al tope almacenable.
  assert.match(leer('components/ui/index.jsx'), /excedeMonto\(value, limite\)/, 'MoneyInput debe marcar el monto que supera el límite efectivo')
  assert.match(leer('components/ui/index.jsx'), /limiteMonto\(max\)/, 'el límite del campo se acota al tope almacenable')
  assert.match(leer('utils/moneda.js'), /LIMITE_MONTO_VENTAS = 99_000_000_000/, 'falta el límite de ventas')
  assert.match(leer('utils/moneda.js'), /LIMITE_MONTO_ALMACENABLE = 2_147_483_647/, 'falta el tope real de almacenamiento')
})

test('el logo sigue al tema: fondo oscuro → logo claro y fondo claro → logo oscuro (#163)', () => {
  const biblioteca = leer('lib/tenantLogo.js')
  assert.match(biblioteca, /export function varianteDeTema\(\)/, 'la variante por tema vive en tenantLogo')
  assert.match(biblioteca, /classList\.contains\('dark'\)/, 'la variante se decide por la clase dark de <html>')
  assert.match(leer('components/app/ThemeLogo.jsx'), /variante/, 'ThemeLogo puede forzar la variante cuando el fondo no sigue al tema')
  const pedido = sinComentarios(leer('pages/PedidoPublico.jsx'))
  assert.match(pedido, /variant=\$\{varianteDeTema\(\)\}/, 'el seguimiento pide la variante del tema activo')
  assert.doesNotMatch(pedido, /logo\?variant=dark/, 'el seguimiento no fija el logo claro sobre fondo claro')
  const celulares = leer('pages/Celulares.jsx')
  assert.match(celulares, /ThemeLogo[^>]{0,80}variante="dark"/, 'la tarjeta con degradé verde fuerza el logo claro')
})

test('finanzas: horas en 24 h, vacíos y estados con etiquetas (#205)', () => {
  // El barrido fino de #205 fija estas convenciones en el dominio de finanzas:
  // horas visibles en 24 h, vacíos con el EmptyState compartido y sin códigos
  // crudos de estado en pantalla.
  const FINANZAS = [
    'components/control/Caja.jsx',
    'components/control/Conciliacion.jsx',
    'components/control/AuditoriaEfectivo.jsx',
    'components/control/AuditoriaMedios.jsx',
    'components/control/Reportes.jsx',
    'components/control/Comisiones.jsx',
    'components/control/Config.jsx',
  ]
  for (const ruta of FINANZAS) {
    const codigo = leer(ruta)
    for (const match of codigo.matchAll(/(?:toLocaleTimeString|toLocaleString)\('es-PY',\s*\{([^}]*)\}/g)) {
      assert.match(match[1], /hour12:\s*false/, `${ruta}: la hora visible debe ir en 24 h (${match[0]})`)
    }
    assert.ok(!/new Date\([^)]*\)\.toLocaleString\('es-PY'\)/.test(codigo), `${ruta}: fecha y hora sin opciones explícitas`)
  }
  for (const ruta of ['components/control/Conciliacion.jsx', 'components/control/PaymentAccounts.jsx', 'components/control/AuditoriaEfectivo.jsx', 'components/control/AuditoriaMedios.jsx']) {
    assert.match(leer(ruta), /<EmptyState[\s\S]{0,200}title=/, `${ruta}: los vacíos van con el EmptyState compartido`)
  }
  const gastos = leer('components/control/Gastos.jsx')
  assert.match(gastos, /ESTADO_MOVIMIENTO = \{[^}]*CLEARED: 'Pagado'/, 'Gastos traduce el estado del movimiento')
  assert.ok(!/>\{row\.status/.test(gastos), 'Gastos no pinta el código crudo del estado')
  assert.ok(!/<button[^>]*>[^<]*<Icon/.test(leer('components/control/Comisiones.jsx')), 'las acciones de ícono de Comisiones van con IconAction (aria-label)')
})

test('la landing: identidad por tema, módulos nuevos y verificador de IMEI honesto (#202)', () => {
  const landing = leer('pages/Landing.jsx')
  assert.match(landing, /ThemeLogo/, 'la landing usa el logo que sigue al tema (#163)')
  assert.match(landing, /ThemeToggle/, 'la landing permite cambiar de tema')
  assert.match(landing, /ImeiVerificador/, 'la landing integra el verificador de IMEI')
  assert.match(landing, /CapturaModulo/, 'los módulos muestran su captura')
  for (const texto of ['POS completo', 'Cliente 360', 'Finanzas, caja y conciliación', 'Inventario por IMEI', 'Servicio técnico', 'Portal del cliente', 'Impresión de verdad', 'Funciona sin internet']) {
    assert.ok(landing.includes(texto), `la landing presenta ${texto}`)
  }
  // El verificador es una demo visual: no consulta ni cobra, y lo dice.
  const verificador = leer('components/landing/ImeiVerificador.jsx')
  assert.match(verificador, /Ejemplo simulado/, 'el resultado se marca como simulado')
  assert.match(verificador, /no se consulta al proveedor ni se cobra/, 'la sección aclara que no consulta ni cobra')
  const demo = leer('lib/imeiDemoLanding.js')
  assert.match(demo, /export const FUENTE_DEMO = .*\(simulado\)/, 'la fuente dice que es simulada')
  assert.match(demo, /from '\.\/imeiComprobante\.js'/, 'la demo reutiliza la validación y la máscara canónicas (#203)')
  assert.match(demo, /simulado: true/, 'el resultado se marca simulado')
  assert.match(demo, /NO_VERIFICADO = 'No verificado'/, 'sin verificar el estado es honesto')
  assert.doesNotMatch(demo, /'Limpio'/, 'la demo no inventa un "Limpio"')
})

test('la identidad de usuario tiene un solo objeto y la biblioteca suma tres objetos nuevos (#211)', () => {
  const chip = leer('components/shared/PersonaChip.jsx')
  assert.match(chip, /from '@\/components\/shared\/Avatar'/, 'PersonaChip envuelve al Avatar compartido')
  assert.match(chip, /identidadDeUsuario/, 'la identidad sale del adaptador compartido (#212)')
  assert.match(chip, /identidad\.picture/, 'la foto la resuelve el adaptador (local → Google → iniciales)')
  assert.match(chip, /identidad\.primerNombre/, 'nombreCorto muestra solo el primer nombre')
  assert.match(leer('lib/identidad.js'), /picture: primerTexto\(objeto\.picture/, 'el adaptador resuelve la foto local → Google')
  assert.match(chip, /ESTADOS = \{[\s\S]{0,120}'en-linea'/, 'acepta estado de presencia')
  const ui = leer('components/ui/index.jsx')
  for (const objeto of ['export function FilaDato', 'export function CeldaMoneda', 'export function BarraProgreso']) {
    assert.ok(ui.includes(objeto), `la UI compartida define ${objeto}`)
  }
  assert.match(ui, /role="progressbar"/, 'la barra de progreso es accesible')
  const doc = leer('../docs/PLANTILLA-OBJETOS.md')
  for (const nombre of ['PersonaChip', 'FilaDato', 'CeldaMoneda', 'BarraProgreso']) {
    assert.ok(doc.includes(nombre), `la biblioteca documenta ${nombre}`)
  }
  // Adopciones de esta entrega: la presencia del pedido (foto + primer nombre),
  // los totales del seguimiento y la barra del escaneo.
  assert.match(leer('components/ventas/PresenciaPedido.jsx'), /PersonaChip[\s\S]{0,160}nombreCorto/, 'la presencia del pedido usa PersonaChip con primer nombre')
  assert.match(leer('components/ventas/PresenciaPedido.jsx'), /persona\.id !== miId/, 'la presencia no se cuenta a sí misma')
  assert.doesNotMatch(leer('components/ventas/PresenciaPedido.jsx'), /está viendo este pedido[\s\S]{0,40}\{otros\[0\]\.name\}/, 'no arma la identidad a mano')
  assert.match(leer('pages/PedidoPublico.jsx'), /<FilaDato/, 'los totales del seguimiento usan FilaDato')
  assert.match(leer('pages/PedidoPublico.jsx'), /<CeldaMoneda/, 'los importes del seguimiento usan CeldaMoneda')
  assert.match(leer('components/landing/ImeiVerificador.jsx'), /<BarraProgreso/, 'la barra del escaneo es la compartida')
  assert.ok(!/function Barra\(/.test(leer('components/landing/CapturaModulo.jsx')), 'las capturas no redefinen la barra')
})

test('el patrón «último usado como predeterminado» está documentado con su base real (#209)', () => {
  const doc = leer('../docs/PLANTILLA-OBJETOS.md')
  assert.match(doc, /Último usado como predeterminado \(#209\)/, 'el patrón vive en la biblioteca')
  for (const regla of ['Solo selecciones frecuentes', 'Siempre cambiable y visible', 'Default sensato por pantalla', 'nunca datos sensibles']) {
    assert.ok(doc.includes(regla), `la regla documentada dice: ${regla}`)
  }
  // El helper compartido (#209) queda documentado por nombre: pendiente en PLT
  // y, cuando aterrice, API única de la sección.
  for (const api of ['useUltimoUsado(clave, inicial)', 'recordarUltimo(clave, valor)']) {
    assert.ok(doc.includes(api) || doc.includes(api.replace('(clave, inicial)', '').replace('(clave, valor)', '')), `la biblioteca nombra ${api}`)
  }
  // La base real que se reutiliza hasta entonces sigue existiendo.
  const recibo = leer('components/shared/OrderReceipt.jsx')
  assert.match(recibo, /export const nivelPreferido/, 'la base del comprobante sigue disponible')
  assert.match(recibo, /export const recordarPreferencia/, 'la base del comprobante sigue disponible')
  assert.match(leer('components/ventas/FormularioVenta.jsx'), /ULTIMO_VENDEDOR/, 'el último vendedor se sigue recordando')
})

test('el pedido: secciones plegables, avatar compartido y densidad (#164)', () => {
  assert.match(leer('components/shared/SeccionColapsable.jsx'), /SeccionColapsable as default/, 'el puente delega en la biblioteca (lote 38)')
  const colapsable = leerBiblioteca('SeccionColapsable.jsx')
  assert.match(colapsable, /aria-expanded/, 'la sección plegable expone su estado')
  assert.match(colapsable, /sessionStorage/, 'recuerda el estado durante la sesión')
  assert.match(colapsable, /hidden=\{!expandida\}/, 'el contenido se oculta sin desmontarse')
  const publico = leer('pages/PedidoPublico.jsx')
  assert.match(publico, /SeccionColapsable/, 'la página pública usa la sección plegable')
  // Orden pedido → cliente → cronología.
  const orden = ['titulo="Artículos"', 'titulo="Pagos"', 'titulo="Tus datos"', 'titulo="Cronología"'].map((titulo) => publico.indexOf(titulo))
  assert.ok(orden.every((indice) => indice >= 0), 'la página pública rotula las secciones')
  assert.ok(orden.every((indice, posicion) => posicion === 0 || indice > orden[posicion - 1]), 'la página pública ordena Pedido → Cliente → Cronología')
  // El contenedor interno no dibuja su propio avatar y usa el compartido.
  const detalle = leer('components/ventas/PedidoDetalle.jsx')
  assert.match(detalle, /import Avatar from '@\/components\/shared\/Avatar'/, 'el detalle usa el Avatar compartido')
  assert.doesNotMatch(detalle, /function Avatar\(/, 'el detalle no redefine el avatar')
  assert.match(detalle, /picture=\{event\.user\?\.picture\}/, 'la cronología pasa la foto de Google al Avatar')
  assert.match(leer('components/shared/Avatar.jsx'), /onError=\{\(\) => setGoogleRota\(true\)\}/, 'la foto de Google cae a iniciales si falla')
})
