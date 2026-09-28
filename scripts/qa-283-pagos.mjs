// Capturas y marcadores del rediseño de «Pagos de esta venta» (#283):
// sin cuenta predeterminada, selector que desaparece al elegir la cuenta y
// lista que no se superpone a los ítems del bloque.
//
// Corre contra el dev server (Vite) en modo demo:
//   npx vite --port 5216 --strictPort &
//   QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=antes \
//     QA_OUT=docs/qa/283-pagos node scripts/qa-283-pagos.mjs
/* global window */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from '../e2e/helpers/demo.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'http://localhost:5216').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/283-pagos'
const ETIQUETA = (process.env.QA_ETIQUETA || 'rama').replace(/[^a-z0-9-]/gi, '')
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const VARIANTES = [
  { id: 'claro', tema: 'light', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
  { id: 'oscuro', tema: 'dark', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
  { id: 'movil', tema: 'light', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
]

const navegador = await chromium.launch()
const resultados = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), variantes: [] }

async function armarVenta(page) {
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente pagos ${ETIQUETA}`)
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill('Funda Silicona Negra')
  await esperar(700)
  await page.getByRole('button', { name: /Funda Silicona Negra/ }).first().click()
  await esperar(600)
}

async function caja(locator) {
  if (await locator.count() === 0) return null
  return locator.first().boundingBox()
}

async function capturar(variante) {
  const contexto = await navegador.newContext({ viewport: variante.viewport, deviceScaleFactor: variante.deviceScaleFactor })
  if (variante.tema === 'dark') {
    await contexto.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  }
  const page = await contexto.newPage()
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1200)
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await cerrarGuiaDemo(page)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /^(POS|Nueva venta)$/, level: 1 }).waitFor({ timeout: 25_000 })
  await cerrarGuiaDemo(page)
  await esperar(1200)
  await armarVenta(page)

  // La foto encuadra el bloque de pagos: la fila queda arriba de la ventana.
  const foto = async (nombre) => {
    const fila = page.getByTestId('pago-fila-0')
    await fila.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -150))
    await esperar(350)
    await page.screenshot({ path: join(SALIDA, `${variante.id}-${nombre}-${ETIQUETA}.jpg`), type: 'jpeg', quality: 76 })
  }

  // 1) Al agregar el pago: ¿viene cuenta predeterminada?
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await esperar(700)
  const fila = page.getByTestId('pago-fila-0')
  const combo = fila.getByLabel('Cuenta de cobro')
  const predeterminada = (await combo.count()) ? await combo.inputValue() : '(sin selector)'
  await foto('01-agregar-pago')

  // 2) Selector abierto: ¿la lista se superpone a los ítems del bloque?
  await combo.click()
  await esperar(600)
  const lista = page.getByRole('listbox', { name: 'Cuentas de cobro' })
  const cajaLista = await caja(lista)
  const cajaMonto = await caja(fila.getByLabel('Monto original'))
  const solapaMonto = Boolean(cajaLista && cajaMonto && cajaLista.y + cajaLista.height > cajaMonto.y + 1)
  await foto('02-selector-abierto')

  // 3) Cuenta elegida: ¿el selector desaparece y queda solo la cápsula?
  await page.getByRole('option', { name: /Caja · Guaraníes/ }).first().click()
  await esperar(700)
  const comboTrasElegir = await fila.getByLabel('Cuenta de cobro').count()
  const capsula = await fila.getByTestId('cuenta-capsula').count()
  const ayuda = await fila.getByTestId('cuenta-cambiar-ayuda').count()
  const datos = await fila.getByTestId('cuenta-capsula-datos').innerText().catch(() => '')
  await foto('03-cuenta-elegida')

  // 4) Segundo pago: ¿arrastra la cuenta anterior?
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await esperar(600)
  const filaDos = page.getByTestId('pago-fila-1')
  const segunda = (await filaDos.getByLabel('Cuenta de cobro').count()) ? await filaDos.getByLabel('Cuenta de cobro').inputValue() : '(sin selector)'
  await foto('04-segundo-pago')

  await contexto.close()
  return { vista: variante.id, predeterminada, solapaMonto, comboTrasElegir, capsula, ayuda, datos: datos.replace(/\s+/g, ' ').slice(0, 200), segunda }
}

for (const variante of VARIANTES) {
  const medida = await capturar(variante)
  console.log(`[283 ${ETIQUETA}] ${variante.id} · predeterminada="${medida.predeterminada}" · solapa monto=${medida.solapaMonto} · combo tras elegir=${medida.comboTrasElegir} · cápsula=${medida.capsula} · ayuda=${medida.ayuda}`)
  resultados.variantes.push(medida)
}

writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify({ etiqueta: ETIQUETA, variantes: resultados.variantes.length }))
await navegador.close()
