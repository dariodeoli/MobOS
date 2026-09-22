// Verificación post-deploy del dominio IMPRESIÓN (demo + producción).
//
// Cubre, contra el deploy desplegado:
//  1. Comprobante en el demo: nivel con iconos (#208), formato por defecto 80 mm
//     (#207), «último usado» recordado entre pantallas (#209), PDFs por tamaño
//     y capturas.
//  2. Etiqueta de unidad (#220): acción en la ficha, aviso honesto del demo y
//     contenido en el bundle (modelo, identificador, IMEI/serial legible, QR y
//     código de barras).
//  3. Bundle de producción: se navegan las pantallas y se revisan TODOS los
//     assets cargados (los chunks lazy no están en /login).
//  4. Reporte en docs/qa/impresion-prod/ (resultados.json + REPORTE.md +
//     capturas). #17/#96 (prueba física de la Mac) siguen en manos de Dario.
//
// Uso: node scripts/qa-impresion-prod-dominio.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/impresion-prod')
mkdirSync(SALIDA, { recursive: true })

const MM = 3.7795275591
const FORMATOS = [
  { id: 'a4', radio: 'Formato A4', etiqueta: 'A4', anchoMm: 210, margen: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } },
  { id: 'thermal-80', radio: 'Formato 80 mm', etiqueta: '80 mm', anchoMm: 80, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
  { id: 'thermal-58', radio: 'Formato 58 mm', etiqueta: '58 mm', anchoMm: 58, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
]

// Marcas del dominio impresión que tienen que viajar en los assets cargados.
const MARCAS = {
  'último usado (#209)': ['mobos:impresion:ultimo'],
  'etiqueta de unidad (#220)': [
    'ETIQUETA DE UNIDAD',
    'IDENTIFICADOR',
    'IMEI / SERIAL',
    'CÓDIGO QR',
    'CÓDIGO DE UNIDAD',
    'class="bloque"',
    'Reimprimir etiqueta',
  ],
  'comprobante/niveles (#206/#208)': ['Recibí conforme (firma)', 'Aclaración: ______________________________'],
  'IMEI legible (#203)': ['no acredita propiedad ni reemplaza la'],
}

const resultados = []
const llamadasApi = []
const llamadasImpresion = []
const erroresConsola = []
const assets = new Set()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (/\/assets\/.+\.js$/.test(url)) assets.add(url)
  if (url.includes('/src/')) return
  if (!/\/api\//.test(url)) return
  const ruta = `${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`
  llamadasApi.push(ruta)
  if (/\/api\/print/.test(ruta)) llamadasImpresion.push(ruta)
})

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre, { completa = false } = {}) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72, fullPage: completa })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(async (n, opciones) => { const archivo = await captura(n, opciones); capturas.push(archivo); return archivo })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

const htmlDeIframe = (iframe) => iframe.evaluate((el) => el.contentDocument?.documentElement?.outerHTML || el.getAttribute('srcdoc') || '')

async function pdfYCaptura(nombre, html, formato) {
  const hoja = await ctx.newPage()
  try {
    const anchoVista = formato.anchoMm === 210 ? Math.round(178 * MM) : Math.round(formato.anchoMm * MM)
    await hoja.setViewportSize({ width: anchoVista, height: 800 })
    await hoja.emulateMedia({ media: 'print' })
    await hoja.setContent(html, { waitUntil: 'load' })
    await hoja.waitForTimeout(250)
    const opciones = { path: join(SALIDA, `${nombre}.pdf`), printBackground: true, margin: formato.margen }
    if (formato.id === 'a4') {
      opciones.format = 'A4'
    } else {
      const altoPx = await hoja.locator('body').evaluate((body) => body.getBoundingClientRect().height)
      opciones.width = `${formato.anchoMm}mm`
      opciones.height = `${Math.round(((altoPx / MM) + 5 + 5 + 2) * 10) / 10}mm`
    }
    await hoja.pdf(opciones)
    await hoja.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
  } finally {
    await hoja.close()
  }
}

// Estado de un control: radio (aria-checked) o select (#208 introdujo radios).
async function estadoControl({ radio, ariaLabel }) {
  const boton = page.getByRole('radio', { name: radio })
  if (await boton.count()) return (await boton.getAttribute('aria-checked')) === 'true'
  const select = page.getByLabel(ariaLabel)
  if ((await select.count()) && (await select.evaluate((el) => el.tagName)) === 'SELECT') return (await select.inputValue()) === radio
  throw new Error(`no encontré el control «${ariaLabel}»`)
}

async function elegirControl({ radio, ariaLabel }) {
  const boton = page.getByRole('radio', { name: radio })
  if (await boton.count()) { if ((await boton.getAttribute('aria-checked')) !== 'true') await boton.click(); return }
  const select = page.getByLabel(ariaLabel)
  if ((await select.count()) && (await select.evaluate((el) => el.tagName)) === 'SELECT') { await select.selectOption(radio); return }
  throw new Error(`no encontré el control «${ariaLabel}»`)
}

let versionProduccion = ''
await paso('demo: comprobante con 80 mm por defecto e iconos en los niveles', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1500)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''

  // Venta demo para tener un comprobante con los tres formatos.
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  await page.getByLabel(/Nombre.*cliente|Nombre, teléfono/).first().fill('QA Impresión 136')
  const buscar = page.getByPlaceholder('Buscar producto…')
  for (const producto of ['Funda MagSafe', 'Cargador USB-C 20W']) {
    await buscar.fill(producto)
    await esperar(900)
    await page.getByRole('button', { name: new RegExp(producto.split(' ')[0]) }).filter({ hasText: producto }).first().click()
    await esperar(500)
  }
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  const imprimir = page.getByRole('button', { name: 'Imprimir comprobante' })
  await imprimir.waitFor({ state: 'visible', timeout: 8000 })
  await imprimir.click()
  const iframe = page.locator('iframe[title="Vista previa del comprobante"]')
  await iframe.waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1500)
  await shot('comprobante-modal-pos')

  // Niveles con iconos (#208) y formato por defecto 80 mm (#207).
  const niveles = ['Rápido', 'Completo', 'Detallado']
  for (const nivel of niveles) {
    const boton = page.getByRole('radio', { name: `Comprobante ${nivel}` })
    if (!(await boton.count())) throw new Error(`falta el nivel ${nivel}`)
    if (!(await boton.locator('svg').count())) throw new Error(`el nivel ${nivel} no tiene icono`)
  }
  if (!(await estadoControl({ radio: 'Formato 80 mm', ariaLabel: 'Formato de impresión' }))) throw new Error('el formato por defecto no es 80 mm')
  if (!(await estadoControl({ radio: 'Comprobante Rápido', ariaLabel: 'Tipo de comprobante' }))) throw new Error('el nivel por defecto no es Rápido')

  // PDFs por tamaño del comprobante completo, con captura de cada vista.
  for (const formato of FORMATOS) {
    await elegirControl({ radio: `Formato ${formato.etiqueta}`, ariaLabel: 'Formato de impresión' })
    await esperar(1500)
    await pdfYCaptura(`comprobante-demo-${formato.id}`, await htmlDeIframe(iframe), formato)
    if (formato.id === 'thermal-80') await shot('comprobante-demo-80')
  }
  return `v${versionProduccion} · niveles con icono y 80 mm por defecto`
})

await paso('demo: «último usado» recordado entre pantallas (#209)', async (shot) => {
  await elegirControl({ radio: 'Comprobante Detallado', ariaLabel: 'Tipo de comprobante' })
  await elegirControl({ radio: 'Formato 58 mm', ariaLabel: 'Formato de impresión' })
  await esperar(1200)
  // «Descargar PDF» registra la preferencia (nivel + formato del tipo).
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  await esperar(800)
  const guardado = await page.evaluate(() => ({
    nivel: globalThis.localStorage.getItem('mobos:comprobante:nivel'),
    formato: globalThis.localStorage.getItem('mobos:comprobante:formato'),
    ultimo: JSON.parse(globalThis.localStorage.getItem('mobos:impresion:ultimo') || '{}'),
  }))
  if (guardado.nivel !== 'detallado' || guardado.formato !== 'thermal-58') throw new Error(`preferencia no guardada: ${JSON.stringify(guardado)}`)
  if (guardado.ultimo?.comprobante?.formato !== 'thermal-58') throw new Error('el último formato del tipo no quedó recordado')
  await page.keyboard.press('Escape')
  await shot('comprobante-preferencia-guardada')

  // Otra pantalla: la página del pedido abre con lo último usado.
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('pedido-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await fila.click()
  await esperar(2000)
  await page.getByRole('button', { name: 'Imprimir comprobante' }).first().click()
  await page.locator('iframe[title="Vista previa del comprobante"]').waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1500)
  const detallado = await estadoControl({ radio: 'Comprobante Detallado', ariaLabel: 'Tipo de comprobante' })
  const cincuentaYOcho = await estadoControl({ radio: 'Formato 58 mm', ariaLabel: 'Formato de impresión' })
  if (!detallado || !cincuentaYOcho) throw new Error('la página del pedido no recordó el último usado')
  await shot('pedido-comprobante-ultimo-usado')
  return 'nivel y formato recordados en otra pantalla'
})

await paso('demo: etiqueta de unidad desde la ficha (#220)', async (shot) => {
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const filas = page.getByTestId('inventario-fila')
  if (!(await filas.count())) throw new Error('el demo no muestra unidades de inventario')
  await shot('inventario-demo')
  await filas.first().click()
  await esperar(1200)
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 10000 })
  const etiqueta = ficha.getByRole('button', { name: 'Etiqueta', exact: true })
  if (!(await etiqueta.count())) throw new Error('la ficha no ofrece la acción «Etiqueta»')
  await etiqueta.click()
  await esperar(1200)
  await shot('etiqueta-demo-aviso')
  const texto = await ficha.innerText().catch(() => '')
  if (!/no está disponible en el demo|Modo demo/i.test(texto)) throw new Error('el demo no avisó que la impresión es ficticia')
  if (await page.locator('iframe[aria-hidden="true"]').count()) throw new Error('el demo abrió el diálogo de impresión')
  return 'ficha con acción de etiqueta y aviso de demo'
})

await paso('producción: contenido del dominio en los assets cargados', async () => {
  // Se navegan las pantallas de impresión y se juntan TODOS los assets (los
  // chunks lazy no están en /login).
  for (const ruta of ['/resumen', '/pos', '/inventario/unidades', '/configuracion/impresoras']) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await esperar(1500)
  }
  const respuesta = await fetch(`${BASE}/login`, { redirect: 'follow' })
  if (!respuesta.ok) throw new Error(`/login respondió ${respuesta.status}`)
  const cuerpo = await respuesta.text()
  for (const match of cuerpo.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  for (const match of cuerpo.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) assets.add(new URL(match[1], BASE).href)
  const bundles = await Promise.all([...assets].map(async (fuente) => (await fetch(fuente)).text()))
  const codigo = bundles.join('\n')
  const faltantes = []
  for (const [grupo, marcas] of Object.entries(MARCAS)) {
    for (const marca of marcas) if (!codigo.includes(marca)) faltantes.push(`${grupo}: ${marca}`)
  }
  if (faltantes.length) throw new Error(`faltan marcas: ${faltantes.join(' · ')}`)
  return `${assets.size} assets · ${Object.values(MARCAS).flat().length} marcas del dominio presentes`
})

await paso('el demo no llama al API de impresión', async () => {
  if (llamadasImpresion.length) throw new Error(`llamadas: ${[...new Set(llamadasImpresion)].slice(0, 5).join(' | ')}`)
  return `0 llamadas a impresión · ${llamadasApi.length} al API general`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  llamadasImpresion: llamadasImpresion.length,
  erroresConsola: erroresConsola.length,
}

const lineasReporte = [
  `# Verificación post-deploy · dominio Impresión · v${versionProduccion || '?'}`,
  '',
  `- Base: ${BASE}`,
  `- Fecha: ${new Date().toISOString()}`,
  '',
  '## Resultado',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle || ''}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Marcas verificadas en los assets desplegados',
  '',
  ...Object.entries(MARCAS).map(([grupo, marcas]) => `- ${grupo}: ${marcas.join(' · ')}`),
  '',
  '## Pendiente en manos de Dario (prueba física)',
  '',
  '- #17 (agente launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): checklist `docs/IMPRESION-PRUEBA-FISICA.md`.',
  '',
  `Veredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${veredicto.llamadasImpresion} llamadas a impresión · ${veredicto.erroresConsola} errores de consola.`,
  '',
]

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  resultados,
  assets: [...assets],
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)
writeFileSync(join(SALIDA, 'REPORTE.md'), `${lineasReporte.join('\n')}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Impresión en producción: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${llamadasImpresion.length} llamadas a impresión · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
