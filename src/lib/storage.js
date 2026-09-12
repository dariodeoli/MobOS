// ════════════════════════════════════════════════════════════════════
// CAPA DE COMPATIBILIDAD LOCAL — MobOS
// El backend productivo es la API propia sobre PostgreSQL. Esta capa mantiene
// únicamente los datos locales que necesita el demo y módulos aún en transición.
// La API exportada es SINCRÓNICA (igual que antes con localStorage): los
// componentes la usan sin async. Por dentro:
//   - cache en memoria = fuente de verdad para la UI
//   - espejo en localStorage = pintado instantáneo y modo offline
// Nadie más debe tocar localStorage directamente.
// ════════════════════════════════════════════════════════════════════

import { num } from '@/utils/calculos'
import { APP_NAME } from '@/lib/brand'
import { api } from '@/lib/api'
import { isDemoRuntime } from './demoMode'

export const ESTADOS_CELULAR = ['Nuevo', 'Seminuevo']

// Lineup de iPhone para cargar rápido la lista de precios. El precio en ₲ lo
// define el propietario. Hay dos listas según la condición del equipo.
export const LINEUP_NUEVO = [
  ['iPhone 17 Pro Max', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone 17 Pro', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone Air', ['256GB', '512GB', '1TB']],
  ['iPhone 17', ['256GB', '512GB']],
  ['iPhone 17E', ['256GB']],
  ['iPhone 16', ['128GB']],
  ['iPhone 15', ['128GB']],
]

export const LINEUP_SEMINUEVO = [
  ['iPhone 17 Pro Max', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone 17 Pro', ['256GB', '512GB', '1TB', '2TB']],
  ['iPhone Air', ['256GB', '512GB', '1TB']],
  ['iPhone 17', ['256GB', '512GB']],
  ['iPhone 17E', ['256GB']],
  ['iPhone 16 Pro Max', ['128GB', '256GB']],
  ['iPhone 16 Pro', ['128GB', '256GB']],
  ['iPhone 16', ['128GB']],
  ['iPhone 15 Pro Max', ['128GB', '256GB']],
  ['iPhone 15 Pro', ['128GB', '256GB']],
  ['iPhone 15', ['128GB']],
  ['iPhone 14 Pro Max', ['128GB', '256GB']],
  ['iPhone 14 Pro', ['128GB', '256GB']],
  ['iPhone 14', ['128GB']],
  ['iPhone 13 Pro Max', ['128GB', '256GB']],
  ['iPhone 13 Pro', ['128GB', '256GB']],
  ['iPhone 13', ['128GB']],
]

// Orden visual de los modelos (más nuevo arriba). Se usa para ordenar la lista
// sin depender de cómo se hayan ido cargando.
export const ORDEN_MODELOS = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone Air',
  'iPhone 17',
  'iPhone 17E',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 16e',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 15 Plus',
  'iPhone 15',
  'iPhone 14',
  'iPhone 13',
]
// Devuelve un número menor para los modelos más nuevos, listo para ordenar
// ascendente. Se calcula por generación (17 antes que 16…) y, dentro de la
// misma, por variante: Pro Max → Pro → Air → Plus → base → E. Es tolerante a
// cómo esté escrito el nombre ("iPhone 17 Air" o "iPhone Air", "16e", etc.).
export function rankCelular(modelo) {
  const m = (modelo || '').toLowerCase().trim()
  let gen = parseInt((m.match(/iphone\s*(\d+)/) || [])[1] || '0', 10)
  // "iPhone Air" sin número pertenece a la generación actual (17).
  if (!gen && m.includes('air')) gen = 17
  const resto = m.replace(/iphone\s*\d+/, '').trim()
  let suf = 4
  if (resto.includes('pro max')) suf = 0
  else if (resto.includes('pro')) suf = 1
  else if (resto.includes('air')) suf = 2
  else if (resto.includes('plus')) suf = 3
  else if (resto === 'e') suf = 5
  return (100 - gen) * 10 + suf
}

// Orden de capacidades dentro de un mismo modelo (de menor a mayor).
const CAP_ORDEN = ['64gb', '128gb', '256gb', '512gb', '1tb', '2tb']
export function rankCapacidad(cap) {
  const i = CAP_ORDEN.indexOf((cap || '').toLowerCase().replace(/\s+/g, ''))
  return i === -1 ? 99 : i
}

// Un modelo es "viejo" (anterior al iPhone 13) si su generación es < 13, o si
// es un iPhone SE. Sirve para limpiar la lista dejando solo del 13 en adelante.
export function esModeloViejo(modelo) {
  const m = (modelo || '').toLowerCase()
  if (m.includes('iphone se') || /\bse\b/.test(m)) return true
  const gen = parseInt((m.match(/iphone\s*(\d+)/) || [])[1] || '0', 10)
  return gen > 0 && gen < 13
}

export const CATEGORIAS_GASTO = [
  'Mercadería',
  'Alquiler',
  'Servicios',
  'Sueldos',
  'Logística',
  'Impuestos',
  'Otros',
]

// ── Constantes de dominio ───────────────────────────────────────────
export const MEDIOS_PAGO = [
  'UENO BANK',
  'POS UENO',
  'PIK ITAÚ',
  'DINELCO',
  'DINERO',
  'CONTINENTAL',
  'FAMILIAR',
]

export const ESTADOS_PAGO = ['Pagado', 'No pagado']

export const ENTREGA = ['Retiro en tienda', 'Delivery', 'Encomienda']

// ── Defaults ────────────────────────────────────────────────────────
function prod(nombre, categoria) {
  return {
    id: nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    nombre,
    categoria,
    precioVenta: 0,
    precioMayorista: 0,
    precioCosto: 0,
    comision: 0,
    stock: 0,
    activo: true,
  }
}

const PRODUCTOS_DEFAULT = [
  prod('Skin Pitón Blanco', 'Skins'),
  prod('Skin Pitón Negro', 'Skins'),
  prod('Skin Pitón Azul', 'Skins'),
  prod('Skin Transparente', 'Skins'),
  prod('Skin Holográfica', 'Skins'),
  prod('Protector 17 Pro Max Azul', 'Protectores'),
  prod('Protector 17 Pro Max Naranja', 'Protectores'),
  prod('Protector 17 Pro Max Silver', 'Protectores'),
  prod('Protector 17 Pro Azul', 'Protectores'),
  prod('Protector 17 Pro Naranja', 'Protectores'),
  prod('Protector 17 Pro Silver', 'Protectores'),
  prod('Protector de Cámara Samsung', 'Protectores'),
  prod('Protector de Cámara iPhone', 'Protectores'),
  prod('Cargador Portátil', 'Accesorios'),
  prod('Cargador MagSafe Portátil', 'Accesorios'),
  prod('Strap', 'Accesorios'),
  prod('Tarjetero MagSafe', 'Accesorios'),
]

// Sin vendedores de ejemplo: el dueño carga los nombres reales desde el
// formulario de venta ("➕ Agregar vendedor") o desde el Centro de Control.
const VENDEDORES_DEFAULT = []

const FRASES_DEFAULT = [
  'Cada venta te acerca a tu meta. ¡Vamos!',
  'El éxito es la suma de pequeños esfuerzos repetidos día a día.',
  'No cuentes los días, haz que los días cuenten.',
  'Tu actitud determina tu dirección. ¡Hoy es un gran día!',
  'Los clientes compran confianza antes que productos. Sonreí.',
  'La constancia vence al talento. Seguí firme.',
  'Hoy es el mejor día para superar tu marca de ayer.',
  'Vendé con pasión, atendé con el corazón.',
  'Las metas grandes se logran con acciones pequeñas y constantes.',
  'Creé en vos: ya hiciste lo difícil, ahora cerrá la venta.',
]

const CONFIG_DEFAULT = {
  clavePanel: 'fono2024', // el propietario la cambia en el Centro de Control
  nombreTienda: APP_NAME,
}

const TRADEIN_DEFAULT = {
  exchangeRate: 7300,
  exchangeMarket: 0, // valor de la casa de cambio antes del ajuste (lo setea la función automática)
  exchangeAdjust: 0, // ₲ que se suman al valor de mercado (markup propio)
  exchangeSource: 'Cambios Chaco',
  exchangeDate: new Date().toISOString().split('T')[0],
  exchangeUpdatedAt: null, // ISO de la última actualización automática
  conditionMultipliers: {
    excelente: { label: 'Excelente', desc: 'Sin rayones, impecable', value: 0.85 },
    bueno: { label: 'Bueno', desc: 'Pequeños rayones, bien conservado', value: 0.7 },
    regular: { label: 'Regular', desc: 'Rayones visibles, desgaste notable', value: 0.55 },
    danado: { label: 'Con daños', desc: 'Pantalla rota, golpes o daños visibles', value: 0.35 },
  },
  batteryMultipliers: {
    '90-100': { label: '90% – 100%', desc: 'Excelente salud de batería', value: 1.0 },
    '80-89': { label: '80% – 89%', desc: 'Buen estado de batería', value: 0.95 },
    '70-79': { label: '70% – 79%', desc: 'Batería con desgaste', value: 0.9 },
    menos70: { label: 'Menos del 70%', desc: 'Batería muy desgastada', value: 0.8 },
  },
  repairMultipliers: {
    pantalla: {
      label: 'Pantalla reemplazada por terceros',
      desc: 'Display cambiado por servicio no oficial',
      value: 0.88,
    },
    camara: {
      label: 'Cámara reemplazada por terceros',
      desc: 'Módulo de cámara cambiado por terceros',
      value: 0.92,
    },
    bateria: {
      label: 'Batería reemplazada por terceros',
      desc: 'Batería cambiada por servicio no oficial',
      value: 0.95,
    },
  },
  devices: [
    {
      model: 'iPhone 17 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 850, '512GB': 950, '1TB': 1050 },
    },
    {
      model: 'iPhone 17 Pro',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 750, '512GB': 850, '1TB': 950 },
    },
    { model: 'iPhone 17', capacities: ['256GB', '512GB'], prices: { '256GB': 520, '512GB': 640 } },
    {
      model: 'iPhone 16 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 950, '512GB': 1050, '1TB': 1150 },
    },
    {
      model: 'iPhone 16 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 850, '256GB': 900, '512GB': 980, '1TB': 1080 },
    },
    {
      model: 'iPhone 16 Plus',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 700, '256GB': 750, '512GB': 820 },
    },
    {
      model: 'iPhone 16',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 620, '256GB': 670, '512GB': 730 },
    },
    {
      model: 'iPhone 15 Pro Max',
      capacities: ['256GB', '512GB', '1TB'],
      prices: { '256GB': 800, '512GB': 880, '1TB': 960 },
    },
    {
      model: 'iPhone 15 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 700, '256GB': 750, '512GB': 820, '1TB': 900 },
    },
    {
      model: 'iPhone 15 Plus',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 580, '256GB': 630, '512GB': 700 },
    },
    {
      model: 'iPhone 15',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 520, '256GB': 570, '512GB': 630 },
    },
    {
      model: 'iPhone 14 Pro Max',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 650, '256GB': 700, '512GB': 770, '1TB': 850 },
    },
    {
      model: 'iPhone 14 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 570, '256GB': 620, '512GB': 680, '1TB': 760 },
    },
    {
      model: 'iPhone 14',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 420, '256GB': 460, '512GB': 510 },
    },
    {
      model: 'iPhone 13 Pro Max',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 520, '256GB': 570, '512GB': 630, '1TB': 710 },
    },
    {
      model: 'iPhone 13 Pro',
      capacities: ['128GB', '256GB', '512GB', '1TB'],
      prices: { '128GB': 450, '256GB': 490, '512GB': 540, '1TB': 620 },
    },
    {
      model: 'iPhone 13',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 360, '256GB': 390, '512GB': 440 },
    },
    {
      model: 'iPhone 12 Pro Max',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 380, '256GB': 420, '512GB': 470 },
    },
    {
      model: 'iPhone 12 Pro',
      capacities: ['128GB', '256GB', '512GB'],
      prices: { '128GB': 330, '256GB': 360, '512GB': 410 },
    },
    {
      model: 'iPhone 12',
      capacities: ['64GB', '128GB', '256GB'],
      prices: { '64GB': 250, '128GB': 280, '256GB': 320 },
    },
    {
      model: 'iPhone 11 Pro Max',
      capacities: ['64GB', '256GB', '512GB'],
      prices: { '64GB': 280, '256GB': 320, '512GB': 360 },
    },
    {
      model: 'iPhone 11 Pro',
      capacities: ['64GB', '256GB', '512GB'],
      prices: { '64GB': 240, '256GB': 270, '512GB': 310 },
    },
    {
      model: 'iPhone 11',
      capacities: ['64GB', '128GB', '256GB'],
      prices: { '64GB': 180, '128GB': 210, '256GB': 240 },
    },
  ],
}

// ════════════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA + ESPEJO LOCAL
// ════════════════════════════════════════════════════════════════════
const COLLECTIONS = [
  'productos',
  'mayoristas',
  'ventasMay',
  'vendedores',
  'ventas',
  'gastos',
  'ads',
  'celulares',
  'auditoria',
  'comparadorImg',
]
// Colecciones tipo "feed": se muestran de la más nueva a la más vieja.
const FEEDS = new Set(['ventas', 'gastos', 'ads', 'auditoria'])

// Colecciones que las sucursales de una misma empresa COMPARTEN: el catálogo
// y la lista de precios se cargan una vez y valen para todos los locales. El
// resto (ventas, gastos, stock, equipo) es de cada sucursal.

// ── Contexto: a qué empresa y sucursal pertenece lo que se lee y escribe ──
// Lo setea setContexto() después del login. Sin empresa, la capa de datos
// queda inerte: no lee ni escribe nada.
const ctx = { empresaId: null, sucursalId: null, userId: null, rol: null }
let fuenteDatos = 'legacy'
export const modoDatosActual = () => fuenteDatos
const apiMode = () => fuenteDatos === 'api'
export const contextoActual = () => ({ ...ctx })
export const hayContexto = () => Boolean(ctx.empresaId)

// El espejo local se guarda por empresa. Si fuera uno solo, al cambiar de
// tienda verías por un instante los datos de la anterior.
const MIRROR_BASE = 'fono:cache:v3'
const mirrorKey = () => `${MIRROR_BASE}:${ctx.empresaId || 'sin-empresa'}`

const clone = (x) => JSON.parse(JSON.stringify(x))
function safeParse(raw) {
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const cache = {
  productos: [],
  mayoristas: [],
  ventasMay: [],
  vendedores: [],
  ventas: [],
  gastos: [],
  ads: [],
  celulares: [],
  auditoria: [],
  tradein: clone(TRADEIN_DEFAULT),
  config: { ...CONFIG_DEFAULT },
  comparadorImg: [], // 1 registro por imagen: { id, modelo, color, img } (colección)
}

// Deja la caché en blanco (al entrar a otra empresa o al cerrar sesión).
function vaciarCache() {
  COLLECTIONS.forEach((c) => {
    cache[c] = []
  })
  cache.tradein = clone(TRADEIN_DEFAULT)
  cache.config = { ...CONFIG_DEFAULT }
}

// Pintado instantáneo: levanta el último estado conocido de ESTA empresa.
// Antes corría al importar el módulo; ahora corre al entrar, porque hasta que
// no sabemos la empresa no sabemos qué espejo leer.
function bootFromMirror() {
  vaciarCache()
  try {
    const m = safeParse(localStorage.getItem(mirrorKey()))
    if (m && typeof m === 'object') Object.assign(cache, m)
  } catch {
    /* localStorage bloqueado: seguimos solo en memoria */
  }
  // Garantiza que toda colección sea un array (por si un espejo viejo guardó
  // otra forma, ej. comparadorImg que antes era un objeto).
  COLLECTIONS.forEach((c) => {
    if (!Array.isArray(cache[c])) cache[c] = []
  })
}

function persistMirror() {
  if (!ctx.empresaId || apiMode()) return
  try {
    localStorage.setItem(mirrorKey(), JSON.stringify(cache))
  } catch {
    /* noop */
  }
}

// ── Suscripción (re-render de la UI) ────────────────────────────────
const listeners = new Set()
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* noop */
    }
  })
}

// Sync entre pestañas del mismo dispositivo para el demo/local.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (ctx.empresaId && e.key === mirrorKey()) {
      const m = safeParse(e.newValue)
      if (m && typeof m === 'object') {
        Object.assign(cache, m)
        notify()
      }
    }
  })
}

// Mutaciones locales del demo (cache + espejo + notify).
function entUpsert(collection, obj) {
  if (apiMode()) throw new Error(`La mutación legacy de ${collection} no está disponible en modo API.`)
  const arr = cache[collection]
  const i = arr.findIndex((o) => o.id === obj.id)
  if (i >= 0) cache[collection] = arr.map((item, index) => index === i ? obj : item)
  else if (FEEDS.has(collection)) cache[collection] = [obj, ...arr]
  else cache[collection] = [...arr, obj]
  persistMirror()
  notify()
}
function entDelete(collection, id) {
  if (apiMode()) throw new Error(`La eliminación legacy de ${collection} no está disponible en modo API.`)
  cache[collection] = cache[collection].filter((o) => o.id !== id)
  persistMirror()
  notify()
}
function kvSet(key, value) {
  if (apiMode()) throw new Error(`La mutación legacy de ${key} no está disponible en modo API.`)
  cache[key] = value
  persistMirror()
  notify()
}
let apiHydrationVersion = 0

async function hydrateApi() {
  if (!apiMode()) return
  const version = apiHydrationVersion
  const identity = `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`
  const [products, orders, users] = await Promise.all([
    api.get('/api/products'), api.get('/api/orders'), ctx.rol === 'dueno' ? api.get('/api/users') : Promise.resolve([]),
  ])
  if (!apiMode() || version !== apiHydrationVersion || identity !== `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`) return
  cache.productos = (products || []).map(mapProductoApi)
  cache.ventas = (orders || []).map(mapOrdenApi)
  cache.vendedores = (users || []).map((u) => ({ ...u, nombre: u.name, activo: u.status === 'ACTIVE' }))
  cache.mayoristas = []; cache.gastos = []; cache.ads = []; cache.auditoria = []
  cache.config = { ...CONFIG_DEFAULT, nombreTienda: getCompanyName() }
  notify()
}

// El costo del producto vive en la API como `costPyg`. Sin este mapeo la
// ganancia se mostraba igual a las ventas (costo 0) cuando la sesión es real.
export function mapProductoApi(p) {
  return { ...p, nombre: p.name, precioVenta: p.pricePyg, precioCosto: num(p.costPyg), activo: p.isActive !== false }
}

// Traduce el formato de la interfaz al contrato de la API.
export function payloadProductoApi(payload = {}) {
  const { nombre, precioVenta, precioCosto, ...resto } = payload
  return {
    ...resto,
    ...(nombre !== undefined ? { name: nombre } : {}),
    ...(precioVenta !== undefined ? { pricePyg: num(precioVenta) } : {}),
    ...(precioCosto !== undefined
      ? { costPyg: precioCosto === '' || precioCosto === null ? null : num(precioCosto) }
      : {}),
  }
}

function mapOrdenApi(o) {
  const pagos = (o.payments || []).map((p) => ({ ...p, monto: p.amountPyg, medioPago: p.method }))
  const totalPagado = pagos.filter((p) => p.status === 'CONFIRMED').reduce((sum, p) => sum + num(p.monto), 0)
  const total = num(o.totalPyg)
  const items = o.items || []
  // Foto del costo guardada en la venta: se prefiere sobre el costo actual.
  const conCosto = items.filter((item) => item.unitCostPyg !== null && item.unitCostPyg !== undefined)
  const costoVenta = conCosto.reduce((sum, item) => sum + num(item.unitCostPyg) * num(item.quantity), 0)
  return { ...o, codigo: o.orderNumber, precio: total, vendedorId: o.sellerId, clienteId: o.customerId, cliente: o.customer?.name || '', fecha: o.createdAt?.slice(0, 10) || '', creadoEn: o.createdAt, productoId: items[0]?.productId || null, productoNombre: items.map((item) => item.description).filter(Boolean).join(', '), ...(conCosto.length ? { precioCosto: costoVenta } : {}), pagos, totalPagado, totalPendiente: Math.max(0, total - totalPagado), estadoPago: totalPagado >= total ? 'Pagado' : totalPagado > 0 ? 'Parcial' : 'Pendiente' }
}

function getCompanyName() {
  try { return JSON.parse(localStorage.getItem('owncoding_hub_company_context') || 'null')?.tenant?.name || APP_NAME } catch { return APP_NAME }
}

// Hora del servidor: la fuente operativa es el API; el demo no requiere reloj remoto.
export async function horaServidorMs() {
  return null
}

export async function refrescar() {
  if (ctx.empresaId && apiMode()) await hydrateApi()
}

// ════════════════════════════════════════════════════════════════════
// MULTIEMPRESA — sesión, empresas y sucursales
// La autorización y el aislamiento los decide la API; aquí solo se recuerda
// la última sucursal elegida para la experiencia local.
// ════════════════════════════════════════════════════════════════════
const SUC_KEY = 'fono:sucursal'

// Entra a una empresa/sucursal y carga la fuente de datos correspondiente.
export async function setContexto({ empresaId, sucursalId, userId, rol, fuente = 'legacy' }) {
  apiHydrationVersion += 1
  const cambioEmpresa = ctx.empresaId !== empresaId
  if (fuente === 'api' && (ctx.userId !== userId || ctx.rol !== rol || cambioEmpresa)) vaciarCache()
  ctx.empresaId = empresaId || null
  ctx.sucursalId = sucursalId || null
  ctx.userId = userId || null
  ctx.rol = rol || null
  fuenteDatos = fuente === 'api' ? 'api' : 'legacy'
  if (sucursalId) {
    try {
      localStorage.setItem(SUC_KEY, sucursalId)
    } catch {
      /* noop */
    }
  }
  if (!ctx.empresaId) {
    vaciarCache()
    notify()
    return
  }
  if (cambioEmpresa && !apiMode()) bootFromMirror()
  notify()
  if (apiMode()) await hydrateApi()
}

export function sucursalGuardada() {
  try {
    return localStorage.getItem(SUC_KEY)
  } catch {
    return null
  }
}

export async function salirDeTodo() {
  ctx.empresaId = null
  ctx.sucursalId = null
  ctx.userId = null
  ctx.rol = null
  vaciarCache()
  notify()
}

// ════════════════════════════════════════════════════════════════════
// AUDITORÍA — quién creó / editó / eliminó cada venta
// El "actor" lo setea la sesión (ver sesion.jsx). Cada acción sobre una
// venta queda registrada en la colección 'auditoria' (sincronizada y solo
// visible para el dueño). Es de solo-agregar: no se edita ni se borra.
// ════════════════════════════════════════════════════════════════════
let actorActual = { id: null, nombre: 'Sistema', esPropietario: false }
export function setActor(sesion) {
  actorActual = sesion
    ? {
        id: sesion.vendedorId ?? sesion.id ?? null,
        nombre: sesion.nombre || 'Desconocido',
        esPropietario: !!sesion.esPropietario,
      }
    : { id: null, nombre: 'Sistema', esPropietario: false }
}

// Campos de la venta que tiene sentido mostrar en el historial de cambios.
const CAMPOS_AUDIT = {
  cliente: 'Cliente',
  productoId: 'Producto',
  precio: 'Precio',
  estadoPago: 'Estado de pago',
  fecha: 'Fecha',
  medioPago: 'Medio de pago',
  entrega: 'Entrega',
  montoDelivery: 'Delivery',
  observacion: 'Observación',
  comision: 'Comisión',
}

function resumenVenta(v) {
  const prod =
    v?.productoNombre || cache.productos.find((p) => p.id === v?.productoId)?.nombre || '—'
  return { cliente: v?.cliente || '—', producto: prod, precio: num(v?.precio) }
}

// El "autor" de un movimiento sobre una venta. Como la compu es compartida,
// la persona real es el vendedor elegido en la venta; para los borrados, el
// autor es quien tiene la sesión (el dueño, único que puede eliminar).
function actorDeVenta(venta) {
  if (venta?.vendedorId) {
    const v = cache.vendedores.find((x) => x.id === venta.vendedorId)
    if (v) return { id: v.id, nombre: v.nombre, esPropietario: false }
  }
  return actorActual
}

function logAuditoria(accion, venta, cambios) {
  const actor = accion === 'eliminar' ? actorActual : actorDeVenta(venta)
  const entry = {
    id: 'aud-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    creadoEn: new Date().toISOString(),
    accion, // 'crear' | 'editar' | 'eliminar'
    ventaId: venta?.id || null,
    actorId: actor.id,
    actorNombre: actor.nombre,
    esPropietario: actor.esPropietario,
    resumen: resumenVenta(venta),
    cambios: cambios && cambios.length ? cambios : undefined,
  }
  entUpsert('auditoria', entry)
}

export function listAuditoria() {
  return cache.auditoria
}

// ════════════════════════════════════════════════════════════════════
// API PÚBLICA (sincrónica) — mismo contrato que la versión localStorage
// ════════════════════════════════════════════════════════════════════

// ── PRODUCTOS ───────────────────────────────────────────────────────
export function getProductos() {
  if (apiMode()) return cache.productos
  // Modo local: sembramos defaults la primera vez.
  if (!isDemoRuntime && cache.productos.length === 0) {
    cache.productos = clone(PRODUCTOS_DEFAULT)
    persistMirror()
  }
  return cache.productos
}
export async function addProductoApi(payload) {
  if (!apiMode()) throw new Error('addProductoApi solo está disponible con una sesión API real.')
  const created = await api.post('/api/products', payloadProductoApi(payload))
  if (!created?.id) throw new Error('El backend no devolvió un producto confirmado.')
  cache.productos.push(mapProductoApi(created))
  notify()
  return created
}
export async function updateProductoApi(id, cambios) {
  if (!apiMode()) throw new Error('updateProductoApi solo está disponible con una sesión API real.')
  const updated = await api.patch('/api/products', { id, ...payloadProductoApi(cambios) })
  if (!updated?.id) throw new Error('El backend no devolvió un producto confirmado.')
  const mapped = mapProductoApi(updated)
  const index = cache.productos.findIndex((product) => product.id === id)
  if (index >= 0) cache.productos[index] = mapped
  notify()
  return updated
}
export function saveProductos(productos) {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  cache.productos = productos
  persistMirror()
  notify()
}
export function addProducto(nombre, categoria = 'Otros') {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  const id = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36)
  const nuevo = {
    id,
    nombre,
    categoria,
    precioVenta: 0,
    precioCosto: 0,
    comision: 0,
    stock: 0,
    activo: true,
    // Variantes generales: color, capacidad, estado y atributos definidos por la tienda.
    varianteDe: null,
    atributos: {},
  }
  entUpsert('productos', nuevo)
  return nuevo
}
export function addProductoVariante(productoBase, atributos = {}) {
  const base = typeof productoBase === 'string' ? cache.productos.find((p) => p.id === productoBase) : productoBase
  if (!base) return null
  const detalle = Object.entries(atributos).filter(([, v]) => String(v).trim()).map(([k, v]) => `${k}: ${v}`).join(' · ')
  const nuevo = addProducto(`${base.nombre}${detalle ? ` · ${detalle}` : ''}`, base.categoria)
  updateProducto(nuevo.id, { ...base, id: nuevo.id, nombre: nuevo.nombre, varianteDe: base.id, atributos, stock: 0 })
  return nuevo
}
export function productosById() {
  const map = {}
  getProductos().forEach((p) => (map[p.id] = p))
  return map
}
export function updateProducto(id, cambios) {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  const actual = cache.productos.find((p) => p.id === id)
  if (!actual) return
  entUpsert('productos', { ...actual, ...cambios })
}
export function deleteProducto(id) {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  entDelete('productos', id)
}

// ── VENDEDORES ──────────────────────────────────────────────────────
export function getVendedores() {
  if (!isDemoRuntime && cache.vendedores.length === 0) {
    cache.vendedores = isDemoRuntime
      ? [{ id: 'demo-user', nombre: 'Usuario demo', activo: true, metaDiaria: 1000000 }]
      : clone(VENDEDORES_DEFAULT)
    persistMirror()
  }
  return cache.vendedores
}

// La cuenta demo utiliza las mismas colecciones y pantallas, en su propia tienda.
export function prepararDatosDemo() {
  if (!isDemoRuntime || ctx.empresaId !== 'mobos-demo') return
  const version = num(cache.config.demoSeedVersion)
  const hoy = new Date()
  const fecha = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() - dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const producto = (id, nombre, categoria, precioVenta, precioCosto, stock, atributos = {}) => ({
    ...prod(nombre, categoria), id, precioVenta, precioCosto, comision: Math.round(precioVenta * 0.01), stock, atributos,
  })
  const seeds = [
    producto('demo-iphone-15-pro-256-titanio', 'iPhone 15 Pro 256GB Titanio', 'Celulares', 6850000, 5300000, 4, { modelo: 'iPhone 15 Pro', color: 'Titanio', capacidad: '256GB', estado: 'Nuevo' }),
    producto('demo-iphone-15-pro-256-negro', 'iPhone 15 Pro 256GB Negro', 'Celulares', 6750000, 5250000, 2, { modelo: 'iPhone 15 Pro', color: 'Negro', capacidad: '256GB', estado: 'Nuevo' }),
    producto('demo-iphone-15-128-azul', 'iPhone 15 128GB Azul', 'Celulares', 4850000, 3900000, 3, { modelo: 'iPhone 15', color: 'Azul', capacidad: '128GB', estado: 'Nuevo' }),
    producto('demo-iphone-14-pro-256-plata', 'iPhone 14 Pro 256GB Plata', 'Celulares', 4950000, 4000000, 1, { modelo: 'iPhone 14 Pro', color: 'Plata', capacidad: '256GB', estado: 'Seminuevo' }),
    producto('demo-funda-magsafe-transparente', 'Funda MagSafe Transparente', 'Accesorios', 180000, 70000, 23, { compatible: 'iPhone 15 Pro' }),
    producto('demo-funda-silicona-negra', 'Funda Silicona Negra', 'Accesorios', 150000, 55000, 14, { compatible: 'iPhone 15 / 15 Pro' }),
    producto('demo-cargador-usbc-20w', 'Cargador USB-C 20W', 'Accesorios', 220000, 120000, 10, { compatible: 'USB-C' }),
    producto('demo-airpods-pro-2-usbc', 'AirPods Pro 2 USB-C', 'Audio', 1850000, 1300000, 3, { estado: 'Nuevo' }),
  ]
  const productoPorId = new Map()
  const productoPorNombre = new Map(cache.productos.map((item) => [item.nombre.trim().toLowerCase(), item]))
  const nuevosProductos = []
  for (const item of seeds) {
    const existente = productoPorNombre.get(item.nombre.trim().toLowerCase())
    const elegido = existente || item
    productoPorId.set(item.id, elegido.id)
    if (!existente && !cache.productos.some((actual) => actual.id === item.id)) nuevosProductos.push(item)
  }
  const ventas = [
    { id: 'demo-venta-hoy-full', fecha: fecha(0), creadoEn: `${fecha(0)}T10:15:00`, cliente: 'María González', productoId: 'demo-iphone-15-pro-256-titanio', productoNombre: 'iPhone 15 Pro 256GB Titanio', precio: 6850000, precioCosto: 5300000, comision: 50000, vendedorId: 'demo-user', medioPago: 'DINERO', pagos: [{ id: 'demo-pago-hoy-full', medioPago: 'DINERO', cuenta: '', monto: 6850000, fecha: `${fecha(0)}T10:15:00` }], totalPagado: 6850000, totalPendiente: 0, estadoPago: 'Pagado', entrega: 'Retiro en tienda', montoDelivery: 0, observacion: 'Venta demo completa' },
    { id: 'demo-venta-hoy-partial', fecha: fecha(0), creadoEn: `${fecha(0)}T11:20:00`, cliente: 'Carlos Benítez', productoId: 'demo-funda-magsafe-transparente', productoNombre: 'Funda MagSafe Transparente', precio: 180000, precioCosto: 70000, comision: 10000, vendedorId: 'demo-user', medioPago: 'DINERO', pagos: [{ id: 'demo-pago-hoy-partial-a', medioPago: 'DINERO', cuenta: '', monto: 50000, fecha: `${fecha(0)}T11:20:00` }, { id: 'demo-pago-hoy-partial-b', medioPago: 'UENO BANK', cuenta: 'Caja demo', monto: 30000, fecha: `${fecha(0)}T11:21:00` }], totalPagado: 80000, totalPendiente: 100000, estadoPago: 'Parcial', entrega: 'Retiro en tienda', montoDelivery: 0, observacion: 'Seña demo combinada' },
    { id: 'demo-venta-ayer-pending', fecha: fecha(1), creadoEn: `${fecha(1)}T16:40:00`, cliente: 'Lucía Franco', productoId: 'demo-airpods-pro-2-usbc', productoNombre: 'AirPods Pro 2 USB-C', precio: 1850000, precioCosto: 1300000, comision: 30000, vendedorId: 'demo-user', medioPago: 'DINERO', pagos: [], totalPagado: 0, totalPendiente: 1880000, estadoPago: 'Pendiente', entrega: 'Delivery', montoDelivery: 30000, observacion: 'Pendiente de cobro demo' },
  ]
  const ventasDemo = ventas.map((item) => ({ ...item, productoId: productoPorId.get(item.productoId) || item.productoId })).filter((item) => !cache.ventas.some((actual) => actual.id === item.id))
  if (version < 2) {
    cache.productos = [...cache.productos, ...nuevosProductos]
    cache.vendedores = cache.vendedores.some((item) => item.id === 'demo-user') ? cache.vendedores : [...cache.vendedores, { id: 'demo-user', nombre: 'Usuario demo', activo: true, metaDiaria: 1000000 }]
    cache.ventas = [...ventasDemo, ...cache.ventas]
  }
  cache.config = { ...cache.config, nombreTienda: cache.config.nombreTienda || 'MobOS Tienda Demo', demoSeedVersion: 2 }
  persistMirror()
  notify()
}
export function saveVendedores(vendedores) {
  cache.vendedores = vendedores
  persistMirror()
  notify()
}
export function addVendedor(nombre) {
  const nuevo = {
    id: 'v' + Date.now().toString(36),
    nombre,
    activo: true,
    metaDiaria: 0,
  }
  entUpsert('vendedores', nuevo)
  return nuevo
}
export function updateVendedor(id, cambios) {
  const actual = cache.vendedores.find((v) => v.id === id)
  if (!actual) return
  entUpsert('vendedores', { ...actual, ...cambios })
}
export function deleteVendedor(id) {
  entDelete('vendedores', id)
}
export function vendedoresById() {
  const map = {}
  getVendedores().forEach((v) => (map[v.id] = v.nombre))
  return map
}

// ── VENTAS ──────────────────────────────────────────────────────────
export function listVentas() {
  return cache.ventas
}
export async function guardarOrdenApi(payload) {
  if (!apiMode()) throw new Error('guardarOrdenApi solo está disponible con una sesión API real.')
  if (!payload || typeof payload !== 'object') throw new Error('El payload de la orden es obligatorio.')
  const order = await api.post('/api/orders', payload)
  if (!order?.id) throw new Error('El backend no devolvió una orden confirmada.')
  const venta = mapOrdenApi(order)
  const i = cache.ventas.findIndex((item) => item.id === venta.id)
  if (i >= 0) cache.ventas = cache.ventas.map((item, index) => index === i ? venta : item)
  else cache.ventas = [venta, ...cache.ventas]
  for (const item of order.items || []) {
    const product = cache.productos.find((p) => p.id === item.productId)
    if (product) product.stock = Math.max(0, num(product.stock) - num(item.quantity))
  }
  notify()
  return order
}
export function addVenta(venta) {
  if (apiMode()) throw new Error('Órdenes: creación API requiere la integración de FormularioVenta.')
  const prod = venta.productoId ? cache.productos.find((p) => p.id === venta.productoId) : null
  const nueva = {
    id: 'venta-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    creadoEn: new Date().toISOString(),
    // Foto del costo y la comisión al momento de la venta: si después editás
    // el producto, los reportes históricos NO cambian. (...venta puede pisarlos.)
    precioCosto: num(prod?.precioCosto),
    comision: num(prod?.comision),
    ...venta,
  }
  const pagos = Array.isArray(venta.pagos) ? venta.pagos : []
  nueva.pagos = pagos.map((p) => ({
    ...p,
    id: p.id || 'p-' + Math.random().toString(36).slice(2, 9),
    medioPago: p.medioPago || MEDIOS_PAGO[0],
    cuenta: p.cuenta || '',
    monto: num(p.monto),
    fecha: p.fecha || new Date().toISOString(),
  }))
  nueva.totalPagado = nueva.pagos.reduce((s, p) => s + num(p.monto), 0)
  nueva.totalPendiente = Math.max(0, num(nueva.precio) + num(nueva.montoDelivery) - nueva.totalPagado)
  nueva.estadoPago = nueva.totalPendiente === 0 ? 'Pagado' : nueva.totalPagado > 0 ? 'Parcial' : 'Pendiente'
  entUpsert('ventas', nueva)
  moverStock(nueva.productoId, -1)
  logAuditoria('crear', nueva)
  return nueva
}
export function updateVenta(id, cambios) {
  const actual = cache.ventas.find((v) => v.id === id)
  if (!actual) return
  const merged = { ...actual, ...cambios }
  const difs = []
  Object.keys(cambios).forEach((k) => {
    if (CAMPOS_AUDIT[k] && actual[k] !== cambios[k]) {
      difs.push({ campo: CAMPOS_AUDIT[k], de: actual[k], a: cambios[k] })
    }
  })
  entUpsert('ventas', merged)
  logAuditoria('editar', merged, difs)
}
export function deleteVenta(id) {
  const v = cache.ventas.find((x) => x.id === id)
  entDelete('ventas', id)
  if (v) moverStock(v.productoId, +1) // se repone lo que había salido
  logAuditoria('eliminar', v || { id })
}

// ── MAYORISTAS ──────────────────────────────────────────────────────
// Mueve el stock de un producto. delta negativo = sale mercadería.
// Lo usan tanto las ventas de mostrador como las mayoristas, para que el
// inventario del sistema coincida con el físico.
export function moverStock(productoId, delta) {
  if (!productoId || !delta) return
  const p = cache.productos.find((x) => x.id === productoId)
  if (!p) return
  entUpsert('productos', { ...p, stock: num(p.stock) + delta })
}

export function listMayoristas() {
  return cache.mayoristas
}
export function addMayorista({ nombre, ruc = '', contacto = '', tel = '' }) {
  const nuevo = {
    id: 'may-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    nombre: (nombre || '').trim(),
    ruc,
    contacto,
    tel,
    activo: true,
    creadoEn: new Date().toISOString(),
  }
  entUpsert('mayoristas', nuevo)
  return nuevo
}
export function updateMayorista(id, cambios) {
  const actual = cache.mayoristas.find((m) => m.id === id)
  if (actual) entUpsert('mayoristas', { ...actual, ...cambios })
}
export function deleteMayorista(id) {
  entDelete('mayoristas', id)
}

export function listVentasMay() {
  return cache.ventasMay
}
// Registra una venta mayorista con varias líneas y descuenta el stock de cada
// producto por la cantidad vendida.
export function addVentaMayorista({ mayoristaId, lineas, medioPago, estadoPago, observacion, fecha }) {
  const items = (lineas || []).filter((l) => l.productoId && num(l.cantidad) > 0)
  if (!mayoristaId || items.length === 0) return null
  const nueva = {
    id: 'vmay-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    codigo: 'MAY-' + String(cache.ventasMay.length + 1).padStart(4, '0'),
    mayoristaId,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    lineas: items.map((l) => {
      const p = cache.productos.find((x) => x.id === l.productoId)
      return {
        productoId: l.productoId,
        nombre: p?.nombre || 'Producto',
        cantidad: num(l.cantidad),
        precioUnit: num(l.precioUnit),
        precioCosto: num(p?.precioCosto),
      }
    }),
    medioPago: medioPago || MEDIOS_PAGO[0],
    estadoPago: estadoPago || 'No pagado',
    observacion: observacion || '',
    creadoEn: new Date().toISOString(),
  }
  nueva.total = nueva.lineas.reduce((a, l) => a + l.cantidad * l.precioUnit, 0)
  nueva.unidades = nueva.lineas.reduce((a, l) => a + l.cantidad, 0)
  entUpsert('ventasMay', nueva)
  nueva.lineas.forEach((l) => moverStock(l.productoId, -l.cantidad))
  return nueva
}
export function updateVentaMay(id, cambios) {
  const actual = cache.ventasMay.find((v) => v.id === id)
  if (actual) entUpsert('ventasMay', { ...actual, ...cambios })
}
export function deleteVentaMay(id) {
  const v = cache.ventasMay.find((x) => x.id === id)
  entDelete('ventasMay', id)
  if (v) (v.lineas || []).forEach((l) => moverStock(l.productoId, +num(l.cantidad)))
}

// ── GASTOS ──────────────────────────────────────────────────────────
export function listGastos() {
  return cache.gastos
}
export function addGasto(gasto) {
  const nuevo = {
    id: 'gasto-' + Date.now().toString(36),
    creadoEn: new Date().toISOString(),
    categoria: 'Otros',
    ...gasto,
  }
  entUpsert('gastos', nuevo)
  return nuevo
}
export function deleteGasto(id) {
  entDelete('gastos', id)
}

// ── META ADS ────────────────────────────────────────────────────────
export function listAds() {
  return cache.ads
}
export function addAds(ad) {
  const nuevo = {
    id: 'ad-' + Date.now().toString(36),
    creadoEn: new Date().toISOString(),
    plataforma: 'Meta Ads',
    ...ad,
  }
  entUpsert('ads', nuevo)
  return nuevo
}
export function deleteAds(id) {
  entDelete('ads', id)
}

// ── CELULARES (lista de precios) ────────────────────────────────────
export function listCelulares() {
  return cache.celulares
}
export function addCelular(cel) {
  const nuevo = {
    id: 'cel-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    modelo: '',
    color: '',
    capacidad: '',
    estado: 'Nuevo',
    precio: 0,
    activo: true,
    ...cel,
  }
  entUpsert('celulares', nuevo)
  return nuevo
}
export function updateCelular(id, cambios) {
  const actual = cache.celulares.find((c) => c.id === id)
  if (!actual) return
  entUpsert('celulares', { ...actual, ...cambios })
}
export function deleteCelular(id) {
  entDelete('celulares', id)
}
// Carga los lineups de iPhone (precio 0) sin duplicar lo que ya exista. Cada
// equipo se identifica por modelo + capacidad + condición, así un mismo modelo
// puede existir como Nuevo y como Seminuevo a la vez.
export function cargarLineupIphone() {
  const existentes = new Set(
    cache.celulares.map((c) => `${c.modelo}|${c.capacidad}|${c.estado}`.toLowerCase()),
  )
  let n = 0
  const seed = (lineup, estado) => {
    lineup.forEach(([modelo, caps]) => {
      caps.forEach((cap) => {
        const key = `${modelo}|${cap}|${estado}`.toLowerCase()
        if (!existentes.has(key)) {
          existentes.add(key)
          entUpsert('celulares', {
            id: 'cel-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            modelo,
            color: '',
            capacidad: cap,
            estado,
            precio: 0,
            activo: true,
          })
          n++
        }
      })
    })
  }
  seed(LINEUP_NUEVO, 'Nuevo')
  seed(LINEUP_SEMINUEVO, 'Seminuevo')
  return n
}

// ── TRADE-IN ────────────────────────────────────────────────────────
export function getTradein() {
  return { ...clone(TRADEIN_DEFAULT), ...cache.tradein }
}
export function saveTradein(cambios) {
  kvSet('tradein', { ...getTradein(), ...cambios })
}
export function resetTradein() {
  kvSet('tradein', clone(TRADEIN_DEFAULT))
}
// La actualización de cotización se integrará con el endpoint propio de finanzas.
export async function actualizarDolar() {
  return { ok: false, error: 'La actualización de cotización todavía no está disponible en la API.' }
}

// ── IMÁGENES DEL COMPARADOR ─────────────────────────────────────────
// Cada imagen es un registro independiente { id, modelo, color, img } en la
// colección 'comparadorImg'. Así guardar varias a la vez NO se pisa entre sí
// (cada una se escribe por separado). Se exponen como mapa { modelo: { color: img } }.
const idImg = (modelo, color) => `${modelo}__${color}`.toLowerCase().replace(/\s+/g, '-')

export function getComparadorImagenes() {
  const map = {}
  for (const r of cache.comparadorImg || []) {
    if (!r.modelo || !r.color) continue
    if (!map[r.modelo]) map[r.modelo] = {}
    map[r.modelo][r.color] = r.img
  }
  return map
}
export function setComparadorImagen(modelo, color, dataUrl) {
  entUpsert('comparadorImg', { id: idImg(modelo, color), modelo, color, img: dataUrl })
}
export function deleteComparadorImagen(modelo, color) {
  entDelete('comparadorImg', idImg(modelo, color))
}

// ── FRASES ──────────────────────────────────────────────────────────
export function getFrases() {
  return FRASES_DEFAULT
}
// Frase "del día": estable por fecha, rota cada día.
export function fraseDelDia() {
  const frases = getFrases()
  const hoy = new Date()
  const idx = (hoy.getFullYear() * 372 + hoy.getMonth() * 31 + hoy.getDate()) % frases.length
  return frases[idx]
}

// ── CONFIG ──────────────────────────────────────────────────────────
export function getConfig() {
  return { ...CONFIG_DEFAULT, ...cache.config }
}
export function saveConfig(cambios) {
  kvSet('config', { ...getConfig(), ...cambios })
}
export function verificarClavePanel(intento) {
  return intento === getConfig().clavePanel
}
export function cambiarClavePanel(actual, nueva) {
  if (actual !== getConfig().clavePanel) return false
  saveConfig({ clavePanel: nueva })
  return true
}
