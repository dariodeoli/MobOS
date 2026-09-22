// Evidencia del informe de dispositivo (#240): PDFs A4 y 80 mm (HTML) y
// térmicos ESC/POS (80/58), con capturas y checks de contenido.
//
// Corre contra el server local (vite), como el resto de la evidencia de impresión:
//   npx vite --port 5273 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-240-informe-dispositivo.mjs
// Salida: docs/qa/240-informe-dispositivo/*.pdf + *.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/240-informe-dispositivo')
const BASE_APP = 'https://app.moboss.online'
mkdirSync(SALIDA, { recursive: true })

const IMEI = '356789102345673'
const unidad = {
  id: 'unit-1',
  serial: IMEI,
  condition: 'USED',
  batteryHealth: 89,
  location: { code: 'D2', name: 'Depósito 2' },
  branch: { name: 'Casa Central' },
  supplierName: 'Proveedor XYZ',
  lastVerifiedBy: { name: 'Lucía Fernández' },
  lastVerifiedAt: '2026-09-21T15:04:00Z',
  verificationCount: 3,
  warrantyUntil: '2026-10-21T00:00:00Z',
  grade: 'A',
  inspection: { puntaje: 92, aprobados: 8, total: 8 },
  product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio', sku: 'IPH-15P' },
}
const consulta = {
  imei: IMEI,
  status: 'verificado',
  resolvedAt: '2026-09-21T15:04:00Z',
  normalized: [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Off' },
    { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Unlocked' },
    { clave: 'mdm', etiqueta: 'MDM', valor: 'Apagado' },
    { clave: 'garantia', etiqueta: 'Garantía', valor: 'Vencida' },
    { clave: 'costo', etiqueta: 'Costo interno', valor: '0.06' },
  ],
}

const resultados = []
const errar = (mensaje) => { throw new Error(mensaje) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(modulo, funcion, datos, opciones = {}) {
  return page.evaluate(async ({ modulo, funcion, datos, opciones }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    const fn = mod[funcion]
    if (typeof fn !== 'function') throw new Error(`falta ${funcion} en ${modulo}`)
    return await fn(datos, opciones)
  }, { modulo, funcion, datos, opciones })
}

async function htmlDe(modulo, funcion, datos, opciones = {}) {
  const html = await datosDe(modulo, funcion, datos, opciones)
  if (!html || !String(html).includes('<')) errar(`${funcion} no devolvió HTML`)
  return html
}

async function lineasDe(funcion, argumentos = [], modulo = '/src/lib/printing/tickets.js') {
  return page.evaluate(async ({ funcion, argumentos, modulo }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos, modulo })
}

async function pdfHtml(nombre, html, formato) {
  const anchoMm = formato === 'a4' ? 210 : Number(formato.replace('thermal-', ''))
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const medidas = {
    anchoBodyMm: Math.round(((await page.locator('body').evaluate((body) => body.getBoundingClientRect().width)) / 3.7795275591) * 10) / 10,
    contenidoAlto: await page.locator('body').evaluate((body) => body.getBoundingClientRect().height),
    qr: await page.locator('img.qr').count(),
  }
  if (formato === 'a4') {
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    await page.pdf({
      path: join(SALIDA, `${nombre}.pdf`),
      width: `${anchoMm}mm`,
      height: `${Math.ceil((medidas.contenidoAlto / 3.7795275591) + 12)}mm`,
      printBackground: true,
      margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' },
    })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
  return medidas
}

async function pdfTermico(nombre, lineas, anchoMm) {
  // El ESC/POS trabaja a 42 columnas (80 mm) o 32 (58 mm): el PDF de evidencia
  // usa monospace de 10 px y sin wrap para que las líneas caigan como en el rollo.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}*{box-sizing:border-box}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm;color:#000}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
}

/** Cuenta las páginas del PDF generado (objetos planos de Chromium). */
function paginasDePdf(nombre) {
  const datos = readFileSync(join(SALIDA, `${nombre}.pdf`))
  return datos.toString('latin1').split('/Type /Page').length - datos.toString('latin1').split('/Type /Pages').length
}

function validarHtml(nombre, html) {
  const problemas = []
  // El IMEI va enmascarado (solo los últimos 4) y con el rótulo correcto.
  if (!/IMEI<\/span>\s*<span>•••••••••••5673/.test(html) && !html.includes('•••••••••••5673')) problemas.push('IMEI sin enmascarar')
  if (html.includes(`<strong>${IMEI}</strong>`)) problemas.push('IMEI completo visible')
  for (const marca of ['Equipo', 'Verificación IMEI', 'Inspección física', 'Garantía', 'Informe público', 'Lucía Fernández', 'Grado', '92', 'Garantía vigente']) {
    if (!html.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (!/img class="qr"/.test(html)) problemas.push('sin QR')
  if (!html.includes(`${BASE_APP}/u/${IMEI}`)) problemas.push('sin enlace al informe público')
  if (/USD|0\.06|provider|raw/i.test(html.replace(/Documento informativo/gi, ''))) problemas.push('expone costos o datos internos')
  return problemas.join(' · ')
}

function validarTermico(lineas) {
  const texto = lineas.join('\n')
  const problemas = []
  for (const marca of ['INFORME DE DISPOSITIVO', 'iPhone 15 Pro', '•••••••••••5673', 'Verificación IMEI', 'Blacklist actual', 'Inspección física', 'Lucía Fernández', 'Grado', '8/8', 'Garantía vigente', 'INFORME DEL DISPOSITIVO']) {
    if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (texto.includes('Costo interno')) problemas.push('expone datos internos')
  if (!lineas.some((linea) => /^\s*-+\s*$/.test(linea))) problemas.push('sin divisores de bloque')
  return problemas.join(' · ')
}

try {
  const datos = await datosDe('/src/lib/printing/informeDispositivo.js', 'datosInformeDispositivo', unidad, { consulta, base: BASE_APP, emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') })

  // A4 + rollo 80 (HTML, el que sale por el diálogo y «Descargar PDF»).
  for (const formato of ['a4', 'thermal-80']) {
    const html = await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildInformeDispositivoHtml', datos, { format: formato })
    const problemas = validarHtml(`informe-${formato}`, html)
    const medidas = await pdfHtml(`informe-${formato}`, html, formato)
    const paginas = paginasDePdf(`informe-${formato}`)
    const problemaQr = medidas.qr ? '' : 'sin QR en la vista'
    const detalle = [problemas, problemaQr].filter(Boolean).join(' · ')
    resultados.push({ documento: `informe-${formato}`, formato, tipo: 'html', paginas, estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
  }

  // Térmicos ESC/POS (impresión directa): 80 y 58.
  for (const ancho of [80, 58]) {
    const lineas = await lineasDe('ticketInformeDispositivo', [datos, { ancho }])
    await pdfTermico(`informe-termico-${ancho}`, lineas, ancho)
    const paginas = paginasDePdf(`informe-termico-${ancho}`)
    const problemas = [validarTermico(lineas), paginas > 1 ? 'el ticket salió en más de una página' : ''].filter(Boolean).join(' · ')
    resultados.push({ documento: `informe-termico-${ancho}`, formato: `térmico ${ancho} mm`, tipo: 'escpos', paginas, estado: problemas ? 'fallo' : 'ok', ...(problemas ? { detalle: problemas } : {}) })
  }
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Informe de dispositivo #240: ${resultados.length - fallos.length}/${resultados.length} OK`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
