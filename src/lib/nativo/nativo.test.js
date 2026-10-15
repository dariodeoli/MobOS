import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { nonceCrudo, sha256Hex, sha256HexJs } from './apple.js'
import { esPrimeraEjecucion } from './arranque.js'
import { marcarPinVigente, pinVigente } from './bloqueo.js'
import { googleNativoDisponible } from './google.js'
import { faceIdAlAbrir, fijarFaceIdAlAbrir, nombreBiometria } from './biometria.js'
import { entornoPush, rutaDeNotificacion } from './push.js'
import { esCancelacion } from './escaner.js'
import { mensajeDeError } from '../cuentaEliminar.js'

const sha = (t) => createHash('sha256').update(t).digest('hex')

test('sha256 en JS puro coincide con node:crypto (incluye acentos y bordes de bloque)', async () => {
  for (const texto of ['', 'abc', 'MobOS', 'ñandú ✓', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(200)]) {
    assert.equal(sha256HexJs(texto), sha(texto), texto.slice(0, 12))
    assert.equal(await sha256Hex(texto), sha(texto))
  }
})

test('apple y google piden el nonce al servidor antes de abrir la hoja', () => {
  const apple = readFileSync(new URL('./apple.js', import.meta.url), 'utf8')
  const google = readFileSync(new URL('./google.js', import.meta.url), 'utf8')
  const nonce = readFileSync(new URL('./nonce.js', import.meta.url), 'utf8')
  assert.match(nonce, /\/api\/auth\/nonce/)
  assert.match(apple, /const nonce = await pedirNonce\(purpose\)/)
  assert.match(google, /scopes: \['email', 'profile'\], nonce/)
  assert.match(google, /return \{ idToken, nonce \}/)
})

test('nonce crudo: 64 hex y distinto cada vez', () => {
  const a = nonceCrudo()
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.notEqual(a, nonceCrudo())
})

test('el cliente manda el nonce CRUDO al API y el sha256 a Apple', () => {
  const fuente = readFileSync(new URL('./apple.js', import.meta.url), 'utf8')
  assert.match(fuente, /nonce: await sha256Hex\(nonce\)/)
  assert.match(fuente, /return \{ identityToken: r\.identityToken, authorizationCode: r\.authorizationCode, nonce,/)
})

test('esPrimeraEjecucion: marca la instalación y solo la primera vez devuelve true', () => {
  const datos = new Map()
  const almacenamiento = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) }
  assert.equal(esPrimeraEjecucion(almacenamiento), true)
  assert.equal(esPrimeraEjecucion(almacenamiento), false)
})

test('bloqueo: el PIN vigente se marca y se descarta (arranque en frío = sin PIN)', () => {
  const datos = new Map()
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v), removeItem: (k) => datos.delete(k) }
  assert.equal(pinVigente(almacen), false)
  marcarPinVigente(true, almacen)
  assert.equal(pinVigente(almacen), true)
  marcarPinVigente(false, almacen)
  assert.equal(pinVigente(almacen), false)
  assert.equal(pinVigente({ getItem() { throw new Error('sin almacenamiento') } }), false)
})

test('Face ID al abrir: apagado por defecto, ajuste del equipo, nunca reemplaza al PIN', () => {
  const datos = new Map()
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v), removeItem: (k) => datos.delete(k) }
  assert.equal(faceIdAlAbrir(almacen), false)
  fijarFaceIdAlAbrir(true, almacen)
  assert.equal(faceIdAlAbrir(almacen), true)
  fijarFaceIdAlAbrir(false, almacen)
  assert.equal(faceIdAlAbrir(almacen), false)
  assert.equal(nombreBiometria('faceId'), 'Face ID')
  const panel = readFileSync(new URL('../../pages/PanelVendedor.jsx', import.meta.url), 'utf8')
  assert.match(panel, /faceId=\{faceIdPendiente/)
})

test('google nativo: solo dentro de la app', () => {
  assert.equal(googleNativoDisponible(), false)
})

test('push: rutas de notificación solo internas', () => {
  assert.equal(rutaDeNotificacion({ route: '/pedidos/abc123' }), '/pedidos/abc123')
  assert.equal(rutaDeNotificacion({ url: 'https://app.moboss.online/pedidos/9?x=1' }), '/pedidos/9?x=1')
  assert.equal(rutaDeNotificacion({ orderId: 'ord_77' }), '/pedidos/ord_77')
  assert.equal(rutaDeNotificacion({ route: '//evil.com/x' }), '')
  assert.equal(rutaDeNotificacion({ url: 'https://evil.com/pedidos/1' }), '')
  assert.equal(rutaDeNotificacion({ orderId: '../../x' }), '')
  assert.equal(rutaDeNotificacion(null), '')
})

test('push: entorno de producción por defecto', () => {
  assert.equal(entornoPush(), 'production')
})

test('escáner: reconoce la cancelación del plugin', () => {
  assert.equal(esCancelacion(new Error('scan canceled.')), true)
  assert.equal(esCancelacion(new Error('camera error')), false)
})

test('eliminar cuenta: el error del dueño explica el camino', () => {
  const dueno = mensajeDeError({ status: 409, message: 'La API respondió con 409.' })
  assert.equal(dueno.dueno, true)
  assert.match(dueno.texto, /Primero transferí o eliminá la tienda\./)
  assert.equal(mensajeDeError({ status: 403, message: 'Eres dueño de una tienda activa' }).dueno, true)
  const clave = mensajeDeError({ status: 401, message: 'Contraseña incorrecta.' })
  assert.equal(clave.dueno, false)
  assert.equal(clave.texto, 'Contraseña incorrecta.')
})

test('iOS: el login oculta Google y el alta de tienda y muestra Apple', () => {
  const login = readFileSync(new URL('../../pages/Login.jsx', import.meta.url), 'utf8')
  assert.match(login, /const crear = modo === 'crear' && !ios/)
  assert.match(login, /ios\n?\s*\? <><AppleButton/)
  assert.match(login, /googleNativoDisponible\(\) && <GoogleButton/)
  assert.match(login, /\{!ios && \(crear \|\| etapa === 'empresa'\)/)
  assert.match(login, /\{!ios && <button type="button" onClick=\{\(\) => iniciarGoogle\(true\)\}/)
})

test('iOS: la UI empaquetada no tiene server.url ni landing en la config de Capacitor', () => {
  const config = JSON.parse(readFileSync(new URL('../../../capacitor.config.json', import.meta.url), 'utf8'))
  assert.equal(config.appId, 'online.moboss.app')
  assert.equal(config.webDir, 'dist')
  assert.equal(config.server, undefined)
})

test('iOS: Info.plist con textos en español, cifrado exento y Face ID como protección extra', () => {
  const plist = readFileSync(new URL('../../../ios/App/App/Info.plist', import.meta.url), 'utf8')
  assert.match(plist, /NSCameraUsageDescription<\/key>\s*<string>Usamos la cámara para escanear IMEI y códigos de barras de tus productos\./)
  assert.match(plist, /NSFaceIDUsageDescription<\/key>\s*<string>Usamos Face ID como protección extra para abrir MobOS en este iPhone\./)
  assert.match(plist, /com\.googleusercontent\.apps\.500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh/)
  assert.match(plist, /UIApplicationSceneManifest/)
  assert.match(plist, /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/)
  assert.doesNotMatch(plist, /ipad/i)
  const privacidad = readFileSync(new URL('../../../ios/App/App/PrivacyInfo.xcprivacy', import.meta.url), 'utf8')
  assert.match(privacidad, /NSPrivacyTracking<\/key>\s*<false\/>/)
})
