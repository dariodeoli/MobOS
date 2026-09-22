// Evidencia de #148 §18 «ventas por caja»: panel de corte por sesión en Caja,
// con sesión real y en la demo. Capturas + resultados.
//
// Uso: QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-148-ventas-por-caja.mjs
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
const SALIDA = join(RAIZ, 'docs/qa/148-18-ventas-por-caja')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    await fn()
    resultados.push({ nombre, ok: true })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

// Sesión real del entorno local (seed de e2e).
const loginRespuesta = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-148' }) })
const login = await loginRespuesta.json()
let cookies = (loginRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = await fetch(`${API}/api/auth/pin`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies }, body: JSON.stringify({ sellerId: admin.id, pin: '1234' }) })
cookies = `${cookies}; ${(pinRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')}`

const browser = await chromium.launch()

await ver('Sesión real: el corte por caja lista las sesiones del período', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addCookies(cookies.split('; ').map((par) => { const [name, ...resto] = par.split('='); return { name, value: resto.join('='), domain: 'localhost', path: '/' } }))
  const page = await ctx.newPage()
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: 'Ventas por caja' })).toBeVisible({ timeout: 30000 })
  const filas = page.getByTestId('ventas-por-caja-fila')
  await expect(filas.first()).toBeVisible({ timeout: 20000 })
  const detalle = (await filas.first().innerText()).replace(/\n+/g, ' · ')
  const medida = await page.getByTestId('ventas-por-caja-tabla').evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
  expect(medida.scrollWidth, 'sin scroll horizontal').toBeLessThanOrEqual(medida.clientWidth + 1)
  await page.screenshot({ path: join(SALIDA, 'real-caja.jpg'), type: 'jpeg', quality: 72 })
  resultados.push({ nombre: 'detalle real', detalle })
  await ctx.close()
})

await ver('Demo: el corte por caja muestra el histórico con diferencias', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: 'Ventas por caja' })).toBeVisible({ timeout: 30000 })
  const filas = page.getByTestId('ventas-por-caja-fila')
  await expect(filas.first()).toBeVisible({ timeout: 20000 })
  await expect(filas.nth(1)).toBeVisible()
  const textos = await filas.allInnerTexts()
  const detalle = textos.map((texto) => texto.replace(/\n+/g, ' · '))
  expect(detalle.join(' ')).toMatch(/Abierta/)
  expect(detalle.join(' ')).toMatch(/Cerrada/)
  await page.screenshot({ path: join(SALIDA, 'demo-caja.jpg'), type: 'jpeg', quality: 72 })
  resultados.push({ nombre: 'detalle demo', detalle })
  await ctx.close()
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => fila.ok === false)
console.log(`\n${resultados.filter((fila) => fila.ok !== false).length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
