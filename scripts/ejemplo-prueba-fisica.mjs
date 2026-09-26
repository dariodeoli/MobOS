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

async function pdfA4(nombre, html) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '14mm', right: '14mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: 'A4', bytes: readFileSync(join(SALIDA, `${nombre}.pdf`)).length })
}

// Checklist de una hoja para la sesión con Dario: se imprime y se completa a
// mano mientras se corre el protocolo (docs/IMPRESION-PRUEBA-FISICA.md).
const checklistHtml = () => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @page{size:A4;margin:12mm 14mm}
  *{box-sizing:border-box}
  body{font:11px/1.4 ui-sans-serif,system-ui,sans-serif;color:#10161a;margin:0}
  h1{font-size:17px;margin:0;letter-spacing:-.02em}
  .sub{color:#5d6f78;font-size:10px;margin:2px 0 8px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#0c8876;margin:10px 0 3px;border-bottom:1px solid #d5dbe0;padding-bottom:2px}
  .fila{display:flex;gap:8px;align-items:baseline;margin:2px 0}
  .caja{width:11px;height:11px;border:1.2px solid #10161a;flex:0 0 auto;transform:translateY(1px)}
  .linea{border-bottom:1px dotted #9aa4ad;flex:1 1 auto;height:13px}
  .dos{display:flex;gap:14px}.dos>div{flex:1 1 0}
  .pie{margin-top:10px;border-top:1px solid #10161a;padding-top:5px;font-size:9.5px;color:#5d6f78}
  code{font-family:Menlo,Consolas,monospace;font-size:10px}
</style></head><body>
  <h1>Prueba física de impresión · #17 launchd/CUPS · #96 USB</h1>
  <p class="sub">Protocolo: docs/IMPRESION-PRUEBA-FISICA.md · Tickets esperados: docs/qa/impresion-fisica/ · Completar a mano y pegar el reporte en el issue</p>
  <div class="dos">
    <div class="fila">Fecha <span class="linea"></span></div>
    <div class="fila">Agente <span class="linea"></span> (manifest 1.7.3)</div>
    <div class="fila">Mac <span class="linea"></span></div>
  </div>

  <h2>0 · Preparación</h2>
  <div class="fila"><span class="caja"></span>Bloque §0 corrido → <code>~/mobos-prueba-fisica.txt</code> (sin tokens)</div>

  <h2>1 · Agente por launchd (#17)</h2>
  <div class="dos">
    <div class="fila"><span class="caja"></span>pid launchd <span class="linea"></span></div>
    <div class="fila"><span class="caja"></span>Permiso Red local para node</div>
  </div>
  <div class="fila"><span class="caja"></span>Alias 192.168.1.100 presente &nbsp;·&nbsp; <code>/health.red</code>: alias <span class="linea"></span> tcp <span class="linea"></span></div>
  <div class="fila"><span class="caja"></span><code>cups</code> <span class="linea"></span> <code>colaTipo</code> <span class="linea"></span> <code>transporte</code> <span class="linea"></span> <code>ultimoTransporte</code> <span class="linea"></span></div>
  <div class="fila"><span class="caja"></span>Diagnóstico de red (Dispositivos · Diagnóstico) sin error: <span class="linea"></span></div>

  <h2>2 · Cola CUPS de respaldo (#17)</h2>
  <div class="fila"><span class="caja"></span><code>lpstat -v</code>: <span class="linea"></span> (MobOS_LAN · socket://192.168.1.23:9100)</div>
  <div class="fila"><span class="caja"></span>Si no existía, comando aplicado: <span class="linea"></span></div>

  <h2>3 · Prueba desde launchd</h2>
  <div class="fila"><span class="caja"></span>Salió el ticket (Dispositivos · Impresoras → «Imprimir prueba»)</div>
  <div class="fila"><span class="caja"></span>Completo (4 secciones: cabecera · cuerpo · QR/barras · trazabilidad) &nbsp;·&nbsp; validación del papel <span class="linea"></span></div>
  <div class="fila"><span class="caja"></span>Confirmado en <b>Cola e historial</b> (número secreto) &nbsp;·&nbsp; el rollo <b>cortó</b>: sí ☐ no ☐</div>
  <div class="fila">Si no cortó, probar «Prueba de corte» y marcar la que separa: &nbsp; ☐ GS V 0 &nbsp; ☐ GS V 1 &nbsp; ☐ GS V 65 0 &nbsp; ☐ GS V 66 0</div>

  <h2>4 · USB directo (#96)</h2>
  <div class="fila"><span class="caja"></span><code>"usb": true</code> en config + agente reiniciado por launchd</div>
  <div class="fila"><span class="caja"></span><code>/health.usb</code>: activo <span class="linea"></span> disponible <span class="linea"></span> motivo <span class="linea"></span></div>
  <div class="fila"><span class="caja"></span>Prueba por USB: salió ☐ &nbsp; cortó ☐ &nbsp; <code>transporte=usb</code> ☐</div>

  <h2>5 · Cierre</h2>
  <div class="fila"><span class="caja"></span>Reporte pegado en #17 / #96 (plantilla del protocolo §5) con <code>~/mobos-prueba-fisica.txt</code></div>
  <div class="fila"><span class="caja"></span>Resultado: ☐ cerrada &nbsp; ☐ pendiente por <span class="linea"></span></div>
  <p class="pie">Criterio: la prueba figura exitosa <b>solo con entrega real y ticket verificado en papel</b> («aceptado» en la cola no alcanza). Si algo falla, anotar el <code>errno</code>/motivo exacto: es lo que permite ajustar el código sin adivinar.</p>
</body></html>`

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
  await pdfA4('checklist-prueba-fisica', checklistHtml())

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
