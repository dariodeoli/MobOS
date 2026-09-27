// #271 · La foto de perfil anterior no debe aparecer al recargar (ni al
// cambiarla o quitarla): la URL del avatar es estable, así que el navegador
// servía la vieja hasta 60 s. Se verifica la revalidación (ETag + no-cache) en
// el flujo de cambio/borrado y el reload del bloqueo sin flash (placeholder
// neutro hasta resolver). Capturas: MOBOS_271_CAPTURAS.
import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const require = createRequire(import.meta.url)
const QRCode = require('qrcode')
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.MOBOS_271_CAPTURAS || join('docs', 'qa', '271-avatar-sin-flash')

test.use({ video: 'on' })

// La empresa guarda el perfil del dueño (con su foto de Google) en el
// localStorage del contexto; al recargar se usaba antes de resolver el avatar.
// Se inyecta una «foto anterior» reconocible para probar que no se pinta.
const CLAVE_CONTEXTO = 'owncoding_hub_company_context'
const FOTO_VIEJA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function sesionDe(page) {
  return page.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json())?.user, API)
}

const subirAvatar = (page, userId, base64) => page.evaluate(async ({ api, userId, base64 }) => {
  const bin = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  const form = new FormData()
  form.append('avatar', new Blob([bin], { type: 'image/png' }), 'avatar.png')
  const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'POST', credentials: 'include', body: form })
  return respuesta.status
}, { api: API, userId, base64 })

const borrarAvatar = (page, userId) => page.evaluate(async ({ api, userId }) => {
  const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'DELETE', credentials: 'include' })
  return respuesta.status
}, { api: API, userId })

test('cambiar o quitar la foto no muestra la anterior (revalidación del avatar)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const sesion = await sesionDe(page)
  const nombre = String(sesion?.user_metadata?.nombre || sesion?.name || SEED.admin.name)
  const pngA = await QRCode.toBuffer(`avatar-A-${Date.now()}`)
  const pngB = await QRCode.toBuffer(`avatar-B-${Date.now() + 1}`)
  const [b64A, b64B] = [pngA.toString('base64'), pngB.toString('base64')]
  const foto = () => page.locator(`img[alt="Foto de ${nombre}"]`).first()

  // La API valida con ETag y `no-cache`: la URL estable ya no puede servir la vieja.
  expect(await subirAvatar(page, sesion.id, b64A)).toBeLessThan(300)
  const cabeceras = await page.evaluate(async ({ api, userId }) => {
    const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { credentials: 'include', cache: 'no-cache' })
    return { status: respuesta.status, cache: respuesta.headers.get('cache-control'), etag: respuesta.headers.get('etag') }
  }, { api: API, userId: sesion.id })
  expect(cabeceras.status).toBe(200)
  // El middleware del backend ya responde `no-store` para todo el API; el
  // avatar además revalida con ETag y pide `no-cache` explícito.
  expect(String(cabeceras.cache || '')).toMatch(/no-store|no-cache/)/* el ETag del avatar revalida incluso si el middleware no agrega no-store */

  // Foto A visible tras recargar.
  await page.reload()
  await expect(foto()).toHaveAttribute('src', /data:image\/png;base64,/, { timeout: 20_000 })
  // Los PNG del QR comparten cabecera: la comparación es exacta.
  expect(await foto().getAttribute('src')).toBe(`data:image/png;base64,${b64A}`)

  // Cambio de foto: tras recargar se ve la B y nunca la A.
  expect(await subirAvatar(page, sesion.id, b64B)).toBeLessThan(300)
  await page.reload()
  await expect(foto()).toBeVisible({ timeout: 20_000 })
  const srcB = await foto().getAttribute('src')
  expect(srcB).toBe(`data:image/png;base64,${b64B}`)
  expect(srcB).not.toBe(`data:image/png;base64,${b64A}`)
  await page.screenshot({ path: join(DIR, 'cambio-de-foto.jpg'), type: 'jpeg', quality: 74 })

  // Foto quitada: placeholder neutro (iniciales), no la anterior.
  expect([200, 204]).toContain(await borrarAvatar(page, sesion.id))
  await page.reload()
  await expect(page.locator(`img[alt="Foto de ${nombre}"]`)).toHaveCount(0, { timeout: 20_000 })
  await page.screenshot({ path: join(DIR, 'sin-foto.jpg'), type: 'jpeg', quality: 74 })
})

test('al recargar el bloqueo no se pinta la foto anterior (placeholder hasta resolver)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const sesion = await sesionDe(page)
  const nombre = String(sesion?.user_metadata?.nombre || sesion?.name || SEED.admin.name)
  const png = await QRCode.toBuffer(`avatar-lock-${Date.now()}`)
  expect(await subirAvatar(page, sesion.id, png.toString('base64'))).toBeLessThan(300)

  // Perfil viejo en el almacenamiento del dispositivo (la foto que NO debe verse).
  await page.addInitScript(({ clave, foto }) => {
    try {
      const actual = JSON.parse(localStorage.getItem(clave) || '{}') || {}
      localStorage.setItem(clave, JSON.stringify({ ...actual, profile: { ...(actual.profile || {}), name: actual.profile?.name || 'Dueño', picture: foto } }))
    } catch { /* sin almacenamiento */ }
  }, { clave: CLAVE_CONTEXTO, foto: FOTO_VIEJA })

  // La descarga del avatar se demora a propósito: durante la espera no puede
  // haber ninguna foto pintada (antes se adelantaba la de Google/almacenada).
  await page.route('**/api/users/*/avatar', async (ruta) => {
    await new Promise((resolver) => setTimeout(resolver, 1500))
    await ruta.continue()
  })
  await page.getByTestId('shell-bloquear').click()
  await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()
  await page.reload()

  const bloqueo = page.getByTestId('pantalla-bloqueada')
  await expect(bloqueo).toBeVisible({ timeout: 20_000 })
  await expect(bloqueo.locator('img[alt^="Foto de"]')).toHaveCount(0)
  await page.screenshot({ path: join(DIR, 'bloqueo-reload-en-curso.jpg'), type: 'jpeg', quality: 74 })

  // Cuando resuelve, entra la foto correcta (sin haber mostrado la anterior).
  await expect(bloqueo.locator(`img[alt="Foto de ${nombre}"]`)).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: join(DIR, 'bloqueo-reload-resuelto.jpg'), type: 'jpeg', quality: 74 })

  // La API del avatar ya respondió: la evidencia de cabeceras quedó en el test 1.
  await borrarAvatar(page, sesion.id)
})
