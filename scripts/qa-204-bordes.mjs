// Bordes de la venta (#204): split con moneda extranjera, método de entrega nuevo
// y períodos de analytics. Uso: BASE=<demo> QA_OUT=docs/qa/204 node scripts/qa-204-bordes.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('/Users/fredd/.herdr/worktrees/mobos/MOS-POS/scripts/')
const { chromium } = require('@playwright/test')
const BASE = process.env.BASE || process.env.QA_BASE_URL || 'https://app.moboss.online'
const OUT = process.env.QA_OUT || 'docs/qa/204'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errores = []
page.on('pageerror', (e) => errores.push(e.message.slice(0, 120)))
await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/demo'), { timeout: 30000 })
await page.waitForTimeout(2400)
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2400)
// venta de base
const campo = page.locator('input[placeholder="Buscar cliente o escribir un nombre nuevo"]')
await campo.fill('Cliente QA 204'); await page.waitForTimeout(700)
await page.getByPlaceholder('Buscar producto…').fill('iPhone 15'); await page.waitForTimeout(900)
await page.getByRole('option', { name: /iPhone 15 128GB Azul/i }).first().click(); await page.waitForTimeout(900)
// A) split con moneda extranjera
await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click(); await page.waitForTimeout(900)
const combo1 = page.getByLabel('Cuenta de cobro').first()
await combo1.click(); await combo1.fill('USD'); await page.waitForTimeout(800)
await page.getByRole('option').filter({ hasText: /USD/i }).first().click(); await page.waitForTimeout(900)
const monto1 = page.getByLabel('Monto original').first()
const deshabilitado = await monto1.isDisabled()
await monto1.fill('100'); await page.waitForTimeout(900)
const cotizacion = await page.getByLabel(/Cotización manual/).first().inputValue().catch(() => '(sin campo)')
const cuerpo = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const equivalente = (cuerpo.match(/Equivalente: Gs [\d.]+/) || ['(sin equivalente)'])[0]
await page.screenshot({ path: `${OUT}/01-split-usd.jpg`, type: 'jpeg', quality: 75 })
const botonDividir = page.getByRole('button', { name: /Dividir saldo/ })
const textoDividir = (await botonDividir.count()) ? await botonDividir.innerText() : '(sin dividir)'
if (await botonDividir.count()) {
  await botonDividir.first().click(); await page.waitForTimeout(1000)
  const prefill = await page.getByLabel('Monto original').nth(1).inputValue()
  const combo2 = page.getByLabel('Cuenta de cobro').nth(1)
  await combo2.click(); await combo2.fill('Caja'); await page.waitForTimeout(800)
  await page.getByRole('option').filter({ hasText: /Caja demo · Gs/i }).first().click(); await page.waitForTimeout(900)
  const principal = page.getByRole('button', { name: /Confirmar venta|Crear pedido/ }).last()
  const etiqueta = (await principal.innerText()).replace(/\s+/g, ' ')
  const habilitado = !(await principal.isDisabled())
  await page.screenshot({ path: `${OUT}/02-split-completo.jpg`, type: 'jpeg', quality: 75 })
  console.log('A) USD:', JSON.stringify({ deshabilitadoSinCuenta: deshabilitado, cotizacion, equivalente, dividir: textoDividir.replace(/\s+/g, ' '), prefill, boton: etiqueta, habilitado }))
  // cerrar la venta con el método nuevo
  await page.locator('#entrega').selectOption('Retiro en otra sucursal').catch(() => {})
  await page.waitForTimeout(700)
  const etiquetaEntrega = await page.locator('#entrega').inputValue().catch(() => '?')
  if (habilitado) { await principal.click(); await page.waitForTimeout(2600) }
  console.log('D) entrega nueva:', etiquetaEntrega, '· venta:', (await page.locator('[role="status"]').first().innerText().catch(() => '(sin banner)')).replace(/\s+/g, ' ').slice(0, 90))
} else {
  console.log('A) USD:', JSON.stringify({ deshabilitadoSinCuenta: deshabilitado, cotizacion, equivalente }))
}
// B) analytics: período
await page.getByRole('button', { name: 'Analytics' }).click(); await page.waitForTimeout(2200)
const textoHoy = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const valorHoy = (textoHoy.match(/VENTAS DE HOY ([^P]*)/) || [])[1]?.trim()?.slice(0, 20)
const chips = await page.getByText(/^(Hoy|7 días|Este mes)$/).allInnerTexts().catch(() => [])
const boton7 = page.getByText('7 días', { exact: true }).first()
const hay7 = await boton7.count()
if (hay7) { await boton7.click(); await page.waitForTimeout(1200) }
const texto7 = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const valor7 = (texto7.match(/VENTAS DE HOY ([^P]*)/) || [])[1]?.trim()?.slice(0, 20)
const tituloMedio = (texto7.match(/COBROS POR MEDIO[^A-Z]*/) || [''])[0].slice(0, 40)
await page.screenshot({ path: `${OUT}/03-analytics-7d.jpg`, type: 'jpeg', quality: 75 })
console.log('B) analytics:', JSON.stringify({ chips, hay7, valorHoy, valor7, tituloMedio: tituloMedio.replace(/\s+/g, ' ') }))
console.log('errores pagina:', errores.length, errores.slice(0, 2).join(' | '))
await browser.close()
