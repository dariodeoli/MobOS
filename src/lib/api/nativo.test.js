import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cabecerasNativas, cargarTokens, expiracion, guardarTokens, hayTokens, limpiarTokens, opcionesDeSesion, usarAlmacen } from './nativo.js'
import { fijarVersionNativa } from '../plataforma.js'

const ios = { getPlatform: () => 'ios', isNativePlatform: () => true }
const web = { getPlatform: () => 'web', isNativePlatform: () => false }

function almacenEnMemoria() {
  const datos = new Map()
  return {
    datos,
    get: async (k) => datos.get(k) ?? null,
    set: async (k, v) => { datos.set(k, v) },
    remove: async (k) => { datos.delete(k) },
  }
}

test('modo nativo: Bearer + X-MobOS-Client y sin cookies', async () => {
  usarAlmacen(almacenEnMemoria())
  fijarVersionNativa('1.2.3')
  await guardarTokens({ token: 'TOKEN-EMPRESA', expiresAt: '2030-01-01T00:00:00Z' })
  const opciones = opcionesDeSesion('/api/orders', ios)
  assert.equal(opciones.credentials, 'omit')
  assert.equal(opciones.headers.Authorization, 'Bearer TOKEN-EMPRESA')
  assert.equal(opciones.headers['X-MobOS-Client'], 'ios/1.2.3')
})

test('modo web: cookies y ningún encabezado nativo', async () => {
  usarAlmacen(almacenEnMemoria())
  await guardarTokens({ token: 'TOKEN-EMPRESA' })
  const opciones = opcionesDeSesion('/api/orders', web)
  assert.equal(opciones.credentials, 'include')
  assert.deepEqual(opciones.headers, {})
})

test('el token del vendedor manda salvo en /api/auth/pin, que usa el de la empresa', async () => {
  usarAlmacen(almacenEnMemoria())
  await guardarTokens({ token: 'EMPRESA' })
  await guardarTokens({ sellerToken: 'VENDEDOR' })
  assert.equal(cabecerasNativas('/api/orders').Authorization, 'Bearer VENDEDOR')
  assert.equal(cabecerasNativas('/api/auth/pin').Authorization, 'Bearer EMPRESA')
})

test('los tokens persisten en el almacén seguro y se recuperan al arrancar', async () => {
  const almacen = almacenEnMemoria()
  usarAlmacen(almacen)
  await guardarTokens({ token: 'A', sellerToken: 'B', expiresAt: '2031-05-05' })
  assert.equal(almacen.datos.get('mobos.token'), 'A')
  assert.equal(almacen.datos.get('mobos.sellerToken'), 'B')
  // «Reinicio»: memoria vacía, el almacén conserva.
  const reinicio = almacenEnMemoria()
  for (const [k, v] of almacen.datos) reinicio.datos.set(k, v)
  usarAlmacen(reinicio)
  assert.equal(hayTokens(), false)
  const cargados = await cargarTokens()
  assert.equal(cargados.token, 'A')
  assert.equal(hayTokens(), true)
  assert.equal(expiracion(), '2031-05-05')
})

test('logout: limpiarTokens borra memoria y almacén', async () => {
  const almacen = almacenEnMemoria()
  usarAlmacen(almacen)
  await guardarTokens({ token: 'A', sellerToken: 'B', expiresAt: 'x' })
  await limpiarTokens()
  assert.equal(hayTokens(), false)
  assert.equal(almacen.datos.size, 0)
  assert.equal(cabecerasNativas('/api/orders').Authorization, undefined)
})

test('una respuesta sin tokens no pisa los guardados', async () => {
  usarAlmacen(almacenEnMemoria())
  await guardarTokens({ token: 'A', sellerToken: 'B' })
  await guardarTokens({ ok: true })
  await guardarTokens(null)
  assert.equal(cabecerasNativas('/api/orders').Authorization, 'Bearer B')
})

test('el cliente HTTP delega la sesión en opcionesDeSesion y guarda los tokens del cuerpo', () => {
  const fuente = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
  assert.match(fuente, /opcionesDeSesion\(path\)/)
  assert.match(fuente, /credentials: sesion\.credentials/)
  assert.doesNotMatch(fuente, /credentials: 'include'/)
  assert.match(fuente, /guardarTokens\(payload\)/)
})

test('los tokens nunca se escriben en localStorage/sessionStorage', () => {
  const fuente = readFileSync(new URL('./nativo.js', import.meta.url), 'utf8')
  assert.doesNotMatch(fuente, /(localStorage|sessionStorage)\.(get|set|remove)Item/)
})


test('una escritura lenta anterior al logout no restaura tokens después de limpiar', async () => {
 const datos = new Map(); let liberar; let iniciar
 const iniciada = new Promise(resolve => { iniciar = resolve })
 const bloqueo = new Promise(resolve => { liberar = resolve })
 usarAlmacen({get: async key => datos.get(key), set: async (key,value) => { iniciar(); await bloqueo; datos.set(key,value) }, remove: async key => datos.delete(key)})
 const guardando = guardarTokens({token:'EMPRESA-ANTERIOR',sellerToken:'VENDEDOR-ANTERIOR'})
 await iniciada
 const limpiando = limpiarTokens()
 assert.equal(hayTokens(),false)
 liberar(); await guardando; await limpiando
 assert.equal(datos.size,0); assert.equal(hayTokens(),false)
})


test('cargarTokens espera una limpieza en curso y no vuelve a autenticar', async () => {
 const datos=new Map();let liberar
 const bloqueo=new Promise(resolve=>{liberar=resolve})
 usarAlmacen({get:async key=>datos.get(key),set:async(key,value)=>datos.set(key,value),remove:async key=>{await bloqueo;datos.delete(key)}})
 await guardarTokens({token:'EMPRESA_QA',sellerToken:'VENDEDOR_QA',expiresAt:'2030-01-01T00:00:00Z'})
 const limpiando=limpiarTokens(), leyendo=cargarTokens()
 assert.equal(hayTokens(),false)
 liberar();await limpiando
 assert.deepEqual(await leyendo,{token:null,sellerToken:null,expiresAt:null})
 assert.equal(hayTokens(),false);assert.equal(datos.size,0)
})
test('una lectura iniciada antes del logout no restaura la memoria al terminar',async()=>{
 const datos=new Map();let liberar,notificar
 const bloqueo=new Promise(resolve=>{liberar=resolve}), iniciada=new Promise(resolve=>{notificar=resolve})
 usarAlmacen({get:async key=>{const valor=datos.get(key);notificar();await bloqueo;return valor},set:async(key,value)=>datos.set(key,value),remove:async key=>datos.delete(key)})
 await guardarTokens({token:'ANTERIOR_QA'})
 const leyendo=cargarTokens();await iniciada;await limpiarTokens();liberar()
 assert.deepEqual(await leyendo,{token:null,sellerToken:null,expiresAt:null});assert.equal(hayTokens(),false)
})
