// Verificación en producción de la unificación Resumen/Análisis (#171): el
// demo público es la UI desplegada (modo local, sin API real), así que se
// comprueba que el build publicado incluye las vistas unificadas, que el demo
// navega sin errores ni llamadas reales, y que los endpoints de métricas no
// filtran datos sin sesión. Los indicadores del servidor se validan aparte
// contra SQL (scripts/qa-171-metricas-servidor.mjs).
//
// Uso: QA_BASE_URL=https://app.moboss.online node scripts/qa-171-resumen-analisis-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API = (process.env.QA_API_URL || 'https://api.moboss.online').replace(/\/$/, '')
const SALIDA = join(RAIZ, 'docs/qa/171')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    await fn()
    resultados.push({ nombre, ok: true })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 200)}`)
  }
}

// ── 1) El build publicado incluye las vistas unificadas de #171 ─────────────
// El código se reparte en chunks por ruta: se rastrean el entry y sus
// referencias (dos niveles) y se buscan los textos de las vistas de #171.
async function contenidoDelBuild() {
  const html = await (await fetch(`${BASE}/demo`)).text()
  const entrada = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((fila) => new URL(fila[1], BASE).href)
  const vistos = new Set()
  const textos = [html]
  const pendientes = [...entrada]
  while (pendientes.length && vistos.size < 60) {
    const url = pendientes.shift()
    if (vistos.has(url)) continue
    vistos.add(url)
    const cuerpo = await (await fetch(url)).text()
    textos.push(cuerpo)
    for (const referencia of cuerpo.matchAll(/assets\/[A-Za-z0-9_.-]+\.js/g)) {
      const siguiente = new URL(referencia[0], BASE).href
      if (!vistos.has(siguiente)) pendientes.push(siguiente)
    }
  }
  return { contenido: textos.join('\n'), chunks: vistos.size }
}

await ver('El bundle de producción incluye los indicadores unificados', async () => {
  const { contenido, chunks } = await contenidoDelBuild()
  for (const texto of ['Stock valorizado', 'Curva ABC por venta', 'Cuentas con mayor ingreso', 'Diferencia de lotes', 'Curva ABC y antigüedad']) {
    expect(contenido.includes(texto), `el bundle (${chunks} chunks) no contiene «${texto}»`).toBe(true)
  }
  // Lote pendiente de este slot (avisos de portada + #209 FIN): se detecta con
  // una clave propia (`fin:gastos-tipo`), porque el texto del aviso de portada
  // es el mismo que ya usa Reportes y no se distingue en el bundle minificado.
  const lotePendiente = contenido.includes('fin:gastos-tipo')
  console.log(`INFO  lote de este slot (#209 FIN + aviso de portada) en el bundle desplegado: ${lotePendiente ? 'sí' : 'no (pendiente de integrar)'}`)
})

// ── 2) Los endpoints de métricas no responden sin sesión ────────────────────
await ver('Los endpoints de métricas exigen sesión en producción', async () => {
  const consultas = [
    `${API}/api/reports?from=2026-09-01&to=2026-09-21&groupBy=product`,
    `${API}/api/finance/reconciliation?from=2026-09-01&to=2026-09-21&soloResumen=1`,
  ]
  for (const url of consultas) {
    const respuesta = await fetch(url, { redirect: 'manual' })
    expect([401, 403, 302, 307].includes(respuesta.status), `${url} respondió ${respuesta.status}`).toBe(true)
    const cuerpo = await respuesta.text()
    expect(cuerpo.includes('totalPyg') || cuerpo.includes('confirmedPyg'), `${url} filtró métricas`).toBe(false)
  }
})

// ── 3) El demo desplegado navega sin errores ni llamadas reales ─────────────
const erroresConsola = []
const llamadasApi = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message}`))
page.on('request', (peticion) => { if (peticion.url().includes('/api/')) llamadasApi.push(peticion.url()) })

await ver('El demo entra por /demo y abre Resumen', async () => {
  await page.goto(`${BASE}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForLoadState('networkidle')
  await page.goto(`${BASE}/resumen`)
  await expect(page.getByText('Facturado').filter({ visible: true }).first()).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA, 'produccion-demo-resumen.jpg'), type: 'jpeg', quality: 70, fullPage: false })
})

await ver('El demo navega Análisis → Reportes y Ganancias', async () => {
  await page.goto(`${BASE}/analisis/reportes`)
  await expect(page.getByText(/datos reales/i).filter({ visible: true }).first()).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: join(SALIDA, 'produccion-demo-reportes.jpg'), type: 'jpeg', quality: 70 })
  await page.goto(`${BASE}/analisis/ganancias`)
  await expect(page.locator('[data-testid="ganancia-resultado"]')).toBeVisible({ timeout: 20000 })
})

await ver('El demo no consulta los endpoints reales de métricas', async () => {
  const metricas = llamadasApi.filter((url) => /\/api\/(reports|finance|reconciliation)/.test(url))
  expect(metricas, `llamadas: ${metricas.slice(0, 3).join(', ')}`).toEqual([])
})

await ver('El demo navega sin errores de consola propios', async () => {
  const RUIDO = /non-boolean attribute|Failed to load resource|ERR_CONNECTION_REFUSED|React Router Future Flag|ResizeObserver|favicon/i
  expect(erroresConsola.filter((texto) => !RUIDO.test(texto))).toEqual([])
})

writeFileSync(join(SALIDA, 'produccion.json'), JSON.stringify({ base: BASE, resultados, erroresConsola, llamadasApi }, null, 2))
await browser.close()

const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones de producción OK`)
if (fallos.length) process.exitCode = 1
