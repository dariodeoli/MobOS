// #264/#265 · Verificación en producción (demo): la papelera del pago vive
// dentro del bloque y el diálogo de eliminar línea queda por encima del carrito.
// Salida: docs/qa/264-265-produccion/{capturas}.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/264-265-produccion'
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const page = await contexto.newPage()
const errores = []
page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)))
const foto = (n) => page.screenshot({ path: join(SALIDA, `${n}.jpg`), type: 'jpeg', quality: 72 })

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await esperar(1400)
await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/demo'), { timeout: 30_000 })
await esperar(2200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.isVisible().catch(() => false)) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})

await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
await esperar(1200)
await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 264')
const buscar = page.getByPlaceholder('Buscar producto…')
await buscar.fill('Funda MagSafe')
await esperar(900)
await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'Funda MagSafe' }).first().click()
await esperar(900)

// #265 · pago: la papelera vive dentro de la fila del bloque.
await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click()
await esperar(900)
const combo = page.getByLabel('Cuenta de cobro').first()
if (await combo.count()) {
  await combo.click().catch(() => {})
  await esperar(500)
  const opcion = page.getByRole('option').first()
  if (await opcion.count()) await opcion.click().catch(() => {})
  else await page.keyboard.press('Escape')
}
await esperar(700)
const filaPago = page.getByTestId('pago-fila-0')
const basurero = filaPago.getByRole('button', { name: 'Eliminar pago 1' })
const dentroDelBloque = (await basurero.count()) === 1
await filaPago.scrollIntoViewIfNeeded().catch(() => {})
await filaPago.screenshot({ path: join(SALIDA, 'pago-bloque.png') }).catch(() => {})
await foto('pos-carrito-pagos')
const bloquesAntes = await page.getByTestId(/^pago-fila-/).count()
if (dentroDelBloque) { await basurero.click(); await esperar(600) }
const bloquesDespues = await page.getByTestId(/^pago-fila-/).count()

// #264 · eliminar línea con descuento: el diálogo tiene que verse por encima.
await page.getByRole('button', { name: /^Ver detalle de / }).first().click()
await esperar(500)
const descuento = page.getByLabel(/^Descuento % de /).first()
if (await descuento.count()) { await descuento.fill('10'); await esperar(500) }
await page.getByRole('button', { name: /^Eliminar / }).first().click()
await esperar(700)
const dialogo = page.getByRole('dialog')
const dialogoVisible = await dialogo.isVisible().catch(() => false)
if (dialogoVisible) await dialogo.screenshot({ path: join(SALIDA, 'dialogo-eliminar-linea.png') }).catch(() => {})
await foto('pos-dialogo-eliminar')
let lineaEliminada = false
if (dialogoVisible) {
  const confirmar = dialogo.getByRole('button', { name: /Eliminar|Quitar|Confirmar/ }).last()
  if (await confirmar.count()) {
    await confirmar.click().catch(() => {})
    await esperar(800)
    lineaEliminada = (await page.getByRole('button', { name: /^Eliminar / }).count()) === 0
  }
}

const resultados = { base: BASE, fecha: new Date().toISOString(), version: (await page.locator('body').innerText()).match(/v1\.0\.\d+/)?.[0] || '', basureroDentroDelBloque: dentroDelBloque, bloquesAntes, bloquesDespues, dialogoVisible, lineaEliminada, erroresPagina: errores }
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify(resultados))
await navegador.close()
