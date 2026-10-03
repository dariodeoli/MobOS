// Capturas de #332 — Inventario con dos vistas conmutables: Unidades (IMEI) y
// Productos (stock), con el switch en cada pantalla, en claro, oscuro y móvil.
//
//   npx vite --port 5216 --strictPort &
//   QA_BASE_URL=http://localhost:5216 QA_OUT=docs/qa/332-inventario \
//     node scripts/qa-332-inventario.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from '../e2e/helpers/demo.js'

const require = createRequire(import.meta.url)
const { chromium, expect } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'http://localhost:5216').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/332-inventario'
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const VARIANTES = [
  { id: 'claro', tema: 'light', viewport: { width: 1280, height: 1000 }, factor: 1 },
  { id: 'oscuro', tema: 'dark', viewport: { width: 1280, height: 1000 }, factor: 1 },
  { id: 'movil', tema: 'light', viewport: { width: 390, height: 844 }, factor: 2 },
]

const navegador = await chromium.launch()
const resultados = { base: BASE, fecha: new Date().toISOString(), variantes: [] }

async function capturar(variante) {
  const contexto = await navegador.newContext({ viewport: variante.viewport, deviceScaleFactor: variante.factor })
  if (variante.tema === 'dark') {
    await contexto.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  }
  const page = await contexto.newPage()
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1200)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await cerrarGuiaDemo(page)

  // Vista Unidades (IMEI/serial). En desktop el switch vive en la barra; en
  // móvil se oculta por diseño (#304) y las dos vistas se eligen desde el menú.
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await esperar(2200)
  const switchVista = page.getByTestId('vista-productos-unidades')
  if (variante.id !== 'movil') {
    await expect(switchVista.first()).toBeVisible({ timeout: 25_000 })
    await expect.poll(() => switchVista.getByRole('button', { name: 'Unidades' }).first().getAttribute('aria-pressed')).toBe('true')
  }
  await esperar(600)
  await page.screenshot({ path: join(SALIDA, `${variante.id}-01-unidades.jpg`), type: 'jpeg', quality: 78, fullPage: false })

  // Conmutar a la vista normal de Productos (stock).
  let menu = null
  if (variante.id === 'movil') {
    await page.getByRole('button', { name: 'Abrir menú completo' }).click()
    await esperar(700)
    menu = await page.getByRole('dialog').innerText().catch(() => '')
    await page.screenshot({ path: join(SALIDA, `${variante.id}-03-menu.jpg`), type: 'jpeg', quality: 78 })
    await page.getByRole('dialog').getByRole('button', { name: 'Productos (stock)', exact: true }).click()
    await page.waitForURL(/\/productos$/, { timeout: 20_000 })
  } else {
    await switchVista.getByRole('button', { name: 'Productos' }).first().click()
    await page.waitForURL(/\/productos$/, { timeout: 20_000 })
  }
  await page.getByTestId('barra-productos').waitFor({ timeout: 25_000 })
  await expect.poll(() => page.getByTestId('vista-productos-unidades').getByRole('button', { name: 'Productos' }).first().getAttribute('aria-pressed')).toBe('true')
  await esperar(900)
  await page.screenshot({ path: join(SALIDA, `${variante.id}-02-productos.jpg`), type: 'jpeg', quality: 78, fullPage: false })

  await contexto.close()
  return { vista: variante.id, urlUnidades: '/inventario/unidades', urlProductos: '/productos', menu: menu ? menu.replace(/\s+/g, ' ').slice(0, 160) : null }
}

for (const variante of VARIANTES) {
  const medida = await capturar(variante)
  console.log(`[332] ${variante.id} · Unidades ✓ · Productos ✓${medida.menu ? ` · menú: ${medida.menu}` : ''}`)
  resultados.variantes.push(medida)
}

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify({ capturas: resultados.variantes.length }))
await navegador.close()
