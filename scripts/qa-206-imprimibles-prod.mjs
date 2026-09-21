// Verificación post-deploy del rediseño de imprimibles (#206) en producción.
//
// Corre contra el demo anónimo (no toca datos reales) y deja la evidencia en
// docs/qa/206-imprimibles-prod:
//  1. Venta demo en el POS y comprobante en A4, 80 mm y 58 mm (rápido /
//     completo / detallado): un PDF por tamaño y captura del documento.
//  2. Resumen del día en A4 (ejecutivo) y 58/80 mm: PDF por tamaño, captura y
//     medición del bloque de firma en el layout real del rollo (rol, 18 mm de
//     aire sobre la línea, aclaración, CI, fecha y observaciones).
//  3. Comprobante de verificación de IMEI (#203) desde la ficha demo: resultado
//     simulado, aviso de que en el demo no se imprime y cero llamadas al API.
//  4. Bundle de producción: los bloques nuevos de #206 de nota de entrega,
//     remisión, recibo interno, proforma y cierre tienen que viajar en el JS
//     desplegado (esos documentos salen de una venta real, no del demo), igual
//     que los textos del comprobante de IMEI (#203).
//  5. Reporta las llamadas al API y los errores de consola del demo; falla si
//     el demo llama al API real de impresión.
//
// Uso: node scripts/qa-206-imprimibles-prod.mjs
//   QA_BASE_URL (default https://app.moboss.online) · QA_OUT para la salida.
// Salida: docs/qa/206-imprimibles-prod/*.pdf + *.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/206-imprimibles-prod')
mkdirSync(SALIDA, { recursive: true })

// 1 mm en px CSS; el ancho del iframe de la vista previa coincide con el papel
// (80 mm → 302 px, 58 mm → 219 px) y el A4 mide 210 mm.
const MM = 3.7795275591
const FORMATOS = [
  { id: 'a4', etiqueta: 'A4', anchoMm: 210, margen: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } },
  { id: 'thermal-80', etiqueta: 'térmico 80 mm', anchoMm: 80, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
  { id: 'thermal-58', etiqueta: 'térmico 58 mm', anchoMm: 58, margen: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } },
]
const NIVELES = ['rapido', 'completo', 'detallado']
const SELECTOR_COMPROBANTE = 'iframe[title="Vista previa del comprobante"]'
const SELECTOR_REPORTE = 'iframe[title="Vista previa · Resumen ejecutivo"]'
// Marcas de #206/#203 que tienen que viajar en el bundle desplegado (documentos
// que no se pueden emitir desde el demo).
const MARCAS_BUNDLE = [
  'Recibí conforme (firma)',
  'Entregué (despacho)',
  'Recibí conforme (recepción)',
  'Entregué / cobré',
  'Aceptación del cliente',
  'Responsable del arqueo',
  'Aclaración: ______________________________',
  'padding-top:18mm',
  'class="observaciones"',
  'no acredita propiedad ni reemplaza la',
  'IMEI verificado: sin reportes',
  'Simulada en demo: el resultado es ficticio',
]

const resultados = []
const llamadasApi = []
const llamadasImpresion = []
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  // En dev los módulos viven bajo /src/ y `/src/lib/api/printing.js` no es una
  // llamada: solo cuentan las rutas reales del API.
  if (url.includes('/src/')) return
  if (!/\/api\//.test(url)) return
  const ruta = `${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`
  llamadasApi.push(ruta)
  if (/\/api\/print/.test(url)) llamadasImpresion.push(ruta)
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
  const pdfs = []
  const antesApi = llamadasApi.length
  try {
    const detalle = await fn({
      captura: async (n, opciones) => { const archivo = await captura(n, opciones); capturas.push(archivo); return archivo },
      pdf: (archivo) => { pdfs.push(archivo); return archivo },
    })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, pdfs, llamadasApi: llamadasApi.slice(antesApi) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, pdfs, llamadasApi: llamadasApi.slice(antesApi) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

const htmlDeIframe = (iframe) => iframe.evaluate((el) => el.contentDocument?.documentElement?.outerHTML || el.getAttribute('srcdoc') || '')

async function esperarIframe(selector, previo, timeout = 20000) {
  const iframe = page.locator(selector)
  const hasta = Date.now() + timeout
  for (;;) {
    const html = await htmlDeIframe(iframe)
    if (html && html !== previo) return html
    if (Date.now() > hasta) throw new Error(`la vista previa (${selector}) no se actualizó`)
    await page.waitForTimeout(150)
  }
}

// PDF con el mismo tamaño de papel que imprime la app: A4 con los márgenes del
// @page (18/16 mm) y rollo con el ancho del formato y alto medido del contenido.
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
      opciones.height = `${Math.round(((altoPx / 3.7795275591) + 5 + 5 + 2) * 10) / 10}mm`
    }
    await hoja.pdf(opciones)
    await hoja.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
    return `${nombre}.pdf`
  } finally {
    await hoja.close()
  }
}

// ── 1. Entrada al demo ──────────────────────────────────────────────────────
await paso('entrada a la demo como dueño', async ({ captura: shot }) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  await shot('panel-demo')
  return 'demo abierta como dueño'
})

// ── 2. Venta demo + comprobante en los tres tamaños ─────────────────────────
await paso('venta demo en el POS y comprobante A4/80/58', async ({ captura: shot, pdf }) => {
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const cliente = page.getByLabel(/Nombre.*cliente|Nombre, teléfono/).first()
  if (!(await cliente.count())) throw new Error('no encontré el campo de cliente del POS')
  await cliente.fill('QA Imprimir 206')
  const buscar = page.getByPlaceholder('Buscar producto…')
  for (const producto of ['Funda MagSafe', 'Cargador USB-C 20W']) {
    await buscar.fill(producto)
    await esperar(900)
    const tarjeta = page.getByRole('button', { name: new RegExp(producto.split(' ')[0]) }).filter({ hasText: producto }).first()
    if (!(await tarjeta.count())) throw new Error(`no encontré el producto ${producto}`)
    await tarjeta.click()
    await esperar(600)
  }
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  // El aviso de venta registrada dura ~2,5 s: hay que abrir el comprobante ya.
  const imprimir = page.getByRole('button', { name: 'Imprimir comprobante' })
  await imprimir.waitFor({ state: 'visible', timeout: 8000 })
  await imprimir.click()
  await page.locator(SELECTOR_COMPROBANTE).waitFor({ state: 'visible', timeout: 15000 })
  await esperar(1500)
  await shot('comprobante-vista-previa', { completa: true })

  const iframe = page.locator(SELECTOR_COMPROBANTE)
  // Cambia nivel y formato y espera el HTML nuevo del iframe (el QR se genera
  // async, así que la espera es por cambio de contenido, no por tiempo).
  async function elegirComprobante(nivel, formato) {
    const htmlAntes = await htmlDeIframe(iframe)
    let cambio = false
    if ((await page.getByLabel('Tipo de comprobante').inputValue()) !== nivel) {
      await page.getByLabel('Tipo de comprobante').selectOption(nivel)
      cambio = true
    }
    if ((await page.getByLabel('Formato de impresión').inputValue()) !== formato.id) {
      await page.getByLabel('Formato de impresión').selectOption(formato.id)
      cambio = true
    }
    if (!cambio) return htmlAntes
    await esperarIframe(SELECTOR_COMPROBANTE, htmlAntes)
    return htmlDeIframe(iframe)
  }
  const generados = []
  const sinLeyenda = []
  const completos = {}
  for (const nivel of NIVELES) {
    for (const formato of FORMATOS) {
      const html = await elegirComprobante(nivel, formato)
      if (!html.includes('Documento no fiscal')) sinLeyenda.push(`${nivel}/${formato.id}`)
      if (nivel === 'completo') completos[formato.id] = html
      const nombre = `comprobante-${nivel}-${formato.id}`
      pdf(await pdfYCaptura(nombre, html, formato))
      generados.push(nombre)
      if (nivel === 'completo') await shot(`comprobante-completo-${formato.id}`, { completa: true })
    }
  }
  if (sinLeyenda.length) throw new Error(`sin leyenda no fiscal: ${sinLeyenda.join(', ')}`)
  // El comprobante tiene que listar la mercadería: es lo que se firma/controla.
  const sinArticulos = FORMATOS.filter((formato) => !completos[formato.id].includes('Funda MagSafe'))
  if (sinArticulos.length) throw new Error(`el comprobante no lista los artículos en: ${sinArticulos.map((f) => f.id).join(', ')}`)
  return `${generados.length} PDFs (${NIVELES.length} niveles × ${FORMATOS.length} tamaños)`
})

// ── 3. Resumen del día + firmas en el rollo ─────────────────────────────────
await paso('resumen del día (A4, 80 y 58 mm) y firmas del rollo', async ({ captura: shot, pdf }) => {
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
  await esperar(3000)
  await page.getByRole('button', { name: /Imprimir resumen/i }).first().click()
  await page.locator(SELECTOR_REPORTE).waitFor({ state: 'visible', timeout: 15000 })
  await esperar(2000)

  const iframe = page.locator(SELECTOR_REPORTE)
  const generados = []
  const firmas = {}
  async function elegirFormato(formato) {
    const htmlAntes = await htmlDeIframe(iframe)
    if ((await page.getByLabel('Formato de impresión').inputValue()) === formato.id) return htmlAntes
    await page.getByLabel('Formato de impresión').selectOption(formato.id)
    await esperarIframe(SELECTOR_REPORTE, htmlAntes)
    return htmlDeIframe(iframe)
  }
  for (const formato of FORMATOS) {
    const html = await elegirFormato(formato)
    const nombre = `resumen-dia-${formato.id}`
    pdf(await pdfYCaptura(nombre, html, formato))
    generados.push(nombre)
    if (formato.id !== 'a4') {
      firmas[formato.id] = await iframe.evaluate((el) => {
        const doc = el.contentDocument
        if (!doc) return null
        const MM = 3.7795275591
        const caja = (nodo) => nodo.getBoundingClientRect()
        const anchoCuerpo = caja(doc.body).width
        return {
          anchoCuerpoMm: Math.round((anchoCuerpo / MM) * 10) / 10,
          firmas: [...doc.querySelectorAll('.firma')].map((firma) => {
            const rol = firma.querySelector('.rol')
            return {
              rol: rol?.textContent.trim() || '',
              anchoMm: Math.round((caja(firma).width / MM) * 10) / 10,
              espacioMm: rol ? Math.round(((caja(rol).top - caja(firma).top) / MM) * 10) / 10 : 0,
              campos: [...firma.querySelectorAll('.campos')].map((campo) => campo.textContent.trim()),
            }
          }),
          observaciones: [...doc.querySelectorAll('.observaciones')].map((area) => ({
            label: area.querySelector('.label')?.textContent.trim() || '',
            lineas: area.querySelectorAll('.linea').length,
            altoLineaMm: area.querySelector('.linea') ? Math.round((caja(area.querySelector('.linea')).height / MM) * 10) / 10 : 0,
          })),
        }
      })
    }
    if (formato.id === 'thermal-58') await shot('resumen-dia-58', { completa: true })
  }

  for (const [formato, medida] of Object.entries(firmas)) {
    if (!medida || medida.firmas.length !== 2) throw new Error(`${formato}: el resumen no trae las dos firmas`)
    for (const firma of medida.firmas) {
      if (!firma.rol) throw new Error(`${formato}: firma sin rol`)
      if (Math.abs(firma.anchoMm - medida.anchoCuerpoMm) > 2) throw new Error(`${formato}: la firma «${firma.rol}» no ocupa el ancho del rollo (${firma.anchoMm} mm de ${medida.anchoCuerpoMm} mm)`)
      if (firma.espacioMm < 17.5) throw new Error(`${formato}: la firma «${firma.rol}» reserva ${firma.espacioMm} mm (mínimo 17,5 mm para escribir a mano)`)
      const texto = firma.campos.join(' ')
      if (!texto.includes('Aclaración:')) throw new Error(`${formato}: falta la aclaración en «${firma.rol}»`)
      if (!texto.includes('CI:')) throw new Error(`${formato}: falta la CI en «${firma.rol}»`)
      if (!texto.includes('Fecha:')) throw new Error(`${formato}: falta la fecha en «${firma.rol}»`)
    }
    const observaciones = medida.observaciones[0]
    if (!observaciones || observaciones.lineas < 2) throw new Error(`${formato}: el área de observaciones no tiene dos líneas`)
    if (observaciones.altoLineaMm < 10) throw new Error(`${formato}: la línea de observaciones mide ${observaciones.altoLineaMm} mm`)
  }
  return `${generados.length} PDFs · firmas medidas en ${Object.keys(firmas).join(' y ')}`
})

// ── 4. Comprobante de IMEI (#203) ───────────────────────────────────────────
await paso('comprobante de verificación de IMEI (#203)', async ({ captura: shot }) => {
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  if (!(await fila.count())) throw new Error('no encontré la clienta demo con equipos')
  await fila.click()
  await esperar(1200)
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: 'Pedidos' }).click()
  await esperar(800)
  const boton = ficha.getByRole('button', { name: 'Verificación IMEI' }).first()
  await boton.waitFor({ state: 'visible', timeout: 10000 })
  await boton.click()
  const modal = page.getByTestId('imei-verificacion')
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(800)
  await shot('imei-verificacion-demo')
  const texto = await modal.innerText()
  for (const marca of ['Simulada en demo', 'IMEI verificado', 'IMEIcheck.net', 'Comprobante informativo']) {
    if (!texto.includes(marca)) throw new Error(`la verificación de IMEI no muestra «${marca}»`)
  }
  // En demo la impresión no se simula: avisa y no encola nada (se verifica
  // también al final que no haya llamadas al API de impresión).
  await modal.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await esperar(1000)
  const aviso = await page.getByText(/no está disponible en el demo|Datos ficticios/i).count()
  await shot('imei-verificacion-aviso')
  return `demo simulado verificado · aviso de no-imprimir: ${aviso > 0 ? 'sí' : 'no'}`
})

// ── 5. Bundle de producción ─────────────────────────────────────────────────
let versionProduccion = ''
await paso('bundle de producción con los bloques de #206/#203', async () => {
  const respuesta = await fetch(`${BASE}/login`, { redirect: 'follow' })
  if (!respuesta.ok) throw new Error(`/login respondió ${respuesta.status}`)
  const cuerpo = await respuesta.text()
  const delTexto = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  versionProduccion = delTexto ? delTexto[1] : ''
  const fuentes = new Set([
    ...[...cuerpo.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => new URL(match[1], BASE).href),
    ...[...cuerpo.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)].map((match) => new URL(match[1], BASE).href),
  ])
  const bundles = await Promise.all([...fuentes].map(async (fuente) => (await fetch(fuente)).text()))
  const codigo = bundles.join('\n')
  const faltantes = MARCAS_BUNDLE.filter((marca) => !codigo.includes(marca))
  if (faltantes.length) throw new Error(`el bundle no trae: ${faltantes.join(' · ')}`)
  if (!versionProduccion) throw new Error('no pude leer la versión desplegada')
  return `v${versionProduccion} con las ${MARCAS_BUNDLE.length} marcas de #206/#203 en ${fuentes.size} bundle(s)`
})

await paso('el demo no llama al API de impresión', async () => {
  if (llamadasImpresion.length) throw new Error(`llamadas: ${[...new Set(llamadasImpresion)].slice(0, 5).join(' | ')}`)
  return `0 llamadas · ${llamadasApi.length} al API general`
})

await browser.close()

const veredicto = {
  pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultados.length,
  llamadasImpresion: llamadasImpresion.length,
  erroresConsola: erroresConsola.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({
  base: BASE,
  version: versionProduccion,
  fecha: new Date().toISOString(),
  resultados,
  llamadasApi: [...new Set(llamadasApi)],
  erroresConsola,
  veredicto,
}, null, 2)}\n`)

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Verificación #206 en producción: ${veredicto.pasosOk}/${veredicto.pasosTotal} pasos OK · ${llamadasImpresion.length} llamadas a impresión · ${erroresConsola.length} errores de consola`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
