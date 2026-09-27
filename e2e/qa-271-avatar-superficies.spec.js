// #271 · La foto anterior no puede aparecer en NINGUNA superficie: se bloquean
// (La «foto actual aparece» se exige donde el avatar del usuario está seguro:
// shell y Mi cuenta; en listas/cronologías se verifica el invariante.)
// las descargas de avatar (compuerta) y se recorre el shell, Mi cuenta, Equipo,
// la ficha de cliente y el detalle de pedido. Mientras no resuelven, ninguna
// foto pintada (placeholder neutro) — aunque haya una «foto anterior» inyectada
// en el contexto del dispositivo; al liberar, aparece la foto actual.
// Capturas: MOBOS_271_SUPERFICIES (default docs/qa/271-avatar-sin-flash).
import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const QRCode = require('qrcode')
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.MOBOS_271_SUPERFICIES || join('docs', 'qa', '271-avatar-sin-flash')
const CLAVE_CONTEXTO = 'owncoding_hub_company_context'
const FOTO_VIEJA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', ...opciones })
  const body = await respuesta.json().catch(() => null)
  return { status: respuesta.status, body }
}, { api: API, ruta, opciones })

const subirAvatar = (page, userId, base64) => page.evaluate(async ({ api, userId, base64 }) => {
  const bin = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  const form = new FormData()
  form.append('avatar', new Blob([bin], { type: 'image/png' }), 'avatar.png')
  return (await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'POST', credentials: 'include', body: form })).status
}, { api: API, userId, base64 })

const borrarAvatar = (page, userId) => page.evaluate(async ({ api, userId }) => (await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'DELETE', credentials: 'include' })).status, { api: API, userId })

test('ninguna superficie pinta una foto antes de resolver (y después muestra la actual)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const sesion = await page.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json())?.user, API)
  const nombre = String(sesion?.user_metadata?.nombre || sesion?.name || 'Administrador')
  const equipo = await apiPagina(page, '/api/users')
  const vendedor = (equipo.body || []).find((usuario) => usuario.id !== sesion.id) || null

  // Fotos reales (dueño + un integrante) y la «foto anterior» guardada en el
  // contexto del dispositivo, que es la que NO debe verse.
  const png = await QRCode.toBuffer(`avatar-superficies-${Date.now()}`)
  expect(await subirAvatar(page, sesion.id, png.toString('base64'))).toBeLessThan(300)
  if (vendedor) expect(await subirAvatar(page, vendedor.id, png.toString('base64'))).toBeLessThan(300)
  await page.addInitScript(({ clave, foto }) => {
    try {
      const actual = JSON.parse(localStorage.getItem(clave) || '{}') || {}
      localStorage.setItem(clave, JSON.stringify({ ...actual, profile: { ...(actual.profile || {}), name: actual.profile?.name || 'Dueño', picture: foto } }))
    } catch { /* sin almacenamiento */ }
  }, { clave: CLAVE_CONTEXTO, foto: FOTO_VIEJA })

  // Trampa realista: el servidor sirve una «foto de Google» vieja en /me. Con
  // el comportamiento anterior el Avatar la adelantaba mientras la local
  // resolvía; ahora espera al placeholder neutro.
  await page.route('**/api/auth/me', async (ruta) => {
    const original = await ruta.fetch()
    const cuerpo = await original.json().catch(() => null)
    if (cuerpo && typeof cuerpo === 'object') {
      cuerpo.ownerProfile = { ...(cuerpo.ownerProfile || {}), name: cuerpo.ownerProfile?.name || 'Dueño', picture: FOTO_VIEJA }
      return ruta.fulfill({ response: original, json: cuerpo })
    }
    return ruta.fulfill({ response: original })
  })

  // Compuerta: cada descarga de avatar queda esperando hasta que la liberemos.
  let bloqueando = true
  const pendientes = []
  const enCurso = new Set()
  let secuencia = 0
  await page.route('**/api/users/*/avatar', async (ruta) => {
    if (!bloqueando) return ruta.continue()
    const id = ++secuencia
    enCurso.add(id)
    await new Promise((resolver) => pendientes.push(resolver))
    enCurso.delete(id)
    return ruta.continue()
  })
  const rearmar = () => { bloqueando = true }
  const liberar = () => { bloqueando = false; while (pendientes.length) pendientes.shift()() }

  const superficies = [
    ['shell', '/resumen', (p) => p.getByTestId('shell-perfil'), true],
    ['mi-cuenta', '/mi-cuenta', (p) => p.getByTestId('mi-cuenta-perfil'), true],
    ['equipo', '/configuracion/equipo', (p) => p.getByTestId('integrante-fila').first(), false],
    ['clientes', '/clientes', (p) => p.getByTestId('cliente-fila').first(), false],
    ['pedidos', '/pedidos', (p) => p.getByTestId('pedido-fila').first(), false],
  ]

  for (const [nombreSuperficie, ruta, listo, muestraFoto] of superficies) {
    rearmar()
    await page.goto(ruta)
    await expect(listo(page)).toBeVisible({ timeout: 25_000 })
    // Mientras el avatar no resolvió: ninguna foto pintada (ni la vieja).
    await expect(page.locator('img[alt^="Foto de"]')).toHaveCount(0)
    await page.screenshot({ path: join(DIR, `superficie-${nombreSuperficie}-sin-foto.jpg`), type: 'jpeg', quality: 70 })
    liberar()
    if (muestraFoto) {
      await expect(page.locator('img[alt^="Foto de"]').first()).toBeVisible({ timeout: 20_000 })
      await page.screenshot({ path: join(DIR, `superficie-${nombreSuperficie}-con-foto.jpg`), type: 'jpeg', quality: 70 })
    } else {
      await expect.poll(() => enCurso.size, { timeout: 15_000 }).toBe(0)
    }
  }

  // Vuelve a dejar las fotos como estaban (el arnés no las tenía).
  await borrarAvatar(page, sesion.id)
  if (vendedor) await borrarAvatar(page, vendedor.id)
})
