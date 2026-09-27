// Capturas antes/después de la composición compacta (#256) de Clientes, POS e
// Inventario: barra de módulo única (identidad + contexto + acciones) y
// métricas con alcance explícito (Tienda/Sucursal vs En pantalla).
//
//   node scripts/qa-256-composicion.mjs                       (producción: antes)
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-256-composicion.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/256-composicion/produccion')
mkdirSync(SALIDA, { recursive: true })

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

const medidas = {}
async function capturar(nombre) {
  await esperar(700)
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78 })
  console.log(`[256] ${nombre}.jpg`)
}

for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.getByTestId('cliente-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await capturar(`clientes-${tema}-desktop`)
  if (tema === 'claro') {
    medidas.clientes = await page.evaluate(() => {
      const resumen = document.querySelector('[data-testid="resumen-clientes"]')
      const textos = resumen ? [...resumen.querySelectorAll('p > span.font-semibold, p')].map((p) => p.textContent.trim()) : []
      return {
        barra: Boolean(document.querySelector('[data-testid="barra-clientes"]')),
        alcances: textos.filter((t) => /^(Tienda|En pantalla)$/.test(t)),
        tiles: resumen ? resumen.children.length : 0,
      }
    })
    console.log('[256] clientes:', JSON.stringify(medidas.clientes))
  }

  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.getByRole('heading', { name: 'Nueva venta' }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await capturar(`pos-${tema}-desktop`)
  if (tema === 'claro') {
    medidas.pos = await page.evaluate(() => ({
      barra: Boolean(document.querySelector('[data-testid="barra-pos"]')),
      bloquesGrandes: document.querySelectorAll('[data-testid="barra-pos"] span.grid.h-10').length,
    }))
    console.log('[256] pos:', JSON.stringify(medidas.pos))
  }

  await page.goto(`${BASE}/productos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.getByTestId('producto-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await capturar(`productos-${tema}-desktop`)
  if (tema === 'claro') {
    medidas.productos = await page.evaluate(() => {
      const resumen = document.querySelector('[data-testid="resumen-productos"]')
      const alcances = resumen ? [...resumen.querySelectorAll('p')].map((p) => p.textContent.trim()).filter((t) => /^(Tienda|En pantalla)$/.test(t)) : []
      return { barra: Boolean(document.querySelector('[data-testid="barra-productos"]')), tiles: resumen ? resumen.children.length : 0, alcances }
    })
    console.log('[256] productos:', JSON.stringify(medidas.productos))
  }

  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await capturar(`inventario-${tema}-desktop`)
  if (tema === 'claro') {
    medidas.inventario = await page.evaluate(() => {
      const resumen = document.querySelector('[data-testid="resumen-inventario"]')
      const alcances = resumen ? [...resumen.querySelectorAll('p')].map((p) => p.textContent.trim()).filter((t) => /^(Tienda|Sucursal|En pantalla)$/.test(t)) : []
      const tabs = document.querySelector('[data-testid="tabs-inventario"]')
      const labels = tabs ? [...tabs.querySelectorAll('button')].map((b) => b.textContent.trim()) : []
      return {
        barra: Boolean(document.querySelector('[data-testid="barra-inventario"]')),
        tiles: resumen ? resumen.children.length : 0,
        alcances,
        tabsConContador: labels.filter((t) => /\(\d+\)/.test(t)),
      }
    })
    console.log('[256] inventario:', JSON.stringify(medidas.inventario))
  }
}

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
await page.getByTestId('cliente-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
await capturar('clientes-claro-mobile')
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.getByRole('heading', { name: 'Nueva venta' }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
await capturar('pos-claro-mobile')
await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
await capturar('inventario-claro-mobile')
await page.goto(`${BASE}/productos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.getByTestId('producto-fila').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
await capturar('productos-claro-mobile')

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
console.log(`[256] ${BASE} · v${version || '?'} · capturas en ${SALIDA}`)
