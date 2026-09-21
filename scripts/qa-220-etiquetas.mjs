// Evidencia de la etiqueta de unidad (#220): modelo, identificador, IMEI/serial
// completo legible, QR y código de barras en bloques separados, por tamaño
// (58 y 80 mm). Renderiza el HTML del respaldo/PDF y el ticket ESC/POS con los
// MISMOS builders que usa la app, y valida el contenido de cada pieza.
//
// Corre contra el server local (vite), como el resto de la evidencia de impresión:
//   npx vite --port 5273 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-220-etiquetas.mjs
// Salida: docs/qa/220-etiquetas/*.pdf + *.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/220-etiquetas')
const BASE_APP = 'https://app.moboss.online'
mkdirSync(SALIDA, { recursive: true })

const unidad = {
  id: 'unit-1',
  serial: '356789012345678',
  condition: 'USED',
  batteryHealth: 89,
  supplierName: 'Proveedor XYZ',
  location: { code: 'D2', name: 'Depósito 2' },
  product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio' },
}
const unidad2 = {
  id: 'unit-2',
  serial: '352000111222333',
  condition: 'NEW',
  batteryHealth: 100,
  supplierName: 'Apple PY',
  location: { code: 'D1', name: 'Depósito 1' },
  product: { name: 'iPhone 16 128GB Negro', model: 'iPhone 16', capacity: '128GB', color: 'Negro' },
}

const resultados = []
const errar = (mensaje) => { throw new Error(mensaje) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function htmlDe(modulo, funcion, datos, opciones = {}) {
  const html = await page.evaluate(async ({ modulo, funcion, datos, opciones }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    const fn = mod[funcion]
    if (typeof fn !== 'function') throw new Error(`falta ${funcion} en ${modulo}`)
    return await fn(datos, opciones)
  }, { modulo, funcion, datos, opciones })
  if (!html || !String(html).includes('<')) errar(`${funcion} no devolvió HTML`)
  return html
}

async function lineasDe(funcion, argumentos = [], modulo = '/src/lib/printing/tickets.js') {
  return page.evaluate(async ({ funcion, argumentos, modulo }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos, modulo })
}

// PDF + captura del HTML con el ancho real del rollo.
async function pdfHtml(nombre, html, anchoMm) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const cuerpo = page.locator('body')
  const serial = page.locator('.serial').first()
  const medidas = {
    anchoBodyMm: Math.round(((await cuerpo.evaluate((body) => body.getBoundingClientRect().width)) / 3.7795275591) * 10) / 10,
    bloques: await page.locator('.bloque').count(),
    serialTexto: ((await serial.textContent()) || '').trim(),
    serialCorta: await serial.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    qr: await page.locator('img.qr').count(),
    barras: await page.locator('.barras svg').count(),
    contenidoAlto: await cuerpo.evaluate((body) => body.getBoundingClientRect().height),
  }
  const altoMm = Math.ceil((medidas.contenidoAlto / 3.7795275591) + 4)
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${altoMm}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
  return medidas
}

// PDF térmico: las líneas ESC/POS en una columna monoespaciada del ancho real.
async function pdfTermico(nombre, lineas, anchoMm) {
  const alto = Math.max(120, lineas.length * 5.2 + 20)
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:${anchoMm}mm auto;margin:0}*{box-sizing:border-box}body{margin:0;font:12px/1.35 'Menlo','SF Mono',monospace;white-space:pre-wrap;padding:4mm;color:#000}pre{margin:0;font:inherit;white-space:pre-wrap}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
}

function validarHtml(nombre, medidas, etiquetasEsperadas) {
  const problemas = []
  if (medidas.bloques < 5) problemas.push(`bloques insuficientes (${medidas.bloques})`)
  if (medidas.serialTexto !== unidad.serial) problemas.push(`serial inesperado (${medidas.serialTexto})`)
  if (!medidas.serialCorta) problemas.push('el serial se corta')
  if (medidas.qr < etiquetasEsperadas) problemas.push(`faltan QR (${medidas.qr})`)
  if (medidas.barras < etiquetasEsperadas) problemas.push(`faltan barras (${medidas.barras})`)
  return problemas.join(' · ')
}

function validarTermico(lineas) {
  const texto = lineas.join('\n')
  const problemas = []
  for (const marca of ['ETIQUETA DE UNIDAD', 'iPhone 15 Pro', 'IDENTIFICADOR', '5678', 'IMEI / SERIAL', unidad.serial, 'CÓDIGO QR', 'CÓDIGO DE UNIDAD', `MOBOS:${unidad.serial}`]) {
    if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (!lineas.some((linea) => linea.trim() === unidad.serial)) problemas.push('el serial no va completo en una línea')
  const iQr = lineas.findIndex((linea) => linea.includes('[QR]'))
  const iBarra = lineas.findIndex((linea) => linea.includes('[BARRA]'))
  if (iQr < 0 || iBarra < 0 || iBarra < iQr) problemas.push('QR y barras desordenados')
  else if (!lineas.slice(iQr, iBarra).some((linea) => /^\s*-+\s*$/.test(linea))) problemas.push('sin divisoria entre QR y barras')
  return problemas.join(' · ')
}

try {
  for (const ancho of [58, 80]) {
    // HTML de respaldo/PDF (el que usa el diálogo cuando no hay impresora).
    const html = await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildUnitLabelsHtml', [unidad], { ancho, base: BASE_APP })
    const problemasHtml = validarHtml(`etiqueta-unidad-${ancho}`, await pdfHtml(`etiqueta-unidad-${ancho}`, html, ancho), 1)
    resultados.push({ documento: `etiqueta-unidad-${ancho}`, formato: `${ancho} mm`, tipo: 'html', estado: problemasHtml ? 'fallo' : 'ok', ...(problemasHtml ? { detalle: problemasHtml } : {}) })

    // Lote de dos etiquetas (impresión masiva/seleccionada).
    const htmlLote = await htmlDe('/src/components/shared/OrderReceipt.jsx', 'buildUnitLabelsHtml', [unidad, unidad2], { ancho, base: BASE_APP })
    const medidasLote = await pdfHtml(`etiquetas-lote-${ancho}`, htmlLote, ancho)
    const problemasLote = validarHtml(`etiquetas-lote-${ancho}`, medidasLote, 2)
    resultados.push({ documento: `etiquetas-lote-${ancho}`, formato: `${ancho} mm`, tipo: 'html', estado: problemasLote ? 'fallo' : 'ok', ...(problemasLote ? { detalle: problemasLote } : {}) })

    // Ticket ESC/POS (impresión directa sin diálogo).
    const lineas = await lineasDe('ticketEtiquetaUnidad', [unidad, { ancho, base: BASE_APP }])
    await pdfTermico(`etiqueta-unidad-${ancho}-termico`, lineas, ancho)
    const problemasTermico = validarTermico(lineas)
    resultados.push({ documento: `etiqueta-unidad-${ancho}-termico`, formato: `térmico ${ancho} mm`, tipo: 'escpos', estado: problemasTermico ? 'fallo' : 'ok', ...(problemasTermico ? { detalle: problemasTermico } : {}) })
  }
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`Etiquetas #220: ${resultados.length - fallos.length}/${resultados.length} OK`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
