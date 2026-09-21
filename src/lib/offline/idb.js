// Acceso mínimo a IndexedDB para el modo offline del POS: una base con dos
// almacenes (`cola` para las ventas sin sincronizar y `snapshots` para la foto
// del catálogo/pedidos). Sin IndexedDB (SSR, modo privado viejo) las funciones
// devuelven vacío: la app sigue funcionando como siempre, sin offline.

const BASE = 'mobos-offline'
const VERSION = 1
const COLA = 'cola'
const SNAPSHOTS = 'snapshots'

export function hayIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function abrir() {
  return new Promise((resolve, reject) => {
    if (!hayIndexedDB()) { resolve(null); return }
    const pedido = indexedDB.open(BASE, VERSION)
    pedido.onupgradeneeded = () => {
      const db = pedido.result
      if (!db.objectStoreNames.contains(COLA)) db.createObjectStore(COLA, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'clave' })
    }
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

async function conAlmacen(nombre, modo, operacion) {
  const db = await abrir()
  if (!db) return null
  return new Promise((resolve, reject) => {
    const transaccion = db.transaction(nombre, modo)
    const almacen = transaccion.objectStore(nombre)
    let resultado
    try {
      resultado = operacion(almacen)
    } catch (error) {
      reject(error)
      return
    }
    transaccion.oncomplete = () => { db.close(); resolve(resultado?.result ?? resultado) }
    transaccion.onerror = () => { db.close(); reject(transaccion.error) }
    transaccion.onabort = () => { db.close(); reject(transaccion.error) }
  })
}

const listarDe = (nombre) => conAlmacen(nombre, 'readonly', (almacen) => almacen.getAll()).catch(() => [])
const guardarEn = (nombre, valor) => conAlmacen(nombre, 'readwrite', (almacen) => almacen.put(valor))
const borrarDe = (nombre, clave) => conAlmacen(nombre, 'readwrite', (almacen) => almacen.delete(clave))
const leerDe = (nombre, clave) => conAlmacen(nombre, 'readonly', (almacen) => almacen.get(clave)).catch(() => null)

// Almacén que consume `crearColaDeVentas` (mismo contrato en los tests).
export function crearStoreDeCola() {
  return {
    listar: () => listarDe(COLA),
    guardar: (item) => guardarEn(COLA, item),
    borrar: (id) => borrarDe(COLA, id),
  }
}

// Foto del catálogo/pedidos para arrancar sin conexión.
export function crearStoreDeSnapshots() {
  return {
    leer: (clave) => leerDe(SNAPSHOTS, clave),
    guardar: (clave, datos) => guardarEn(SNAPSHOTS, { clave, datos, guardadoEn: Date.now() }),
    borrar: (clave) => borrarDe(SNAPSHOTS, clave),
  }
}
