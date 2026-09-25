// Acompañamiento de la prueba física de impresión (#17 launchd/CUPS y #96 USB):
// genera los tickets de prueba esperados —los mismos builders que manda el
// agente— para comparar contra el papel en la Mac del local.
//
//   npx vite --port 5276 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5276 node scripts/ejemplo-prueba-fisica.mjs
//
// Salida: docs/qa/impresion-fisica/ (PDF + JPG por tipo de prueba + datos).
// El protocolo paso a paso vive en docs/IMPRESION-PRUEBA-FISICA.md.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5276'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/impresion-fisica')
mkdirSync(SALIDA, { recursive: true })
const BASE_APP = 'https://app.moboss.online'

// Los mismos datos que arma la app al imprimir la prueba desde Dispositivos.
const PRUEBA = {
  impresora: 'lan:192.168.1.23:9100',
  nombre: 'Térmica mostrador',
  equipo: 'Mac mostrador',
  copias: 1,
  metodo: 'LAN (TCP directo)',
  conexion: 'lan',
  puente: 'Mac mostrador',
  tokenPista: 'a1b2…c3d4',
  usuario: 'Administrador',
  marca: 'TEST-PRUEBA-FISICA',
  base: BASE_APP,
}

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1200 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function lineasDe(tipo, { ancho }) {
  return page.evaluate(async ({ tipo, opciones }) => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    return mod.ticketPruebaTipo(tipo, opciones).lineas()
  }, { tipo, opciones: { ...PRUEBA, ancho } })
}

async function pdfTermico(nombre, lineas, anchoMm) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  const bytes = readFileSync(join(SALIDA, `${nombre}.pdf`)).length
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: `ESC/POS ${anchoMm} mm`, bytes })
}

try {
  const tipos = await page.evaluate(async () => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    return Object.entries(mod.TIPOS_TICKET_PRUEBA)
  })
  for (const [tipo] of tipos) {
    await pdfTermico(`prueba-${tipo}-80mm`, await lineasDe(tipo, { ancho: 80 }), 80)
  }
  await pdfTermico('prueba-corta-58mm', await lineasDe('corta', { ancho: 58 }), 58)

  // El QR del ticket abre la página de verificación física: se arma el mismo
  // enlace con `qrPrueba` (datos de ejemplo) para probar la página en el
  // teléfono y en el QA de producción.
  const enlace = await page.evaluate(async ({ base }) => {
    const { qrPrueba } = await import(/* @vite-ignore */ '/src/lib/printing/qr.js')
    return qrPrueba({ destino: 'lan:192.168.1.23:9100', validacion: '1234', fecha: '2026-09-25T15:00:00.000Z', tipo: 'corta' }, base)
  }, { base: BASE_APP })
  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    prueba: PRUEBA,
    tipos: Object.fromEntries(tipos),
    enlaceQr: enlace,
    protocolo: 'docs/IMPRESION-PRUEBA-FISICA.md',
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
  pasos.push({ documento: 'enlace-qr', archivo: '', formato: 'QR', enlace })
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Prueba física #17/#96: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.enlace ? ` (${paso.enlace})` : ''}`)
