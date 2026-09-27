import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { crearCacheAvatar, EVENTO_AVATAR } from './avatarCache.js'

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
  assert.match(avatar, /suscribirAvatar/, 'el avatar escucha los cambios de foto')
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
