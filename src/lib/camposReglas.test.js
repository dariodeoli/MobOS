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
  const rucField = readFileSync(join(RAIZ, 'components/shared/RucField.jsx'), 'utf8')
  assert.ok(rucField.includes('BotonDentroCampo'), 'el botón de extraer vive dentro del campo (objeto compartido)')
  assert.ok(!rucField.includes('<Button'), 'no vuelve un botón externo al lado del input')
  assert.ok(rucField.includes('consultarRucDemo'), 'en demo resuelve contra el mock del navegador, sin /api/ruc')
  assert.ok(rucField.includes('Simulada en demo'), 'el resultado simulado se marca como tal')

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
  'Avatar', 'BancoCombobox', 'BancoLogo', 'BarraLote', 'BotonDentroCampo',
  'ChipEstado', 'ChipsLocks', 'CityAutocomplete', 'CodigoQr', 'Cronologia',
  'CurrencySelect', 'EmailField', 'EstadoBadge', 'FichaCertificado',
  'GradoBadge', 'Icon', 'IconoCategoria', 'InstagramField', 'ListGridToggle',
  'MedidorBateria', 'NumericKeypad', 'PasosEquipo', 'PegarEnlaceToken',
  'PercentField', 'PeriodoTabs', 'PersonaChip', 'PhoneField',
  'ProductCombobox', 'RucField', 'SearchField', 'SeccionColapsable',
  'SegmentedField', 'SemaforoItem', 'SerialField', 'SerialTexto', 'Switch',
  'VistaPreviaPapel',
])

const LIB_COMPONENTES = fileURLToPath(new URL('../../node_modules/owncoding-ui/src/components', import.meta.url))
const LIB_INDEX = fileURLToPath(new URL('../../node_modules/owncoding-ui/src/index.js', import.meta.url))
const esPuente = (codigo) => /export\s*\{\s*\w+\s+as\s+default\s*\}\s*from\s*'owncoding-ui'/.test(codigo)

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
    if (!publicados.has(nombre)) return false
    return !esPuente(readFileSync(join(RAIZ, 'components/shared', `${nombre}.jsx`), 'utf8'))
  })
  const nuevas = copias.filter((nombre) => !DEUDA_BIBLIOTECA.has(nombre))
  assert.deepEqual(nuevas, [], 'un objeto nuevo no puede duplicar uno publicado en owncoding-ui')
  assert.ok(copias.length <= DEUDA_BIBLIOTECA.size, 'la deuda de duplicados con la biblioteca no puede crecer')
  // Lo ya migrado queda como puente sin implementación propia.
  assert.match(
    readFileSync(join(RAIZ, 'components/shared/PanelDerecho.jsx'), 'utf8'),
    /PanelDerecho as default/,
    'PanelDerecho delega en la biblioteca (#253)',
  )
})

test('los objetos de Configuración (#253) están publicados en la biblioteca', () => {
  const indice = readFileSync(LIB_INDEX, 'utf8')
  for (const objeto of ['TarjetaAjuste', 'PanelDerecho', 'Subtabs', 'PageHeader', 'SeccionColapsable', 'Eyebrow']) {
    assert.ok(indice.includes(objeto), `owncoding-ui debe publicar ${objeto} para la pantalla de Configuración`)
  }
  // La tarjeta de ajuste cubre el encabezado y el tono de archivar/eliminar.
  const tarjeta = readFileSync(join(LIB_COMPONENTES, 'TarjetaAjuste.jsx'), 'utf8')
  assert.match(tarjeta, /tono = 'normal'/, 'el default de la tarjeta no cambia')
  assert.match(tarjeta, /peligro && 'border-bad\/30'/, 'el tono peligro viene en el objeto')
})
