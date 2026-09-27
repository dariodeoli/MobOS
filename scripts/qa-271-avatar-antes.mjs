// Verificación visual de #271 — ANTES: reproduce en el código actual (main, sin
// el fix de PLT) el flash de la foto anterior al recargar la pantalla de
// bloqueo. La foto «vieja» (perfil guardado en el dispositivo) se inyecta y la
// descarga del avatar se demora a propósito: durante esa ventana, el `Avatar`
// anterior pinta la foto de Google/almacenada (el bug) en vez de un placeholder
// neutro.
//
// No es un test del harness: es evidencia de revisión (los asserts del bug
// quedan como hallazgos, no como gate). Requiere el backend+frontend e2e
// (MOBOS_E2E_API_PORT/WEB_PORT) y entra con la empresa del seed (para no
// depender de un `storageState` que puede quedar vencido).
//
//   node scripts/qa-271-avatar-antes.mjs
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-271-avatar-antes.mjs
/* global document, localStorage */
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
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/271-avatar-sin-flash/dsn-antes')
const CLAVE_CONTEXTO = 'owncoding_hub_company_context'
const VENTANA_MS = 1500 // demora del avatar (la ventana donde antes se veía la vieja)
const CREDENCIALES = {
  email: process.env.QA_EMAIL || 'e2e-tienda@test.local',
  password: process.env.QA_PASSWORD || 'E2e-password-123',
  deviceId: process.env.QA_DEVICE_ID || 'e2e-setup-device',
}
const PIN_ADMIN = process.env.QA_PIN || '1234'
mkdirSync(SALIDA, { recursive: true })

const fotoA = (await QRCode.toBuffer(`avatar-correcta-${Date.now()}`)).toString('base64')
const fotoVieja = (await QRCode.toBuffer(`avatar-vieja-${Date.now() + 1}`)).toString('base64')

const browser = await chromium.launch()
const esperar = (page, ms) => page.waitForTimeout(ms)

const cookieDe = (headers, nombre) => {
  const fila = (headers || []).find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(`${nombre}=`))
  return fila ? fila.value.slice(nombre.length + 1).split(';')[0] : ''
}

// Sesión del app: empresa → PIN del Administrador → cookie de vendedor (igual
// que el harness; `/api/auth/me` solo acepta sesión SELLER).
async function cookiesDeSesion() {
  const api = await request.newContext({ baseURL: API })
  const login = await api.post('/api/auth/login', { data: CREDENCIALES })
  if (!login.ok()) throw new Error(`qa-271: login HTTP ${login.status()}`)
  const cuerpo = await login.json().catch(() => ({}))
  const empresa = cookieDe(login.headersArray(), 'mobos_company_session')
  const admin = (cuerpo.sellers || []).find((s) => s.role === 'ADMIN') || (cuerpo.sellers || [])[0]
  if (!empresa || !admin?.id) throw new Error('qa-271: el login no devolvió sesión o vendedores')
  const pin = await api.post('/api/auth/pin', { data: { sellerId: admin.id, pin: PIN_ADMIN }, headers: { Authorization: `Bearer ${empresa}` } })
  if (!pin.ok()) throw new Error(`qa-271: PIN HTTP ${pin.status()}`)
  const vendedor = cookieDe(pin.headersArray(), 'mobos_seller_session')
  await api.dispose()
  const base = { domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }
  return [
    { name: 'mobos_company_session', value: empresa, ...base },
    { name: 'mobos_seller_session', value: vendedor, ...base },
  ]
}

const COOKIES = await cookiesDeSesion()

// Contexto con la sesión lista y, si hace falta, la foto vieja inyectada.
async function nuevaSesion({ viewport, init } = {}) {
  const contexto = await browser.newContext({ viewport })
  if (init?.fn) await contexto.addInitScript(init.fn, init.arg)
  await contexto.addCookies(COOKIES)
  const page = await contexto.newPage()
  return { contexto, page }
}

const medidas = []

// La foto real se sube una vez: es la que debe quedar después de resolver.
{
  const { contexto, page } = await nuevaSesion({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 20_000 })
  const sesion = await page.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json())?.user, API)
  const subida = await page.evaluate(async ({ api, userId, base64 }) => {
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const form = new FormData()
    form.append('avatar', new Blob([bin], { type: 'image/png' }), 'avatar.png')
    const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'POST', credentials: 'include', body: form })
    return respuesta.status
  }, { api: API, userId: sesion.id, base64: fotoA })
  console.log(`[271-ant] foto correcta subida: HTTP ${subida} (usuario ${sesion.id})`)
  await contexto.close()

  for (const [tema, modo, viewport] of [['claro', 'light', { width: 1280, height: 900 }], ['oscuro', 'dark', { width: 1280, height: 900 }], ['movil', 'light', { width: 390, height: 844 }]]) {
    // Foto vieja en el perfil guardado del dispositivo: es la que NO debe verse.
    const { contexto, page } = await nuevaSesion({
      viewport,
      init: {
        fn: ({ clave, foto, m }) => {
          try {
            const actual = JSON.parse(localStorage.getItem(clave) || '{}') || {}
            localStorage.setItem(clave, JSON.stringify({ ...actual, profile: { ...(actual.profile || {}), name: actual.profile?.name || 'Dueño', picture: foto } }))
            localStorage.setItem('mobos:theme', m)
          } catch { /* sin almacenamiento */ }
        },
        arg: { clave: CLAVE_CONTEXTO, foto: `data:image/png;base64,${fotoVieja}`, m: modo },
      },
    })
    await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('[data-testid="shell-bloquear"]').first().click()
    await page.locator('[data-testid="pantalla-bloqueada"]').waitFor({ state: 'visible', timeout: 20_000 })

    // Desde acá el avatar tarda VENTANA_MS: con el fix habría placeholder neutro.
    await page.route('**/api/users/*/avatar', async (ruta) => {
      await new Promise((resolver) => setTimeout(resolver, VENTANA_MS))
      await ruta.continue()
    })
    const inicio = Date.now()
    await page.reload({ waitUntil: 'domcontentloaded' })
    const bloqueo = page.locator('[data-testid="pantalla-bloqueada"]')
    await bloqueo.waitFor({ state: 'visible', timeout: 20_000 })
    await esperar(page, 700) // dentro de la ventana, sin llegar a resolver
    const enCurso = await page.evaluate(({ vieja, correcta }) => [...document.querySelectorAll('[data-testid="pantalla-bloqueada"] img')].map((img) => ({ alt: img.alt, esVieja: img.src === vieja, esCorrecta: img.src === correcta })), { vieja: `data:image/png;base64,${fotoVieja}`, correcta: `data:image/png;base64,${fotoA}` })
    await page.screenshot({ path: join(SALIDA, `bloqueo-en-curso-${tema}.jpg`), type: 'jpeg', quality: 78 })

    // Resuelto: entra la foto correcta (sin haber mostrado la vieja en el fix).
    await page.waitForFunction((correcta) => [...document.querySelectorAll('[data-testid="pantalla-bloqueada"] img')].some((img) => img.src === correcta), `data:image/png;base64,${fotoA}`, { timeout: 20_000 }).catch(() => {})
    await esperar(page, 400)
    const resuelto = await page.evaluate(({ vieja, correcta }) => [...document.querySelectorAll('[data-testid="pantalla-bloqueada"] img')].map((img) => ({ alt: img.alt, esVieja: img.src === vieja, esCorrecta: img.src === correcta })), { vieja: `data:image/png;base64,${fotoVieja}`, correcta: `data:image/png;base64,${fotoA}` })
    await page.screenshot({ path: join(SALIDA, `bloqueo-resuelto-${tema}.jpg`), type: 'jpeg', quality: 78 })

    const fotoViejaPintada = enCurso.some((img) => img.esVieja)
    medidas.push({ tema, ms: Date.now() - inicio, fotoViejaPintada, enCurso, resuelto })
    console.log(`[271-ant] ${tema}: foto vieja pintada = ${fotoViejaPintada} · en curso: ${enCurso.map((i) => (i.esVieja ? 'VIEJA' : i.esCorrecta ? 'correcta' : i.alt)).join(' · ') || 'sin imágenes'} · resuelto: ${resuelto.map((i) => (i.esVieja ? 'VIEJA' : i.esCorrecta ? 'correcta' : i.alt)).join(' · ') || 'sin imágenes'}`)
    await contexto.close()
  }

  // La foto subida se quita al terminar: la base e2e queda como estaba.
  const { contexto: ctxLimpieza, page: pageLimpieza } = await nuevaSesion({ viewport: { width: 1280, height: 900 } })
  await pageLimpieza.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const borrado = await pageLimpieza.evaluate(async (api) => {
    const yo = (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json())?.user
    const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(yo.id)}/avatar`, { method: 'DELETE', credentials: 'include' })
    return respuesta.status
  }, API)
  console.log(`[271-ant] foto de prueba quitada: HTTP ${borrado}`)
  await ctxLimpieza.close()
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, ventanaMs: VENTANA_MS, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
const pintadas = medidas.filter((m) => m.fotoViejaPintada).length
console.log(`[271-ant] ${BASE} · ${medidas.length} temas · window con foto vieja pintada: ${pintadas}/${medidas.length}`)
