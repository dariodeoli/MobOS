import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { crearAlmacenAvatar, crearCacheAvatar, EVENTO_AVATAR } from './avatarCache.js'

// #271: la foto de perfil se cachea por usuario y hay que invalidarla al
// cambiarla o quitarla, avisando a todos los avatares montados; la descarga no
// puede salir de la caché HTTP (URL fija) y el componente compartido no pinta
// la foto anterior mientras resuelve la nueva.
const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')

const eventos = []
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type
    this.detail = init?.detail
  }
}
globalThis.window = {
  dispatchEvent: (evento) => eventos.push(evento),
}

test('la caché comparte la promesa y se invalida al cambiar o quitar', async () => {
  const llamadas = []
  let contador = 0
  const cache = crearCacheAvatar(async (userId) => {
    llamadas.push(userId)
    contador += 1
    return `foto-${userId}-${contador}`
  })

  const [a, b] = await Promise.all([cache.obtener('u1'), cache.obtener('u1')])
  assert.equal(a, 'foto-u1-1')
  assert.equal(b, 'foto-u1-1', 'dos componentes comparten la misma descarga')
  assert.deepEqual(llamadas, ['u1'])

  cache.olvidar('u1')
  assert.equal(await cache.obtener('u1'), 'foto-u1-2', 'vuelve a pedir la foto (no la vieja)')
  assert.deepEqual(llamadas, ['u1', 'u1'])

  assert.equal(await cache.obtener(''), '', 'sin usuario no hay descarga')
  cache.olvidar('')
})

test('la invalidación avisa a los suscriptores y emite el evento', () => {
  const cache = crearCacheAvatar(async () => '')
  const avisos = []
  cache.suscribir(() => { throw new Error('suscriptor roto') })
  const baja = cache.suscribir((userId) => avisos.push(userId))

  cache.olvidar('u2')
  assert.deepEqual(avisos, ['u2'], 'un suscriptor roto no frena a los demás')
  assert.equal(eventos.at(-1)?.type, EVENTO_AVATAR)
  assert.equal(eventos.at(-1)?.detail?.userId, 'u2')

  baja()
  cache.olvidar('u2')
  assert.deepEqual(avisos, ['u2'], 'después de la baja no hay más avisos')
})

test('la descarga revalida y el componente no pinta la anterior', () => {
  const cache = leer('lib/userAvatar.js')
  assert.match(cache, /cache: 'no-cache'/, 'la descarga revalida el ETag: no puede salir de la caché del navegador (URL fija)')
  assert.match(cache, /suscribirAvatar/, 'expone la suscripción a los cambios')
  assert.match(leer('lib/avatarCache.js'), /mobos:avatar-cambio/, 'emite el evento para el resto de las instancias')

  const avatar = leer('components/shared/Avatar.jsx')
  assert.match(cache, /If-None-Match/, 'manda el ETag guardado al revalidar (#284)')
  assert.match(cache, /if \(response\.status === 304\)/, 'el 304 no reescribe la foto (#284)')
  assert.match(cache, /precargarAvatar/, 'expone el prefetch para el arranque de sesión (#284)')
  assert.match(cache, /limpiarAvatarCache/, 'expone la limpieza para el cierre de sesión (#284)')
  assert.match(cache, /avatarCacheado/, 'expone la lectura síncrona (#284)')

  assert.match(avatar, /suscribirAvatar/, 'el avatar escucha los cambios de foto')
  assert.match(avatar, /avatarCacheado/, 'el avatar pinta lo cacheado en el primer render (#284)')
  assert.match(avatar, /fuenteAvatar/, 'la fuente visible sale del contrato puro (#271)')
  assert.match(avatar, /setLocalListo\(false\)/, 'mientras resuelve no pinta la anterior ni la de Google')
  assert.match(avatar, /onError=\{\(\) => setGoogleRota\(true\)\}/, 'si la imagen falla no queda un cuadro roto')

  const miCuenta = leer('components/cuenta/MiCuenta.jsx')
  assert.match(miCuenta, /olvidarAvatar\(usuario\.id\)/, 'al subir y quitar se invalida la caché')
  assert.ok(
    /olvidarAvatar\(usuario\.id\)\s*\n\s*\/\/[^\n]*\n\s*setFoto\(''\)/.test(miCuenta),
    'la vista previa no queda con la foto vieja mientras resuelve la nueva',
  )
})

const almacenFalso = () => {
  const datos = new Map()
  return {
    get length() { return datos.size },
    key: (indice) => [...datos.keys()][indice] ?? null,
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  }
}

test('el almacén persistente guarda, lee, olvida y limpia por usuario (#284)', () => {
  const almacen = crearAlmacenAvatar(almacenFalso())
  assert.equal(almacen.leer('u1'), null)
  assert.equal(almacen.guardar('u1', { url: 'data:image/png;base64,AAA', etag: 'W/"1"' }), true)
  const entrada = almacen.leer('u1')
  assert.equal(entrada.url, 'data:image/png;base64,AAA')
  assert.equal(entrada.etag, 'W/"1"')
  almacen.guardar('u2', { url: 'data:image/png;base64,BBB' })
  almacen.olvidar('u1')
  assert.equal(almacen.leer('u1'), null, 'olvidar borra solo ese usuario')
  assert.ok(almacen.leer('u2'), 'el otro usuario sigue cacheado')
  almacen.limpiar()
  assert.equal(almacen.leer('u2'), null, 'limpiar borra todo (cierre de sesión)')
})

test('el almacén no cachea fotos enormes y reintenta si la cuota está llena (#284)', () => {
  const storage = almacenFalso()
  const chico = crearAlmacenAvatar(storage, { maxBytes: 10 })
  assert.equal(chico.guardar('u1', { url: `data:image/png;base64,${'x'.repeat(50)}` }), false, 'no guarda si supera el tope')
  assert.equal(chico.leer('u1'), null)

  const almacen = crearAlmacenAvatar(storage, { maxBytes: 1024 })
  almacen.guardar('viejo', { url: 'data:image/png;base64,VIEJO' })
  let fallo = false
  const original = storage.setItem
  storage.setItem = (clave, valor) => {
    if (!fallo && clave.includes('nuevo')) { fallo = true; throw new Error('QuotaExceededError') }
    return original(clave, valor)
  }
  assert.equal(almacen.guardar('nuevo', { url: 'data:image/png;base64,NUEVO' }), true, 'reintenta tras liberar')
  assert.equal(almacen.leer('nuevo')?.url, 'data:image/png;base64,NUEVO')
})

test('la caché pinta lo persistido al instante y revalida con ETag (#284)', async () => {
  const almacen = crearAlmacenAvatar(almacenFalso())
  almacen.guardar('u1', { url: 'cacheada', etag: 'e1' })
  const llamadas = []
  const cache = crearCacheAvatar(async (userId, opciones) => {
    llamadas.push({ userId, etag: opciones?.etag })
    return { url: 'nueva', etag: 'e2' }
  }, { almacen, revalidarCadaMs: 0 })

  assert.equal(cache.cacheado('u1'), 'cacheada', 'lectura síncrona para el primer render')
  assert.equal(await cache.obtener('u1'), 'cacheada', 'pinta la persistida sin esperar la red')
  await new Promise((resolver) => setTimeout(resolver, 10))
  assert.deepEqual(llamadas[0], { userId: 'u1', etag: 'e1' }, 'revalida con el ETag guardado')
  assert.equal(almacen.leer('u1')?.url, 'nueva', 'si cambió, el almacén queda con la nueva')
  cache.olvidar('u1')
  assert.equal(almacen.leer('u1'), null, 'olvidar limpia también la persistencia')
})

test('la revalidación no repite descargas por ventana y el 304 conserva la foto (#284)', async () => {
  const almacen = crearAlmacenAvatar(almacenFalso())
  almacen.guardar('u1', { url: 'cacheada', etag: 'e1' })
  let llamadas = 0
  const cache = crearCacheAvatar(async () => { llamadas += 1; return { noModificado: true } }, { almacen, revalidarCadaMs: 60_000 })
  await Promise.all([cache.obtener('u1'), cache.obtener('u1'), cache.obtener('u1')])
  await new Promise((resolver) => setTimeout(resolver, 10))
  assert.equal(llamadas, 1, 'una sola revalidación por ventana')
  assert.equal(cache.cacheado('u1'), 'cacheada', 'el 304 conserva la foto')
  cache.limpiar()
  assert.equal(cache.cacheado('u1'), '', 'limpiar borra memoria y almacén')
})
