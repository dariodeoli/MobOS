// Verificación en producción de la activación F4 (#241): el v2 es el diseño
// por defecto y el selector «Volver al diseño anterior» funciona por
// dispositivo (ida y vuelta), con capturas de los dos estados.
//
//   node scripts/qa-241-f4-toggle-produccion.mjs
//   QA_BASE_URL=http://localhost:5175 QA_OUT=docs/qa/... node scripts/qa-241-f4-toggle-produccion.mjs
//
// Entra por la demo pública (sin credenciales). Evidencia:
// docs/qa/241-f4-toggle-produccion/ (capturas + resultados.json).
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/241-f4-toggle-produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
let capturas = 0
async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const caps = []
  try {
    const detalle = await fn(caps)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: caps })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 240)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: caps })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

// El shell expone `data-tema-v2` (1 = rediseño activo); si el host no lo
// tuviera, se cae al localStorage y a la clase `.tema-v2`.
const estadoTema = (page) => page.evaluate(() => {
  const shell = document.querySelector('[data-testid="shell"]')
  const attr = shell?.getAttribute('data-tema-v2') ?? null
  const clase = Boolean(shell?.classList.contains('tema-v2'))
  const clave = (() => { try { return localStorage.getItem('mobos:tema-v2') } catch { return null } })()
  return { attr, clase, clave }
})

const esperarTema = async (page, esperado) => {
  const buscado = esperado ? '1' : '0'
  for (let intento = 0; intento < 40; intento += 1) {
    const estado = await estadoTema(page)
    const activo = estado.attr ? estado.attr === buscado : esperado ? estado.clase : !estado.clase
    // El default v2 puede no tener clave (la decide el entorno); el opt-out y
    // la vuelta sí la escriben.
    const claveOk = esperado ? (estado.clave === null || estado.clave === '1') : estado.clave === '0'
    if (activo && claveOk) return estado
    await page.waitForTimeout(250)
  }
  throw new Error(`el shell no quedó en v2=${buscado}: ${JSON.stringify(await estadoTema(page))}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const erroresConsola = []
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 160)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 160)}`))

let version = ''
await paso('entrar a la demo en producción', async (caps) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
    await guia.getByRole('button', { name: 'Cerrar' }).click()
  }
  const texto = await page.locator('body').innerText()
  version = (texto.match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''
  caps.push(await shot(page, 'v2-default-resumen-claro'))
  return `v${version || '?'}`
})

await paso('el default es v2 (claro y oscuro, desktop y mobile)', async (caps) => {
  const estado = await esperarTema(page, true)
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Facturado').first().waitFor({ timeout: 25_000 })
    caps.push(await shot(page, `v2-default-resumen-${tema}-desktop`))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Nueva venta' }).waitFor({ timeout: 25_000 })
    caps.push(await shot(page, `v2-default-pos-${tema}-mobile`))
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  return `shell v2=${estado.attr ?? estado.clase} · clave ${estado.clave ?? 'sin clave'}`
})

await paso('el toggle de vuelta al diseño anterior funciona y se recuerda', async (caps) => {
  await page.goto(`${BASE}/mi-cuenta`, { waitUntil: 'domcontentloaded' })
  const volver = page.getByLabel('Volver al diseño anterior')
  await volver.waitFor({ timeout: 25_000 })
  caps.push(await shot(page, 'preferencias-selector'))
  await volver.check()
  const anterior = await esperarTema(page, false)
  // Mismo tema claro que el par del default, para comparar diseño contra diseño.
  await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Facturado').first().waitFor({ timeout: 25_000 })
  caps.push(await shot(page, 'diseno-anterior-resumen-claro'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Nueva venta' }).waitFor({ timeout: 25_000 })
  caps.push(await shot(page, 'diseno-anterior-pos-claro-mobile'))
  // Se recuerda al recargar (es del dispositivo).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await esperarTema(page, false)
  return `shell anterior=${anterior.attr ?? anterior.clase} · clave ${anterior.clave ?? 'sin clave'}`
})

await paso('volver al rediseño deja todo como estaba', async (caps) => {
  await page.goto(`${BASE}/mi-cuenta`, { waitUntil: 'domcontentloaded' })
  const volver = page.getByLabel('Volver al diseño anterior')
  await volver.waitFor({ timeout: 25_000 })
  await volver.uncheck()
  const estado = await esperarTema(page, true)
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Facturado').first().waitFor({ timeout: 25_000 })
  caps.push(await shot(page, 'v2-vuelta-resumen-claro'))
  return `shell v2=${estado.attr ?? estado.clase} · clave ${estado.clave ?? 'sin clave'}`
})

await paso('rutas clave siguen funcionando', async () => {
  await page.setViewportSize({ width: 1280, height: 900 })
  // El título de la vista va en el h1 del shell (visible en desktop y mobile).
  const rutas = [
    ['/pos', 'POS'],
    ['/inventario/unidades', 'Unidades'],
    ['/ayuda/ayuda', 'Ayuda'],
    ['/configuracion/mi-cuenta', 'Mi cuenta'],
  ]
  for (const [ruta, titulo] of rutas) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').filter({ hasText: titulo }).first().waitFor({ timeout: 25_000 })
  }
  return rutas.map(([ruta]) => ruta).join(' · ')
})

const resumen = {
  verificado: new Date().toISOString(),
  base: BASE,
  version,
  erroresConsola,
  resultados,
  resumen: {
    pasos: resultados.length,
    ok: resultados.filter((r) => r.estado === 'ok').length,
    fallos: resultados.filter((r) => r.estado === 'fallo').length,
  },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resumen, null, 2)}\n`)
console.log(`\n${resumen.resumen.ok}/${resumen.resumen.pasos} pasos OK · errores de consola: ${erroresConsola.length}`)

await browser.close()
if (resumen.resumen.fallos) process.exitCode = 1
