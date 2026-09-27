// Verificación en PRODUCCIÓN del panel de métricas F6 (#250/#254): el chunk
// desplegado trae el panel, la API de métricas/alertas existe y (en el demo
// público, única sesión disponible sin credenciales) la vista responde. Falla
// en voz alta si el deploy todavía no trae F6.
//
// Uso: node scripts/qa-f6-metricas-produccion.mjs
// Salida: docs/qa/f6-metricas/produccion-<versión>/*.png + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API = (process.env.QA_API_URL || WEB.replace('app.', 'api.')).replace(/\/$/, '')

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

// El bundle desplegado: la versión viva y las piezas de F6 (el panel es un
// chunk lazy, así que se siguen los imports dinámicos desde la entrada).
const assets = async () => {
  const html = await (await fetch(`${WEB}/login`)).text()
  const fuentes = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((fila) => new URL(fila[1], WEB).href)
  const vistos = new Map()
  const cola = [...fuentes]
  while (cola.length) {
    const url = cola.shift()
    if (!url || vistos.has(url)) continue
    const texto = await (await fetch(url)).text()
    vistos.set(url, texto)
    for (const fila of texto.matchAll(/assets\/[A-Za-z0-9_-]+\.js/g)) {
      const hijo = new URL(fila[0], WEB).href
      if (!vistos.has(hijo)) cola.push(hijo)
    }
  }
  return [...vistos.values()].join('\n')
}

let bundle = ''
let versionDesplegada = ''

await ver('Producción responde y el bundle expone la versión', async () => {
  bundle = await assets()
  expect(bundle.length).toBeGreaterThan(1000)
  const versiones = [...new Set([...bundle.matchAll(/1\.0\.\d{2,3}/g)].map((fila) => fila[0]))].sort()
  versionDesplegada = versiones[versiones.length - 1] || ''
  expect(versionDesplegada, 'no se pudo leer la versión del bundle').toMatch(/^1\.0\.\d+/)
  return `v${versionDesplegada}`
})

const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/f6-metricas', `produccion-${versionDesplegada || 'desconocida'}`)
mkdirSync(SALIDA, { recursive: true })

await ver('El panel F6 está en el bundle desplegado', async () => {
  for (const texto of ['Métricas de abastecimiento', 'Rendimiento por proveedor', 'Tiempos de tránsito por ruta', 'Lotes atrasados', 'metricas-abastecimiento', 'metricas-tiempos-tabla', 'metricas-atrasados-tabla']) {
    if (!bundle.includes(texto)) throw new Error(`el bundle no trae «${texto}»`)
  }
  if (!bundle.includes('/metricas')) throw new Error('el bundle no trae la ruta /metricas')
  return '4 secciones + testids + ruta'
})

await ver('La API de F6 existe en producción (pide sesión)', async () => {
  for (const ruta of ['/api/supply/performance', '/api/supply/alerts']) {
    const response = await fetch(`${API}${ruta}`, { redirect: 'manual' })
    expect([401, 403], `${ruta} respondió ${response.status}`).toContain(response.status)
  }
  return 'performance y alerts → 401'
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Asuncion' })
const page = await ctx.newPage()

await ver('Demo: se entra como Dueño', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByRole('button', { name: 'Cerrar' }).click({ timeout: 5000 }).catch(() => {})
})

await ver('El menú Inventario trae «Métricas de abastecimiento»', async () => {
  await page.goto(`${WEB}/resumen`)
  const item = page.getByRole('button', { name: 'Métricas de abastecimiento', exact: true })
  if (!(await item.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Inventario', exact: true }).first().click().catch(() => {})
  }
  await expect(item).toBeVisible({ timeout: 20000 })
})

await ver('La vista /metricas abre y monta el panel (demo)', async () => {
  await page.goto(`${WEB}/metricas`)
  expect(new URL(page.url()).pathname, 'la vista no debe redirigir').toBe('/metricas')
  await expect(page.getByRole('heading', { name: 'Métricas de abastecimiento' })).toBeVisible({ timeout: 20000 })
  // En la demo no hay compras/recepciones: el panel lo dice en voz alta (el
  // testid `metricas-abastecimiento` queda para la sesión real, ya verificado
  // en el bundle).
  await expect(page.getByText('El rendimiento de proveedores y los tiempos de tránsito salen de las compras y recepciones de una cuenta real.')).toBeVisible()
  return `URL ${new URL(page.url()).pathname}`
})

await ver('Capturas del panel en producción', async () => {
  await page.screenshot({ path: join(SALIDA, 'f6-metricas-produccion-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(SALIDA, 'f6-metricas-produccion-mobile.png'), fullPage: true })
  // `globalThis` mantiene el lint de scripts (sin globals de navegador) en verde.
  const medida = await page.evaluate(() => ({ total: globalThis.document.documentElement.scrollWidth, visible: globalThis.document.documentElement.clientWidth }))
  expect(medida.total <= medida.visible + 1, 'sin scroll horizontal en mobile').toBe(true)
})

await browser.close()

const ok = resultados.filter((fila) => fila.ok).length
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ fecha: new Date().toISOString(), base: WEB, version: versionDesplegada, resultados }, null, 2)}\n`)
console.log(`\n${ok}/${resultados.length} verificaciones OK · capturas en ${SALIDA.replace(`${RAIZ}/`, '')}`)
if (resultados.some((fila) => !fila.ok)) process.exit(1)
