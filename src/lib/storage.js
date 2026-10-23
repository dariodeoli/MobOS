import { completarEquipoDemo } from './demo/equipo.js'
import { contextoDemo } from './demo/contexto.js'
import { crearCacheDemo } from './demo/memoria.js'
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

import { conFotosDemo } from '@/lib/demo/fotosAccesorios.js'
import { num } from '@/utils/calculos'
import { APP_NAME } from '@/lib/brand'
import { api } from '@/lib/api'
import { isDemoRuntime } from './demoMode'
import { adsDemo, gastosDemo, PREFIJO_AD_DEMO, PREFIJO_GASTO_DEMO } from './demo/finanzas.js'
import { tomarNumeroPedidoDemo, registrarNumerosUsadosDemo } from './demoTenant.js'
import { marcarUnidadesVendidasDemo, liberarUnidadesVendidasDemo, listDemoUnits } from './demoInventory.js'
import { guardarDemo, limpiarMemoriaDemo } from './demoStorage.js'
import { ESTADOS_CELULAR, LINEUP_NUEVO, LINEUP_SEMINUEVO, MEDIOS_PAGO } from './catalog'
import { guardarSnapshotCatalogo, leerSnapshotCatalogo, activarContextoSnapshots, invalidarSnapshotsPrivados, alInvalidarSnapshots, esDenegacionPrivada, permiteRespaldoOffline } from './offline/snapshot'
import { invalidarConsultas } from './api/client'
import { skuDemo } from './demo/sku.js'
import { stockDePedidoDemo } from './demo/pedidoPos.js'
import { garantiaDiasDemo, ventasDemoLegacy } from './demo/ventas.js'
import { sincronizarPedidoDemoConVenta } from './demoClientes.js'
import { CATALOGO_VENTA } from './demo/catalogoPro.js'
import { EMPRESA_DEMO, SUCURSALES_DEMO } from './demo/empresa.js'
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
const ctx = { empresaId: null, sucursalId: null, userId: null, rol: null, permisos: null }
let tokenSnapshot = null
let contextoApiValidado = false
let fuenteDatos = 'legacy'
export const modoDatosActual = () => fuenteDatos
const apiMode = () => fuenteDatos === 'api'
export const contextoActual = () => ({ ...ctx })

// Última sesión del dispositivo (#377): empresa y desde cuándo. La cola offline la
// usa para atribuir ventas viejas sin empresa; se actualiza solo cuando CAMBIA la
// empresa activa. El cambio de empresa también avisa a los componentes vivos.
const ULTIMA_SESION_KEY = 'mobos:ultima-sesion-empresa'
export const EVENTO_CAMBIO_EMPRESA = 'mobos:empresa-cambio'
export function ultimaSesionEmpresa() {
  try {
    const dato = JSON.parse(globalThis.localStorage?.getItem(ULTIMA_SESION_KEY) || 'null')
    return dato && typeof dato.tenantId === 'string' ? { tenantId: dato.tenantId, desde: Number(dato.desde) || 0 } : null
  } catch { return null }
}
function registrarCambioDeEmpresa(empresaId) {
  if (!empresaId || isDemoRuntime) return
  try { globalThis.localStorage?.setItem(ULTIMA_SESION_KEY, JSON.stringify({ tenantId: empresaId, desde: Date.now() })) } catch { /* sin almacenamiento: la cola pide confirmación */ }
  try { globalThis.window?.dispatchEvent?.(new Event(EVENTO_CAMBIO_EMPRESA)) } catch { /* sin window (tests) */ }
}

// El espejo local se guarda por empresa. Si fuera uno solo, al cambiar de
// tienda verías por un instante los datos de la anterior.
const MIRROR_BASE = 'fono:cache:v3'
const mirrorKey = () => `${MIRROR_BASE}:${ctx.empresaId || 'sin-empresa'}`

const clone = x => JSON.parse(JSON.stringify(x))
const cacheDemoPorEmpresa = crearCacheDemo(contextoDemo)
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

// La numeración de la demo salta por encima de los pedidos ya guardados (#461).
registrarNumerosUsadosDemo(() => cache.ventas.map(venta => venta.orderNumber || venta.numero))

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
let revisionAlmacen = 0
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
// Contador monótono: las pantallas que leen el espejo local fuera del ciclo de
// estado (p. ej. el catálogo del POS con `getProductos()`) lo usan para repintar
// cuando llega una hidratación o una mutación (#257).
export function revisionDeAlmacen() {
  return revisionAlmacen
}
function notify() {
  revisionAlmacen += 1
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
    if (!apiMode() && ctx.empresaId && e.key === mirrorKey()) {
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
// Cualquier denegación/logout/contexto invalida datos privados visibles y carreras.
alInvalidarSnapshots(() => {
  invalidarConsultas()
  apiHydrationVersion += 1
  tokenSnapshot = null
  contextoApiValidado = false
  identidadesFinanzas.clear()
  vaciarCache()
  notify()
})

// El catálogo puede superar la página del API: el POS necesita el espejo
// completo para buscar y vender, así que se recorren las páginas con el tope
// de 500 (#247: con el catálogo típico entra en una sola consulta; el bucle
// sigue cubriendo catálogos más grandes).
async function todosLosProductos({ fresco = false } = {}) {
  const todos = []
  let cursor = null
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const lote = await api.get(`/api/products?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, fresco ? { cacheMs: 0 } : undefined)
    const filas = Array.isArray(lote) ? lote : []
    todos.push(...filas)
    if (filas.length < 500) break
    cursor = filas[filas.length - 1].id
  }
  return todos
}

const identidadActual = () => JSON.stringify(ctx)

// #247: las finanzas dejaron de viajar en la hidratación global (se pedían en
// todas las pantallas). Se hidratan al entrar a finanzas/análisis y, desde ahí,
// siguen incluidas en los refrescos siguientes.
const identidadesFinanzas = new Set()
const rutaFinanciera = () => typeof window !== 'undefined' && /^\/(finanzas|analisis|resumen)(\/|$)/.test(window.location.pathname)

function aplicarHidratacion({ products, orders, users, finance }) {
  cache.productos = (products || []).map(mapProductoApi)
  cache.ventas = (orders || []).map(mapOrdenApi)
  cache.vendedores = (users || []).map(u => ({
    ...u,
    nombre: u.name,
    activo: u.status === 'ACTIVE',
    metaDiaria: u.dailyGoalPyg ?? 0,
  }))
  // Si las finanzas no vinieron en este pedido, se conserva lo que ya había.
  if (finance !== null && finance !== undefined) cache.gastos = mapGastosApi(finance)
  cache.ads = []
  cache.auditoria = []
  cache.config = { nombreTienda: getCompanyName() }
  notify()
}

async function hydrateDesdeApi(version, identity, snapshot) {
  const rol = ctx.rol
  const puedeVerFinanzas = ['dueno', 'GERENTE', 'CAJERA'].includes(rol)
  const conFinanzas = puedeVerFinanzas && (rutaFinanciera() || identidadesFinanzas.has(identity))
  const vigente = () => apiMode() && contextoApiValidado && version === apiHydrationVersion && identity === identidadActual()
  let products; let orders; let users; let finance
  let desdeFoto = false
  try {
    ;[products, orders, users, finance] = await Promise.all([
      todosLosProductos({ fresco: true }),
      api.get('/api/orders?filtro=todos', { cacheMs: 0 }),
      rol === 'dueno' ? api.get('/api/users', { cacheMs: 0 }) : Promise.resolve([]),
      conFinanzas ? api.get('/api/finance', { cacheMs: 0 }).catch(error => { if (esDenegacionPrivada(error)) throw error; return null }) : Promise.resolve(null),
    ])
  } catch (error) {
    if (!apiMode() || identity !== identidadActual()) return
    if (esDenegacionPrivada(error)) {
      if (vigente()) await invalidarSnapshotsPrivados()
      throw error
    }
    if (!vigente()) return
    // Solo fallo de transporte; jamás una respuesta HTTP o denegación explícita.
    if (!permiteRespaldoOffline(error)) throw error
    const foto = await leerSnapshotCatalogo(snapshot)
    if (!vigente()) return
    if (!foto) throw error
    ;({ products, orders, users, finance } = foto)
    desdeFoto = true
  }
  if (!vigente()) return
  if (conFinanzas) identidadesFinanzas.add(identity)
  aplicarHidratacion({ products, orders, users, finance })
  if (!desdeFoto) await guardarSnapshotCatalogo(snapshot, { products, orders, users, finance })
}

// #257 (demo): el catálogo del POS y el inventario serializado son dos stores
// del demo. Para que las unidades cargadas figuren en el POS, el stock de los
// productos con unidades se recalcula con las disponibles reales; los productos
// sin unidades (accesorios, fundas) conservan su stock propio.
function sincronizarCatalogoDemo() {
  if (!isDemoRuntime) return
  const unidades = listDemoUnits()
  if (!unidades.length) return
  const disponibles = new Map()
  for (const unidad of unidades) {
    if (!unidad?.productId) continue
    if (!disponibles.has(unidad.productId)) disponibles.set(unidad.productId, 0)
    if (unidad.status === 'AVAILABLE') disponibles.set(unidad.productId, disponibles.get(unidad.productId) + 1)
  }
  if (!disponibles.size) return
  let cambio = false
  cache.productos = cache.productos.map((producto) => {
    if (!disponibles.has(producto.id)) return producto
    const stock = disponibles.get(producto.id)
    if (Number(producto.stock) === stock) return producto
    cambio = true
    return { ...producto, stock }
  })
  if (cambio) {
    persistMirror()
    notify()
  }
}

// #257: refresca SOLO el catálogo de productos (sin pedidos ni usuarios) y
// avisa a la UI. Lo usan el POS al entrar y el Inventario después de cada
// movimiento: el espejo local tiene que ver las unidades recién cargadas sin
// esperar al refresco periódico ni obligar a recargar la página.
let refrescoCatalogoEnCurso = Promise.resolve()
let ultimoRefrescoCatalogo = 0
export function refrescarCatalogo({ forzar = false } = {}) {
  if (isDemoRuntime) {
    sincronizarCatalogoDemo()
    return Promise.resolve()
  }
  if (!ctx.empresaId || !apiMode() || !contextoApiValidado) return Promise.resolve()
  if (!forzar && Date.now() - ultimoRefrescoCatalogo < 2500) return Promise.resolve()
  const version = apiHydrationVersion
  const identity = identidadActual()
  const anterior = refrescoCatalogoEnCurso
  refrescoCatalogoEnCurso = (async () => {
    await anterior.catch(() => {})
    if (!apiMode() || !contextoApiValidado || version !== apiHydrationVersion || identity !== identidadActual()) return
    try {
      // Sin caché de consultas: el refresco existe justamente para ver lo que se
      // cargó fuera de esta pestaña, así que va sí o sí contra la red (#257).
      const products = await todosLosProductos({ fresco: true })
      if (!apiMode() || !contextoApiValidado || version !== apiHydrationVersion || identity !== identidadActual()) return
      cache.productos = (Array.isArray(products) ? products : []).map(mapProductoApi)
      ultimoRefrescoCatalogo = Date.now()
      notify()
    } catch (error) {
      if (esDenegacionPrivada(error)) {
        if (identity === identidadActual() && version === apiHydrationVersion) await invalidarSnapshotsPrivados()
        throw error
      }
      // Solo un corte de red conserva datos del contexto vigente.
    }
  })()
  return refrescoCatalogoEnCurso
}

// Hidrata las finanzas al entrar a su pantalla (una sola consulta) y las deja
// incluidas en los refrescos siguientes (#247).
export async function hidratarFinanzas() {
  if (!ctx.empresaId || !apiMode() || !contextoApiValidado) return
  const identity = identidadActual()
  if (identidadesFinanzas.has(identity) && cache.gastos.length) return
  identidadesFinanzas.add(identity)
  const version = apiHydrationVersion
  let finance
  try { finance = await api.get('/api/finance') } catch (error) {
    if (esDenegacionPrivada(error)) {
      if (identity === identidadActual() && version === apiHydrationVersion) await invalidarSnapshotsPrivados()
      throw error
    }
    return
  }
  if (!apiMode() || !contextoApiValidado || version !== apiHydrationVersion || identity !== identidadActual()) return
  if (finance !== null && finance !== undefined) {
    cache.gastos = mapGastosApi(finance)
    notify()
  }
}

async function hydrateApi() {
  if (!apiMode() || !contextoApiValidado) return
  // No pintar una foto antes de conocer el resultado del API: un401/403 nunca
  // debe mostrar por un instante datos de una sesión ya rechazada.
  await hydrateDesdeApi(apiHydrationVersion, identidadActual(), tokenSnapshot)
}

// El costo del producto vive en la API como `costPyg`. Sin este mapeo la
// ganancia se mostraba igual a las ventas (costo 0) cuando la sesión es real.
export function mapProductoApi(p) {
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
export async function setContexto({ empresaId, sucursalId, userId, rol, permisos = null, fuente = 'legacy' }) {
  // Validar/guardar la rama demo antes de cambiar su contexto. No modifica API502.
  if (isDemoRuntime && !contextoDemo.permite(empresaId || null)) throw new Error('Empresa de demostración no disponible.')
  if (isDemoRuntime && ctx.empresaId) cacheDemoPorEmpresa.guardar(contextoDemo.capturar(), cache)
  apiHydrationVersion += 1
  const siguiente = { empresaId: empresaId || null, sucursalId: sucursalId || null, userId: userId || null, rol: rol || null, permisos: Array.isArray(permisos) ? [...new Set(permisos)].sort() : null }
  const modo = fuente === 'api' ? 'api' : 'legacy'
  const cambioEmpresa = ctx.empresaId !== siguiente.empresaId
  const cambio = identidadActual() !== JSON.stringify(siguiente) || fuenteDatos !== modo
  if (cambio) {
    invalidarConsultas()
    if (!isDemoRuntime && (ctx.empresaId || !siguiente.empresaId)) void invalidarSnapshotsPrivados()
    vaciarCache()
  }
  if (isDemoRuntime) {
    const anterior = contextoDemo.capturar()
    const actual = contextoDemo.activar({ empresaId: siguiente.empresaId, sucursalId: siguiente.sucursalId, userId: siguiente.userId })
    // Cambiar solo rol/permisos/fuente también retira continuaciones anteriores.
    if (cambio && actual === anterior) contextoDemo.invalidar()
  }
  if (cambioEmpresa) registrarCambioDeEmpresa(empresaId)
  Object.assign(ctx, siguiente)
  fuenteDatos = modo
  tokenSnapshot = apiMode() ? activarContextoSnapshots(ctx) : null
  contextoApiValidado = apiMode() && Boolean(ctx.empresaId && ctx.userId && ctx.rol)
  if (sucursalId) guardarDemo(SUC_KEY, sucursalId)
  if (!ctx.empresaId) {
    if (isDemoRuntime) { cacheDemoPorEmpresa.limpiar(); limpiarMemoriaDemo() }
    vaciarCache(); notify(); return
  }
  if (isDemoRuntime && cambio) {
    const guardado = cacheDemoPorEmpresa.leer(contextoDemo.capturar())
    if (guardado) Object.assign(cache, guardado)
  } else if (cambioEmpresa && !apiMode()) bootFromMirror()
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
  if (!ctx.empresaId) return []
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
  if (cache.vendedores.length === 0) {
    // #219: en la demo el equipo ficticio también se siembra acá. Antes la
    // demo dependía solo de `prepararDatosDemo` y una carga directa de Equipo
    // (antes de que el seed corriera) quedaba sin integrantes.
    cache.vendedores = clone(isDemoRuntime ? EQUIPO_DEMO : VENDEDORES_DEFAULT)
    persistMirror()
  }
  return cache.vendedores
}

// La cuenta demo utiliza las mismas colecciones y pantallas, en su propia tienda.
export function prepararDatosDemo() {
  if (!isDemoRuntime || ctx.empresaId !== 'mobos-demo') return
  const version = num(cache.config.demoSeedVersion)
  const producto = (id, nombre, categoria, precioVenta, precioCosto, stock, atributos = {}) => ({
    ...prod(nombre, categoria),
    id,
    sku: skuDemo(id),
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
  // #324: las ventas demo salen de una sola fuente (`demo/ventas.js`), la misma
  // que alimenta la ficha del cliente y el comprobante. Acá se resuelven los
  // ids de producto contra el catálogo, se completa el costo/comisión reales y
  // se conservan las ventas demo ya sembradas en esta pestaña.
  const catalogoPorId = new Map([...cache.productos, ...nuevosProductos].map(item => [item.id, item]))
  const ventasDemo = ventasDemoLegacy()
    .map(item => {
      const items = (item.items || []).map(linea => ({ ...linea, productoId: productoPorId.get(linea.productoId) || linea.productoId }))
      const costo = items.reduce((suma, linea) => suma + (Number(catalogoPorId.get(linea.productoId)?.precioCosto || CATALOGO_VENTA[linea.productoId]?.costo) * (Number(linea.quantity) || 1) || Math.round(Number(linea.totalPyg || 0) * 0.78)), 0)
      const comision = items.reduce((suma, linea) => suma + (Number(catalogoPorId.get(linea.productoId)?.comision) * (Number(linea.quantity) || 1) || Math.round(Number(linea.totalPyg || 0) * 0.01)), 0)
      return { ...item, items, precioCosto: costo, comision }
    })
    .filter(item => !cache.ventas.some(actual => actual.id === item.id))
  if (version < 5) {
    // Los celulares demo llevan sucursal y SKU: el inventario serializado y la
    // carga rápida los necesitan (los productos viejos se completan acá).
    cache.productos = [...cache.productos, ...nuevosProductos].map(item =>
      item.categoria === 'Celulares'
        ? { ...item, branchId: item.branchId || 'mobos-demo-central', sku: item.sku || skuDemo(item.id) }
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
        sku: item.sku || skuDemo(item.id),
        branchId: item.branchId || 'mobos-demo-central',
        precioMayorista: item.precioMayorista || Math.round(Number(item.precioVenta || 0) * 0.93),
        ...(umbrales[item.id] ? { reorderPoint: item.reorderPoint || umbrales[item.id] } : {}),
      }
    })
    // Equipo demo (#213): 6 usuarios con rol, correo y PIN ficticios.
    cache.vendedores = completarEquipoDemo(cache.vendedores)
    // Idempotente por id: los pedidos nuevos entran una sola vez.
    cache.ventas = [...ventasDemo.filter(item => !cache.ventas.some(actual => actual.id === item.id)), ...cache.ventas]
    // #324: Seguridad y auditoría también arranca con actividad ficticia: el
    // alta de cada pedido (misma venta canónica) y una edición de cobro.
    const idsAuditoria = new Set(cache.auditoria.map(entry => entry.id))
    const auditoriaDemo = ventasDemo.map(venta => ({
      id: `demo-aud-${venta.id}`,
      creadoEn: venta.creadoEn,
      accion: 'crear',
      ventaId: venta.id,
      actorId: venta.vendedorId,
      actorNombre: venta.seller?.name || 'Equipo demo',
      esPropietario: venta.vendedorId === 'demo-user',
      resumen: { cliente: venta.cliente, producto: venta.productoNombre || '—', precio: num(venta.precio) },
    }))
    auditoriaDemo.push({
      id: 'demo-aud-edicion-cobro',
      creadoEn: new Date().toISOString(),
      accion: 'editar',
      ventaId: 'demo-venta-hoy-partial',
      actorId: 'demo-user',
      actorNombre: 'Hernán Acosta',
      esPropietario: true,
      resumen: { cliente: 'Carlos Benítez', producto: 'Funda MagSafe Transparente', precio: 180000 },
      cambios: [{ campo: 'Estado de pago', de: 'Pendiente', a: 'Parcial' }],
    })
    cache.auditoria = [...cache.auditoria, ...auditoriaDemo.filter(entry => !idsAuditoria.has(entry.id))]
  }
  if (version < 6) {
    // #148 §6: el catálogo demo completa el SKU de todos los productos (los
    // seeds base no lo traían y el escáner del POS no los encontraba). Es
    // idempotente: solo toca los que no tienen SKU.
    cache.productos = cache.productos.map(item => (item.sku ? item : { ...item, sku: skuDemo(item.id) }))
  }
  if (version < 7) {
    // #313: los pedidos demo sin número humano mostraban el id interno truncado
    // (demo-venta-…). Se numera una sola vez con el mismo contador del POS
    // (#275) para que la lista y el detalle muestren AUR-#0001 y siguientes.
    cache.ventas = cache.ventas.map(venta => (venta.orderNumber || venta.numero)
      ? venta
      : { ...venta, orderNumber: tomarNumeroPedidoDemo() })
  }
  if (version < 8) {
    // #303: la Lista por modelo y el Comparador también arrancan con el
    // catálogo ficticio del demo; antes quedaban vacíos sin forma de cargarlos.
    if (!cache.celulares.length) {
      cache.celulares = IPHONES_DEMO.map((item, indice) => ({
        id: `demo-celular-${indice + 1}`,
        modelo: item.atributos.modelo,
        capacidad: item.atributos.capacidad,
        color: item.atributos.color,
        estado: item.atributos.estado,
        precio: item.precioVenta,
        activo: true,
      }))
    }
  }
  if (version < 9) {
    // #451: historial de ~120 días (idempotente por id) para sesiones que ya
    // habían sembrado las ventas manuales.
    const idsVentas = new Set(cache.ventas.map(actual => actual.id))
    cache.ventas = [...ventasDemo.filter(item => !idsVentas.has(item.id)), ...cache.ventas]
  }
  // Gastos y publicidad con historia de varios meses, siempre relativa a hoy:
  // se regeneran en cada arranque y no pisan lo que la persona cargue a mano.
  cache.gastos = [...gastosDemo(), ...cache.gastos.filter(item => !String(item.id || '').startsWith(PREFIJO_GASTO_DEMO))]
  cache.ads = [...adsDemo(), ...cache.ads.filter(item => !String(item.id || '').startsWith(PREFIJO_AD_DEMO))]
  // #404: fotos de muestra y categorías de accesorio (idempotente, no depende de la versión).
  cache.productos = conFotosDemo(cache.productos, (id, nombre, categoria, precioVenta, precioCosto, stock) => ({ ...producto(id, nombre, categoria, precioVenta, precioCosto, stock, {}), branchId: 'mobos-demo-central', precioMayorista: Math.round(precioVenta * 0.93) }))
  cache.config = {
    ...cache.config,
    nombreTienda: cache.config.nombreTienda || 'Aurora Móviles',
    demoSeedVersion: 9,
  }
  // #461: la ficha del cliente muestra lo mismo que la venta guardada (cobros posteriores al seed).
  for (const venta of cache.ventas) sincronizarPedidoDemoConVenta(venta)
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
// #324: la venta demo completa los datos que el comprobante y el detalle del
// pedido necesitan (empresa, cliente, sucursal, línea y entrega). Sin esto el
// papel salía con «MobOS», «Consumidor final» y «Sin artículos detallados».
function enriquecerVentaDemo(venta, prod) {
  venta.productoNombre = venta.productoNombre || prod?.nombre || ''
  venta.tenant = venta.tenant || { id: EMPRESA_DEMO.id, name: EMPRESA_DEMO.razonSocial, ruc: EMPRESA_DEMO.ruc, address: EMPRESA_DEMO.direccion, phone: EMPRESA_DEMO.telefono, email: EMPRESA_DEMO.email }
  venta.customer = venta.customer || { id: venta.clienteId || null, name: venta.cliente || 'Consumidor final', phone: venta.clienteTelefono || '', email: venta.clienteEmail || '', address: venta.clienteDireccion || '', countryCode: '+595' }
  const sucursal = SUCURSALES_DEMO.find(s => s.id === ctx.sucursalId) || SUCURSALES_DEMO[0]
  venta.branch = venta.branch || { id: sucursal.id, name: sucursal.name, address: sucursal.address, city: sucursal.city }
  venta.deliveryType = venta.deliveryType || (String(venta.entrega || '').toLowerCase().includes('delivery') ? 'DELIVERY' : 'RETIRO')
  // Nunca se marca retirada/entregada sola: el vendedor lo confirma («¿ya se llevó el producto?»).
  venta.fulfillmentStatus = venta.fulfillmentStatus || 'PROCESSING'
  venta.subtotalPyg = venta.subtotalPyg ?? num(venta.precio)
  venta.totalPyg = venta.totalPyg ?? num(venta.precio) + num(venta.montoDelivery)
  venta.seller = venta.seller || { id: venta.vendedorId || null, name: venta.vendedorNombre || 'Equipo demo' }
  if (!Array.isArray(venta.items) || !venta.items.length) {
    const seriales = venta.seriales || venta.serials || venta.imei || []
    venta.items = [{
      id: `${venta.id}-item-1`,
      productoId: venta.productoId || null,
      description: venta.productoNombre || prod?.nombre || 'Producto',
      quantity: 1,
      model: prod?.atributos?.modelo || '',
      category: prod?.categoria || '',
      unitPricePyg: num(venta.precio),
      totalPyg: num(venta.precio),
      serials: Array.isArray(seriales) ? seriales : [],
      ...(garantiaDiasDemo(prod?.categoria, prod?.atributos?.estado) ? { warrantyDays: garantiaDiasDemo(prod?.categoria, prod?.atributos?.estado) } : {}),
    }]
  }
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
  // #313: toda venta demo tiene número humano (AUR-#0001): sin esto, la lista
  // de Pedidos caía al id interno y lo mostraba truncado.
  nueva.orderNumber = nueva.orderNumber || nueva.numero || tomarNumeroPedidoDemo()
  const pagos = Array.isArray(venta.pagos) ? venta.pagos : []
  nueva.pagos = pagos.map(p => ({
    ...p,
    id: p.id || 'p-' + Math.random().toString(36).slice(2, 9),
    medioPago: p.medioPago || MEDIOS_PAGO[0],
    cuenta: p.cuenta || '',
    monto: num(p.monto),
    amountPyg: num(p.amountPyg ?? p.monto),
    fecha: p.fecha || new Date().toISOString(),
  }))
  nueva.totalPagado = nueva.pagos.reduce((s, p) => s + num(p.monto), 0)
  nueva.totalPendiente = Math.max(
    0,
    num(nueva.precio) + num(nueva.montoDelivery) - nueva.totalPagado,
  )
  nueva.estadoPago =
    nueva.totalPendiente === 0 ? 'Pagado' : nueva.totalPagado > 0 ? 'Parcial' : 'Pendiente'
  if (isDemoRuntime) enriquecerVentaDemo(nueva, prod)
  entUpsert('ventas', nueva)
  for (const item of stockDePedidoDemo(nueva)) moverStock(item.productoId, -item.quantity)
  // #227: la venta demo también baja la unidad (SOLD + cronología), como el API real.
  if (isDemoRuntime) {
    const seriales = nueva.seriales || nueva.serials || nueva.imei || (nueva.items || []).flatMap(item => item.serials || item.seriales || (item.imei ? [item.imei] : []))
    if (Array.isArray(seriales) && seriales.length) {
      marcarUnidadesVendidasDemo({ serials: seriales, orderNumber: nueva.orderNumber || nueva.numero || '', customerName: nueva.cliente || '', totalPyg: nueva.precio })
      // #257: la venta demo también tiene que verse en el stock del catálogo.
      sincronizarCatalogoDemo()
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
  if (isDemoRuntime && ('pagos' in cambios || 'totalPagado' in cambios)) sincronizarPedidoDemoConVenta(merged)
  logAuditoria('editar', merged, difs)
}
// Demo: vincula (o quita, con `ficha` nula) la ficha de cliente de un pedido.
export function asignarClienteVenta(id, ficha) {
  const nuevo = ficha
    ? { id: ficha.id, name: ficha.name, phone: ficha.phone || '', countryCode: ficha.countryCode || '+595', email: ficha.email || '', document: ficha.document || '' }
    : { id: null, name: 'Consumidor final', phone: '', email: '', document: '' }
  updateVenta(id, { clienteId: nuevo.id, customerId: nuevo.id, cliente: ficha ? nuevo.name : '', customer: nuevo })
}
// Demo: anular un pedido lo deja CANCELLED, devuelve el stock y las unidades
// (IMEI) y no deja saldo pendiente; los pagos quedan registrados.
export function anularVenta(id, motivo = '') {
  const v = cache.ventas.find(x => x.id === id)
  if (!v || v.status === 'CANCELLED') return v
  for (const item of stockDePedidoDemo(v)) moverStock(item.productoId, item.quantity)
  if (isDemoRuntime) {
    const seriales = v.seriales || v.serials || (v.items || []).flatMap(item => item.serials || item.seriales || [])
    if (Array.isArray(seriales) && seriales.length) {
      liberarUnidadesVendidasDemo({ serials: seriales, orderNumber: v.orderNumber || v.numero || '' })
      sincronizarCatalogoDemo()
    }
  }
  const razon = String(motivo || '').trim()
  updateVenta(id, { status: 'CANCELLED', totalPendiente: 0, anuladoEn: new Date().toISOString(), ...(razon ? { observacion: `Anulado: ${razon}` } : {}) })
  return cache.ventas.find(x => x.id === id)
}
export function deleteVenta(id) {
  const v = cache.ventas.find(x => x.id === id)
  entDelete('ventas', id)
  if (v) for (const item of stockDePedidoDemo(v)) moverStock(item.productoId, item.quantity)
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
export function updateGasto(id, cambios) {
  const actual = cache.gastos.find(item => item.id === id)
  if (!actual) return null
  const siguiente = { ...actual, ...cambios }
  entUpsert('gastos', siguiente)
  return siguiente
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

// #303: administración de la lista por modelo desde el Centro de Control.
// Es la capa local del demo (y del modo legacy): en una cuenta API la
// pantalla muestra su aviso, porque todavía no hay endpoints de esta colección.
const idCelular = () => `cel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export function addCelular(datos = {}) {
  if (apiMode()) throw new Error('La lista por modelo se administra desde el Centro de Control y todavía no tiene API.')
  const nuevo = {
    id: idCelular(),
    modelo: String(datos.modelo || '').trim(),
    capacidad: String(datos.capacidad || '').trim(),
    color: String(datos.color || '').trim(),
    estado: ESTADOS_CELULAR.includes(datos.estado) ? datos.estado : ESTADOS_CELULAR[0],
    precio: num(datos.precio),
    activo: datos.activo !== false,
  }
  if (!nuevo.modelo || !nuevo.capacidad) throw new Error('Modelo y capacidad son obligatorios.')
  entUpsert('celulares', nuevo)
  return nuevo
}

export function updateCelular(id, cambios = {}) {
  if (apiMode()) throw new Error('La lista por modelo se administra desde el Centro de Control y todavía no tiene API.')
  const actual = cache.celulares.find(c => c.id === id)
  if (!actual) return null
  const actualizado = {
    ...actual,
    ...cambios,
    ...(cambios.precio !== undefined ? { precio: num(cambios.precio) } : {}),
    ...(cambios.estado !== undefined && !ESTADOS_CELULAR.includes(cambios.estado) ? { estado: actual.estado } : {}),
  }
  entUpsert('celulares', actualizado)
  return actualizado
}

export function deleteCelular(id) {
  if (apiMode()) throw new Error('La lista por modelo se administra desde el Centro de Control y todavía no tiene API.')
  entDelete('celulares', id)
}

// Carga el lineup de iPhone (nuevos y semi-nuevos) sin precio: el propietario
// lo completa. No duplica filas existentes por estado + modelo + capacidad.
export function cargarLineupIphone() {
  if (apiMode()) throw new Error('La lista por modelo se administra desde el Centro de Control y todavía no tiene API.')
  const existentes = new Set(cache.celulares.map(c => `${c.estado}|${c.modelo}|${c.capacidad}`.toLowerCase()))
  let agregados = 0
  for (const [estado, lineup] of [['Nuevo', LINEUP_NUEVO], ['Seminuevo', LINEUP_SEMINUEVO]]) {
    for (const [modelo, capacidades] of lineup) {
      for (const capacidad of capacidades) {
        const clave = `${estado}|${modelo}|${capacidad}`.toLowerCase()
        if (existentes.has(clave)) continue
        existentes.add(clave)
        entUpsert('celulares', { id: idCelular(), modelo, capacidad, color: '', estado, precio: 0, activo: true })
        agregados += 1
      }
    }
  }
  return agregados
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

// Registros crudos (con id) para administrarlos desde el Centro de Control.
export function listComparadorImagenes() {
  return cache.comparadorImg || []
}

// #303: alta/borrado de fotos desde el Centro de Control. Cada foto es un
// registro por modelo + color (guardar una no pisa las demás).
export function setComparadorImagen(modelo, color, img) {
  if (apiMode()) throw new Error('Las fotos del comparador se administran desde el Centro de Control y todavía no tienen API.')
  const nombreModelo = String(modelo || '').trim()
  const nombreColor = String(color || '').trim()
  if (!nombreModelo || !nombreColor || !img) throw new Error('Elegí el modelo, el color y la foto.')
  const actual = (cache.comparadorImg || []).find(r => r.modelo === nombreModelo && r.color === nombreColor)
  const registro = {
    id: actual?.id || `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    modelo: nombreModelo,
    color: nombreColor,
    img,
  }
  entUpsert('comparadorImg', registro)
  return registro
}

export function deleteComparadorImagen(id) {
  if (apiMode()) throw new Error('Las fotos del comparador se administran desde el Centro de Control y todavía no tienen API.')
  entDelete('comparadorImg', id)
}
