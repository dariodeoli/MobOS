import { isNativeIOS } from '../plataforma.js'
import { pedirNonce } from './nonce.js'

// Sign in with Apple (guía 4.8): único método social en iOS. Flujo del nonce:
// el servidor emite uno crudo de un solo uso (POST /api/auth/nonce), se le pide a Apple el sha256 en hexadecimal (Apple lo
// copia tal cual al identityToken) y al API se le manda el CRUDO; el servidor
// calcula el sha256 y lo compara con el claim del token.

export const APPLE_CLIENT_ID = 'online.moboss.app'

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

// SHA-256 en JavaScript puro: respaldo para webviews sin `crypto.subtle`.
export function sha256HexJs(texto) {
  const datos = new TextEncoder().encode(String(texto))
  const largo = datos.length
  const relleno = ((largo + 9 + 63) >> 6) << 6
  const bloque = new Uint8Array(relleno)
  bloque.set(datos)
  bloque[largo] = 0x80
  const vista = new DataView(bloque.buffer)
  vista.setUint32(relleno - 8, Math.floor((largo * 8) / 0x100000000))
  vista.setUint32(relleno - 4, (largo * 8) >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))
  for (let i = 0; i < relleno; i += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = vista.getUint32(i + t * 4)
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let t = 0; t < 64; t += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('')
}

export async function sha256Hex(texto) {
  try {
    if (globalThis.crypto?.subtle) {
      const resumen = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)))
      return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch { /* cae al respaldo */ }
  return sha256HexJs(texto)
}

/** Nonce crudo de 32 bytes aleatorios en hexadecimal (64 caracteres). */
export function nonceCrudo() {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Abre la hoja nativa de Sign in with Apple y devuelve el cuerpo listo para
 * `POST /api/auth/apple`. Cancelar la hoja lanza un error con `cancelado`.
 */
export async function iniciarSesionConApple({ purpose = 'login' } = {}) {
  if (!isNativeIOS()) throw new Error('Sign in with Apple solo está disponible en la app de iPhone.')
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
  const nonce = await pedirNonce(purpose)
  let resultado
  try {
    resultado = await SignInWithApple.authorize({
      clientId: APPLE_CLIENT_ID,
      redirectURI: '',
      scopes: 'email name',
      nonce: await sha256Hex(nonce),
    })
  } catch (error) {
    const cancelado = String(error?.code || error?.message || '') === '1001' || /cancel/i.test(String(error?.message || ''))
    const e = new Error(cancelado ? 'Cancelaste el acceso con Apple.' : 'No se pudo completar el acceso con Apple. Probá de nuevo.')
    e.cancelado = cancelado
    throw e
  }
  const r = resultado?.response || {}
  const nombre = [r.givenName, r.familyName].filter(Boolean).join(' ').trim()
  return { identityToken: r.identityToken, authorizationCode: r.authorizationCode, nonce, fullName: nombre || null }
}
