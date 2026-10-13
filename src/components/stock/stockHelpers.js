import { montoTexto } from '@/utils/moneda'
import { fechaHora } from '@/utils/fecha'
import { costoEnGs } from '@/utils/inventario'
import { leerEtiqueta } from '@/lib/printing/qr'

export const MOTIVOS_BAJA = ['Uso interno', 'Daño', 'Transferencia', 'Pérdida', 'Devolución a proveedor', 'Otro']
export const MOTIVOS_REVISION = ['Revisión física', 'Falla detectada', 'Verificación vencida', 'Otro']
// Formatos de impresión que acepta AEX (doc API v1.5.4, /envios/imprimir).
export const FORMATOS_ETIQUETA_AEX = [
  ['etiqueta8x6', 'Etiqueta 8 × 6 cm'],
  ['etiqueta8x10', 'Etiqueta 8 × 10 cm'],
  ['etiqueta65x45', 'Etiqueta 6,5 × 4,5 cm'],
  ['guia_A4', 'Guía A4 (retiro y entrega)'],
  ['guia_A5', 'Guía A5'],
  ['guia_A6', 'Guía A6'],
  ['guia', 'Guía (predeterminado de AEX)'],
]
export const VERIFIER_NAMES = { VPE: 'Edgar', VPM: 'Matheo' }
// Tonos de fila como la planilla: nuevos verde, semis amarillo, atajando/reservado
// lila, vendido rojo y asistencia/tránsito celeste.
export const rowTone = unit => unit.status === 'SOLD' ? 'border-l-4 border-l-bad/70 bg-bad/10' : unit.status === 'RESERVED' ? 'border-l-4 border-l-reserved/80 bg-reserved/10' : unit.status === 'IN_TRANSIT' || unit.status === 'DEFECTIVE' ? 'border-l-4 border-l-info/70 bg-info/10' : unit.condition === 'NEW' ? 'border-l-4 border-l-ok/70 bg-ok/10' : 'border-l-4 border-l-warn/70 bg-warn/10'
// Muestra de hasta 4 variantes distintas (un producto por modelo) de una ubicación.
export const locationSample = (units, locationId) => {
  const seen = new Set()
  const sample = []
  for (const unit of units) {
    if (unit.locationId !== locationId || seen.has(unit.productId)) continue
    seen.add(unit.productId)
    sample.push(unit)
    if (sample.length === 4) break
  }
  return sample
}
export const formatCost = unit => {
  const amount = Number(unit.originalCost)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return montoTexto(amount, unit.costCurrency)
}
// El verificador puede ser un usuario real (foto + nombre) o un código legacy
// de vendedor sin cuenta (VPE/VPM): en los dos casos la fila muestra su avatar.
export const verifiedLabel = (unit) => {
  const fecha = fechaHora(unit.lastVerifiedAt, '')
  const usuario = unit.lastVerifiedBy?.name ? unit.lastVerifiedBy : unit.verifiedByCode ? { name: VERIFIER_NAMES[unit.verifiedByCode] || unit.verifiedByCode } : null
  if (!fecha || !usuario) return null
  return { fecha, quien: usuario.name, usuario }
}
export const LOCATION_TONES = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa']
// Colores estables por nombre para las ubicaciones típicas del local; el resto
// cae en un tono derivado del id. Así "Piso de venta" siempre se ve verde y
// "Depósito 1/2" azules en cualquier pantalla.
export const LOCATION_TONES_NOMBRE = [
  [/piso de venta|sal[oó]n|mostrador/i, '#34d399'],
  [/dep[oó]sito\s*1/i, '#60a5fa'],
  [/dep[oó]sito\s*2/i, '#a78bfa'],
  [/dep[oó]sito/i, '#38bdf8'],
  [/recepci[oó]n/i, '#fbbf24'],
  [/taller|servicio/i, '#f472b6'],
]
export const locationTone = (location) => {
  const colorPropio = typeof location === 'object' ? location?.color : ''
  if (colorPropio && /^#[0-9a-fA-F]{6}$/.test(colorPropio)) return colorPropio
  const nombre = typeof location === 'string' ? location : location?.name || ''
  const porNombre = LOCATION_TONES_NOMBRE.find(([patron]) => patron.test(nombre))
  if (porNombre) return porNombre[1]
  const id = typeof location === 'string' ? location : location?.id || ''
  return LOCATION_TONES[[...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % LOCATION_TONES.length]
}
export const fechaVerificacion = (value) => {
  if (!value) return ''
  const date = new Date(value)
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit' })
  const mes = date.toLocaleDateString('es-PY', { month: 'short' }).replace('.', '')
  const hora = date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} ${mes} ${String(date.getFullYear()).slice(-2)} · ${hora}`
}
// Physical verification keeps the full actor and calendar date visible.
export const fechaVerificacionCorta = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const dos = (numero) => String(numero).padStart(2, '0')
  return `${dos(date.getDate())}/${dos(date.getMonth() + 1)}/${date.getFullYear()}`
}
// Header, loading and rows share one scoped, content-sized grid.
// Narrow containers switch to cards rather than clipping serialized identity.
export const UNIDADES_GRID = 'stock-f4-grid'
export const GRID_RESERVAS = 'grid min-w-[44rem] grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,0.9fr)_minmax(6rem,1.1fr)_6rem_15rem] items-center gap-x-2'
export const GRID_ELIMINADOS = 'grid min-w-[42rem] grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,0.9fr)_minmax(7rem,1.6fr)_7rem] items-center gap-x-2'
// #218: el lote suma ETA y Despachó/Recibió al detalle del tránsito.
export const GRID_TRASLADOS = 'grid min-w-[72rem] grid-cols-[minmax(9rem,1.3fr)_minmax(7rem,1.2fr)_4rem_6rem_5.5rem_6rem_6rem_minmax(7rem,0.9fr)_7rem_13rem] items-center gap-x-2'
export const fechaReserva = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const dia = date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).replace('.', '')
  return `${dia} · ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
// Acciones de una unidad, compartidas por la fila de escritorio y la tarjeta
// móvil (#304). `incluirVerificar` suma la verificación al menú cuando la vista
// no tiene el botón inline (la tarjeta móvil no lo tiene).
export function accionesDeUnidad(unit, handlers, { incluirVerificar = false } = {}) {
  return [
    ...(unit.status === 'SOLD' ? [{ label: 'Comprobante rápido', tooltip: 'Imprimir el comprobante de la venta sin abrir la ficha', icon: 'receipt', run: () => handlers.onComprobante?.(unit) }] : []),
    // #279 (A4): el equipo que viaja se puede apartar para una venta futura.
    ...(unit.status === 'IN_TRANSIT' && !unit.transitAssignment ? [{ label: 'Apartar para una venta', tooltip: 'Bloquear este equipo que viaja para una venta (se vincula solo al llegar)', icon: 'clock', run: () => handlers.onApartar?.(unit) }] : []),
    ...(unit.status === 'IN_TRANSIT' && unit.transitAssignment ? [{ label: 'Liberar apartado', tooltip: 'Soltar la asignación futura de este equipo', icon: 'alert', run: () => handlers.onLiberarApartado?.(unit) }] : []),
    { label: 'Vender', tooltip: 'Cargar la venta de esta unidad', icon: 'cart', run: () => handlers.onSell?.(unit) },
    { label: 'Reservar', tooltip: 'Apartar la unidad para un cliente', icon: 'clock', run: () => handlers.onReserve?.(unit) },
    // #305: en la tabla «Verificar» vive solo en el botón de la columna; la
    // tarjeta móvil no lo tiene, así que lo suma al menú (#304).
    ...(incluirVerificar ? [{ label: 'Verificar', tooltip: 'Registrar la verificación física ahora', icon: 'check', run: () => handlers.onVerify?.(unit) }] : []),
    { label: 'Imprimir etiqueta', tooltip: 'Imprimir la etiqueta de esta unidad', icon: 'printer', run: () => handlers.onLabel?.(unit) },
    { label: 'Enviar a revisión', tooltip: 'Marcar la unidad en revisión con un motivo', icon: 'alert', run: () => handlers.onAdjust?.(unit) },
    { label: 'Cambiar ubicación', tooltip: 'Mover la unidad a otro depósito o sucursal', icon: 'box', run: () => handlers.onMove?.(unit) },
    { label: 'Dar de baja', tooltip: 'Sacar la unidad del stock (queda en Eliminados)', icon: 'trash', run: () => handlers.onRemove?.(unit) },
  ]
}
// Display only: retain stored zero without changing shared financial valuation.
export function costoVisible(unit, cotizacion) {
  const missing = value => value == null || (typeof value === 'string' && !value.trim())
  const amount = value => {
    if (missing(value) || !['number', 'string'].includes(typeof value)) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const original = amount(unit.originalCost)
  const sinCosto = missing(unit.costPyg) && missing(unit.originalCost)
  const storedPyg = !missing(unit.costPyg)
  const valid = storedPyg ? amount(unit.costPyg) !== null : original !== null
  const currency = unit.costCurrency || 'PYG'
  const rate = amount(unit.exchangeRatePyg)
  const zeroInGs = original === 0 && (currency === 'PYG' || (Number.isFinite(rate) && rate > 0))
  const costoGs = !valid
    ? null
    : !storedPyg && zeroInGs
      ? 0
      : costoEnGs(storedPyg ? unit : { ...unit, costPyg: null })
  const enUsd = !valid
    ? null
    : costoGs === null
      ? currency === 'USD' && original === 0
        ? 0
        : null
      : currency === 'USD' && !cotizacion && original !== null
        ? original
        : cotizacion > 0
          ? costoGs / cotizacion
          : currency === 'USD' && original !== null
            ? original
            : null
  return { costoGs, enUsd, sinCosto }
}
// Un QR nuevo llega como URL de la app (`/u/<serial>`) y el lector de barras
// sigue mandando `MOBOS:<serial>`: las dos formas entran al mismo flujo.
export const normalizeScan = (value = '') => {
  const etiqueta = leerEtiqueta(value)
  const crudo = etiqueta.tipo === 'UBI'
    ? `UBI:${etiqueta.valor}`
    : etiqueta.tipo === 'UNIDAD'
      ? etiqueta.valor
      : etiqueta.tipo
        ? `${etiqueta.tipo}:${etiqueta.valor}`
        : String(value)
  return crudo.trim().replace(/^MOBOS:/i, '').replace(/[\s-]+/g, '').toUpperCase()
}
export const safe = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
export const INVENTARIO_TABS = ['unidades', 'taller', 'alertas', 'reservas', 'traslados', 'vendidos', 'transito', 'ubicaciones', 'compartido', 'eliminados', 'conteos', 'autorizaciones']
// #305: la navegación agrupa las vistas en tres bloques (Stock · Movimientos ·
// Control). El grupo activo se deriva de la pestaña actual, así los enlaces
// directos (/stock/transito, y /inventario/transito por redirección) siguen
// abriendo su vista.
export const GRUPOS_INVENTARIO = [
  { id: 'stock', label: 'Stock', tabs: ['unidades', 'reservas', 'ubicaciones', 'alertas'] },
  { id: 'movimientos', label: 'Movimientos', tabs: ['transito', 'traslados', 'vendidos', 'eliminados'] },
  { id: 'control', label: 'Control', tabs: ['taller', 'conteos', 'compartido', 'autorizaciones'] },
]
export const TAB_LABEL = {
  unidades: 'Unidades', reservas: 'Reservas', ubicaciones: 'Ubicaciones', alertas: 'Alertas',
  transito: 'En tránsito', traslados: 'Traslados', vendidos: 'Vendidos', eliminados: 'Eliminados',
  taller: 'Taller', conteos: 'Conteos', compartido: 'Compartido', autorizaciones: 'Autorizaciones',
}
export const ESTADO_CONTEO = { DRAFT: ['Borrador', 'orange'], APPLIED: ['Aplicado', 'green'], CANCELLED: ['Cancelado', 'slate'] }

// U3: pestañas servidas por la lista unificada (GET /api/stock/items, con cursor).
export const TABS_LISTA_STOCK = ['unidades', 'vendidos', 'eliminados']
// Pestañas que todavía necesitan el inventario completo (ficha, tránsito, conteo…).
export const TABS_CON_UNIDADES = ['taller', 'alertas', 'transito', 'traslados', 'conteos', 'autorizaciones']

// U3: la barra muestra Unidades · Reservas · Movimientos · Control. Cada sección
// agrupa sus vistas (Unidades suma Ubicaciones y Alertas; Movimientos y Control
// conservan las suyas), así las doce pestañas siguen alcanzables.
export function seccionesDeStock(grupos = GRUPOS_INVENTARIO) {
  const secciones = []
  for (const grupo of grupos) {
    if (grupo.id === 'stock') {
      const resto = grupo.tabs.filter((id) => id !== 'reservas')
      if (resto.length) secciones.push({ id: 'unidades', label: 'Unidades', tabs: resto })
      if (grupo.tabs.includes('reservas')) secciones.push({ id: 'reservas', label: 'Reservas', tabs: ['reservas'] })
    } else if (grupo.tabs.length) {
      secciones.push({ id: grupo.id, label: grupo.label, tabs: grupo.tabs })
    }
  }
  return secciones
}
export const seccionDeTab = (secciones, tab) => secciones.find((seccion) => seccion.tabs.includes(tab)) || secciones[0]
