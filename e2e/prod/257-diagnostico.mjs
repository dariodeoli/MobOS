// #257 · Verificación en la demo de producción: el stock del catálogo del POS
// tiene que coincidir con las unidades disponibles del inventario serializado.
//
// Uso: node e2e/prod/257-diagnostico.mjs
// Recorre las familias de iPhone del catálogo demo, suma las unidades
// Disponibles en Inventario → Unidades y las compara con lo que muestra el POS.
// Sirve de evidencia antes/después del arreglo (sin el fix, los modelos con
// unidades figuran «Agotado» y otros arrastran stock del seed viejo).
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const APP = process.env.MOBOS_APP_URL || 'https://app.moboss.online'
const MODELOS = [
  'iPhone 15 Pro 256GB Titanio',
  'iPhone 15 Pro 256GB Negro',
  'iPhone 15 128GB Azul',
  'iPhone 14 Pro 256GB Plata',
  'iPhone 15 Pro Max 256GB Titanio Natural',
  'iPhone 15 Pro Max 512GB Azul',
  'iPhone 15 256GB Rosa',
  'iPhone 14 128GB Medianoche',
  'iPhone 14 256GB Azul',
  'iPhone 13 128GB Blanco',
  'iPhone 13 Pro Max 256GB Grafito',
  'iPhone 12 128GB Verde',
]
const familia = (modelo) => modelo.replace(/\s+(Titanio Natural|Titanio|Negro|Azul|Plata|Rosa|Medianoche|Blanco|Grafito|Verde)$/, '')
const FAMILIAS = [...new Set(MODELOS.map(familia))].map((base) => ({
  base,
  modelos: MODELOS.filter((modelo) => familia(modelo) === base),
}))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const cerrarGuia = async () => {
  const boton = page.getByRole('button', { name: 'Entendido' }).first()
  if (await boton.count()) await boton.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
}

const numeroEnStock = (texto) => {
  const agotado = /Agotado/i.test(texto)
  const match = texto.match(/(\d+)\s+en stock/i)
  return match ? Number(match[1]) : agotado ? 0 : null
}

await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
if (await dueno.count()) await dueno.click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await page.waitForTimeout(1500)
await cerrarGuia()

// POS: el texto de la tarjeta de cada familia.
await page.goto(`${APP}/pos`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await cerrarGuia()
const buscadorPOS = page.getByPlaceholder('Buscar producto…')
const pos = new Map()
for (const { base } of FAMILIAS) {
  await buscadorPOS.fill(base)
  await page.waitForTimeout(350)
  const texto = await page.evaluate((textoBase) => {
    const cuerpo = document.body.innerText
    const indice = cuerpo.indexOf(textoBase)
    return indice >= 0 ? cuerpo.slice(indice, indice + 160).replace(/\s+/g, ' ') : ''
  }, base)
  pos.set(base, { stock: numeroEnStock(texto) })
}
await buscadorPOS.fill('')

// Inventario: unidades Disponibles por familia.
await page.goto(`${APP}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
const filas = []
for (const { base, modelos } of FAMILIAS) {
  let disponibles = 0
  for (const modelo of modelos) {
    await campo.fill(modelo)
    await campo.press('Enter')
    await page.waitForTimeout(500)
    const textos = await page.getByTestId('inventario-fila').allInnerTexts()
    disponibles += textos.filter((texto) => /Disponible/.test(texto)).length
  }
  filas.push({ base, disponibles, ...(pos.get(base) || {}) })
}
await campo.fill('')

let desalineados = 0
console.log('familia | inventario (Disponibles) | POS')
for (const fila of filas) {
  const posTexto = fila.stock === null ? 'sin tarjeta' : fila.stock === 0 ? 'Agotado' : `${fila.stock} en stock`
  const ok = fila.stock === fila.disponibles
  if (!ok) desalineados += 1
  console.log(`${ok ? 'OK ' : 'MAL'} ${fila.base} | ${fila.disponibles} | ${posTexto}`)
}
console.log(desalineados ? `\n#257: ${desalineados} familia(s) con el stock del POS desalineado del inventario.` : '\n#257: POS e inventario alineados en las familias del demo.')
await page.screenshot({ path: 'test-results/qa-257-prod/diagnostico-demo.jpg', fullPage: true, type: 'jpeg', quality: 78 })
await browser.close()
process.exit(desalineados ? 1 : 0)
