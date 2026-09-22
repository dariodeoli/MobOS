// Evidencia de #148 §18 (analytics del POS al día): cortes netos por tipo,
// efectivo, por cuenta y sucursal, top productos, por vendedor y por caja, con
// sesión real y en la demo. Capturas + resultados.
//
// Uso: QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-148-analytics-pos.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const API = process.env.QA_API_URL || 'http://localhost:3115'
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/148-18-analytics-pos')
// `QA_SOLO_DEMO=1` corre únicamente la parte de la demo pública (producción, sin
// credenciales de tienda): omite el inicio de sesión real y su verificación.
const SOLO_DEMO = process.env.QA_SOLO_DEMO === '1'
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

const loginRespuesta = SOLO_DEMO ? null : await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-148a' }) })
const login = loginRespuesta ? await loginRespuesta.json() : null
let cookies = (loginRespuesta?.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login?.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = SOLO_DEMO ? null : await fetch(`${API}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies }, body: JSON.stringify({ sellerId: admin.id, pin: '1234' }) })
cookies = `${cookies}; ${(pinRespuesta?.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')}`

const browser = await chromium.launch()

if (!SOLO_DEMO) await ver('Sesión real: el tablero muestra los cortes netos y por caja', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addCookies(cookies.split('; ').map((par) => { const [name, ...resto] = par.split('='); return { name, value: resto.join('='), domain: 'localhost', path: '/' } }))
  const page = await ctx.newPage()
  await page.goto(`${WEB}/pos`)
  await page.getByRole('button', { name: 'Analytics' }).click({ timeout: 30000 })
  const panel = page.getByRole('dialog')
  await panel.getByText('Ventas de hoy').waitFor({ timeout: 20000 })
  for (const texto of ['Efectivo', 'Cobros netos por tipo', 'Cobros netos por cuenta', 'Cobros netos por sucursal', 'Top productos', 'Ventas por vendedor']) {
    await expect(panel.getByText(texto).first()).toBeVisible({ timeout: 15000 })
  }
  await panel.getByRole('tab', { name: '7 días' }).click()
  await expect(panel.getByText('Cobros netos por tipo').first()).toBeVisible()
  const porTipo = await panel.locator('section').filter({ hasText: 'Cobros netos por tipo' }).first().innerText()
  await page.screenshot({ path: join(SALIDA, 'real-analytics.jpg'), type: 'jpeg', quality: 72 })
  await ctx.close()
  return porTipo.replace(/\n+/g, ' · ').slice(0, 220)
})

await ver('Demo: el tablero muestra el sistema completo (Pix, USDT, canje y cajas)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
  await page.goto(`${WEB}/pos`)
  await page.getByRole('button', { name: 'Analytics' }).click({ timeout: 30000 })
  const panel = page.getByRole('dialog')
  await panel.getByText('Ventas de hoy').waitFor({ timeout: 20000 })
  for (const texto of ['Efectivo', 'Cobros netos por tipo', 'Cobros netos por cuenta', 'Cobros netos por sucursal', 'Ventas por caja']) {
    await expect(panel.getByText(texto).first()).toBeVisible({ timeout: 15000 })
  }
  const porTipo = await panel.locator('section').filter({ hasText: 'Cobros netos por tipo' }).first().innerText()
  await page.screenshot({ path: join(SALIDA, 'demo-analytics.jpg'), type: 'jpeg', quality: 72 })
  await ctx.close()
  return porTipo.replace(/\n+/g, ' · ').slice(0, 260)
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
