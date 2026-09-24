// Escáner del POS (#148 §6): el lector escribe `MOBOS:PROD:<sku>` como teclado,
// el POS muestra el producto y pide confirmación antes de sumarlo. La sonda
// verifica el flujo en la demo, mide los botones del modal (#249) y captura.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.156-produccion node scripts/qa-148-s6-escaner.mjs
// Salida: docs/qa/148-s6/escaner/<etiqueta>/<viewport>-0X-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/148-s6/escaner', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const SKU = process.env.QA_SKU || 'IP15PRO-256-TIT'
const TOQUE = 44
const VIEWPORTS = [
  { nombre: '390', ancho: 390, alto: 844 },
  { nombre: '1280', ancho: 1280, alto: 900 },
]

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const resultados = []
const navegador = await chromium.launch()

for (const viewport of VIEWPORTS) {
  const contexto = await navegador.newContext({
    viewport: { width: viewport.ancho, height: viewport.alto },
    deviceScaleFactor: 2,
  })
  const page = await contexto.newPage()
  const errores = []
  const medidas = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))

  const medir = async (etiqueta, locator) => {
    try {
      const caja = await locator.first().boundingBox()
      if (!caja) return
      const ancho = Math.round(caja.width)
      const alto = Math.round(caja.height)
      medidas.push({
        etiqueta,
        ancho,
        alto,
        corto: viewport.ancho < 768 && (ancho < TOQUE || alto < TOQUE),
      })
    } catch { /* no visible */ }
  }

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1400)
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await esperar(2200)
    const guia = page.getByRole('button', { name: 'Entendido' })
    if (await guia.count()) await guia.click().catch(() => {})

    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.waitFor({ timeout: 25_000 })
    await esperar(1200)
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente escáner QA')

    // El lector USB escribe el código como teclado.
    await buscar.fill(`MOBOS:PROD:${SKU}`)
    const dialogo = page.getByRole('dialog', { name: 'Producto escaneado' })
    await dialogo.waitFor({ timeout: 15_000 })
    await esperar(400)
    const producto = (await dialogo.innerText()).replace(/\s+/g, ' ').slice(0, 140)
    await medir('modal · cancelar', dialogo.getByRole('button', { name: 'Cancelar' }))
    await medir('modal · agregar a la venta', dialogo.getByRole('button', { name: 'Agregar a la venta' }))
    if (viewport.ancho < 1280) await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-01-modal.jpg`), type: 'jpeg', quality: 72 })
    else await page.screenshot({ path: join(SALIDA, `1280-01-modal.jpg`), type: 'jpeg', quality: 72 })

    await dialogo.getByRole('button', { name: 'Agregar a la venta' }).click()
    await page.getByRole('button', { name: /^Ver detalle de / }).first().waitFor({ timeout: 10_000 })
    await page.locator('#pos-resumen-venta').scrollIntoViewIfNeeded()
    await esperar(400)
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-02-agregado.jpg`), type: 'jpeg', quality: 72 })

    resultados.push({ viewport: viewport.nombre, producto, medidas, errores })
  } catch (error) {
    errores.push(String(error.message).slice(0, 200))
    resultados.push({ viewport: viewport.nombre, medidas, errores })
  }
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, sku: SKU, resultados }, null, 2))
for (const fila of resultados) {
  const cortos = (fila.medidas || []).filter((m) => m.corto).map((m) => `${m.etiqueta} ${m.ancho}x${m.alto}`)
  console.log(`${fila.viewport}: ${fila.producto ? `producto "${fila.producto.slice(0, 60)}"` : 'SIN MODAL'} · cortos: ${cortos.length ? cortos.join(' | ') : '0'} · errores ${fila.errores.length}`)
}
