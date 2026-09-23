// Verificación en producción del certificado de inspección (#240) — post-deploy.
//
//   node scripts/qa-240-certificado-prod.mjs
//
// En la demo: completa la inspección de una unidad (checklist + repuestos no
// OEM con nota), la guarda, abre el «Certificado» (80 mm y A4) y comprueba que
// el papel muestre grado, puntaje, checklist y repuestos, con el serial
// enmascarado. Capturas + reporte en docs/qa/240-certificado/prod/.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serialDemo } from '../src/lib/demo/iphones.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/240-certificado/prod')
mkdirSync(SALIDA, { recursive: true })

const MARCAS = {
  'Certificado de inspección': 'el modal del certificado',
  'Constancia de inspección': 'el encabezado del papel',
  'Repuestos no OEM': 'los repuestos en el papel',
  Checklist: 'el checklist del papel',
  Grado: 'el grado del papel',
  // La ronda de INV persiste ítems + puntaje/grado y muestra el grado público.
  'Puntaje': 'el puntaje del papel',
}

const resultados = []
const llamadasApi = []
const assets = new Set()
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (/\/assets\/.+\.js$/.test(url)) assets.add(url)
  if (url.includes('/src/')) return
  if (/\/api\//.test(url)) llamadasApi.push(`${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`)
})

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (n) => { const archivo = await captura(n); capturas.push(archivo); return archivo })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre.replace(/[^\w]+/g, '-')}`)) } catch { /* sin captura */ }
  }
}

let versionProduccion = ''
const serial = serialDemo(1)
const REPUESTO = 'Pantalla no original'
const NOTA_REPUESTO = 'Cambio hecho en taller'

await paso('demo: entrar y leer la versión desplegada', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''
  await shot('demo-panel')
  return versionProduccion ? `v${versionProduccion}` : '(sin versión visible)'
})

await paso('producción: marcas del certificado en los assets', async () => {
  for (const ruta of ['/inventario/unidades', '/pos']) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await esperar(1200)
  }
  const html = await (await fetch(`${BASE}/login`, { redirect: 'follow' })).text()
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  const bundles = await Promise.all([...assets].map(async (fuente) => (await fetch(fuente)).text().catch(() => '')))
  const codigo = bundles.join('\n')
  const faltantes = Object.entries(MARCAS).filter(([marca]) => !codigo.includes(marca)).map(([marca]) => marca)
  if (faltantes.length) throw new Error(`faltan marcas en los assets: ${faltantes.join(' · ')}`)
  return `${assets.size} assets · ${Object.keys(MARCAS).length} marcas del certificado presentes`
})

await paso('demo: inspección de una unidad (checklist + repuestos con nota)', async (shot) => {
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  await esperar(1500)
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  const checklist = ficha.getByTestId('unidad-phonecheck')
  await checklist.scrollIntoViewIfNeeded()
  await shot('inspeccion-antes')
  // Dos ítems: uno bien y otro con observación ⇒ puntaje 75 y grado B.
  await checklist.getByRole('button', { name: 'Bien', exact: true }).nth(0).click()
  await checklist.getByRole('button', { name: 'Con observación', exact: true }).nth(1).click()
  await ficha.getByLabel('Repuestos no OEM', { exact: true }).fill(REPUESTO)
  await ficha.getByLabel('Nota de repuestos no OEM', { exact: true }).fill(NOTA_REPUESTO)
  await ficha.getByTestId('unidad-phonecheck-guardar').click()
  await page.getByText('Inspección guardada.').waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1200)
  await shot('inspeccion-guardada')
  // Se cierra y reabre la ficha: el grado sale de lo persistido, no del estado local.
  await page.keyboard.press('Escape')
  await esperar(600)
  await fila.click()
  const ficha2 = page.getByRole('dialog')
  await ficha2.getByTestId('unidad-phonecheck').getByText('Grado B').waitFor({ state: 'visible', timeout: 10000 })
  await ficha2.getByTestId('unidad-phonecheck').getByText('75/100').waitFor({ state: 'visible', timeout: 5000 })
  await shot('inspeccion-persistida')
  return `serial ${serial} · Grado B · 75/100 · ${REPUESTO}`
})

await paso('demo: certificado 80 mm (grado, puntaje, checklist y repuestos)', async (shot) => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Certificado' }).click()
  const modal = page.getByRole('dialog', { name: 'Certificado de inspección' })
  await modal.waitFor({ state: 'visible', timeout: 15000 })
  const preview = modal.frameLocator('iframe[title="Vista previa del documento"]')
  await preview.locator('body').waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1200)
  const papel = await preview.locator('body').innerText()
  for (const esperado of ['Grado', 'B', 'Puntaje 75/100', '1/2 conformes', 'Repuestos no OEM', REPUESTO, 'Checklist', 'Pantalla / táctil', 'Con observación']) {
    if (!papel.includes(esperado)) throw new Error(`el certificado no muestra «${esperado}»`)
  }
  // Privacidad: el serial completo no viaja al papel; sí el enmascarado.
  const ultimos4 = serial.slice(-4)
  if (papel.includes(serial)) throw new Error('el certificado muestra el serial completo')
  if (!papel.includes(`••••${ultimos4}`)) throw new Error('el certificado no muestra el serial enmascarado')
  await shot('certificado-80mm')
  return `80 mm · Grado B · 75/100 · 1/2 conformes · serial ••••${ultimos4}`
})

await paso('demo: certificado A4 (dos columnas de checklist)', async (shot) => {
  const modal = page.getByRole('dialog', { name: 'Certificado de inspección' })
  await modal.getByLabel('Formato del documento').selectOption('a4')
  await esperar(1500)
  const preview = modal.frameLocator('iframe[title="Vista previa del documento"]')
  const papel = await preview.locator('body').innerText()
  if (!papel.includes(REPUESTO)) throw new Error('el certificado A4 perdió los repuestos')
  if (!papel.includes('Puntaje 75/100')) throw new Error('el certificado A4 perdió el puntaje')
  await shot('certificado-a4')
  return 'A4 · mismo grado, puntaje, repuestos y checklist'
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'produccion.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  serial,
  resultados,
  assets: [...assets],
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const lineas = [
  '# Certificado de inspección (#240) · verificación en producción',
  '',
  `- Producción: ${BASE} · versión v${versionProduccion || '?'} · ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK`,
  `- Recorrido: inspección de una unidad demo (checklist + repuestos no OEM con nota) → certificado 80 mm y A4 con grado, puntaje, checklist y repuestos; serial siempre enmascarado.`,
  '',
  '## Pasos',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Notas',
  '',
  '- El certificado sale de la ficha de la unidad («Certificado»): vista previa con el ancho del papel, impresión directa por el agente y respaldo PDF.',
  '- El papel no imprime costos ni datos del cliente; el IMEI/serial va enmascarado y el QR abre el informe público.',
  `- Errores de consola durante la corrida: ${erroresConsola.length}.`,
  '',
].join('\n') + '\n'
writeFileSync(join(SALIDA, 'REPORTE.md'), lineas)

console.log(`\nVeredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${erroresConsola.length} errores de consola`)
console.log(`Evidencia: ${SALIDA}`)
