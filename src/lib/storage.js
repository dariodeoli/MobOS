// ════════════════════════════════════════════════════════════════════
// CAPA ÚNICA DE DATOS — Fono Mobile Store
// Backend: Supabase (tiempo real entre dispositivos) con caché en memoria.
// La API exportada es SINCRÓNICA (igual que antes con localStorage): los
// componentes la usan sin async. Por dentro:
//   - cache en memoria = fuente de verdad para la UI
//   - espejo en localStorage = pintado instantáneo y modo offline
//   - Supabase = persistencia + realtime hacia/desde otros dispositivos
// Si faltan las env de Supabase, la app sigue andando 100% local.
// Nadie más debe tocar localStorage ni Supabase directamente.
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { num } from '@/utils/calculos'

// ── Cliente Supabase (opcional) ─────────────────────────────────────
const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase =
  SB_URL && SB_KEY
    ? createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null

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
  'Cada venta te acerca a tu meta. ¡Vamos! 🚀',
  'El éxito es la suma de pequeños esfuerzos repetidos día a día. 💪',
  'No cuentes los días, haz que los días cuenten. 🔥',
  'Tu actitud determina tu dirección. ¡Hoy es un gran día! ☀️',
  'Los clientes compran confianza antes que productos. Sonreí. 😊',
  'La constancia vence al talento. Seguí firme. 🎯',
  'Hoy es el mejor día para superar tu marca de ayer. 📈',
  'Vendé con pasión, atendé con el corazón. ❤️',
  'Las metas grandes se logran con acciones pequeñas y constantes. ⭐',
  'Creé en vos: ya hiciste lo difícil, ahora cerrá la venta. 🤝',
]

const CONFIG_DEFAULT = {
  clavePanel: 'fono2024', // el propietario la cambia en el Centro de Control
  nombreTienda: 'Fono Mobile Store',
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
    pantalla: { label: 'Pantalla reemplazada por terceros', desc: 'Display cambiado por servicio no oficial', value: 0.88 },
    camara: { label: 'Cámara reemplazada por terceros', desc: 'Módulo de cámara cambiado por terceros', value: 0.92 },
    bateria: { label: 'Batería reemplazada por terceros', desc: 'Batería cambiada por servicio no oficial', value: 0.95 },
  },
  devices: [
    { model: 'iPhone 17 Pro Max', capacities: ['256GB', '512GB', '1TB'], prices: { '256GB': 850, '512GB': 950, '1TB': 1050 } },
    { model: 'iPhone 17 Pro', capacities: ['256GB', '512GB', '1TB'], prices: { '256GB': 750, '512GB': 850, '1TB': 950 } },
    { model: 'iPhone 17', capacities: ['256GB', '512GB'], prices: { '256GB': 520, '512GB': 640 } },
    { model: 'iPhone 16 Pro Max', capacities: ['256GB', '512GB', '1TB'], prices: { '256GB': 950, '512GB': 1050, '1TB': 1150 } },
    { model: 'iPhone 16 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 850, '256GB': 900, '512GB': 980, '1TB': 1080 } },
    { model: 'iPhone 16 Plus', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 700, '256GB': 750, '512GB': 820 } },
    { model: 'iPhone 16', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 620, '256GB': 670, '512GB': 730 } },
    { model: 'iPhone 15 Pro Max', capacities: ['256GB', '512GB', '1TB'], prices: { '256GB': 800, '512GB': 880, '1TB': 960 } },
    { model: 'iPhone 15 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 700, '256GB': 750, '512GB': 820, '1TB': 900 } },
    { model: 'iPhone 15 Plus', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 580, '256GB': 630, '512GB': 700 } },
    { model: 'iPhone 15', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 520, '256GB': 570, '512GB': 630 } },
    { model: 'iPhone 14 Pro Max', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 650, '256GB': 700, '512GB': 770, '1TB': 850 } },
    { model: 'iPhone 14 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 570, '256GB': 620, '512GB': 680, '1TB': 760 } },
    { model: 'iPhone 14', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 420, '256GB': 460, '512GB': 510 } },
    { model: 'iPhone 13 Pro Max', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 520, '256GB': 570, '512GB': 630, '1TB': 710 } },
    { model: 'iPhone 13 Pro', capacities: ['128GB', '256GB', '512GB', '1TB'], prices: { '128GB': 450, '256GB': 490, '512GB': 540, '1TB': 620 } },
    { model: 'iPhone 13', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 360, '256GB': 390, '512GB': 440 } },
    { model: 'iPhone 12 Pro Max', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 380, '256GB': 420, '512GB': 470 } },
    { model: 'iPhone 12 Pro', capacities: ['128GB', '256GB', '512GB'], prices: { '128GB': 330, '256GB': 360, '512GB': 410 } },
    { model: 'iPhone 12', capacities: ['64GB', '128GB', '256GB'], prices: { '64GB': 250, '128GB': 280, '256GB': 320 } },
    { model: 'iPhone 11 Pro Max', capacities: ['64GB', '256GB', '512GB'], prices: { '64GB': 280, '256GB': 320, '512GB': 360 } },
    { model: 'iPhone 11 Pro', capacities: ['64GB', '256GB', '512GB'], prices: { '64GB': 240, '256GB': 270, '512GB': 310 } },
    { model: 'iPhone 11', capacities: ['64GB', '128GB', '256GB'], prices: { '64GB': 180, '128GB': 210, '256GB': 240 } },
  ],
}

// ════════════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA + ESPEJO LOCAL
// ════════════════════════════════════════════════════════════════════
const COLLECTIONS = ['productos', 'vendedores', 'ventas', 'gastos', 'ads', 'celulares', 'auditoria', 'comparadorImg']
// Colecciones tipo "feed": se muestran de la más nueva a la más vieja.
const FEEDS = new Set(['ventas', 'gastos', 'ads', 'auditoria'])
const MIRROR = 'fono:cache:v2'

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

// Pintado instantáneo: levantamos el último estado conocido del espejo local.
;(function bootFromMirror() {
  try {
    const m = safeParse(localStorage.getItem(MIRROR))
    if (m && typeof m === 'object') Object.assign(cache, m)
  } catch {
    /* localStorage bloqueado: seguimos solo en memoria */
  }
  // Garantiza que toda colección sea un array (por si un espejo viejo guardó
  // otra forma, ej. comparadorImg que antes era un objeto).
  COLLECTIONS.forEach((c) => {
    if (!Array.isArray(cache[c])) cache[c] = []
  })
})()

function persistMirror() {
  try {
    localStorage.setItem(MIRROR, JSON.stringify(cache))
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
    if (e.key === MIRROR) {
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
function logErr(prefix) {
  return ({ error } = {}) => {
    if (error) console.warn(`[storage] ${prefix}:`, error.message || error)
  }
}

// Inserta/actualiza una entidad (fila) en Supabase.
function remoteUpsertEnt(collection, obj) {
  if (!supabase) return
  const row = { collection, id: obj.id, data: obj }
  if (obj.creadoEn) row.created_at = obj.creadoEn
  supabase.from('entities').upsert(row).then(logErr(`upsert ${collection}`))
}
function remoteDeleteEnt(collection, id) {
  if (!supabase) return
  supabase
    .from('entities')
    .delete()
    .eq('collection', collection)
    .eq('id', id)
    .then(logErr(`delete ${collection}`))
}
function remoteUpsertKv(key, value) {
  if (!supabase) return
  supabase
    .from('kv')
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .then(logErr(`upsert kv ${key}`))
}

// Mutaciones locales optimistas (cache + espejo + notify) y luego remoto.
function entUpsert(collection, obj) {
  const arr = cache[collection]
  const i = arr.findIndex((o) => o.id === obj.id)
  if (i >= 0) arr[i] = obj
  else if (FEEDS.has(collection)) arr.unshift(obj)
  else arr.push(obj)
  persistMirror()
  notify()
  remoteUpsertEnt(collection, obj)
}
function entDelete(collection, id) {
  cache[collection] = cache[collection].filter((o) => o.id !== id)
  persistMirror()
  notify()
  remoteDeleteEnt(collection, id)
}
function kvSet(key, value) {
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
    const { collection, id, data } = payload.new || {}
    if (!collection || !cache[collection]) return
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

let hidratado = false
async function hydrate() {
  if (!supabase || hidratado) return
  hidratado = true
  try {
    const [{ data: ents }, { data: kvs }] = await Promise.all([
      supabase.from('entities').select('collection,id,data,created_at'),
      supabase.from('kv').select('key,value'),
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
  await supabase.from('entities').upsert(rows).then(logErr(`seed ${collection}`))
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

function subscribeRealtime() {
  if (!supabase) return
  supabase
    .channel('fono-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entities' }, aplicarEnt)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv' }, aplicarKv)
    .subscribe()
}

// Arranca la sincronización (no bloquea el primer render).
hydrate()

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
  // Modo 100% local (sin Supabase): sembramos defaults la primera vez.
  if (!supabase && cache.productos.length === 0) {
    cache.productos = clone(PRODUCTOS_DEFAULT)
    persistMirror()
  }
  return cache.productos
}
export function saveProductos(productos) {
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
  const id =
    nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36)
  const nuevo = {
    id,
    nombre,
    categoria,
    precioVenta: 0,
    precioCosto: 0,
    comision: 0,
    stock: 0,
    activo: true,
  }
  entUpsert('productos', nuevo)
  return nuevo
}
export function productosById() {
  const map = {}
  getProductos().forEach((p) => (map[p.id] = p))
  return map
}
export function updateProducto(id, cambios) {
  const actual = cache.productos.find((p) => p.id === id)
  if (!actual) return
  entUpsert('productos', { ...actual, ...cambios })
}
export function deleteProducto(id) {
  entDelete('productos', id)
}

// ── VENDEDORES ──────────────────────────────────────────────────────
export function getVendedores() {
  if (!supabase && cache.vendedores.length === 0) {
    cache.vendedores = clone(VENDEDORES_DEFAULT)
    persistMirror()
  }
  return cache.vendedores
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
export function addVenta(venta) {
  const prod = venta.productoId
    ? cache.productos.find((p) => p.id === venta.productoId)
    : null
  const nueva = {
    id: 'venta-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    creadoEn: new Date().toISOString(),
    // Foto del costo y la comisión al momento de la venta: si después editás
    // el producto, los reportes históricos NO cambian. (...venta puede pisarlos.)
    precioCosto: num(prod?.precioCosto),
    comision: num(prod?.comision),
    ...venta,
  }
  entUpsert('ventas', nueva)
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
  logAuditoria('eliminar', v || { id })
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
const idImg = (modelo, color) =>
  `${modelo}__${color}`.toLowerCase().replace(/\s+/g, '-')

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
  const idx =
    (hoy.getFullYear() * 372 + hoy.getMonth() * 31 + hoy.getDate()) % frases.length
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
