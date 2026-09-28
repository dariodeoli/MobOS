// Capturas de la UI de #279 A2 (carrito privado + borrador con creador y
// retoma) en la demo: pendientes y retomadas, en claro, oscuro y móvil.
//
//   npx vite --port 5216 --strictPort &
//   QA_BASE_URL=http://localhost:5216 QA_OUT=docs/qa/279-a2-carrito \
//     node scripts/qa-279-a2-carrito.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from '../e2e/helpers/demo.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'http://localhost:5216').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/279-a2-carrito'
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const VARIANTES = [
  { id: 'claro', tema: 'light', viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 },
  { id: 'oscuro', tema: 'dark', viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 },
  { id: 'movil', tema: 'light', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
]

const navegador = await chromium.launch()
const resultados = { base: BASE, fecha: new Date().toISOString(), variantes: [] }

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
  await esperar(1000)

  // Carrito con un producto y borrador guardado.
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente A2 ${variante.id}`)
  await page.getByPlaceholder('Buscar producto…').fill('Cargador USB-C')
  await esperar(700)
  await page.getByRole('button', { name: /Cargador USB-C 20W/ }).first().click()
  await esperar(500)
  await page.getByRole('button', { name: 'Suspender venta' }).click()
  const suspender = page.getByRole('dialog', { name: 'Suspender venta' })
  await suspender.getByLabel('Etiqueta (opcional)').fill(`Borrador A2 ${variante.id}`)
  await suspender.getByRole('button', { name: 'Suspender venta' }).click()
  await esperar(1200)

  // Pendientes: el borrador con quién lo creó.
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const modal = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await modal.waitFor({ timeout: 15_000 })
  await esperar(500)
  await page.screenshot({ path: join(SALIDA, `${variante.id}-01-pendientes.jpg`), type: 'jpeg', quality: 78 })
  const creador = await modal.getByText(/Creada por/).first().innerText().catch(() => '')

  // Retomar no borra: el borrador queda en «Retomadas» con quién lo retomó.
  await modal.getByRole('button', { name: 'Recuperar' }).click()
  await esperar(1200)
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const modal2 = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await modal2.getByRole('tab', { name: /Retomadas \(1\)/ }).click()
  await esperar(500)
  const retoma = await modal2.getByText(/Retomada por/).first().innerText().catch(() => '')
  await page.screenshot({ path: join(SALIDA, `${variante.id}-02-retomadas.jpg`), type: 'jpeg', quality: 78 })

  await contexto.close()
  return { vista: variante.id, creador: creador.replace(/\s+/g, ' ').trim(), retoma: retoma.replace(/\s+/g, ' ').trim() }
}

for (const variante of VARIANTES) {
  const medida = await capturar(variante)
  console.log(`[279 A2] ${variante.id} · "${medida.creador}" · "${medida.retoma}"`)
  resultados.variantes.push(medida)
}

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify({ capturas: resultados.variantes.length }))
await navegador.close()
