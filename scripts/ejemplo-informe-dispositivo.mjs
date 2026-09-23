// Ejemplo de informe de dispositivo y certificado con una unidad demo (#240)
// para mostrarle a Dario: PDFs en 80 mm y A4 con el QR al informe público.
//
//   npx vite --port 5273 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5273 node scripts/ejemplo-informe-dispositivo.mjs
//
// Salida: docs/informe-dispositivo-ejemplo/ (PDFs + JPG + QR + README).
// La unidad sale del inventario demo del repo (`demoInventory.js`); la
// verificación IMEI y la inspección son un ejemplo con los estados de INV.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDemoBranches, listDemoLocations, listDemoUnits } from '../src/lib/demoInventory.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/informe-dispositivo-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-22T10:00:00Z')
const enDias = (dias) => new Date(HOY.getTime() + dias * 86_400_000).toISOString()

// El inventario demo usa seriales AUR (a propósito, no son IMEI). Para que el
// ejemplo se vea como un equipo real, el informe usa un IMEI ficticio válido
// (pasa Luhn): así el papel muestra solo el IMEI enmascarado, como en producción.
const imeiDemo = (() => {
  const base = '35150000000000'
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
})()

// Unidad demo (inventario del repo): iPhone 15 Pro Max USED con batería 85%.
const demo = listDemoUnits('', 'active').find((unidad) => unidad.id === 'demo-unit-5')
if (!demo) throw new Error('no se encontró la unidad demo-unit-5')
const ubicacion = listDemoLocations(demo.branchId).find((lugar) => lugar.id === demo.locationId)
const sucursal = listDemoBranches().find((rama) => rama.id === demo.branchId)
const unidad = {
  ...demo,
  serialDemo: demo.serial,
  serial: imeiDemo,
  branch: sucursal || { name: 'Casa Central (demo)' },
  location: ubicacion || { code: 'D1', name: 'Depósito 1' },
  // La demo no carga garantía de tienda: para el ejemplo se muestra una vigente
  // (en un equipo real sale de la venta; sin dato el informe dice «Sin garantía»).
  warrantyUntil: enDias(45),
  // Inspección PhoneCheck de ejemplo (estados y campos del checklist de INV).
  inspection: {
    items: {
      pantalla: { estado: 'ok' },
      camaras: { estado: 'ok' },
      faceId: { estado: 'ok' },
      audio: { estado: 'observacion', nota: 'Crujido al máximo volumen' },
      sensores: { estado: 'ok' },
      botones: { estado: 'ok' },
      conexiones: { estado: 'ok' },
      carga: { estado: 'ok' },
      bateria: { estado: 'ok' },
      carcasa: { estado: 'ok' },
    },
    cosmetico: 'buen estado',
    bateriaPct: String(demo.batteryHealth),
    bateriaCiclos: '312',
    repuestosNoOem: '',
    puntaje: 95,
    grado: 'A',
    inspeccionadoAt: enDias(-1),
    inspeccionadoPor: 'Jorge Villalba',
    nota: 'Equipo probado con chip de operador y carga inalámbrica.',
  },
}
// Verificación IMEI de ejemplo (en el demo real figura como simulada).
const consulta = {
  imei: unidad.serial,
  status: 'verificado',
  resolvedAt: enDias(-1),
  normalized: [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Off' },
    { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Unlocked' },
    { clave: 'mdm', etiqueta: 'MDM', valor: 'Apagado' },
    { clave: 'garantia', etiqueta: 'Garantía', valor: 'Vencida' },
    { clave: 'modelo', etiqueta: 'Modelo', valor: 'iPhone 15 Pro Max' },
  ],
}

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function datosDe(modulo, funcion, argumentos = []) {
  return page.evaluate(async ({ modulo, funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ modulo)
    return mod[funcion](...argumentos)
  }, { modulo, funcion, argumentos })
}

async function lineasDe(funcion, argumentos = []) {
  return page.evaluate(async ({ funcion, argumentos }) => {
    const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
    return mod[funcion](...argumentos).lineas()
  }, { funcion, argumentos })
}

async function pdfHtml(nombre, html, formato) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  if (formato === 'a4') {
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  const paginas = readFileSync(join(SALIDA, `${nombre}.pdf`)).toString('latin1').split('/Type /Page').length
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato, paginas })
}

async function pdfTermico(nombre, lineas, anchoMm) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  await page.pdf({ path: join(SALIDA, `${nombre}.pdf`), width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: `ESC/POS ${anchoMm} mm`, paginas: 1 })
}

try {
  const datosInforme = await datosDe('/src/lib/printing/informeDispositivo.js', 'datosInformeDispositivo', [unidad, { consulta, base: BASE_APP, emisor: 'Móvil Center (demo)', ahora: HOY }])
  const datosCertificado = await datosDe('/src/lib/printing/certificado.js', 'datosCertificado', [unidad, { verificacion: consulta, base: BASE_APP, emisor: 'Móvil Center (demo)', ahora: HOY }])

  // Informe: PDF de 80 mm (rollo) y A4, más el ESC/POS que recibe la impresora.
  let htmlA4 = ''
  for (const formato of ['thermal-80', 'a4']) {
    const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildInformeDispositivoHtml', [datosInforme, { format: formato }])
    if (formato === 'a4') htmlA4 = html
    await pdfHtml(`informe-${formato === 'a4' ? 'a4' : '80mm'}`, html, formato)
  }
  await pdfTermico('informe-80mm-escpos', await lineasDe('ticketInformeDispositivo', [datosInforme, { ancho: 80 }]), 80)

  // Certificado (mismo equipo): 80 mm y A4, para que Dario vea la constancia.
  const htmlCertificado80 = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildCertificadoHtml', [datosCertificado, { format: 'thermal-80' }])
  await pdfHtml('certificado-80mm', htmlCertificado80, 'thermal-80')
  const htmlCertificadoA4 = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildCertificadoHtml', [datosCertificado, { format: 'a4' }])
  await pdfHtml('certificado-a4', htmlCertificadoA4, 'a4')

  // Constancia de preparación (#240 §6): la declaración firmada del checklist.
  const datosConstancia = await datosDe('/src/lib/printing/certificado.js', 'datosConstancia', [unidad, { verificacion: consulta, base: BASE_APP, emisor: 'Móvil Center (demo)', ahora: HOY }])
  for (const formato of ['a4', 'thermal-80']) {
    const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildCertificadoHtml', [datosConstancia, { format: formato }])
    await pdfHtml(`constancia-${formato === 'a4' ? 'a4' : '80mm'}`, html, formato)
  }

  // Hoja de estación (modo taller): la lista de equipos de un carril para el
  // depósito. Se arma con el builder real y tres unidades del inventario demo.
  const otrasDemo = listDemoUnits('', 'active').filter((fila) => fila.id !== demo.id).slice(0, 2)
  const equiposHoja = [
    { ...unidad },
    { ...otrasDemo[0], inspection: { grado: 'B', puntaje: 78, bateriaSalud: '88', bateriaPct: '88', bateriaCiclos: '412', inspeccionadoPor: 'Jorge Villalba', inspeccionadoAt: enDias(-2) } },
    { ...otrasDemo[1] },
  ]
  const htmlHoja = await datosDe('/src/lib/printing/hojaEstacion.js', 'buildStationSheetHtml', [equiposHoja, { estacion: 'Por verificar', fecha: HOY }])
  await pdfHtml('hoja-estacion-a4', htmlHoja, 'a4')

  // QR suelto (el mismo que va impreso) para escanear desde la pantalla.
  const qr = (htmlA4.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
  if (!qr) throw new Error('el informe A4 no trae el QR del informe público')
  writeFileSync(join(SALIDA, 'qr-enlace.png'), Buffer.from(qr, 'base64'))
  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({ unidad: { id: unidad.id, serial: unidad.serial, serialDemo: unidad.serialDemo, producto: unidad.product?.name, condicion: unidad.condition, bateria: unidad.batteryHealth, sucursal: unidad.branch?.name, ubicacion: [unidad.location?.code, unidad.location?.name].filter(Boolean).join(' · '), proveedor: unidad.supplierName }, inspeccion: unidad.inspection, enlace: datosInforme.enlace, generado: new Date().toISOString() }, null, 2)}\n`)
  pasos.push({ documento: 'qr-enlace', archivo: 'qr-enlace.png', formato: 'QR', enlace: datosInforme.enlace })
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 300) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Ejemplo #240: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.enlace ? ` (${paso.enlace})` : ''}`)
