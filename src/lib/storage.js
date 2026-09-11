// ════════════════════════════════════════════════════════════════════
// CAPA ÚNICA DE DATOS — Mobtock
// Backend: Supabase (tiempo real entre dispositivos) con caché en memoria.
// La API exportada es SINCRÓNICA (igual que antes con localStorage): los
// componentes la usan sin async. Por dentro:
//   - cache en memoria = fuente de verdad para la UI
//   - espejo en localStorage = pintado instantáneo y modo offline
//   - Supabase = persistencia + realtime hacia/desde otros dispositivos
// Si faltan las env de Supabase, la app sigue andando 100% local.
// Nadie más debe tocar localStorage ni Supabase directamente.
// ════════════════════════════════════════════════════════════════════

import { num } from '@/utils/calculos'
import { APP_NAME } from '@/lib/brand'
import { api } from '@/lib/api'
import { isDemoRuntime } from './demoMode'

// La persistencia real del frontend usa OwnCoding Hub. Se conserva este
// export por compatibilidad con consumidores legacy, pero ya no existe un
// cliente Supabase en esta capa.
export const supabase = null

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
const COMPARTIDAS = new Set(['productos', 'celulares', 'comparadorImg'])

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

// Sync entre pestañas del mismo dispositivo (incluso sin Supabase).
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

// ── Orden de las colecciones ────────────────────────────────────────
function sortColeccion(coll, arr) {
  const a = [...arr]
  if (FEEDS.has(coll)) {
    a.sort((x, y) => (y._ts || '').localeCompare(x._ts || ''))
  } else {
    a.sort((x, y) => (x._ts || '').localeCompare(y._ts || ''))
  }
  return a.map(({ _ts, ...o }) => o)
}

// ════════════════════════════════════════════════════════════════════
// SUPABASE: hidratación, escritura y realtime
// ════════════════════════════════════════════════════════════════════
// ── Cola de escrituras pendientes ───────────────────────────────────
// Si un envío a Supabase falla (ej. corte de internet), lo guardamos y lo
// reintentamos. Así una venta cargada NUNCA se pierde por un fallo de red.
const PENDING_KEY = 'fono:pending:v1'
let pendientes =
  safeParse(typeof localStorage !== 'undefined' ? localStorage.getItem(PENDING_KEY) : null) || []
function savePendientes() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendientes))
  } catch {
    /* noop */
  }
}
function enqueue(item) {
  // La empresa viaja con el pendiente: si se reintenta después de cambiar de
  // tienda, tiene que escribirse igual en la que lo originó.
  const it = { empresa_id: ctx.empresaId, sucursal_id: ctx.sucursalId, ...item }
  // Evita duplicados de la misma entidad: se queda con la última versión.
  pendientes = pendientes.filter(
    (p) =>
      !(
        p.t === it.t &&
        p.empresa_id === it.empresa_id &&
        p.collection === it.collection &&
        (p.obj?.id || p.id) === (it.obj?.id || it.id)
      ),
  )
  pendientes.push(it)
  savePendientes()
}
// ¿La entidad `id` de `collection` está pendiente de subir? (para no borrarla al refrescar)
function estaPendiente(collection, id) {
  return pendientes.some(
    (p) =>
      p.empresa_id === ctx.empresaId &&
      p.collection === collection &&
      (p.obj?.id || p.id) === id,
  )
}
export async function flushPendientes() {
  if (!supabase || pendientes.length === 0) return
  const cola = pendientes
  pendientes = []
  savePendientes()
  for (const it of cola) {
    // Un pendiente sin empresa es de la versión anterior a multiempresa: se
    // descarta en vez de escribirlo en la tienda equivocada.
    if (!it.empresa_id) continue
    try {
      let res
      if (it.t === 'ent') {
        const row = {
          empresa_id: it.empresa_id,
          sucursal_id: COMPARTIDAS.has(it.collection) ? null : it.sucursal_id,
          collection: it.collection,
          id: it.obj.id,
          data: it.obj,
        }
        if (it.obj.creadoEn) row.created_at = it.obj.creadoEn
        res = await supabase.from('entities').upsert(row)
      } else if (it.t === 'entdel') {
        res = await supabase
          .from('entities')
          .delete()
          .eq('empresa_id', it.empresa_id)
          .eq('collection', it.collection)
          .eq('id', it.id)
      } else if (it.t === 'kv') {
        res = await supabase.from('kv').upsert({
          empresa_id: it.empresa_id,
          key: it.key,
          value: it.value,
          updated_at: new Date().toISOString(),
        })
      }
      if (res?.error) throw res.error
    } catch {
      enqueue(it) // sigue fallando: lo dejamos para el próximo intento
    }
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushPendientes())
}

// Inserta/actualiza una entidad (fila) en Supabase; si falla, la encola.
function remoteUpsertEnt(collection, obj) {
  if (!supabase || !ctx.empresaId) return
  const row = {
    empresa_id: ctx.empresaId,
    // Las compartidas no viven en una sucursal: son de toda la empresa.
    sucursal_id: COMPARTIDAS.has(collection) ? null : ctx.sucursalId,
    collection,
    id: obj.id,
    data: obj,
  }
  if (obj.creadoEn) row.created_at = obj.creadoEn
  supabase
    .from('entities')
    .upsert(row)
    .then(
      ({ error }) => {
        if (error) enqueue({ t: 'ent', collection, obj })
      },
      () => enqueue({ t: 'ent', collection, obj }),
    )
}
function remoteDeleteEnt(collection, id) {
  if (!supabase || !ctx.empresaId) return
  supabase
    .from('entities')
    .delete()
    .eq('empresa_id', ctx.empresaId)
    .eq('collection', collection)
    .eq('id', id)
    .then(
      ({ error }) => {
        if (error) enqueue({ t: 'entdel', collection, id })
      },
      () => enqueue({ t: 'entdel', collection, id }),
    )
}
function remoteUpsertKv(key, value) {
  if (!supabase || !ctx.empresaId) return
  supabase
    .from('kv')
    .upsert({
      empresa_id: ctx.empresaId,
      key,
      value,
      updated_at: new Date().toISOString(),
    })
    .then(
      ({ error }) => {
        if (error) enqueue({ t: 'kv', key, value })
      },
      () => enqueue({ t: 'kv', key, value }),
    )
}

// Mutaciones locales optimistas (cache + espejo + notify) y luego remoto.
function entUpsert(collection, obj) {
  if (apiMode()) throw new Error(`La mutación legacy de ${collection} no está disponible en modo API.`)
  const arr = cache[collection]
  const i = arr.findIndex((o) => o.id === obj.id)
  if (i >= 0) cache[collection] = arr.map((item, index) => index === i ? obj : item)
  else if (FEEDS.has(collection)) cache[collection] = [obj, ...arr]
  else cache[collection] = [...arr, obj]
  persistMirror()
  notify()
  remoteUpsertEnt(collection, obj)
}
function entDelete(collection, id) {
  if (apiMode()) throw new Error(`La eliminación legacy de ${collection} no está disponible en modo API.`)
  cache[collection] = cache[collection].filter((o) => o.id !== id)
  persistMirror()
  notify()
  remoteDeleteEnt(collection, id)
}
function kvSet(key, value) {
  if (apiMode()) throw new Error(`La mutación legacy de ${key} no está disponible en modo API.`)
  cache[key] = value
  persistMirror()
  notify()
  remoteUpsertKv(key, value)
}

// Aplica un cambio recibido por realtime a la caché (sin reescribir remoto).
function aplicarEnt(payload) {
  const { eventType } = payload
  if (eventType === 'DELETE') {
    const { collection, id } = payload.old || {}
    if (collection && cache[collection]) {
      cache[collection] = cache[collection].filter((o) => o.id !== id)
    }
  } else {
    const { collection, id, data, sucursal_id: suc } = payload.new || {}
    if (!collection || !cache[collection]) return
    // Un movimiento de otra sucursal no entra en la vista actual. (suc null =
    // compartido por toda la empresa, ese sí entra siempre.)
    if (suc && ctx.sucursalId && suc !== ctx.sucursalId) return
    const arr = cache[collection]
    const i = arr.findIndex((o) => o.id === id)
    if (i >= 0) arr[i] = data
    else if (FEEDS.has(collection)) arr.unshift(data)
    else arr.push(data)
  }
  persistMirror()
  notify()
}
function aplicarKv(payload) {
  if (payload.eventType === 'DELETE') return
  const { key, value } = payload.new || {}
  if (key === 'tradein' || key === 'config') {
    cache[key] = value
    persistMirror()
    notify()
  }
}

// Baja TODAS las filas de `entities` paginando de a 1000 (Supabase/PostgREST
// devuelve como máximo 1000 por request; sin esto, se perdían las más nuevas).
async function fetchAllEntities() {
  const PAGE = 1000
  let desde = 0
  let todo = []
  for (;;) {
    // La RLS ya limita a las empresas del usuario, pero filtramos igual: el
    // dueño de varias tiendas no debe mezclar los datos de una con otra.
    // sucursal_id null = compartida por toda la empresa (catálogo, precios).
    let q = supabase
      .from('entities')
      .select('collection,id,data,created_at,sucursal_id')
      .eq('empresa_id', ctx.empresaId)
    if (ctx.sucursalId) q = q.or(`sucursal_id.is.null,sucursal_id.eq.${ctx.sucursalId}`)
    const { data, error } = await q
      .order('created_at', { ascending: true })
      .range(desde, desde + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    todo = todo.concat(data)
    if (data.length < PAGE) break
    desde += PAGE
  }
  return todo
}

let hidratado = false
let apiHydrationVersion = 0
async function hydrate() {
  if (!supabase || hidratado || !ctx.empresaId) return
  hidratado = true
  try {
    const [ents, { data: kvs }] = await Promise.all([
      fetchAllEntities(),
      supabase.from('kv').select('key,value').eq('empresa_id', ctx.empresaId),
    ])

    if (ents) {
      const porColl = Object.fromEntries(COLLECTIONS.map((c) => [c, []]))
      ents.forEach((r) => {
        if (porColl[r.collection]) porColl[r.collection].push({ ...r.data, _ts: r.created_at })
      })
      COLLECTIONS.forEach((c) => {
        cache[c] = sortColeccion(c, porColl[c])
      })
    }

    const kvPresent = new Set()
    if (kvs) {
      kvs.forEach((r) => {
        kvPresent.add(r.key)
        if (r.key === 'tradein' || r.key === 'config') cache[r.key] = r.value
      })
    }

    await seedSiVacio(kvPresent)
    persistMirror()
    notify()
    subscribeRealtime()
  } catch (e) {
    console.warn('[storage] hidratación falló, sigo en modo local:', e?.message || e)
  }
}

async function hydrateApi() {
  if (!apiMode()) return
  const version = apiHydrationVersion
  const identity = `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`
  const [products, orders, users] = await Promise.all([
    api.get('/api/products'), api.get('/api/orders'), ctx.rol === 'dueno' ? api.get('/api/users') : Promise.resolve([]),
  ])
  if (!apiMode() || version !== apiHydrationVersion || identity !== `${ctx.empresaId}:${ctx.userId}:${ctx.rol}:${ctx.sucursalId}`) return
  cache.productos = (products || []).map((p) => ({ ...p, nombre: p.name, precioVenta: p.pricePyg, precioCosto: 0, activo: p.isActive !== false }))
  cache.ventas = (orders || []).map(mapOrdenApi)
  cache.vendedores = (users || []).map((u) => ({ ...u, nombre: u.name, activo: u.status === 'ACTIVE' }))
  cache.mayoristas = []; cache.gastos = []; cache.ads = []; cache.auditoria = []
  cache.config = { ...CONFIG_DEFAULT, nombreTienda: getCompanyName() }
  notify()
}

function mapOrdenApi(o) {
  const pagos = (o.payments || []).map((p) => ({ ...p, monto: p.amountPyg, medioPago: p.method }))
  const totalPagado = pagos.filter((p) => p.status === 'CONFIRMED').reduce((sum, p) => sum + num(p.monto), 0)
  const total = num(o.totalPyg)
  return { ...o, codigo: o.orderNumber, precio: total, vendedorId: o.sellerId, clienteId: o.customerId, cliente: o.customer?.name || '', fecha: o.createdAt?.slice(0, 10) || '', creadoEn: o.createdAt, productoNombre: (o.items || []).map((item) => item.description).filter(Boolean).join(', '), pagos, totalPagado, totalPendiente: Math.max(0, total - totalPagado), estadoPago: totalPagado >= total ? 'Pagado' : totalPagado > 0 ? 'Parcial' : 'Pendiente' }
}

function getCompanyName() {
  try { return JSON.parse(localStorage.getItem('owncoding_hub_company_context') || 'null')?.tenant?.name || APP_NAME } catch { return APP_NAME }
}

// Vuelve a bajar todo de Supabase y refresca la vista. Se usa para mantener el
// sistema al día (al volver a la pestaña y cada pocos minutos), aunque el
// realtime no haya empujado algún cambio.
// Hora del servidor (ms) leída del header HTTP `Date` de Supabase. Sirve para
// detectar si el reloj del equipo está mal (y por eso guardaría mal las fechas).
export async function horaServidorMs() {
  return null
}

export async function refrescar() {
  if (!ctx.empresaId) return
  if (apiMode()) {
    await hydrateApi()
    return
  }
  if (!supabase) return
  // Primero reintentamos lo que quedó sin subir, para no perderlo.
  await flushPendientes()
  try {
    const [ents, { data: kvs }] = await Promise.all([
      fetchAllEntities(),
      supabase.from('kv').select('key,value').eq('empresa_id', ctx.empresaId),
    ])
    if (ents) {
      const porColl = Object.fromEntries(COLLECTIONS.map((c) => [c, []]))
      ents.forEach((r) => {
        if (porColl[r.collection]) porColl[r.collection].push({ ...r.data, _ts: r.created_at })
      })
      COLLECTIONS.forEach((c) => {
        cache[c] = sortColeccion(c, porColl[c])
      })
      // Re-aplica lo que todavía está pendiente de subir, para que NO desaparezca
      // de la vista mientras se reintenta el envío.
      pendientes.forEach((it) => {
        if (it.empresa_id !== ctx.empresaId) return
        if (it.t === 'ent' && cache[it.collection]) {
          const arr = cache[it.collection]
          const i = arr.findIndex((o) => o.id === it.obj.id)
          if (i >= 0) arr[i] = it.obj
          else arr.push(it.obj)
        }
      })
    }
    if (kvs) {
      kvs.forEach((r) => {
        if (r.key === 'tradein' || r.key === 'config') cache[r.key] = r.value
      })
    }
    persistMirror()
    notify()
  } catch (e) {
    console.warn('[storage] refresco falló:', e?.message || e)
  }
}

// Primer arranque: si Supabase está vacío, sembramos defaults (o importamos
// datos viejos de localStorage de la versión anterior, si existieran).
const LEGACY = {
  productos: 'fono:productos:v1',
  vendedores: 'fono:vendedores:v1',
  ventas: 'fono:ventas:v1',
  gastos: 'fono:gastos:v1',
  ads: 'fono:ads:v1',
  celulares: 'fono:celulares:v1',
  tradein: 'fono:tradein:v1',
  config: 'fono:config:v1',
}
function readLegacy(coll) {
  try {
    return safeParse(localStorage.getItem(LEGACY[coll]))
  } catch {
    return null
  }
}
async function bulkInsert(collection, arr) {
  if (!supabase || !arr.length) return
  const rows = arr.map((o) => {
    const row = { collection, id: o.id, data: o }
    if (o.creadoEn) row.created_at = o.creadoEn
    return row
  })
  await supabase
    .from('entities')
    .upsert(rows)
    .then(logErr(`seed ${collection}`))
}

async function seedSiVacio(kvPresent) {
  // Catálogos con defaults
  if (cache.productos.length === 0) {
    const legacy = readLegacy('productos')
    cache.productos = legacy?.length ? legacy : clone(PRODUCTOS_DEFAULT)
    await bulkInsert('productos', cache.productos)
  }
  if (cache.vendedores.length === 0) {
    const legacy = readLegacy('vendedores')
    cache.vendedores = legacy?.length ? legacy : clone(VENDEDORES_DEFAULT)
    await bulkInsert('vendedores', cache.vendedores)
  }
  // Feeds y celulares: sin defaults, pero importamos datos viejos si hay.
  for (const c of ['ventas', 'gastos', 'ads', 'celulares']) {
    if (cache[c].length === 0) {
      const legacy = readLegacy(c)
      if (legacy?.length) {
        cache[c] = sortColeccion(
          c,
          legacy.map((o) => ({ ...o, _ts: o.creadoEn })),
        )
        await bulkInsert(c, legacy)
      }
    }
  }
  // KV
  if (!kvPresent.has('config')) {
    const legacy = readLegacy('config')
    cache.config = { ...CONFIG_DEFAULT, ...(legacy || {}) }
    remoteUpsertKv('config', cache.config)
  }
  if (!kvPresent.has('tradein')) {
    const legacy = readLegacy('tradein')
    cache.tradein = { ...clone(TRADEIN_DEFAULT), ...(legacy || {}) }
    remoteUpsertKv('tradein', cache.tradein)
  }
}

let canal = null
function subscribeRealtime() {
  if (!supabase || !ctx.empresaId) return
  desconectarRealtime()
  // El filtro evita recibir (y tener que descartar) los cambios de las otras
  // empresas. La RLS igual no los dejaría pasar, pero mejor no pedirlos.
  const filtro = `empresa_id=eq.${ctx.empresaId}`
  canal = supabase
    .channel(`fono-${ctx.empresaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entities', filter: filtro },
      aplicarEnt,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kv', filter: filtro },
      aplicarKv,
    )
    .subscribe()
}
function desconectarRealtime() {
  if (canal) {
    supabase?.removeChannel(canal)
    canal = null
  }
}

// ════════════════════════════════════════════════════════════════════
// MULTIEMPRESA — sesión, empresas y sucursales
// Nada de esto se guarda en el navegador salvo la sesión de Supabase y la
// última sucursal elegida: quién puede ver qué lo decide la base (RLS).
// ════════════════════════════════════════════════════════════════════
const SUC_KEY = 'fono:sucursal'

// Entra a una empresa/sucursal: limpia lo anterior, levanta el espejo de esta
// y arranca la sincronización. Es el único punto por donde se cambia de tienda.
export async function setContexto({ empresaId, sucursalId, userId, rol, fuente = 'legacy' }) {
  apiHydrationVersion += 1
  const cambioEmpresa = ctx.empresaId !== empresaId
  if (fuente === 'api' && (ctx.userId !== userId || ctx.rol !== rol || cambioEmpresa)) vaciarCache()
  desconectarRealtime()
  hidratado = false
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
  else await hydrate()
}

export function sucursalGuardada() {
  try {
    return localStorage.getItem(SUC_KEY)
  } catch {
    return null
  }
}

export async function salirDeTodo() {
  desconectarRealtime()
  hidratado = false
  ctx.empresaId = null
  ctx.sucursalId = null
  ctx.userId = null
  ctx.rol = null
  vaciarCache()
  notify()
  await supabase?.auth.signOut()
}

// ── Autenticación ───────────────────────────────────────────────────
export async function sesionSupabase() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

export async function entrarConCorreo(correo, clave) {
  if (!supabase) return { error: 'Supabase no está configurado.' }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: clave,
  })
  if (error) {
    return {
      error:
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : error.message,
    }
  }
  return { user: data.user }
}

// Crea la cuenta, la empresa y su primera sucursal, y deja al que registra
// como dueño. Todo en la misma llamada para que no queden cuentas sin empresa.
export async function registrarEmpresa({ nombreEmpresa, nombrePersona, correo, clave }) {
  if (!supabase) return { error: 'Supabase no está configurado.' }
  const { data, error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: clave,
    options: { data: { nombre: nombrePersona } },
  })
  if (error) return { error: error.message }
  if (!data.user) return { error: 'No se pudo crear el usuario.' }

  const { data: empresaId, error: e2 } = await supabase.rpc('crear_empresa', {
    p_nombre: nombreEmpresa.trim(),
    p_nombre_persona: (nombrePersona || '').trim(),
  })
  if (e2) return { error: e2.message }
  return { user: data.user, empresaId }
}

// ── Empresas y sucursales del usuario ───────────────────────────────
export async function misEmpresas() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('miembros')
    .select('rol, sucursal_id, empresa_id, empresas(id, nombre, slug)')
  if (error || !data) return []
  return data
    .filter((m) => m.empresas)
    .map((m) => ({
      id: m.empresas.id,
      nombre: m.empresas.nombre,
      slug: m.empresas.slug,
      rol: m.rol,
      sucursalId: m.sucursal_id,
    }))
}

export async function sucursalesDe(empresaId) {
  if (!supabase || !empresaId) return []
  const { data, error } = await supabase
    .from('sucursales')
    .select('id, nombre, activa')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .order('creada_en', { ascending: true })
  return error || !data ? [] : data
}

export async function crearSucursal(nombre) {
  if (!supabase || !ctx.empresaId) return { error: 'Sin empresa activa.' }
  const { data, error } = await supabase
    .from('sucursales')
    .insert({ empresa_id: ctx.empresaId, nombre: nombre.trim() })
    .select('id, nombre')
    .single()
  return error ? { error: error.message } : { sucursal: data }
}

export async function renombrarSucursal(id, nombre) {
  if (!supabase) return { error: 'Supabase no está configurado.' }
  const { error } = await supabase
    .from('sucursales')
    .update({ nombre: nombre.trim() })
    .eq('id', id)
  return error ? { error: error.message } : {}
}

// ── Equipo ──────────────────────────────────────────────────────────
export async function miembrosDeEmpresa() {
  if (!supabase || !ctx.empresaId) return []
  const { data, error } = await supabase
    .from('miembros')
    .select('user_id, rol, nombre, sucursal_id')
    .eq('empresa_id', ctx.empresaId)
  return error || !data ? [] : data
}

export async function cambiarMiClave(nueva) {
  if (!supabase) return { error: 'Supabase no está configurado.' }
  const { error } = await supabase.auth.updateUser({ password: nueva })
  return error ? { error: error.message } : {}
}

// ── Invitaciones ────────────────────────────────────────────────────
// El dueño anota el correo; cuando esa persona crea su cuenta, entra sola.
export async function listInvitaciones() {
  if (!supabase || !ctx.empresaId) return []
  const { data, error } = await supabase
    .from('invitaciones')
    .select('correo, rol, nombre, sucursal_id, creada_en')
    .eq('empresa_id', ctx.empresaId)
    .order('creada_en', { ascending: true })
  return error || !data ? [] : data
}

export async function invitar({ correo, rol = 'vendedor', nombre = '', sucursalId }) {
  if (!supabase || !ctx.empresaId) return { error: 'Sin empresa activa.' }
  const { error } = await supabase.from('invitaciones').upsert({
    empresa_id: ctx.empresaId,
    correo: correo.trim().toLowerCase(),
    rol,
    nombre: nombre.trim() || null,
    sucursal_id: sucursalId || ctx.sucursalId,
  })
  return error ? { error: error.message } : {}
}

export async function cancelarInvitacion(correo) {
  if (!supabase || !ctx.empresaId) return { error: 'Sin empresa activa.' }
  const { error } = await supabase
    .from('invitaciones')
    .delete()
    .eq('empresa_id', ctx.empresaId)
    .eq('correo', correo.trim().toLowerCase())
  return error ? { error: error.message } : {}
}

export async function cambiarRol(userId, rol) {
  if (!supabase || !ctx.empresaId) return { error: 'Sin empresa activa.' }
  const { error } = await supabase
    .from('miembros')
    .update({ rol })
    .eq('empresa_id', ctx.empresaId)
    .eq('user_id', userId)
  return error ? { error: error.message } : {}
}

export async function quitarMiembro(userId) {
  if (!supabase || !ctx.empresaId) return { error: 'Sin empresa activa.' }
  if (userId === ctx.userId) return { error: 'No te podés quitar a vos mismo.' }
  const { error } = await supabase
    .from('miembros')
    .delete()
    .eq('empresa_id', ctx.empresaId)
    .eq('user_id', userId)
  return error ? { error: error.message } : {}
}

// ── Cotización del dólar (global, compartida por todas las empresas) ──
export async function cotizacionDolar() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('cotizacion')
    .select('compra, venta, actualizado')
    .eq('id', 1)
    .maybeSingle()
  return error ? null : data
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
  // Modo 100% local (sin Supabase): sembramos defaults la primera vez.
  if (!isDemoRuntime && !supabase && cache.productos.length === 0) {
    cache.productos = clone(PRODUCTOS_DEFAULT)
    persistMirror()
  }
  return cache.productos
}
export async function addProductoApi(payload) {
  if (!apiMode()) throw new Error('addProductoApi solo está disponible con una sesión API real.')
  const created = await api.post('/api/products', payload)
  if (!created?.id) throw new Error('El backend no devolvió un producto confirmado.')
  cache.productos.push({ ...created, nombre: created.name, precioVenta: created.pricePyg, activo: created.isActive !== false })
  notify()
  return created
}
export async function updateProductoApi(id, cambios) {
  if (!apiMode()) throw new Error('updateProductoApi solo está disponible con una sesión API real.')
  const updated = await api.patch('/api/products', { id, ...cambios })
  if (!updated?.id) throw new Error('El backend no devolvió un producto confirmado.')
  const mapped = { ...updated, nombre: updated.name, precioVenta: updated.pricePyg, activo: updated.isActive !== false }
  const index = cache.productos.findIndex((product) => product.id === id)
  if (index >= 0) cache.productos[index] = mapped
  notify()
  return updated
}
export function saveProductos(productos) {
  if (apiMode()) throw new Error('Productos: escritura API todavía no está disponible.')
  const removidos = cache.productos.filter((p) => !productos.some((n) => n.id === p.id))
  cache.productos = productos
  persistMirror()
  notify()
  if (supabase) {
    if (productos.length)
      supabase
        .from('entities')
        .upsert(productos.map((o) => ({ collection: 'productos', id: o.id, data: o })))
        .then(logErr('save productos'))
    removidos.forEach((p) => remoteDeleteEnt('productos', p.id))
  }
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
  if (!isDemoRuntime && !supabase && cache.vendedores.length === 0) {
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
  const removidos = cache.vendedores.filter((v) => !vendedores.some((n) => n.id === v.id))
  cache.vendedores = vendedores
  persistMirror()
  notify()
  if (supabase) {
    if (vendedores.length)
      supabase
        .from('entities')
        .upsert(vendedores.map((o) => ({ collection: 'vendedores', id: o.id, data: o })))
        .then(logErr('save vendedores'))
    removidos.forEach((v) => remoteDeleteEnt('vendedores', v.id))
  }
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
// Dispara la Edge Function que actualiza la cotización ahora mismo (manual). El
// valor nuevo llega por realtime y re-renderiza la UI. Devuelve { ok, rate, ... }.
export async function actualizarDolar() {
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase' }
  try {
    const { data, error } = await supabase.functions.invoke('actualizar-dolar')
    if (error) return { ok: false, error: error.message || String(error) }
    return data || { ok: false, error: 'Sin respuesta' }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
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
