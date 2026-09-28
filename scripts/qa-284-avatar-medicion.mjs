// Medición #284 · foto del avatar: tiempo hasta pintar en el chip del topbar
// (iniciales → foto) en carga fría y recarga de la misma pestaña, con una
// demora determinista en el endpoint del avatar (300 ms por defecto) para
// simular la red real de forma reproducible.
//
// Corre contra el harness e2e local con la sesión del seed (empresa → PIN del
// Administrador), sube una foto reconocible y la quita al terminar.
//
//   node scripts/qa-284-avatar-medicion.mjs
//   QA_OUT=docs/qa/284-avatar/despues node scripts/qa-284-avatar-medicion.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium, request } = require('@playwright/test')
const QRCode = require('qrcode')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'http://localhost:5203').replace(/\/$/, '')
const API = process.env.QA_API_URL || BASE.replace(/:(\d+)$/, ':3103')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/284-avatar/despues')
const DEMORA_AVATAR = Number(process.env.QA_DEMORA || 300)
const CREDENCIALES = {
  email: process.env.QA_EMAIL || 'e2e-tienda@test.local',
  password: process.env.QA_PASSWORD || 'E2e-password-123',
  deviceId: process.env.QA_DEVICE_ID || 'e2e-setup-device',
}
const PIN_ADMIN = process.env.QA_PIN || '1234'
mkdirSync(SALIDA, { recursive: true })

const cookieDe = (headers, nombre) => {
  const fila = (headers || []).find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(`${nombre}=`))
  return fila ? fila.value.slice(nombre.length + 1).split(';')[0] : ''
}

async function cookiesDeSesion() {
  const api = await request.newContext({ baseURL: API })
  const login = await api.post('/api/auth/login', { data: CREDENCIALES })
  if (!login.ok()) throw new Error(`qa-284: login HTTP ${login.status()}`)
  const cuerpo = await login.json().catch(() => ({}))
  const empresa = cookieDe(login.headersArray(), 'mobos_company_session')
  const admin = (cuerpo.sellers || []).find((s) => s.role === 'ADMIN') || (cuerpo.sellers || [])[0]
  if (!empresa || !admin?.id) throw new Error('qa-284: el login no devolvió sesión o vendedores')
  const pin = await api.post('/api/auth/pin', { data: { sellerId: admin.id, pin: PIN_ADMIN }, headers: { Authorization: `Bearer ${empresa}` } })
  if (!pin.ok()) throw new Error(`qa-284: PIN HTTP ${pin.status()}`)
  const vendedor = cookieDe(pin.headersArray(), 'mobos_seller_session')
  await api.dispose()
  const base = { domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax', secure: false, expires: -1 }
  return {
    cookies: [{ name: 'mobos_company_session', value: empresa, ...base }, { name: 'mobos_seller_session', value: vendedor, ...base }],
    sellerToken: vendedor,
  }
}

const foto = (await QRCode.toBuffer(`avatar-284-${Date.now()}`)).toString('base64')
const browser = await chromium.launch()
const { cookies, sellerToken } = await cookiesDeSesion()

async function conApi(callback) {
  const api = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${sellerToken}` } })
  try { return await callback(api) } finally { await api.dispose() }
}
const { userId, status: subida } = await conApi(async (api) => {
  const yo = await (await api.get('/api/auth/me')).json()
  const png = Buffer.from(foto, 'base64')
  const respuesta = await api.post(`/api/users/${encodeURIComponent(yo.user.id)}/avatar`, { multipart: { avatar: { name: 'avatar.png', mimeType: 'image/png', buffer: png } } })
  return { userId: yo.user.id, status: respuesta.status() }
})
console.log(`[284] foto subida: HTTP ${subida} (usuario ${userId}) · demora del avatar ${DEMORA_AVATAR} ms`)

const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await contexto.addCookies(cookies)
const page = await contexto.newPage()
// Demora determinista del avatar: aísla el costo que el issue pide medir.
await page.route('**/api/users/*/avatar', async (ruta) => {
  await new Promise((resolver) => setTimeout(resolver, DEMORA_AVATAR))
  await ruta.continue()
})
const red = { inicio: 0, fin: 0, status: 0 }
page.on('request', (req) => { if (/\/api\/users\/[^/]+\/avatar/.test(req.url()) && !red.inicio) red.inicio = Date.now() })
page.on('response', (res) => { if (/\/api\/users\/[^/]+\/avatar/.test(res.url()) && !red.fin) { red.fin = Date.now(); red.status = res.status() } })

async function medir(etiqueta) {
  const inicio = Date.now()
  const marcas = await page.evaluate(async (inicioMs) => {
    const t = () => Date.now() - inicioMs
    const chip = () => document.querySelector('[data-testid="shell-perfil"]')
    const imagen = () => {
      const img = chip()?.querySelector('img[alt^="Foto de"]')
      return img && img.complete && img.naturalWidth > 0 ? img : null
    }
    const esLocal = (img) => String(img?.src || '').startsWith('data:image/')
    const iniciales = () => {
      const span = chip()?.querySelector('span')
      return span && /^[A-ZÁÉÍÓÚÑ]{1,2}$/.test((span.textContent || '').trim()) ? span : null
    }
    const resultado = { tapa: null, iniciales: null, imagen: null, fotoLocal: null }
    const limite = Date.now() + 8000
    while (Date.now() < limite && resultado.fotoLocal === null) {
      if (resultado.tapa === null && document.querySelector('header')) resultado.tapa = t()
      if (resultado.iniciales === null && iniciales()) resultado.iniciales = t()
      if (resultado.imagen === null && imagen()) resultado.imagen = t()
      if (resultado.fotoLocal === null && esLocal(imagen())) resultado.fotoLocal = t()
      if (resultado.fotoLocal === null) await new Promise((resolver) => setTimeout(resolver, 16))
    }
    return resultado
  }, inicio)
  await page.screenshot({ path: join(SALIDA, `${etiqueta}.jpg`), type: 'jpeg', quality: 76 })
  const rtt = red.inicio && red.fin ? red.fin - red.inicio : 0
  red.inicio = 0; red.fin = 0; red.status = 0
  return { etiqueta, ...marcas, rtt, statusAvatar: red.status || 0 }
}

// Frío: primer ingreso de la pestaña (sin caché de la app).
await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
const frio = await medir('frio')
// Control: recarga borrando el almacén persistente (comportamiento «antes»:
// la caché de módulo se pierde en cada recarga y hay que esperar la red).
await page.evaluate(() => { try { for (const clave of Object.keys(localStorage)) if (clave.startsWith('mobos:avatar')) localStorage.removeItem(clave) } catch { /* sin storage */ } })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
const sinCache = await medir('repetida-sin-cache')
// Repetida con la caché persistente (#284): no debe esperar la red.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
const conCache = await medir('repetida-con-cache')
await contexto.close()

const resultados = { base: BASE, demoraAvatarMs: DEMORA_AVATAR, fecha: new Date().toISOString(), frio, sinCache, conCache }
writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify(resultados, null, 2)}\n`)
for (const m of [frio, sinCache, conCache]) {
  const dato = (v) => (v === null ? '—' : `${v} ms`)
  const espera = m.fotoLocal !== null && m.tapa !== null ? `${Math.max(0, m.fotoLocal - m.tapa)} ms` : '—'
  console.log(`[284] ${m.etiqueta}: tapa ${dato(m.tapa)} · iniciales ${dato(m.iniciales)} · imagen ${dato(m.imagen)} · foto local ${dato(m.fotoLocal)} (espera tras la tapa: ${espera}) · RTT avatar ${m.rtt} ms (HTTP ${m.statusAvatar})`)
}

const limpieza = await conApi((api) => api.delete(`/api/users/${encodeURIComponent(userId)}/avatar`).then((r) => r.status()))
console.log(`[284] limpieza: HTTP ${limpieza}`)
await browser.close()
