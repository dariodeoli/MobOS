import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// Aserción de fuente: fija las reglas de docs/CAMPOS.md. Si un campo se
// reimplementa suelto dentro de una pantalla, este test falla y obliga a usar
// el objeto compartido.

const RAIZ = fileURLToPath(new URL('..', import.meta.url))

function archivosFuente() {
  return readdirSync(RAIZ, { recursive: true })
    .filter((ruta) => /\.(jsx?|mjs)$/.test(ruta) && !/\.test\./.test(ruta))
    .map((ruta) => ({ ruta: String(ruta).split(sep).join('/'), contenido: readFileSync(join(RAIZ, ruta), 'utf8') }))
}

test('la consulta de RUC vive solo en el objeto compartido RucField', () => {
  // `demoRuc.js` es el mock del navegador que usa el campo en la demo (#234):
  // no consulta el API, solo nombra el endpoint en su comentario.
  const permitidos = new Set(['components/shared/RucField.jsx', 'lib/demoRuc.js'])
  const culpables = archivosFuente()
    .filter((archivo) => /api\/ruc/.test(archivo.contenido) && !permitidos.has(archivo.ruta))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el extractor de RUC vive dentro del input y se ve en todos los lugares, también en demo (#234)', () => {
  // La UI vive en la biblioteca (el adaptador de la app aporta la consulta).
  const rucField = leerBiblioteca('RucField.jsx')
  assert.ok(rucField.includes('BotonDentroCampo'), 'el botón de extraer vive dentro del campo (objeto compartido)')
  assert.ok(!rucField.includes('<Button'), 'no vuelve un botón externo al lado del input')
  assert.ok(rucField.includes('Simulada en demo'), 'el resultado simulado se marca como tal')
  const adaptador = readFileSync(join(RAIZ, 'components/shared/RucField.jsx'), 'utf8')
  assert.ok(adaptador.includes('consultarRucDemo'), 'en demo resuelve contra el mock del navegador, sin /api/ruc')
  assert.ok(adaptador.includes('api.get(`/api/ruc'), 'en real consulta el endpoint con cuota y auditoría')

  const usos = archivosFuente().filter((archivo) => /<RucField/.test(archivo.contenido))
  const esperados = [
    'components/control/Compras.jsx',
    'components/control/Config.jsx',
    'components/control/DatosPrivados.jsx',
    'components/control/PaymentAccounts.jsx',
    'components/customers/CustomerProfile.jsx',
    'components/ventas/CheckoutCustomer.jsx',
    'components/ventas/SellerCustomers.jsx',
  ]
  assert.deepEqual(usos.map((archivo) => archivo.ruta).sort(), esperados, 'todos los lugares con RUC usan el objeto compartido')
  for (const uso of usos) {
    for (const bloque of uso.contenido.match(/<RucField[\s\S]*?\/>/g) || []) {
      assert.ok(/esDemo/.test(bloque), `${uso.ruta}: cada RucField declara esDemo para funcionar en la demo`)
      assert.ok(!/mostrarExtractor=\{!esDemo\}/.test(bloque), `${uso.ruta}: el extractor no se oculta en demo`)
    }
  }
})

test('el correo y el teléfono no se escriben como input crudo fuera de sus objetos', () => {
  const permitidos = new Set(['components/shared/EmailField.jsx', 'components/shared/PhoneField.jsx'])
  const culpables = archivosFuente()
    .filter((archivo) => !permitidos.has(archivo.ruta) && /type="(email|tel)"/.test(archivo.contenido))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('los catálogos se eligen con el Select compartido', () => {
  const permitidos = new Set([
    'components/ui/index.jsx',
    'components/shared/SelectorSucursal.jsx',
    'components/shared/SelectorMedioPago.jsx',
  ])
  const culpables = archivosFuente()
    .filter((archivo) => !permitidos.has(archivo.ruta) && /<select/.test(archivo.contenido))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

test('el comprobante público no expone el snapshot interno', () => {
  // El snapshot guarda la fila completa del pedido (incluido el comentario
  // interno y la facturación); el detalle público filtra por nivel de token y
  // solo sirve los campos que corresponden a ese nivel.
  const ruta = fileURLToPath(new URL('../../backend/app/api/orders/public/[token]/route.ts', import.meta.url))
  const codigo = readFileSync(ruta, 'utf8')
  assert.ok(!codigo.includes('receiptSnapshot'), 'el detalle público no debe servir el snapshot crudo')
  assert.ok(codigo.includes("acceso?.level"), 'el detalle público debe seguir filtrando por nivel')
})

test('las subidas de archivos pasan por el objeto compartido', () => {
  // El control nativo del navegador muestra "No file chosen" en inglés: la
  // unica aparicion de un input de archivo debe ser la del objeto compartido,
  // que lo esconde y ofrece un boton propio en espanol.
  const permitidos = new Set(['components/shared/AttachmentInput.jsx'])
  const culpables = archivosFuente()
    .filter((archivo) => /type="file"/.test(archivo.contenido) && !permitidos.has(archivo.ruta))
    .map((archivo) => archivo.ruta)

  assert.deepEqual(culpables, [])
})

// #253 (lote 34): la biblioteca ya publica el kit de campos y los objetos
// compuestos. La copia local es deuda de migración declarada (inventario en
// docs/AUDITORIA-DUPLICACION.md, lote 34) y solo puede bajar: un nombre NUEVO
// que duplique un componente publicado falla acá y obliga a decidir (usar el
// objeto de `owncoding-ui` o publicarlo allí).
const DEUDA_BIBLIOTECA = new Set([
  'Avatar', 'BancoCombobox', 'BancoLogo', 'Cronologia', 'PasosEquipo',
  'PersonaChip',
])

// Adaptadores (#253): la UI es de la biblioteca y la app solo aporta la capa de
// datos o la normalización propia. No son puentes (tienen lógica), pero no
// reimplementan la interfaz.
const ADAPTADORES = new Set(['RucField', 'CityAutocomplete', 'SerialField'])

const LIB_COMPONENTES = fileURLToPath(new URL('../../node_modules/owncoding-ui/src/components', import.meta.url))
const LIB_INDEX = fileURLToPath(new URL('../../node_modules/owncoding-ui/src/index.js', import.meta.url))
const leerBiblioteca = (ruta) => readFileSync(join(LIB_COMPONENTES, ruta), 'utf8')
const esPuente = (codigo) => /export\s*\{[^}]*\bas\s+default\b[^}]*\}\s*from\s*'owncoding-ui'/.test(codigo)

test('no aparecen copias locales nuevas de objetos publicados en la biblioteca (#253)', () => {
  const publicados = new Set(
    readdirSync(LIB_COMPONENTES)
      .filter((nombre) => nombre.endsWith('.jsx'))
      .map((nombre) => nombre.replace(/\.jsx$/, '')),
  )
  const locales = readdirSync(join(RAIZ, 'components/shared'))
    .filter((nombre) => nombre.endsWith('.jsx'))
    .map((nombre) => nombre.replace(/\.jsx$/, ''))
  const copias = locales.filter((nombre) => {
    if (!publicados.has(nombre) || ADAPTADORES.has(nombre)) return false
    return !esPuente(readFileSync(join(RAIZ, 'components/shared', `${nombre}.jsx`), 'utf8'))
  })
  const nuevas = copias.filter((nombre) => !DEUDA_BIBLIOTECA.has(nombre))
  assert.deepEqual(nuevas, [], 'un objeto nuevo no puede duplicar uno publicado en owncoding-ui')
  assert.ok(copias.length <= DEUDA_BIBLIOTECA.size, 'la deuda de duplicados con la biblioteca no puede crecer')
  // Lo ya migrado queda como puente sin implementación propia (lote 34 PanelDerecho
  // y lote 35 los 15 objetos idénticos: campos, chips, QR y vista previa).
  const puentes = [
    'BarraLote', 'BotonDentroCampo', 'ChipEstado', 'ChipsLocks', 'CodigoQr',
    'CurrencySelect', 'EmailField', 'EstadoBadge', 'FichaCertificado',
    'GradoBadge', 'Icon', 'IconoCategoria', 'InstagramField', 'ListGridToggle',
    'MedidorBateria', 'NumericKeypad', 'PanelDerecho', 'PegarEnlaceToken',
    'PercentField', 'PeriodoTabs', 'PhoneField', 'ProductCombobox',
    'SearchField', 'SeccionColapsable', 'SegmentedField', 'SemaforoItem',
    'SerialTexto', 'Switch', 'VistaPreviaPapel',
  ]
  for (const nombre of puentes) {
    const puente = readFileSync(join(RAIZ, 'components/shared', `${nombre}.jsx`), 'utf8')
    assert.match(puente, new RegExp(`${nombre} as default`), `${nombre} delega en la biblioteca`)
    assert.ok(!/function |=>/.test(puente.replace(/\/\/[^\n]*/g, '')), `${nombre}: el puente no implementa nada`)
  }
})

test('los adaptadores delegan la UI en la biblioteca (#253)', () => {
  const adaptadores = {
    RucField: { propio: /consultarRucDemo/, prohibido: /<Input\b/ },
    CityAutocomplete: { propio: /api\.get\(`\/api\/geo\/cities/, prohibido: /<Input\b|<ul\b/ },
    SerialField: { propio: /leerEtiqueta/, prohibido: /<Input\b/ },
  }
  for (const [nombre, reglas] of Object.entries(adaptadores)) {
    const codigo = readFileSync(join(RAIZ, 'components/shared', `${nombre}.jsx`), 'utf8')
    assert.match(codigo, /from 'owncoding-ui'/, `${nombre} usa la biblioteca`)
    assert.match(codigo, reglas.propio, `${nombre} conserva su lógica de datos`)
    assert.ok(!reglas.prohibido.test(codigo), `${nombre} no reimplementa la UI`)
  }
})

test('los objetos de Abastecimiento F1 (#250/#254) están publicados', () => {
  const indice = readFileSync(LIB_INDEX, 'utf8')
  for (const objeto of ['ChipPrioridad', 'ChipOrigen', 'ContadoresCompra', 'TarjetaNecesidad', 'PRIORIDADES_COMPRA', 'ORIGENES_NECESIDAD', 'ESTADOS_NECESIDAD', 'claveDePrioridad', 'claveDeEstado', 'ordenarPorPrioridad', 'PASOS_NECESIDAD', 'CONDICION_UNIDAD', 'etiquetaCondicion']) {
    assert.ok(indice.includes(objeto), `owncoding-ui debe publicar ${objeto} para la demanda F1`)
  }
  // Las colas del panel usan Subtabs con contador (#254).
  assert.match(readFileSync(join(LIB_COMPONENTES, 'ui.jsx'), 'utf8'), /items\.map\(\(\[id, label, contador\]\)/, 'Subtabs debe aceptar el contador de la cola')
  // El contrato del backend (INV) viaja en los mapas: prioridades, orígenes y
  // estados, así el panel de PLT no traduce nada.
  const mapas = readFileSync(join(LIB_COMPONENTES, '..', 'utils', 'abastecimiento.js'), 'utf8')
  for (const clave of ['urgente', 'alta', 'normal', 'baja', 'sale_no_stock', 'reservation_no_stock', 'abierta', 'asignada', 'comprada', 'recibida', 'cancelada']) {
    assert.match(mapas, new RegExp(`${clave}:`), `falta la clave ${clave} del contrato F1`)
  }
  // La tarjeta compone los objetos del abastecimiento y no reimplementa los mapas.
  const tarjeta = readFileSync(join(LIB_COMPONENTES, 'TarjetaNecesidad.jsx'), 'utf8')
  for (const pieza of ['ChipPrioridad', 'ContadoresCompra', 'ResumenDestinos', 'Vencimiento']) {
    assert.match(tarjeta, new RegExp(`<${pieza}\\b`), `la tarjeta compone ${pieza}`)
  }
  assert.match(tarjeta, /data-estado=/, 'la tarjeta expone el estado para los tests del panel')
})

test('el kit re-exporta la biblioteca y no reimplementa objetos (#253)', () => {
  const ui = readFileSync(join(RAIZ, 'components/ui/index.jsx'), 'utf8')
  assert.match(ui, /from 'owncoding-ui'/, 'el kit re-exporta la biblioteca')
  const inicio = ui.indexOf('export {')
  const bloque = ui.slice(inicio, ui.indexOf("} from 'owncoding-ui'", inicio))
  const reexportados = [...bloque.matchAll(/([A-Za-z0-9_]+),/g)].map((m) => m[1])
  for (const nombre of ['Input', 'Select', 'Textarea', 'Aviso', 'Nota', 'Badge', 'Button', 'PageHeader', 'PinInput', 'Money', 'CeldaMoneda', 'BarraProgreso', 'Subtabs', 'FormField']) {
    assert.ok(reexportados.includes(nombre), `el kit re-exporta ${nombre}`)
  }
  // Solo quedan locales los pendientes de decisión de diseño (DSN): al
  // resolverse se puentean igual que el resto.
  const locales = [...ui.matchAll(/^export (?:function|const) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]).sort()
  assert.deepEqual(locales, ['Card', 'Drawer', 'Modal', 'MoneyInput', 'Stat'], 'el kit no agrega objetos locales')
})

test('los objetos de Configuración (#253) están publicados en la biblioteca', () => {
  const indice = readFileSync(LIB_INDEX, 'utf8')
  for (const objeto of ['TarjetaAjuste', 'PanelDerecho', 'Subtabs', 'PageHeader', 'SeccionColapsable', 'Eyebrow', 'EstadoGuardado', 'Checkbox']) {
    assert.ok(indice.includes(objeto), `owncoding-ui debe publicar ${objeto} para la pantalla de Configuración`)
  }
  // La tarjeta de ajuste cubre el encabezado y el tono de archivar/eliminar.
  const tarjeta = readFileSync(join(LIB_COMPONENTES, 'TarjetaAjuste.jsx'), 'utf8')
  assert.match(tarjeta, /tono = 'normal'/, 'el default de la tarjeta no cambia')
  assert.match(tarjeta, /peligro && 'border-bad\/30'/, 'el tono peligro viene en el objeto')
  // El estado de guardado es de la biblioteca; la app conserva el hook con API.
  const guardado = readFileSync(join(RAIZ, 'components/control/GuardadoCuenta.jsx'), 'utf8')
  assert.match(guardado, /export \{ EstadoGuardado \} from 'owncoding-ui'/, 'el chip de guardado delega en la biblioteca')
  assert.ok(!/function EstadoGuardado/.test(guardado), 'no se reimplementa el estado de guardado')
  assert.match(guardado, /export function useGuardadoCuenta\(/, 'la app mantiene el hook de guardado con reautenticación')
})
