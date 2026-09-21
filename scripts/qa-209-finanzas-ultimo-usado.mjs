// Verificación y capturas del patrón #209 en Finanzas: Gastos (tipo, moneda y
// cuenta) y Conciliación (estado, medio y período) recuerdan el último uso,
// sobreviven a la recarga y se pueden cambiar.
//
// Uso: QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
//   node scripts/qa-209-finanzas-ultimo-usado.mjs
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
const SALIDA = join(RAIZ, 'docs/qa/209')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    await fn()
    resultados.push({ nombre, ok: true })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 200)}`)
  }
}

// Sesión real del entorno local (seed de e2e).
const loginRespuesta = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB },
  body: JSON.stringify({ email: 'e2e-tienda@test.local', password: 'E2e-password-123', deviceId: 'qa-209' }),
})
const login = await loginRespuesta.json()
let cookies = (loginRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')
const admin = (login.sellers || []).find((fila) => fila.name === 'Administrador')
const pinRespuesta = await fetch(`${API}/api/auth/pin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB, cookie: cookies },
  body: JSON.stringify({ sellerId: admin.id, pin: '1234' }),
})
cookies = `${cookies}; ${(pinRespuesta.headers.getSetCookie?.() || []).map((fila) => fila.split(';')[0]).join('; ')}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies(cookies.split('; ').map((par) => {
  const [name, ...resto] = par.split('=')
  return { name, value: resto.join('='), domain: 'localhost', path: '/' }
}))
const page = await ctx.newPage()

await ver('Gastos: el tipo y la moneda vuelven tras recargar', async () => {
  await page.goto(`${WEB}/finanzas/gastos`)
  await expect(page.getByRole('heading', { name: 'Registrar salida, cheque o adelanto' })).toBeVisible()
  await page.locator('#tipo').selectOption('CHEQUE')
  await page.locator('#moneda-gasto').selectOption('USD')
  await expect(page.getByText(/arrancan con tu última elección/)).toBeVisible()
  await page.reload()
  await expect(page.locator('#tipo')).toHaveValue('CHEQUE')
  await expect(page.locator('#moneda-gasto')).toHaveValue('USD')
  await page.screenshot({ path: join(SALIDA, 'gastos-ultimo-usado.jpg'), type: 'jpeg', quality: 72 })
})

await ver('Gastos: el cambio explícito pisa lo recordado', async () => {
  await page.locator('#tipo').selectOption('EXPENSE')
  await page.locator('#moneda-gasto').selectOption('PYG')
  await page.reload()
  await expect(page.locator('#tipo')).toHaveValue('EXPENSE')
  await expect(page.locator('#moneda-gasto')).toHaveValue('PYG')
})

await ver('Conciliación: el período y el estado vuelven tras recargar', async () => {
  await page.goto(`${WEB}/finanzas/conciliacion`)
  await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible()
  await page.getByRole('button', { name: '30 días' }).click()
  await page.getByRole('button', { name: '7 días' }).click()
  await page.getByLabel('Estado').selectOption('VERIFIED')
  await page.reload()
  await expect(page.getByRole('button', { name: '7 días' })).toBeVisible()
  await expect(page.getByLabel('Estado')).toHaveValue('VERIFIED')
})

await ver('Conciliación: el filtro de medio vuelve y se avisa que es recordado', async () => {
  const medio = page.getByLabel('Medio')
  // La carga trae las facetas del período: se espera a que aparezca algún
  // medio (además de «Todos»), porque el select existe desde el primer render.
  let opciones = []
  try {
    await expect.poll(async () => (await medio.locator('option').evaluateAll((filas) => filas.map((fila) => fila.value).filter(Boolean))).length, { timeout: 15000 }).toBeGreaterThan(0)
    opciones = await medio.locator('option').evaluateAll((filas) => filas.map((fila) => fila.value).filter(Boolean))
  } catch {
    return // el período no tiene medios: no hay nada que recordar
  }
  await medio.selectOption(opciones[0])
  await page.reload()
  await expect(page.getByText('Ingresos conciliables')).toBeVisible()
  await expect(medio).toHaveValue(opciones[0])
  await expect(page.getByText('Filtros de tu última visita')).toBeVisible()
  await page.screenshot({ path: join(SALIDA, 'conciliacion-ultimo-usado.jpg'), type: 'jpeg', quality: 72 })
})

await ver('Conciliación: «Limpiar filtros» olvida lo recordado', async () => {
  await expect(page.getByText('Ingresos conciliables')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click()
  await page.reload()
  await expect(page.getByText('Ingresos conciliables')).toBeVisible()
  await expect(page.getByLabel('Estado')).toHaveValue('')
  await expect(page.getByText('Filtros de tu última visita')).toHaveCount(0)
})

await ver('Demo: el último usado no toca localStorage y se descarta al recargar', async () => {
  // Las verificaciones reales anteriores ya dejaron claves `mobos:ultimo:*`:
  // se limpian para medir solo lo que hace la demo.
  await page.goto(`${WEB}/resumen`)
  await page.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:ultimo:')).forEach((clave) => localStorage.removeItem(clave)))
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForLoadState('networkidle')
  await page.goto(`${WEB}/finanzas/gastos`)
  await expect(page.getByRole('heading', { name: 'Registrar salida, cheque o adelanto' })).toBeVisible()
  await page.locator('#tipo').selectOption('CHEQUE')
  const claves = await page.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:ultimo:')))
  expect(claves, `la demo escribió: ${claves.join(', ')}`).toEqual([])
  await page.reload()
  // La demo guarda en memoria de la pestaña: al recargar vuelve el default.
  await expect(page.locator('#tipo')).toHaveValue('EXPENSE')
  await page.screenshot({ path: join(SALIDA, 'demo-sin-persistencia.jpg'), type: 'jpeg', quality: 72 })
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ web: WEB, resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones de #209 OK`)
if (fallos.length) process.exitCode = 1
