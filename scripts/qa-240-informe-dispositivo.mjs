// Evidencia PhoneCheck (#240): informe de dispositivo y certificado de
// inspección con datos del checklist (contrato de INV), en A4 y 80 mm (HTML) y
// térmicos ESC/POS 80/58, con capturas y checks de contenido.
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
  product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio', sku: 'IPH-15P' },
  // Checklist de INV tal como lo guarda la UI: items por clave + campos extra.
  inspection: {
    items: {
      pantalla: { estado: 'ok' },
      camaras: { estado: 'ok' },
      faceId: { estado: 'ok' },
      audio: { estado: 'observacion', nota: 'Crujido al máximo' },
      sensores: { estado: 'ok' },
      botones: { estado: 'ok' },
      conexiones: { estado: 'ok' },
      carga: { estado: 'ok' },
      bateria: { estado: 'falla', nota: 'Salud 79%' },
      carcasa: { estado: 'na' },
    },
    cosmetico: 'buen estado',
    bateriaPct: '89',
    bateriaCiclos: '310',
    repuestosNoOem: 'Pantalla no OEM',
    puntaje: 83,
    grado: 'B',
    inspeccionadoAt: '2026-09-21T23:09:00.000Z',
    inspeccionadoPor: 'Lucía Fernández',
  },
}
// Payload público de INV (`informePublicoInspection`, docs/PHONECHECK-INFORME.md)
// tal como lo pasa el informe (sin `enlace`: todavía no hay ruta pública de DSN,
// así que el QR cae al contrato vigente `/u/<serial>`).
const informe = {
  tipo: 'certificado-phonecheck',
  version: 1,
  titulo: 'Certificado PhoneCheck',
  grado: 'A',
  puntaje: 100,
  producto: 'iPhone 15 Pro',
  capacidad: '256GB',
  condicion: 'USED',
  cosmetico: 'buen estado',
  serial: '•••••••••••5673',
  bateria: { porcentaje: '89', ciclos: '310' },
  controles: [{ label: 'iCloud', ok: true }, { label: 'MDM', ok: true }, { label: 'ESN/Blacklist', ok: false }, { label: 'Carrier/SIM', ok: true }],
  repuestosNoOem: 'Pantalla no OEM',
  items: [
    { grupo: 'Pantalla', label: 'Pantalla / táctil', estado: 'ok', nota: '' },
    { grupo: 'Pantalla', label: 'Cámaras (frontal y traseras)', estado: 'ok', nota: '' },
    { grupo: 'Biometría', label: 'Face ID / Touch ID', estado: 'ok', nota: '' },
    { grupo: 'Audio', label: 'Altavoces y micrófono', estado: 'observacion', nota: 'Crujido al máximo' },
    { grupo: 'Sensores', label: 'Sensores', estado: 'ok', nota: '' },
    { grupo: 'Controles', label: 'Botones y vibración', estado: 'ok', nota: '' },
    { grupo: 'Conectividad', label: 'WiFi / Bluetooth / GPS', estado: 'ok', nota: '' },
    { grupo: 'Energía', label: 'Carga y puerto', estado: 'ok', nota: '' },
    { grupo: 'Energía', label: 'Batería', estado: 'ok', nota: '' },
    { grupo: 'Carcasa', label: 'Carcasa y chasis', estado: 'ok', nota: '' },
  ],
  verificado: '2026-09-21T23:09:00.000Z',
  fuente: { proveedor: 'imeicheck.net', fecha: '2026-09-21T23:09:00.000Z', etiqueta: 'Verificado' },
  aviso: 'iCloud/US Block clean no equivalen a blacklist mundial.',
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
  ],
}

const resultados = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(modulo, funcion, argumentos = []) {
  return page.evaluate(async ({ modulo, funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    const fn = mod[funcion]
    if (typeof fn !== 'function') throw new Error(`falta ${funcion} en ${modulo}`)
    return await fn(...argumentos)
  }, { modulo, funcion, argumentos })
}

async function lineasDe(funcion, argumentos = []) {
  return page.evaluate(async ({ funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos })
}

async function pdfHtml(nombre, html, formato) {
  const anchoMm = formato === 'a4' ? 210 : Number(formato.replace('thermal-', ''))
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const medidas = {
    contenidoMm: Math.round((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591),
    qr: await page.locator('img.qr').count(),
  }
  if (formato === 'a4') {
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    await page.pdf({
      path: join(SALIDA, `${nombre}.pdf`),
      width: `${anchoMm}mm`,
      height: `${medidas.contenidoMm + 12}mm`,
      printBackground: true,
      margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' },
    })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
  return medidas
}

async function pdfTermico(nombre, lineas, anchoMm) {
  // El ESC/POS trabaja a 42 columnas (80 mm) o 32 (58 mm): el PDF de evidencia
  // usa monospace de 9 px y sin wrap para que las líneas caigan como en el rollo.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}*{box-sizing:border-box}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm;color:#000}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 72, fullPage: true })
}

/** Cuenta las páginas del PDF generado (objetos planos de Chromium). */
function paginasDePdf(nombre) {
  const datos = readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1')
  return datos.split('/Type /Page').length - datos.split('/Type /Pages').length
}

const plano = (valor) => String(valor || '').replace(/\s+/g, ' ')

function validarInformeHtml(html) {
  const problemas = []
  const texto = plano(html.replace(/<[^>]+>/g, ' '))
  for (const marca of ['Inspección física', 'Grado', 'A', 'Puntaje', '100/100', 'Cosmético', 'buen estado', 'Repuestos no OEM', 'Pantalla / táctil', 'Con observación', 'Crujido al máximo', 'iCloud/US Block clean no equivalen a blacklist mundial', 'Informe público']) {
    if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (!html.includes('•••••••••••5673')) problemas.push('IMEI sin enmascarar')
  if (!/img class="qr"/.test(html)) problemas.push('sin QR')
  if (!html.includes('Escaneá para abrir el informe público.')) problemas.push('sin invitación al informe público')
  if (/USD|0\.06|provider|raw/i.test(html)) problemas.push('expone costos o datos internos')
  return problemas.join(' · ')
}

function validarCertificadoHtml(html) {
  const problemas = []
  const texto = plano(html.replace(/<[^>]+>/g, ' '))
  for (const marca of ['Certificado PhoneCheck', 'Puntaje 100/100', 'iCloud', 'ESN/Blacklist', 'FALLA', 'Pantalla / táctil', 'Carcasa', 'Verificado por', 'Lucía Fernández', 'imeicheck.net', 'iCloud/US Block clean no equivalen a blacklist mundial', 'Constancia de inspección', 'Informe público', 'Escaneá para abrir el informe público.']) {
    if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (!/img class="qr"/.test(html)) problemas.push('sin QR')
  const filaSerial = (html.match(/<span>Serial<\/span><span>([^<]*)</) || [])[1] || ''
  if (!filaSerial.includes('5673') || filaSerial.includes(IMEI)) problemas.push(`serial enmascarado (quedó «${filaSerial}»)`)
  if (/USD|0\.06|provider|raw/i.test(html)) problemas.push('expone costos o datos internos')
  return problemas.join(' · ')
}

function validarTermico(lineas, marcas) {
  const texto = plano(lineas.join(' '))
  const problemas = []
  for (const marca of marcas) if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  return problemas.join(' · ')
}

const MARCAS_INFORME = ['INFORME DE DISPOSITIVO', 'iPhone 15 Pro', 'Grado', 'Puntaje', '100/100', 'Pantalla / táctil', 'Obs.', 'Crujido al máximo', 'iCloud/US Block clean no equivalen a blacklist mundial', 'INFORME DEL DISPOSITIVO']
const MARCAS_CERTIFICADO = ['CERTIFICADO PHONECHECK', 'GRADO', 'Puntaje 100/100', 'iCloud', 'ESN/Blacklist', 'FALLA', 'Lucía Fernández', 'Constancia de inspección', '[QR]', '[BARRA]']

try {
  // 1) Informe con checklist de INV (el `enlace` cae al contrato `/u/<serial>`).
  const datosInforme = await datosDe('/src/lib/printing/informeDispositivo.js', 'datosInformeDispositivo', [unidad, { consulta, informe, base: BASE_APP, emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') }])
  if (datosInforme.enlace !== `${BASE_APP}/u/${IMEI}`) throw new Error(`el informe debe caer al enlace /u/<serial> (quedó «${datosInforme.enlace}»)`)
  for (const formato of ['a4', 'thermal-80']) {
    const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildInformeDispositivoHtml', [datosInforme, { format: formato }])
    const medidas = await pdfHtml(`informe-${formato}`, html, formato)
    const paginas = paginasDePdf(`informe-${formato}`)
    const detalle = [validarInformeHtml(html), medidas.qr ? '' : 'sin QR en la vista', paginas > 2 ? `salió en ${paginas} páginas` : ''].filter(Boolean).join(' · ')
    resultados.push({ documento: `informe-${formato}`, formato, tipo: 'html', paginas, contenidoMm: medidas.contenidoMm, estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
  }
  for (const ancho of [80, 58]) {
    const lineas = await lineasDe('ticketInformeDispositivo', [datosInforme, { ancho }])
    await pdfTermico(`informe-termico-${ancho}`, lineas, ancho)
    const paginas = paginasDePdf(`informe-termico-${ancho}`)
    const detalle = [validarTermico(lineas, MARCAS_INFORME), paginas > 1 ? 'el ticket salió en más de una página' : ''].filter(Boolean).join(' · ')
    resultados.push({ documento: `informe-termico-${ancho}`, formato: `térmico ${ancho} mm`, tipo: 'escpos', paginas, estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
  }

  // 2) Certificado de inspección (la constancia que se le da al comprador).
  const datosCertificado = await datosDe('/src/lib/printing/certificado.js', 'datosCertificado', [unidad, { informe, base: BASE_APP, emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') }])
  for (const formato of ['a4', 'thermal-80']) {
    const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildCertificadoHtml', [datosCertificado, { format: formato }])
    const medidas = await pdfHtml(`certificado-${formato}`, html, formato)
    const paginas = paginasDePdf(`certificado-${formato}`)
    const detalle = [validarCertificadoHtml(html), medidas.qr ? '' : 'sin QR en la vista', paginas > 2 ? `salió en ${paginas} páginas` : ''].filter(Boolean).join(' · ')
    resultados.push({ documento: `certificado-${formato}`, formato, tipo: 'html', paginas, contenidoMm: medidas.contenidoMm, estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
  }
  for (const ancho of [80, 58]) {
    const lineas = await lineasDe('ticketCertificado', [datosCertificado, { ancho }])
    await pdfTermico(`certificado-termico-${ancho}`, lineas, ancho)
    const paginas = paginasDePdf(`certificado-termico-${ancho}`)
    const detalle = [validarTermico(lineas, MARCAS_CERTIFICADO), paginas > 1 ? 'el ticket salió en más de una página' : ''].filter(Boolean).join(' · ')
    resultados.push({ documento: `certificado-termico-${ancho}`, formato: `térmico ${ancho} mm`, tipo: 'escpos', paginas, estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
  }

  // 3) Certificado sin inspección: honesto, sin grado inventado.
  const pendiente = await datosDe('/src/lib/printing/certificado.js', 'datosCertificado', [{ serial: IMEI, product: { name: 'iPhone 15' } }, { base: BASE_APP, ahora: new Date('2026-09-22T10:00:00Z') }])
  const lineasPendiente = await lineasDe('ticketCertificado', [pendiente, { ancho: 80 }])
  const detallePendiente = validarTermico(lineasPendiente, ['Pendiente de inspección', 'CERTIFICADO DE INSPECCIÓN'])
  resultados.push({ documento: 'certificado-pendiente', formato: 'térmico 80 mm', tipo: 'escpos', estado: detallePendiente ? 'fallo' : 'ok', ...(detallePendiente ? { detalle: detallePendiente } : {}) })
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
const fallos = resultados.filter((fila) => fila.estado !== 'ok')
console.log(`PhoneCheck #240 (informe + certificado): ${resultados.length - fallos.length}/${resultados.length} OK`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
