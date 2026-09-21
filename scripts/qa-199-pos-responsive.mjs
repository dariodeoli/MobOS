// Barrido responsivo del POS y la venta (#199): 360 y 768 px sobre el demo.
// Uso: QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/199 node scripts/qa-199-pos-responsive.mjs
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const SALIDA = process.env.QA_OUT || 'docs/qa/199'
mkdirSync(SALIDA, { recursive: true })
const filas = []
const browser = await chromium.launch()
for (const [ancho, alto, etiqueta] of [[360, 740, 'movil-360'], [768, 1024, 'tablet-768']]) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.waitForTimeout(2400)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2400)
  await page.screenshot({ path: join(SALIDA, `${etiqueta}-pos.jpg`), type: 'jpeg', quality: 72 })
  const desbordeInicial = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill('iPhone 15 Pro')
  await page.waitForTimeout(900)
  const opcion = page.getByRole('option', { name: /iPhone 15 Pro 256GB Titanio/i })
  if (await opcion.count()) await opcion.first().click()
  await page.waitForTimeout(1000)
  const totalVisible = await page.locator('[data-testid="resumen-compra"]').isVisible().catch(() => false)
  await page.screenshot({ path: join(SALIDA, `${etiqueta}-carrito.jpg`), type: 'jpeg', quality: 72 })
  const desbordeCarrito = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  // Cobro: agregar pago y ver la cuenta/monto (scroll al bloque).
  const cobroVisible = await page.getByText('Cobro y entrega').first().isVisible().catch(() => false)
  await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
  const bloquePago = await page.getByLabel('Cuenta de cobro').count()
  const montoDeshabilitado = await page.getByLabel('Monto original').first().isDisabled().catch(() => null)
  await page.getByText('Cobro y entrega').first().scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: join(SALIDA, `${etiqueta}-cobro.jpg`), type: 'jpeg', quality: 72 })
  const desbordeCobro = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const totalTexto = (await page.locator('[data-testid="resumen-compra"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90)
  filas.push({ viewport: etiqueta, ancho, desbordeInicial, desbordeCarrito, desbordeCobro, totalVisible, cobroVisible, bloquePago, montoDeshabilitado, totalTexto, erroresPagina: errores })
  await ctx.close()
}
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), filas }, null, 2))
await browser.close()
for (const fila of filas) console.log(`${fila.viewport}: desborde ${fila.desbordeInicial}/${fila.desbordeCarrito}/${fila.desbordeCobro}px · total visible ${fila.totalVisible} · cobro visible ${fila.cobroVisible} · bloques de pago ${fila.bloquePago} · monto deshabilitado sin cuenta ${fila.montoDeshabilitado} · errores ${fila.erroresPagina.length}`)
