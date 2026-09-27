// Verificación en producción (demo) del buscador de proveedores (#259) y del
// panel «Preparar lote» (F3/F4, #250).
//
// Uso: node e2e/prod/259-abastecimiento.mjs
// Sale 1 si producción todavía no tiene desplegado el cambio (con la captura
// del estado actual en test-results/qa-259-prod/) y 0 cuando ya está.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const APP = process.env.MOBOS_APP_URL || 'https://app.moboss.online'
const SALIDA = process.env.MOBOS_PROD_CAPTURAS || 'test-results/qa-259-prod'
const buscar = process.env.MOBOS_PROD_BUSCAR || 'Importadora'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const cerrarGuia = async () => {
  const boton = page.getByRole('button', { name: 'Entendido' }).first()
  if (await boton.count()) await boton.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
}

await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
if (await dueno.count()) await dueno.click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await page.waitForTimeout(1500)
await cerrarGuia()
mkdirSync(SALIDA, { recursive: true })

// ── #259: el campo Proveedor de la recepción es un buscador con dropdown ──
await page.goto(`${APP}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await cerrarGuia()
await page.getByRole('button', { name: '+ Recibir unidad' }).click()
await page.waitForTimeout(500)
const campo = page.locator('#recibir-proveedor')
const esCombobox = (await campo.getAttribute('role')) === 'combobox'
let listaVisible = false
if (esCombobox) {
  await campo.click()
  await campo.fill(buscar)
  listaVisible = await page.getByRole('listbox', { name: 'Proveedores' }).isVisible().catch(() => false)
}
await page.screenshot({ path: `${SALIDA}/recepcion-proveedor-produccion.jpg`, type: 'jpeg', quality: 80 })
console.log(`#259 · campo Proveedor: ${esCombobox ? 'buscador con dropdown' : 'datalist nativo (pendiente de deploy)'}${esCombobox ? ` · lista: ${listaVisible ? 'OK' : 'no abrió'}` : ''}`)
await page.keyboard.press('Escape')

// ── F3/F4: la pestaña «Preparar lote» ──
await page.goto(`${APP}/preparar-lote`, { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2000)
const panelLote = await page.getByTestId('preparar-lote').isVisible().catch(() => false)
await page.screenshot({ path: `${SALIDA}/preparar-lote-produccion.jpg`, type: 'jpeg', quality: 80 })
console.log(`F3/F4 · Preparar lote: ${panelLote ? 'desplegado' : `pendiente de deploy (quedó en ${page.url()})`}`)

await browser.close()
const ok = esCombobox && listaVisible && panelLote
console.log(ok ? '\nProducción tiene #259 y el panel F3/F4.' : '\nProducción todavía no tiene los cambios (correr de nuevo después del deploy).')
process.exit(ok ? 0 : 1)
