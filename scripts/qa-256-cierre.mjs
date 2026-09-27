// Cierre de #256 · composición compacta: auditoría por pantalla en PRODUCCIÓN.
//
// Recorre las pantallas del panel en la demo pública (dueño) y mide, para cada
// una: la identidad de página del shell (h1), si el contenido repite esa
// identidad (h2/h3 con el mismo texto — el problema de #256), si hay barra
// compacta (`[data-testid^="barra-"]` visible) y si desborda en 390. Deja una
// captura por pantalla para el cierre y para reportar faltantes.
//
//   node scripts/qa-256-cierre.mjs
//
// Evidencia: docs/qa/256-cierre/produccion/ (capturas + resultado.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/256-cierre/produccion')
mkdirSync(SALIDA, { recursive: true })

// Cierre (vendedor) + pantallas del panel para reportar faltantes.
const PANTALLAS = [
  ['/pos', 'pos', 'vendedor'],
  ['/clientes', 'clientes', 'vendedor'],
  ['/productos', 'productos', 'vendedor'],
  ['/pedidos', 'pedidos', 'vendedor'],
  ['/delivery', 'delivery', 'vendedor'],
  ['/promociones', 'promociones', 'vendedor'],
  ['/cotizaciones', 'cotizaciones', 'vendedor'],
  ['/plantillas', 'plantillas', 'vendedor'],
  ['/resumen', 'resumen', 'dueno'],
  ['/inventario', 'inventario', 'dueno'],
  ['/compras', 'compras', 'dueno'],
  ['/abastecimiento', 'abastecimiento', 'dueno'],
  ['/compras-centro', 'compras-centro', 'dueno'],
  ['/preparacion', 'preparacion', 'dueno'],
  ['/preparar-lote', 'preparar-lote', 'dueno'],
  ['/recepcion', 'recepcion', 'dueno'],
  ['/metricas', 'metricas', 'dueno'],
  ['/servicio', 'servicio', 'dueno'],
  ['/garantias', 'garantias', 'dueno'],
  ['/autorizaciones', 'autorizaciones', 'dueno'],
  ['/analisis', 'analisis', 'dueno'],
  ['/finanzas', 'finanzas', 'dueno'],
  ['/precios', 'precios', 'dueno'],
  ['/trade-in', 'trade-in', 'dueno'],
  ['/celulares', 'celulares', 'dueno'],
  ['/comparador', 'comparador', 'dueno'],
  ['/mi-cuenta', 'mi-cuenta', 'personal'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await esperar(1200)
await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await esperar(1200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guia.getByRole('button', { name: 'Cerrar' }).click()
}
const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''

const medir = () => page.evaluate(() => {
  const normalizar = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const h1 = [...document.querySelectorAll('h1')].map((n) => n.textContent).filter((t) => t && t.trim())[0] || ''
  const titulos = [...document.querySelectorAll('main h2, main h3')].map((n) => n.textContent.trim()).filter(Boolean)
  const duplicados = titulos.filter((t) => normalizar(t) === normalizar(h1))
  const barras = [...document.querySelectorAll('[data-testid^="barra-"]')].filter((n) => n.offsetParent !== null)
  return {
    tituloShell: h1.trim(),
    titulosContenido: titulos.slice(0, 6),
    identidadDuplicada: duplicados,
    barra: barras.map((n) => n.getAttribute('data-testid')),
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }
})

const resultados = []
for (const [ruta, slug, rol] of PANTALLAS) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"], [data-testid="ops-tablero"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  await esperar(1300)
  let desktop
  try {
    desktop = await medir()
  } catch {
    desktop = { tituloShell: '', titulosContenido: [], identidadDuplicada: [], barra: [], desborde: false }
  }
  await page.screenshot({ path: join(SALIDA, `${slug}-claro-desktop.jpg`), type: 'jpeg', quality: 72 })

  await page.setViewportSize({ width: 390, height: 844 })
  await esperar(700)
  let mobile
  try {
    mobile = await medir()
  } catch {
    mobile = { desborde: false }
  }
  await page.screenshot({ path: join(SALIDA, `${slug}-claro-mobile.jpg`), type: 'jpeg', quality: 72 })

  resultados.push({ ruta, slug, rol, ...desktop, desbordeMobile: Boolean(mobile.desborde) })
  console.log(`[256-cierre] ${slug.padEnd(16)} barra=${desktop.barra.length ? desktop.barra.join(',') : '—'} · identidad duplicada=${desktop.identidadDuplicada.length ? desktop.identidadDuplicada.join(' | ') : 'no'} · móvil desborde=${mobile.desborde ? 'SÍ' : 'no'}`)
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)

// ── Pase del vendedor: el cotizador de Trade-In es su vista (el dueño ve la
// pipeline). Cubre el único secundario que no se ve desde el demo de dueño.
const ctxVendedor = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const pageVendedor = await ctxVendedor.newPage()
await pageVendedor.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await esperar(1200)
await pageVendedor.getByRole('button', { name: /Entrar como Vendedor/ }).first().click()
await pageVendedor.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await esperar(1200)
const guiaV = pageVendedor.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guiaV.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guiaV.getByRole('button', { name: 'Cerrar' }).click()
}
const cotizador = {}
for (const [tema, modo, vista, ancho, alto] of [['claro', 'light', 'desktop', 1280, 900], ['oscuro', 'dark', 'desktop', 1280, 900], ['claro', 'light', 'mobile', 390, 844]]) {
  await pageVendedor.setViewportSize({ width: ancho, height: alto })
  await pageVendedor.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  await pageVendedor.goto(`${BASE}/trade-in`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await pageVendedor.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  await esperar(1200)
  cotizador[`${vista}-${tema}`] = await pageVendedor.evaluate(() => ({
    barra: [...document.querySelectorAll('[data-testid^="barra-"]')].filter((n) => n.offsetParent !== null).map((n) => n.getAttribute('data-testid')),
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }))
  await pageVendedor.screenshot({ path: join(SALIDA, `trade-in-vendedor-${vista}-${tema}.jpg`), type: 'jpeg', quality: 72 })
  console.log(`[256-cierre] trade-in vendedor ${vista}-${tema}: barra=${cotizador[`${vista}-${tema}`].barra.join(',') || '—'} · desborde=${cotizador[`${vista}-${tema}`].desborde ? 'SÍ' : 'no'}`)
}
writeFileSync(join(SALIDA, 'resultado-vendedor.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), cotizador }, null, 2)}\n`)
await ctxVendedor.close()

await browser.close()
const sinBarra = resultados.filter((r) => !r.barra.length)
const duplican = resultados.filter((r) => r.identidadDuplicada.length)
console.log(`\n[256-cierre] ${BASE} · v${version || '?'} · ${resultados.length} pantallas · sin barra: ${sinBarra.length} · identidad duplicada: ${duplican.length} · desborde móvil: ${resultados.filter((r) => r.desbordeMobile).length}`)
