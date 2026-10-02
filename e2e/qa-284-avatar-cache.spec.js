// #284 · Foto del avatar: la segunda carga la pinta al instante desde la caché
// persistente y la revalidación con ETag converge sola, sin mostrar la foto
// anterior de otro origen (#271).
//
// La red del avatar se retiene a propósito: si la foto aparece igual, salió de
// la caché; si la app esperara la red, veríamos iniciales.
import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const QRCode = require('qrcode')
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.MOBOS_284_CAPTURAS || join('docs', 'qa', '284-avatar')

const sesionDe = (page) => page.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json())?.user, API)

const subirAvatar = (page, userId, base64) => page.evaluate(async ({ api, userId, base64 }) => {
  const bin = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  const form = new FormData()
  form.append('avatar', new Blob([bin], { type: 'image/png' }), 'avatar.png')
  const respuesta = await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'POST', credentials: 'include', body: form })
  return respuesta.status
}, { api: API, userId, base64 })

const borrarAvatar = (page, userId) => page.evaluate(async ({ api, userId }) => (await fetch(`${api}/api/users/${encodeURIComponent(userId)}/avatar`, { method: 'DELETE', credentials: 'include' })).status, { api: API, userId })

const olvidarCache = (page) => page.evaluate(() => {
  try {
    for (const clave of Object.keys(localStorage)) if (clave.startsWith('mobos:avatar')) localStorage.removeItem(clave)
  } catch { /* sin almacenamiento */ }
})

test('la segunda carga pinta la foto cacheada al instante y revalida sola (#284)', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const sesion = await sesionDe(page)
  const nombre = String(sesion?.user_metadata?.nombre || sesion?.name || 'Administrador')
  const pngA = await QRCode.toBuffer(`avatar-284-A-${Date.now()}`)
  const pngB = await QRCode.toBuffer(`avatar-284-B-${Date.now() + 1}`)
  const [b64A, b64B] = [pngA.toString('base64'), pngB.toString('base64')]
  const foto = () => page.locator(`img[alt="Foto de ${nombre}"]`).first()

  // Compuerta del avatar: retenida, nada puede venir de la red (4 s).
  let retenida = false
  await page.route('**/api/users/*/avatar', async (ruta) => {
    if (retenida) await new Promise((resolver) => setTimeout(resolver, 4000))
    await ruta.continue()
  })

  // Primera carga (sin caché): la foto llega de la red y queda cacheada.
  expect(await subirAvatar(page, sesion.id, b64A)).toBeLessThan(300)
  await olvidarCache(page)
  await page.reload()
  await expect(foto()).toHaveAttribute('src', `data:image/png;base64,${b64A}`, { timeout: 20_000 })
  // Recién cuando A quedó persistida se sube B: si la descarga de A siguiera en
  // vuelo, podría guardarse B en la caché y la segunda carga lo pintaría antes
  // de revalidar (la carrera que hacía fallar el spec).
  await page.waitForFunction((id) => Boolean(localStorage.getItem(`mobos:avatar:${id}`)), sesion.id)
  await page.screenshot({ path: join(DIR, 'segunda-carga-antes.jpg'), type: 'jpeg', quality: 74 })

  // Otra computadora cambia la foto: esta pestaña todavía no lo sabe.
  expect(await subirAvatar(page, sesion.id, b64B)).toBeLessThan(300)

  // Segunda carga con la red retenida: la foto cacheada (A) se pinta al
  // instante; esperar la red tardaría 4 s (y mostraría iniciales).
  retenida = true
  await page.reload()
  await expect(foto()).toHaveAttribute('src', `data:image/png;base64,${b64A}`, { timeout: 1_500 })
  await page.screenshot({ path: join(DIR, 'segunda-carga-cacheada.jpg'), type: 'jpeg', quality: 74 })

  // La revalidación corre sola: al liberar la red, converge a la foto nueva.
  retenida = false
  await expect(foto()).toHaveAttribute('src', `data:image/png;base64,${b64B}`, { timeout: 20_000 })
  await page.screenshot({ path: join(DIR, 'revalidacion-convergida.jpg'), type: 'jpeg', quality: 74 })

  // Limpieza: quitar la foto e invalidar la caché (como hace la app).
  expect([200, 204]).toContain(await borrarAvatar(page, sesion.id))
  await olvidarCache(page)
})
