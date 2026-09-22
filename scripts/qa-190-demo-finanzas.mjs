// #190 — datos de demo al día en Finanzas: cuentas de cobro, caja y
// conciliación muestran el sistema nuevo completo y sin la palabra «demo» en
// los datos (los avisos de demo se conservan). Capturas + resultados.
//
// Uso: QA_BASE_URL=http://localhost:5215 node scripts/qa-190-demo-finanzas.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = join(RAIZ, 'docs/qa/190')
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

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await ctx.newPage()
await page.goto(`${WEB}/demo`)
await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()

await ver('Cuentas de cobro: medios del sistema nuevo, sin «demo» en los datos', async () => {
  await page.goto(`${WEB}/finanzas/bancos`)
  const filas = page.getByTestId('cuenta-fila')
  for (const nombre of ['Caja · Guaraníes', 'Caja · Dólares', 'Itaú · Cuenta corriente', 'Continental · Cuenta corriente', 'ueno · Tarjeta', 'Dinelco · Tarjeta', 'Pix · Itaú', 'USDT · Binance', 'Canje · Equipos']) {
    await expect(filas.filter({ hasText: nombre })).toHaveCount(1)
  }
  const textos = await filas.allInnerTexts()
  const conDemo = textos.filter((texto) => /demo/i.test(texto))
  expect(conDemo, `cuentas con «demo»: ${conDemo.join(' | ')}`).toEqual([])
  await page.screenshot({ path: join(SALIDA, '190-cuentas.jpg'), type: 'jpeg', quality: 72 })
})

await ver('Caja: turno con nombre real y auditoría del día', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
  await expect(page.getByText(/Turno de Hernán Acosta/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Entradas por medio de pago' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Auditoría de efectivo' })).toBeVisible()
  await page.screenshot({ path: join(SALIDA, '190-caja.jpg'), type: 'jpeg', quality: 72 })
})

await ver('Conciliación: medios nuevos, lote con su cuenta y número de la empresa', async () => {
  await page.goto(`${WEB}/finanzas/conciliacion`)
  const medio = page.getByLabel('Medio')
  for (const etiqueta of ['Pix', 'USDT - Cripto', 'Canje', 'Tarjeta', 'Transferencia']) {
    await expect(medio.locator('option', { hasText: etiqueta }).first()).toHaveCount(1)
  }
  await expect(page.getByTestId('conciliacion-lote').first()).toContainText('Itaú · Cuenta corriente')
  await expect(page.getByTestId('conciliacion-fila').first().getByText(/AUR-\d{4}/)).toBeVisible()
  const textos = await page.getByTestId('conciliacion-fila').allInnerTexts()
  expect(textos.filter((texto) => /demo/i.test(texto)), 'las filas de conciliación no deben decir «demo»').toEqual([])
  await page.screenshot({ path: join(SALIDA, '190-conciliacion.jpg'), type: 'jpeg', quality: 72 })
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ web: WEB, resultados }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones de #190 OK`)
if (fallos.length) process.exitCode = 1
