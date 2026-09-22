// Recorrido funcional de producción (#185) — dominio Impresión: comprobantes y
// PDFs dentro de la épica POS/finanzas.
//
// Playwright headless contra la demo anónima de producción:
//  1. POS: venta demo → comprobante en los 3 niveles × A4/80/58, con PDF por
//     tamaño, capturas y verificación de contenido (ítems, totales, QR, leyenda
//     no fiscal).
//  2. Pedido: comprobante desde la página del pedido (formatos y PDF).
//  3. Finanzas: Resumen → Imprimir resumen (A4 ejecutivo + 58/80) con PDF y
//     captura.
//  4. «Descargar PDF» (camino del diálogo): el HTML imprimible llega al iframe
//     oculto, sin ventanas ni diálogo en headless.
//  5. Reporte en docs/qa/185-comprobantes-pdf/ (PDFs + capturas +
//     resultados.json + REPORTE.md). La cola/monitor de impresión ya está en
//     docs/qa/185-impresion; #17/#96 (prueba física) siguen en manos de Dario.
//
// Uso: node scripts/qa-185-comprobantes-pdf.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/185-comprobantes-pdf')
mkdirSync(SALIDA, { recursive: true })

const MM = 3.7795275591
const NIVELES = ['rapido', 'completo', 'detallado']
const ETIQUETA_NIVEL = { rapido: 'Rápido', completo: 'Completo', detallado: 'Detallado' }
const FORMATOS = [
  { id: 'a4', etiqueta: 'A4', anchoMm: 210, margen: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } },
  { id: 'thermal-80', etiqueta: '80 mm', anchoMm: 80, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
  { id: 'thermal-58', etiqueta: '58 mm', anchoMm: 58, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
]

const resultados = []
const llamadasApi = []
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (url.includes('/src/')) return
  if (/\/api\//.test(url)) llamadasApi.push(`${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`)
})

const esperar = (ms) => page.waitForTimeout(ms)
let contador = 0
async function captura(nombre, { completa = false } = {}) {
  contador += 1
  const limpio = String(nombre).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  const archivo = `${String(contador).padStart(2, '0')}-${limpio}.jpg`
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

// `radio` es el nombre accesible del botón (#208) y `valor` el value del
// <select> (#206/#146 cuando la pantalla todavía usa select nativo).
async function estadoControl({ radio, ariaLabel, valor }) {
  const boton = page.getByRole('radio', { name: radio })
  if (await boton.count()) return (await boton.getAttribute('aria-checked')) === 'true'
  const select = page.getByLabel(ariaLabel)
  if ((await select.count()) && (await select.evaluate((el) => el.tagName)) === 'SELECT') return (await select.inputValue()) === valor
  throw new Error(`no encontré el control «${ariaLabel}»`)
}

async function elegirControl({ radio, ariaLabel, valor }) {
  const boton = page.getByRole('radio', { name: radio })
  if (await boton.count()) { if ((await boton.getAttribute('aria-checked')) !== 'true') await boton.click(); return }
  const select = page.getByLabel(ariaLabel)
  if ((await select.count()) && (await select.evaluate((el) => el.tagName)) === 'SELECT') { await select.selectOption(valor ?? radio); return }
  throw new Error(`no encontré el control «${ariaLabel}»`)
}

let versionProduccion = ''
await paso('entrada a la demo como dueño', async (shot) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const texto = await page.locator('body').innerText()
  await shot('acceso-demo')
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = version ? version[1] : ''
  await shot('panel-demo')
  return `versión ${versionProduccion || '?'} · perfiles demo: ${/Vendedor/.test(texto) && /Dueño/.test(texto)}`
})

await paso('POS: comprobante con ítems en los 3 niveles × A4/80/58 (PDF por tamaño)', async (shot) => {
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  await page.getByLabel(/Nombre.*cliente|Nombre, teléfono/).first().fill('QA Comprobantes 185')
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

  let generados = 0
  for (const nivel of NIVELES) {
    for (const formato of FORMATOS) {
      const htmlAntes = await htmlDeIframe(iframe)
      let cambio = false
      if (!(await estadoControl({ radio: `Comprobante ${ETIQUETA_NIVEL[nivel]}`, ariaLabel: 'Tipo de comprobante' }))) {
        await elegirControl({ radio: `Comprobante ${ETIQUETA_NIVEL[nivel]}`, ariaLabel: 'Tipo de comprobante' })
        cambio = true
      }
      if (!(await estadoControl({ radio: `Formato ${formato.etiqueta}`, ariaLabel: 'Formato de impresión', valor: formato.id }))) {
        await elegirControl({ radio: `Formato ${formato.etiqueta}`, ariaLabel: 'Formato de impresión', valor: formato.id })
        cambio = true
      }
      let html = htmlAntes
      if (cambio) {
        const hasta = Date.now() + 20000
        for (;;) {
          html = await htmlDeIframe(iframe)
          if (html && html !== htmlAntes) break
          if (Date.now() > hasta) throw new Error(`la vista previa no se actualizó (${nivel}/${formato.id})`)
          await esperar(150)
        }
      }
      // Contenido: ítems, totales, QR del nivel y leyenda no fiscal.
      for (const marca of [/Funda MagSafe/i, /Cargador USB-C 20W/i, /total/i, /Documento no fiscal/i, /saldo pendiente/i]) {
        if (!marca.test(html)) throw new Error(`${nivel}/${formato.id}: falta ${marca}`)
      }
      if (!/qr|QRCode|data:image\/png/i.test(html) && !/Seguimiento/.test(html)) throw new Error(`${nivel}/${formato.id}: sin QR ni enlace`)
      await pdfYCaptura(`comprobante-${nivel}-${formato.id}`, html, formato)
      generados += 1
      if (nivel === 'completo') await shot(`comprobante-completo-${formato.id}`)
    }
  }
  return `${generados} PDFs (3 niveles × 3 tamaños) con ítems, totales, QR y leyenda`
})

await paso('POS: «Descargar PDF» llega al iframe imprimible (sin diálogo en headless)', async (shot) => {
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  await esperar(1000)
  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 8000 })
  const contenido = await marco.contentFrame().locator('body').innerText().catch(() => '')
  await shot('comprobante-descargar-pdf')
  if (!/Comprobante de compra|Documento no fiscal/.test(contenido)) throw new Error(`el PDF no recibió el HTML imprimible: ${contenido.slice(0, 80)}`)
  if (!(await page.locator('iframe[title="Vista previa del comprobante"]').count())) throw new Error('se perdió la vista previa')
  return `iframe imprimible con ${contenido.replace(/\s+/g, ' ').slice(0, 80)}…`
})

await paso('pedido: comprobante desde la página del pedido', async (shot) => {
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('pedido-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  await fila.click()
  await esperar(2000)
  await page.getByRole('button', { name: 'Imprimir comprobante' }).first().click()
  const iframe = page.locator('iframe[title="Vista previa del comprobante"]')
  await iframe.waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1500)
  await shot('pedido-comprobante-modal')

  // Formatos del pedido (80 mm primero, #207) y PDF en 80 mm.
  for (const etiqueta of ['80 mm', 'A4', '58 mm']) {
    if (!(await page.getByRole('radio', { name: `Formato ${etiqueta}` }).count())) throw new Error(`la página del pedido no ofrece ${etiqueta}`)
  }
  await elegirControl({ radio: 'Formato 80 mm', ariaLabel: 'Formato de impresión', valor: 'thermal-80' })
  await esperar(1500)
  const html = await htmlDeIframe(iframe)
  if (!/Comprobante de compra|Documento no fiscal/.test(html)) throw new Error('el comprobante del pedido no trae el contenido esperado')
  await pdfYCaptura('pedido-comprobante-80', html, FORMATOS[1])
  await shot('pedido-comprobante-80')
  return 'pedido con A4/80/58 y PDF 80 mm'
})

await paso('finanzas: Resumen → Imprimir resumen (A4 ejecutivo + 58/80)', async (shot) => {
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
  await esperar(3000)
  await page.getByRole('button', { name: /Imprimir resumen/i }).first().click()
  const iframe = page.locator('iframe[title^="Vista previa"]')
  await iframe.waitFor({ state: 'visible', timeout: 15000 })
  await esperar(2000)
  await shot('resumen-modal')

  const formularios = [
    { id: 'a4', etiqueta: 'A4', marca: /Resumen ejecutivo|Rentabilidad|Facturado/i },
    { id: 'thermal-80', etiqueta: '80 mm', marca: /Resumen del día|Facturado/i },
    { id: 'thermal-58', etiqueta: '58 mm', marca: /Resumen del día|Facturado/i },
  ]
  let generados = 0
  for (const item of formularios) {
    const htmlAntes = await htmlDeIframe(iframe)
    await elegirControl({ radio: `Formato ${item.etiqueta}`, ariaLabel: 'Formato de impresión', valor: item.id })
    await esperar(1800)
    const html = await htmlDeIframe(iframe)
    if (html === htmlAntes && !(await estadoControl({ radio: `Formato ${item.etiqueta}`, ariaLabel: 'Formato de impresión', valor: item.id }))) throw new Error(`resumen ${item.id}: no se actualizó`)
    if (!item.marca.test(html)) throw new Error(`resumen ${item.id}: sin contenido esperado`)
    const formato = FORMATOS.find((f) => f.id === item.id)
    await pdfYCaptura(`resumen-${item.id}`, html, formato)
    generados += 1
    if (item.id === 'a4') await shot('resumen-a4')
  }
  return `${generados} PDFs del resumen (A4 ejecutivo + 58/80)`
})

await paso('el demo no llama al API real', async () => {
  const deImpresion = [...new Set(llamadasApi)].filter((ruta) => /\/api\/print/.test(ruta))
  const deReportes = [...new Set(llamadasApi)].filter((ruta) => /\/api\/(orders|cash|reports|metrics)/.test(ruta))
  if (deImpresion.length) throw new Error(`llamó al API de impresión: ${deImpresion.slice(0, 4).join(' | ')}`)
  if (deReportes.length) throw new Error(`llamó al API de datos: ${deReportes.slice(0, 4).join(' | ')}`)
  return `0 llamadas de impresión/datos · ${[...new Set(llamadasApi)].length} al API general del shell`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  erroresConsola: erroresConsola.length,
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  metodo: 'Playwright headless (chromium) sobre la demo pública de producción',
  resultados,
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const reporte = [
  '# Recorrido funcional de producción · dominio Impresión · comprobantes y PDFs (#185)',
  '',
  `- Base: ${BASE}`,
  `- Versión desplegada: v${versionProduccion || '?'}`,
  `- Fecha: ${new Date().toISOString()}`,
  '- Método: Playwright headless (chromium) sobre la demo pública de producción.',
  '',
  '## Pasos',
  '',
  ...resultados.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Evidencia',
  '',
  '- PDFs por tamaño: `comprobante-<nivel>-<a4|thermal-80|thermal-58>.pdf` (9), `pedido-comprobante-80.pdf`, `resumen-<a4|thermal-80|thermal-58>.pdf` (3).',
  '- Capturas del modal, de la vista previa y de «Descargar PDF».',
  '',
  '## Fuera de alcance',
  '',
  '- Cola/monitor de impresión en la demo: `docs/qa/185-impresion/` (script `scripts/qa-185-impresion-demo.mjs`).',
  '- #17 (launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): prueba física en manos de Dario (`docs/IMPRESION-PRUEBA-FISICA.md`).',
  '',
  `Veredicto: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${erroresConsola.length} errores de consola.`,
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${reporte.join('\n')}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Comprobantes/PDFs #185: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
