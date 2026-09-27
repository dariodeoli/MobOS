// Ejemplo del PDF profesional de cotización (A4, identidad de marca) que el
// vendedor comparte por WhatsApp/correo: generado con el **mismo código** que
// usa la app (`buildProformaHtml` + `documentoAPdf`) en Chromium real.
//
//   npx vite --port 5281 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5281 node scripts/ejemplo-cotizacion-pdf.mjs
//
// Salida: docs/cotizacion-pdf-ejemplo/ (PDF real + JPG + QR + datos).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5281'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/cotizacion-pdf-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-26T10:00:00Z')
const ENLACE = `${BASE_APP}/cotizacion/COT-DEMO-0007`

// Forma real de una cotización (`GET /api/quotes`), con la identidad de marca
// que ya usan los impresos (logo del tenant, empresa, vendedor y cliente).
const COTIZACION = {
  number: 'COT-0007',
  createdAt: HOY.toISOString(),
  validUntil: new Date(HOY.getTime() + 7 * 86_400_000).toISOString(),
  customerName: 'Juan Pérez',
  customer: { name: 'Juan Pérez', document: '3.456.789', phone: '981123456', countryCode: '+595' },
  seller: { name: 'Lucía Benítez' },
  branch: { name: 'Casa Central' },
  tenant: { name: 'Móvil Center (demo)', ruc: '80012345-6' },
  subtotalPyg: 6_250_000,
  discountPyg: 250_000,
  totalPyg: 6_000_000,
  notes: 'Precio válido con pago en efectivo o transferencia.',
  items: [
    { description: 'iPhone 15 Pro Max 256 GB Titanio Natural · Seminuevo', quantity: 1, unitPricePyg: 5_450_000, totalPyg: 5_450_000 },
    { description: 'AirPods Pro 2 · Nuevo', quantity: 1, unitPricePyg: 800_000, totalPyg: 800_000 },
  ],
}

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

try {
  // 1) El HTML profesional (A4) con el QR de aceptación.
  const html = await page.evaluate(async ({ cotizacion, enlace }) => {
    const { buildProformaHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    return buildProformaHtml(cotizacion, { format: 'a4', enlace })
  }, { cotizacion: COTIZACION, enlace: ENLACE })

  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(SALIDA, 'cotizacion-a4.jpg'), type: 'jpeg', quality: 80, fullPage: true })

  // 2) El PDF real, con el generador que viaja en la app.
  const pdf = await page.evaluate(async ({ html }) => {
    const { documentoAPdf } = await import('/src/lib/printing/pdfDocumento.js')
    const blob = await documentoAPdf(html, { formato: 'a4' })
    if (!blob) return null
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binario = ''
    for (const byte of bytes) binario += String.fromCharCode(byte)
    return { base64: btoa(binario), bytes: bytes.length }
  }, { html })
  if (!pdf) throw new Error('no se pudo generar el PDF de la cotización')
  const bytes = Buffer.from(pdf.base64, 'base64')
  writeFileSync(join(SALIDA, 'cotizacion-a4.pdf'), bytes)
  const texto = bytes.toString('latin1')
  pasos.push({
    documento: 'cotizacion-a4',
    archivo: 'cotizacion-a4.pdf',
    formato: 'PDF A4',
    paginas: Number((texto.match(/\/Count (\d+)/) || [])[1] || 1),
    bytes: pdf.bytes,
    firma: texto.startsWith('%PDF-1.4'),
    dct: (texto.match(/\/Filter \/DCTDecode/g) || []).length,
  })

  // 3) El QR de aceptación (el mismo que va impreso en el PDF).
  const qr = (html.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
  if (!qr) throw new Error('el PDF no trae el QR de aceptación')
  writeFileSync(join(SALIDA, 'qr-aceptacion.png'), Buffer.from(qr, 'base64'))
  pasos.push({ documento: 'qr-aceptacion', archivo: 'qr-aceptacion.png', formato: 'QR', enlace: ENLACE })

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    cotizacion: { number: COTIZACION.number, cliente: COTIZACION.customerName, vendedor: COTIZACION.seller.name, totalPyg: COTIZACION.totalPyg, validez: COTIZACION.validUntil },
    enlaceDemo: ENLACE,
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`PDF de cotización: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.bytes ? ` (${Math.round(paso.bytes / 1024)} KB)` : ''}${paso.enlace ? ` (${paso.enlace})` : ''}`)
