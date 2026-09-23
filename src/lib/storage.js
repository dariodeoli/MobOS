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
import { marcarUnidadesVendidasDemo } from './demoInventory.js'
import { guardarDemo } from './demoStorage.js'
import { MEDIOS_PAGO } from './catalog'
import { guardarSnapshotCatalogo, leerSnapshotCatalogo } from './offline/snapshot'
import {
  prod,
  PRODUCTOS_DEFAULT,
  VENDEDORES_DEFAULT,
  TRADEIN_DEFAULT,
  IPHONES_DEMO,
  EQUIPO_DEMO,
} from './demo/seed'

export {
  ESTADOS_CELULAR,
  LINEUP_NUEVO,
  LINEUP_SEMINUEVO,
  ORDEN_MODELOS,
  rankCelular,
  rankCapacidad,
  esModeloViejo,
  CATEGORIAS_GASTO,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
  ENTREGA,
} from './catalog'

// ════════════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA + ESPEJO LOCAL
// ════════════════════════════════════════════════════════════════════
const COLLECTIONS = [
  'productos',
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

// El espejo local se guarda por empresa. Si fuera uno solo, al cambiar de
// tienda verías por un instante los datos de la anterior.
const MIRROR_BASE = 'fono:cache:v3'
const mirrorKey = () => `${MIRROR_BASE}:${ctx.empresaId || 'sin-empresa'}`

const clone = x => JSON.parse(JSON.stringify(x))
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
  vendedores: [],
  ventas: [],
  gastos: [],
  ads: [],
  celulares: [],
  auditoria: [],
  tradein: clone(TRADEIN_DEFAULT),
  config: { nombreTienda: APP_NAME },
  comparadorImg: [], // 1 registro por imagen: { id, modelo, color, img } (colección)
}

// Deja la caché en blanco (al entrar a otra empresa o al cerrar sesión).
function vaciarCache() {
  COLLECTIONS.forEach(c => {
    cache[c] = []
  })
  cache.tradein = clone(TRADEIN_DEFAULT)
  cache.config = { nombreTienda: APP_NAME }
}

// Pintado instantáneo: levanta el último estado conocido de ESTA empresa.
// Antes corría al importar el módulo; ahora corre al entrar, porque hasta que
// no sabemos la empresa no sabemos qué espejo leer.
function bootFromMirror() {
  vaciarCache()
  // La demo (#201) no levanta nada de localStorage: arranca siempre del seed y
  // los guardados viven solo en memoria (se descartan al recargar/salir).
  if (isDemoRuntime) return
  try {
    const m = safeParse(localStorage.getItem(mirrorKey()))
    if (m && typeof m === 'object') Object.assign(cache, m)
  } catch {
    /* localStorage bloqueado: seguimos solo en memoria */
  }
  // Garantiza que toda colección sea un array (por si un espejo viejo guardó
  // otra forma, ej. comparadorImg que antes era un objeto).
  COLLECTIONS.forEach(c => {
    if (!Array.isArray(cache[c])) cache[c] = []
  })
}

function persistMirror() {
  // La demo nunca escribe en localStorage: nada persiste entre recargas.
  if (!ctx.empresaId || apiMode() || isDemoRuntime) return
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
  listeners.forEach(fn => {
    try {
      fn()
    } catch {
      /* noop */
    }
  })
}

// Sync entre pestañas del mismo dispositivo para el demo/local.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (ctx.empresaId && e.key === mirrorKey()) {
      const m = safeParse(e.newValue)
      if (m && typeof m === 'object') {
        Object.assign(cache, m)
        notify()
      }
    }
  })
}

// Mutaciones locales del demo (cache + espejo + notify). Cada guardado avisa
// a la UI (toast con nota de demo, #192): en la demo nada toca la tienda real.
function avisarGuardadoDemo() {
  try { window.dispatchEvent(new CustomEvent('mobos:demo-guardado')) } catch { /* sin window (SSR/tests) */ }
}
function entUpsert(collection, obj) {
  if (apiMode())
    throw new Error(`La mutación legacy de ${collection} no está disponible en modo API.`)
  const arr = cache[collection]
  const i = arr.findIndex(o => o.id === obj.id)
  if (i >= 0) cache[collection] = arr.map((item, index) => (index === i ? obj : item))
  else if (FEEDS.has(collection)) cache[collection] = [obj, ...arr]
  else cache[collection] = [...arr, obj]
  persistMirror()
  notify()
  avisarGuardadoDemo()
}
function entDelete(collection, id) {
  if (apiMode())
    throw new Error(`La eliminación legacy de ${collection} no está disponible en modo API.`)
  cache[collection] = cache[collection].filter(o => o.id !== id)
  persistMirror()
  notify()
  avisarGuardadoDemo()
}
let apiHydrationVersion = 0

// El catálogo puede superar la página del API (200): el POS necesita el
// espejo completo para buscar y vender, así que se recorren todas las páginas.
async function todosLosProductos() {
  const todos = []
  let cursor = null
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const lote = await api.get(`/api/products?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    const filas = Array.isArray(lote) ? lote : []
    todos.push(...filas)
    if (filas.length < 200) break
    cursor = filas[filas.length - 1].id
  }
  return todos
}

async function hydrateApi() {
  if (!apiMode()) return
  const version = apiHydrationVersion
  const identity = `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`
  const puedeVerFinanzas = ['dueno', 'GERENTE', 'CAJERA'].includes(ctx.rol)
  let products; let orders; let users; let finance
  try {
    ;[products, orders, users, finance] = await Promise.all([
      todosLosProductos(),
      api.get('/api/orders?filtro=todos'),
      ctx.rol === 'dueno' ? api.get('/api/users') : Promise.resolve([]),
      puedeVerFinanzas ? api.get('/api/finance').catch(() => null) : Promise.resolve(null),
    ])
  } catch (error) {
    // Sin conexión al arrancar (POS offline-first): se hidrata con la última
    // foto local del catálogo y los pedidos. Sin foto, el error sigue su curso.
    const foto = await leerSnapshotCatalogo(ctx.empresaId)
    if (!foto) throw error
    ;({ products, orders, users, finance } = foto)
  }
  if (
    !apiMode() ||
    version !== apiHydrationVersion ||
    identity !== `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`
  )
    return
  cache.productos = (products || []).map(mapProductoApi)
  cache.ventas = (orders || []).map(mapOrdenApi)
  cache.vendedores = (users || []).map(u => ({
    ...u,
    nombre: u.name,
    activo: u.status === 'ACTIVE',
    metaDiaria: u.dailyGoalPyg ?? 0,
  }))
  cache.gastos = mapGastosApi(finance)
  cache.ads = []
  cache.auditoria = []
  cache.config = { nombreTienda: getCompanyName() }
  notify()
  // Foto para el próximo arranque sin conexión (no bloquea la UI).
  guardarSnapshotCatalogo(ctx.empresaId, { products, orders, users, finance })
}

// El costo del producto vive en la API como `costPyg`. Sin este mapeo la
// ganancia se mostraba igual a las ventas (costo 0) cuando la sesión es real.
function mapProductoApi(p) {
  return {
    ...p,
    nombre: p.name,
    precioVenta: p.pricePyg,
    precioCosto: num(p.costPyg),
    activo: p.isActive !== false,
  }
}

// Traduce el formato de la interfaz al contrato de la API.
function payloadProductoApi(payload = {}) {
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

// Fecha comercial del día en Paraguay (UTC-3, igual que reportes y backend)
// para que las ventas nocturnas no caigan en el día siguiente por UTC.
function fechaLocalApi(iso) {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() - 180 * 60000).toISOString().slice(0, 10)
}

// Traduce movimientos de caja reales al formato legacy de "gastos" para que
// Ganancias, Resumen y el Asistente descuenten gastos también en modo API.
function mapGastosApi(finance) {
  return (finance?.movements || [])
    .filter((row) => row.kind === 'EXPENSE' && row.direction === 'OUT' && row.status !== 'VOID')
    .map((row) => ({ id: row.id, monto: Number(row.amountPyg || 0), motivo: row.description || 'Gasto', fecha: fechaLocalApi(row.createdAt), categoria: 'Gastos' }))
}

function mapOrdenApi(o) {
  const pagos = (o.payments || []).map(p => ({ ...p, monto: p.amountPyg, medioPago: p.method }))
  const totalPagado = pagos
    .filter(p => p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + num(p.monto), 0)
  const total = num(o.totalPyg)
  const items = o.items || []
  // Foto del costo guardada en la venta: se prefiere sobre el costo actual.
  // Solo se usa cuando todas las líneas tienen costo; si alguna línea no lo
  // tiene, se deja caer al costo actual del producto para no inflar la ganancia.
  const conCosto = items.filter(item => item.unitCostPyg !== null && item.unitCostPyg !== undefined)
  const costoCompleto = items.length > 0 && conCosto.length === items.length
  const costoVenta = conCosto.reduce(
    (sum, item) => sum + num(item.unitCostPyg) * num(item.quantity),
    0,
  )
  const medioPago = [...new Set(pagos.map(p => p.medioPago).filter(Boolean))].join(' · ')
  return {
    ...o,
    codigo: o.orderNumber,
    precio: total,
    vendedorId: o.sellerId,
    clienteId: o.customerId,
    cliente: o.customer?.name || '',
    fecha: fechaLocalApi(o.createdAt),
    creadoEn: o.createdAt,
    productoId: items[0]?.productId || null,
    productoNombre: items
      .map(item => item.description)
      .filter(Boolean)
      .join(', '),
    ...(costoCompleto ? { precioCosto: costoVenta } : {}),
    medioPago,
    pagos,
    totalPagado,
    totalPendiente: Math.max(0, total - totalPagado),
    estadoPago: totalPagado >= total ? 'Pagado' : totalPagado > 0 ? 'Parcial' : 'Pendiente',
  }
}

function getCompanyName() {
  try {
    return (
      JSON.parse(localStorage.getItem('owncoding_hub_company_context') || 'null')?.tenant?.name ||
      APP_NAME
    )
  } catch {
    return APP_NAME
  }
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
    // En demo no se guarda ni la sucursal ficticia (#204).
    guardarDemo(SUC_KEY, sucursalId)
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
  const prod = v?.productoNombre || cache.productos.find(p => p.id === v?.productoId)?.nombre || '—'
  return { cliente: v?.cliente || '—', producto: prod, precio: num(v?.precio) }
}

// El "autor" de un movimiento sobre una venta. Como la compu es compartida,
// la persona real es el vendedor elegido en la venta; para los borrados, el
// autor es quien tiene la sesión (el dueño, único que puede eliminar).
function actorDeVenta(venta) {
  if (venta?.vendedorId) {
    const v = cache.vendedores.find(x => x.id === venta.vendedorId)
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
export function productosById() {
  const map = {}
  getProductos().forEach(p => (map[p.id] = p))
  return map
}
export function updateProducto(id, cambios) {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  const actual = cache.productos.find(p => p.id === id)
  if (!actual) return
  entUpsert('productos', { ...actual, ...cambios })
}

// ── VENDEDORES ──────────────────────────────────────────────────────
export function getVendedores() {
  if (!isDemoRuntime && cache.vendedores.length === 0) {
    cache.vendedores = isDemoRuntime
      ? [{ id: 'demo-user', nombre: 'Hernán Acosta', activo: true, metaDiaria: 1000000 }]
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
  const fecha = dias => {
    const d = new Date(hoy)
    d.setDate(d.getDate() - dias)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const producto = (id, nombre, categoria, precioVenta, precioCosto, stock, atributos = {}) => ({
    ...prod(nombre, categoria),
    id,
    precioVenta,
    precioCosto,
    comision: Math.round(precioVenta * 0.01),
    stock,
    atributos,
  })
  const seeds = [
    producto(
      'demo-iphone-15-pro-256-titanio',
      'iPhone 15 Pro 256GB Titanio',
      'Celulares',
      6850000,
      5300000,
      4,
      { modelo: 'iPhone 15 Pro', color: 'Titanio', capacidad: '256GB', estado: 'Nuevo' },
    ),
    producto(
      'demo-iphone-15-pro-256-negro',
      'iPhone 15 Pro 256GB Negro',
      'Celulares',
      6750000,
      5250000,
      2,
      { modelo: 'iPhone 15 Pro', color: 'Negro', capacidad: '256GB', estado: 'Nuevo' },
    ),
    producto('demo-iphone-15-128-azul', 'iPhone 15 128GB Azul', 'Celulares', 4850000, 3900000, 3, {
      modelo: 'iPhone 15',
      color: 'Azul',
      capacidad: '128GB',
      estado: 'Nuevo',
    }),
    producto(
      'demo-iphone-14-pro-256-plata',
      'iPhone 14 Pro 256GB Plata',
      'Celulares',
      4950000,
      4000000,
      1,
      { modelo: 'iPhone 14 Pro', color: 'Plata', capacidad: '256GB', estado: 'Seminuevo' },
    ),
    producto(
      'demo-funda-magsafe-transparente',
      'Funda MagSafe Transparente',
      'Accesorios',
      180000,
      70000,
      23,
      { compatible: 'iPhone 15 Pro' },
    ),
    producto('demo-funda-silicona-negra', 'Funda Silicona Negra', 'Accesorios', 150000, 55000, 14, {
      compatible: 'iPhone 15 / 15 Pro',
    }),
    producto('demo-cargador-usbc-20w', 'Cargador USB-C 20W', 'Accesorios', 220000, 120000, 10, {
      compatible: 'USB-C',
    }),
    producto('demo-airpods-pro-2-usbc', 'AirPods Pro 2 USB-C', 'Audio', 1850000, 1300000, 3, {
      estado: 'Nuevo',
    }),
    producto('demo-vidrio-17-pro', 'Protector de vidrio 17 Pro', 'Protectores', 120000, 45000, 0, {}),
  ]
  const productoPorId = new Map()
  // #213: catálogo de iPhones del demo (12 modelos). Los que ya existen por
  // nombre o id se reutilizan; los nuevos entran con sucursal y SKU para que la
  // carga rápida y el inventario serializado funcionen.
  for (const item of IPHONES_DEMO) {
    if (seeds.some(actual => actual.id === item.id || actual.nombre === item.nombre)) continue
    seeds.push({
      ...prod(item.nombre, 'Celulares'),
      id: item.id,
      sku: item.sku,
      branchId: 'mobos-demo-central',
      precioVenta: item.precioVenta,
      precioCosto: item.precioCosto,
      precioMayorista: Math.round(item.precioVenta * 0.93),
      comision: Math.round(item.precioVenta * 0.01),
      stock: 0,
      atributos: item.atributos,
    })
  }
  const productoPorNombre = new Map(
    cache.productos.map(item => [item.nombre.trim().toLowerCase(), item]),
  )
  const nuevosProductos = []
  for (const item of seeds) {
    const existente = productoPorNombre.get(item.nombre.trim().toLowerCase())
    const elegido = existente || item
    productoPorId.set(item.id, elegido.id)
    if (!existente && !cache.productos.some(actual => actual.id === item.id))
      nuevosProductos.push(item)
  }
  const ventas = [
    {
      id: 'demo-venta-hoy-full',
      fecha: fecha(0),
      creadoEn: `${fecha(0)}T10:15:00`,
      cliente: 'María González',
      clienteId: 'demo-cliente-maria',
      productoId: 'demo-iphone-15-pro-256-titanio',
      productoNombre: 'iPhone 15 Pro 256GB Titanio',
      precio: 6850000,
      precioCosto: 5300000,
      comision: 50000,
      vendedorId: 'demo-user',
      medioPago: 'DINERO',
      pagos: [
        {
          id: 'demo-pago-hoy-full',
          medioPago: 'DINERO',
          cuenta: '',
          monto: 6850000,
          fecha: `${fecha(0)}T10:15:00`,
        },
      ],
      totalPagado: 6850000,
      totalPendiente: 0,
      estadoPago: 'Pagado',
      entrega: 'Retiro en tienda',
      montoDelivery: 0,
      observacion: 'Venta de mostrador',
    },
    {
      id: 'demo-venta-hoy-partial',
      fecha: fecha(0),
      creadoEn: `${fecha(0)}T11:20:00`,
      cliente: 'Carlos Benítez',
      productoId: 'demo-funda-magsafe-transparente',
      productoNombre: 'Funda MagSafe Transparente',
      precio: 180000,
      precioCosto: 70000,
      comision: 10000,
      vendedorId: 'demo-user',
      medioPago: 'DINERO',
      pagos: [
        {
          id: 'demo-pago-hoy-partial-a',
          medioPago: 'DINERO',
          cuenta: '',
          monto: 50000,
          fecha: `${fecha(0)}T11:20:00`,
        },
        {
          id: 'demo-pago-hoy-partial-b',
          medioPago: 'UENO BANK',
          cuenta: 'Caja · Guaraníes',
          monto: 30000,
          fecha: `${fecha(0)}T11:21:00`,
        },
      ],
      totalPagado: 80000,
      totalPendiente: 100000,
      estadoPago: 'Parcial',
      entrega: 'Retiro en tienda',
      montoDelivery: 0,
      observacion: 'Seña en dos medios',
    },
    {
      id: 'demo-venta-ayer-pending',
      fecha: fecha(1),
      creadoEn: `${fecha(1)}T16:40:00`,
      cliente: 'Lucía Franco',
      clienteId: null,
      productoId: 'demo-airpods-pro-2-usbc',
      productoNombre: 'AirPods Pro 2 USB-C',
      precio: 1850000,
      precioCosto: 1300000,
      comision: 30000,
      vendedorId: 'demo-user',
      medioPago: 'DINERO',
      pagos: [],
      totalPagado: 0,
      totalPendiente: 1880000,
      estadoPago: 'Pendiente',
      entrega: 'Delivery',
      montoDelivery: 30000,
      observacion: 'Pendiente de cobro',
    },
  ]
  // #213: pedidos demo extra con pagos divididos y medios variados. La tabla es
  // [cliente, productoId, precio, entrega, montoDelivery, pagos, días].
  // #213/#216: cada pedido demo conoce su cliente, como en la cuenta real.
  const CLIENTE_ID_POR_NOMBRE = {
    'María González': 'demo-cliente-maria', 'Juan Pereira': 'demo-cliente-juan', 'Ana Villalba': 'demo-cliente-ana',
    'Ramiro Cáceres': 'demo-cliente-ramiro', 'Estela Ramírez': 'demo-cliente-estela', 'Fernando Ortellado': 'demo-cliente-fernando',
    'Gloria Martínez': 'demo-cliente-gloria', 'Hugo Benítez': 'demo-cliente-hugo',
    'Distribuidora Luque S.A. ': 'demo-cliente-distribuidora-luque', 'Lucía Fernández': 'demo-cliente-lucia',
    'Distribuidora del Este S.A.': 'demo-cliente-distribuidora', 'Carlos Ramírez': 'demo-cliente-carlos',
  }
  const PAGOS_EXTRA = [
    ['María González', 'demo-iphone-15-pro-max-256-titanio', 7250000, 'Retiro en tienda', 0, [['DINERO', '', 3000000], ['SALDO A FAVOR', 'Saldo a favor', 1000000], ['TRANSFERENCIA', 'Itaú · Cuenta corriente', 3250000]], 0],
    ['Juan Pereira', 'demo-iphone-15-128-azul', 4850000, 'Delivery', 30000, [['DINERO', '', 2000000], ['TARJETA', 'ueno · Tarjeta', 2880000]], 1],
    ['Ana Villalba', 'demo-iphone-14-256-azul', 3950000, 'Retiro en tienda', 0, [['PIX', 'Pix · Itaú', 3950000]], 1],
    ['Ramiro Cáceres', 'demo-iphone-13-pro-max-256-grafito', 4450000, 'Retiro en tienda', 0, [['USDT - Cripto', 'USDT · Binance', 2225000], ['DINERO USD', 'Caja · Dólares', 2225000]], 2],
    ['Estela Ramírez', 'demo-iphone-15-256-rosa', 5400000, 'Delivery', 30000, [['DINERO', '', 2000000], ['TRANSFERENCIA', 'Continental · Cuenta corriente', 3430000]], 2],
    ['Distribuidora Luque S.A. ', 'demo-iphone-14-128-medianoche', 3600000, 'Retiro en tienda', 0, [['TRANSFERENCIA', 'Itaú · Cuenta corriente', 3600000]], 3],
    ['Gloria Martínez', 'demo-iphone-13-128-blanco', 3050000, 'Retiro en tienda', 0, [['CANJE', 'Canje · Equipos', 1850000], ['DINERO', '', 1200000]], 3],
    ['Fernando Ortellado', 'demo-iphone-15-pro-256-negro', 6750000, 'Delivery', 30000, [['DINERO', '', 3000000], ['POS UENO', 'ueno · Tarjeta', 3780000]], 4],
    ['Hugo Benítez', 'demo-iphone-12-128-verde', 2350000, 'Retiro en tienda', 0, [], 5],
    ['María González', 'demo-airpods-pro-2-usbc', 1850000, 'Retiro en tienda', 0, [['DINERO', '', 1850000]], 6],
    ['Juan Pereira', 'demo-cargador-usbc-20w', 220000, 'Retiro en tienda', 0, [['DINERO', '', 100000], ['PIX', 'Pix · Itaú', 120000]], 7],
    ['Ana Villalba', 'demo-funda-magsafe-transparente', 180000, 'Delivery', 20000, [['DINERO USD', 'Caja · Dólares', 200000]], 8],
  ]
  const vendedoresDemo = ['demo-user', 'demo-user-vendedor', 'demo-user-vendedora']
  PAGOS_EXTRA.forEach(([cliente, productoId, precio, entrega, montoDelivery, pagos, dias], indice) => {
    const lista = pagos.map(([medioPago, cuenta, monto], j) => ({ id: `demo-pago-extra-${indice}-${j}`, medioPago, cuenta, monto, fecha: `${fecha(dias)}T${String(10 + j).padStart(2, '0')}:30:00` }))
    const totalPagado = lista.reduce((suma, pago) => suma + pago.monto, 0)
    const total = precio + montoDelivery
    ventas.push({
      id: `demo-venta-extra-${indice + 1}`,
      fecha: fecha(dias),
      creadoEn: `${fecha(dias)}T10:30:00`,
      cliente,
      productoId,
      productoNombre: (IPHONES_DEMO.find(item => item.id === productoId) || {}).nombre || 'Producto demo',
      precio,
      precioCosto: Math.round(precio * 0.78),
      comision: Math.round(precio * 0.01),
      clienteId: CLIENTE_ID_POR_NOMBRE[cliente] || null,
      vendedorId: vendedoresDemo[indice % vendedoresDemo.length],
      medioPago: lista[0]?.medioPago || '',
      pagos: lista,
      totalPagado,
      totalPendiente: Math.max(0, total - totalPagado),
      estadoPago: totalPagado === 0 ? 'Pendiente' : totalPagado >= total ? 'Pagado' : 'Parcial',
      entrega,
      montoDelivery,
      observacion: 'Pedido con pagos variados',
    })
  })
  const ventasDemo = ventas
    .map(item => ({ ...item, productoId: productoPorId.get(item.productoId) || item.productoId }))
    .filter(item => !cache.ventas.some(actual => actual.id === item.id))
  if (version < 5) {
    // Los celulares demo llevan sucursal y SKU: el inventario serializado y la
    // carga rápida los necesitan (los productos viejos se completan acá).
    cache.productos = [...cache.productos, ...nuevosProductos].map(item =>
      item.categoria === 'Celulares'
        ? { ...item, branchId: item.branchId || 'mobos-demo-central', sku: item.sku || item.id.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24) }
        : item,
    )
    // #195: catálogo demo al día (SKU, sucursal, mayorista) y umbrales para que
    // la pestaña Alertas muestre reposición y agotados en la demo.
    const umbrales = { 'demo-airpods-pro-2-usbc': 5, 'demo-vidrio-17-pro': 3, 'demo-funda-silicona-negra': 10 }
    cache.productos = cache.productos.map(item => {
      if (item.id === 'demo-vidrio-17-pro' && Number(item.stock) === 0 && !item.reorderPoint) return { ...item, reorderPoint: umbrales[item.id] }
      const demo = item.id?.startsWith('demo-')
      if (!demo) return item
      return {
        ...item,
        sku: item.sku || item.id.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24),
        branchId: item.branchId || 'mobos-demo-central',
        precioMayorista: item.precioMayorista || Math.round(Number(item.precioVenta || 0) * 0.93),
        ...(umbrales[item.id] ? { reorderPoint: item.reorderPoint || umbrales[item.id] } : {}),
      }
    })
    // Equipo demo (#213): 6 usuarios con rol, correo y PIN ficticios.
    const idsEquipo = new Set(EQUIPO_DEMO.map(usuario => usuario.id))
    cache.vendedores = [...cache.vendedores.filter(usuario => !idsEquipo.has(usuario.id)), ...EQUIPO_DEMO]
    // Idempotente por id: los pedidos nuevos entran una sola vez.
    cache.ventas = [...ventasDemo.filter(item => !cache.ventas.some(actual => actual.id === item.id)), ...cache.ventas]
  }
  cache.config = {
    ...cache.config,
    nombreTienda: cache.config.nombreTienda || 'Aurora Móviles',
    demoSeedVersion: 5,
  }
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
  const actual = cache.vendedores.find(v => v.id === id)
  if (!actual) return
  entUpsert('vendedores', { ...actual, ...cambios })
}
export function deleteVendedor(id) {
  entDelete('vendedores', id)
}
export function vendedoresById() {
  const map = {}
  getVendedores().forEach(v => (map[v.id] = v.nombre))
  return map
}

// ── VENTAS ──────────────────────────────────────────────────────────
export function listVentas() {
  return cache.ventas
}
// Pedido del API con la misma forma que `listVentas`: lo usan las pantallas
// que abren un pedido que no está en el caché del día (p. ej. Cobranzas).
export function ventaDesdeApi(order) {
  return mapOrdenApi(order)
}
export async function guardarOrdenApi(payload, opciones = {}) {
  if (!apiMode()) throw new Error('guardarOrdenApi solo está disponible con una sesión API real.')
  if (!payload || typeof payload !== 'object')
    throw new Error('El payload de la orden es obligatorio.')
  // Idempotency-Key opcional: reintentos de la misma venta reutilizan la orden
  // ya creada en vez de duplicarla. El path demo no lo usa.
  const order = await api.post(
    '/api/orders',
    payload,
    opciones.idempotencyKey
      ? { headers: { 'Idempotency-Key': opciones.idempotencyKey } }
      : undefined,
  )
  if (!order?.id) throw new Error('El backend no devolvió una orden confirmada.')
  const venta = mapOrdenApi(order)
  const i = cache.ventas.findIndex(item => item.id === venta.id)
  if (i >= 0) cache.ventas = cache.ventas.map((item, index) => (index === i ? venta : item))
  else cache.ventas = [venta, ...cache.ventas]
  for (const item of order.items || []) {
    const product = cache.productos.find(p => p.id === item.productId)
    if (product) product.stock = Math.max(0, num(product.stock) - num(item.quantity))
  }
  notify()
  return order
}
export function addVenta(venta) {
  if (apiMode())
    throw new Error('Órdenes: creación API requiere la integración de FormularioVenta.')
  const prod = venta.productoId ? cache.productos.find(p => p.id === venta.productoId) : null
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
  nueva.pagos = pagos.map(p => ({
    ...p,
    id: p.id || 'p-' + Math.random().toString(36).slice(2, 9),
    medioPago: p.medioPago || MEDIOS_PAGO[0],
    cuenta: p.cuenta || '',
    monto: num(p.monto),
    fecha: p.fecha || new Date().toISOString(),
  }))
  nueva.totalPagado = nueva.pagos.reduce((s, p) => s + num(p.monto), 0)
  nueva.totalPendiente = Math.max(
    0,
    num(nueva.precio) + num(nueva.montoDelivery) - nueva.totalPagado,
  )
  nueva.estadoPago =
    nueva.totalPendiente === 0 ? 'Pagado' : nueva.totalPagado > 0 ? 'Parcial' : 'Pendiente'
  entUpsert('ventas', nueva)
  moverStock(nueva.productoId, -1)
  // #227: la venta demo también baja la unidad (SOLD + cronología), como el API real.
  if (isDemoRuntime) {
    const seriales = nueva.seriales || nueva.serials || nueva.imei || (nueva.items || []).flatMap(item => item.serials || item.seriales || (item.imei ? [item.imei] : []))
    if (Array.isArray(seriales) && seriales.length) {
      marcarUnidadesVendidasDemo({ serials: seriales, orderNumber: nueva.orderNumber || nueva.numero || '', customerName: nueva.cliente || '', totalPyg: nueva.precio })
    }
  }
  logAuditoria('crear', nueva)
  return nueva
}
export function updateVenta(id, cambios) {
  const actual = cache.ventas.find(v => v.id === id)
  if (!actual) return
  const merged = { ...actual, ...cambios }
  const difs = []
  Object.keys(cambios).forEach(k => {
    if (CAMPOS_AUDIT[k] && actual[k] !== cambios[k]) {
      difs.push({ campo: CAMPOS_AUDIT[k], de: actual[k], a: cambios[k] })
    }
  })
  entUpsert('ventas', merged)
  logAuditoria('editar', merged, difs)
}
export function deleteVenta(id) {
  const v = cache.ventas.find(x => x.id === id)
  entDelete('ventas', id)
  if (v) moverStock(v.productoId, +1) // se repone lo que había salido
  logAuditoria('eliminar', v || { id })
}

// ── MAYORISTAS (legacy) ─────────────────────────────────────────────
// Mueve el stock de un producto. delta negativo = sale mercadería.
// Lo usan tanto las ventas de mostrador como las mayoristas, para que el
// inventario del sistema coincida con el físico.
export function moverStock(productoId, delta) {
  if (!productoId || !delta) return
  const p = cache.productos.find(x => x.id === productoId)
  if (!p) return
  entUpsert('productos', { ...p, stock: num(p.stock) + delta })
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

// ── TRADE-IN ────────────────────────────────────────────────────────
export function getTradein() {
  return { ...clone(TRADEIN_DEFAULT), ...cache.tradein }
}

// ── IMÁGENES DEL COMPARADOR ─────────────────────────────────────────
// Cada imagen es un registro independiente { id, modelo, color, img } en la
// colección 'comparadorImg'. Así guardar varias a la vez NO se pisa entre sí
// (cada una se escribe por separado). Se exponen como mapa { modelo: { color: img } }.
export function getComparadorImagenes() {
  const map = {}
  for (const r of cache.comparadorImg || []) {
    if (!r.modelo || !r.color) continue
    if (!map[r.modelo]) map[r.modelo] = {}
    map[r.modelo][r.color] = r.img
  }
  return map
}
