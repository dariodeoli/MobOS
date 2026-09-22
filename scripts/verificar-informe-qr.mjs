// Verificación de los PDFs del informe y del certificado (#240): el QR que sale
// impreso tiene que leerse y apuntar al informe público de la unidad.
//
//   npx vite --port 5283 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5283 node scripts/verificar-informe-qr.mjs
//
// Genera los PDFs con el mismo código que imprime la app (unidad demo, con el
// checklist de INV y con el de la UI de DSN), los convierte a PNG y decodifica
// el QR con Vision (`scripts/decode-qr.swift`).
//
// Salida: docs/qa/240-informe-dispositivo/verificacion-qr/ + REPORTE.md.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDemoBranches, listDemoLocations, listDemoUnits } from '../src/lib/demoInventory.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5283'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/240-informe-dispositivo/verificacion-qr')
const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-22T10:00:00Z')
const enDias = (dias) => new Date(HOY.getTime() + dias * 86_400_000).toISOString()
mkdirSync(SALIDA, { recursive: true })

// El compilador Swift del equipo no acepta el SDK más nuevo: se elige uno que sí.
const SDK_SWIFT = process.env.QR_SDK || ['MacOSX26.5.sdk', 'MacOSX26.sdk', 'MacOSX15.4.sdk', 'MacOSX15.sdk']
  .map((nombre) => `/Library/Developer/CommandLineTools/SDKs/${nombre}`)
  .find((ruta) => existsSync(ruta))

// Unidad demo (inventario del repo) con un IMEI ficticio válido para que el papel
// se vea como un equipo real (solo el IMEI enmascarado).
const demo = listDemoUnits('', 'active').find((unidad) => unidad.id === 'demo-unit-5')
if (!demo) throw new Error('no se encontró la unidad demo-unit-5')
const imeiDemo = (() => {
  const base = '35150000000000'
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
})()
const ubicacion = listDemoLocations(demo.branchId).find((lugar) => lugar.id === demo.locationId)
const sucursal = listDemoBranches().find((rama) => rama.id === demo.branchId)
const ENLACE_INFORME = `${BASE_APP}/u/${imeiDemo}`

const unidad = {
  ...demo,
  serial: imeiDemo,
  branch: sucursal || { name: 'Casa Central (demo)' },
  location: ubicacion || { code: 'D1', name: 'Depósito 1' },
  warrantyUntil: enDias(45),
  lastVerifiedBy: null,
  verifiedAt: null,
}

// Checklist con el vocabulario de INV (10 ítems, observación con nota).
const inspeccionINV = {
  items: {
    pantalla: { estado: 'ok' }, camaras: { estado: 'ok' }, faceId: { estado: 'ok' },
    audio: { estado: 'observacion', nota: 'Crujido al máximo volumen' },
    sensores: { estado: 'ok' }, botones: { estado: 'ok' }, conexiones: { estado: 'ok' },
    carga: { estado: 'ok' }, bateria: { estado: 'ok' }, carcasa: { estado: 'ok' },
  },
  cosmetico: 'buen estado',
  bateriaPct: String(demo.batteryHealth),
  bateriaCiclos: '312',
  puntaje: 95,
  grado: 'A',
  inspeccionadoAt: enDias(-1),
  inspeccionadoPor: 'Jorge Villalba',
}
// Checklist con el vocabulario de la UI de DSN (23 ítems, estados y notas).
const inspeccionDSN = {
  items: {
    tactil: 'pasa', imagen: 'pasa', brillo: 'pasa', trasera: 'pasa', frontal: 'pasa', video: 'pasa',
    biometria: 'pasa', altavoz: 'falla', microfono: 'pasa', vibracion: 'pasa', proximidad: 'pasa',
    giroscopio: 'pasa', brujula: 'pasa', encendido: 'pasa', silencioso: 'pasa', wifi: 'pasa',
    senal: 'pasa', carga: 'pasa', bateria: 'pasa', carga_rapida: 'pasa', carcasa: 'na',
    tapa: 'pasa', camaras_lente: 'pasa',
  },
  notas: { altavoz: 'Crujido al máximo volumen' },
  bateriaSalud: String(demo.batteryHealth),
  bateriaCiclos: '312',
  inspeccionadoAt: enDias(-1),
  inspeccionadoPor: 'Jorge Villalba',
}
const consulta = {
  imei: imeiDemo,
  status: 'verificado',
  resolvedAt: enDias(-1),
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
const page = await browser.newPage({ viewport: { width: 1240, height: 1600 } })
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

function paginasDePdf(ruta) {
  const datos = readFileSync(ruta).toString('latin1')
  return datos.split('/Type /Page').length - datos.split('/Type /Pages').length
}

async function pdfHtml(nombre, html, formato) {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const ruta = join(SALIDA, `${nombre}.pdf`)
  if (formato === 'a4') {
    await page.pdf({ path: ruta, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await page.pdf({ path: ruta, width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 75, fullPage: true })
  return { ruta, paginas: paginasDePdf(ruta), html }
}

async function pdfTermico(nombre, lineas, anchoMm) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0}body{font:9px/1.35 'Menlo','SF Mono',monospace;padding:3mm 2mm}pre{margin:0;font:inherit;white-space:pre;overflow:hidden}</style></head><body><pre>${lineas.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre></body></html>`
  await page.setContent(html, { waitUntil: 'load' })
  const alto = Math.ceil((await page.locator('pre').evaluate((el) => el.getBoundingClientRect().height)) / 3.7795275591) + 20
  const ruta = join(SALIDA, `${nombre}.pdf`)
  await page.pdf({ path: ruta, width: `${anchoMm}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '2mm', bottom: '2mm', left: '1mm', right: '1mm' } })
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 75, fullPage: true })
  return { ruta, paginas: paginasDePdf(ruta) }
}

/** Render de la primera página del PDF a PNG (para leer el QR con Vision). */
function pngDePdf(ruta, destino) {
  execFileSync('sips', ['-s', 'format', 'png', '-Z', '1600', ruta, '--out', destino], { stdio: 'pipe' })
  return destino
}

/** Decodifica los QR de las imágenes con Vision (scripts/decode-qr.swift). */
function leerQr(imagenes) {
  const argumentos = [join(RAIZ, 'scripts/decode-qr.swift'), ...imagenes]
  if (SDK_SWIFT) argumentos.unshift('-sdk', SDK_SWIFT)
  let salida = ''
  try {
    salida = execFileSync('swift', argumentos, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    // El lector sale con 1 cuando alguna imagen no tiene QR: se sigue igual
    // para que el reporte diga cuál falló y por qué.
    salida = String(error.stdout || '')
  }
  return Object.fromEntries(salida.trim().split('\n').filter(Boolean).map((linea) => {
    const [estado, ruta, valor] = linea.split('\t')
    return [ruta, { estado, valor: valor || '' }]
  }))
}

function validarHtml(html, { dsn = false, tipo = 'informe' } = {}) {
  const problemas = []
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const marcas = ['Informe público', 'Escaneá para abrir el informe público.']
  marcas.push(...(tipo === 'informe' ? ['Verificación IMEI', 'Inspección física'] : ['Controles', 'Checklist', 'Verificación']))
  for (const marca of marcas) {
    if (!texto.includes(marca)) problemas.push(`falta «${marca}»`)
  }
  if (!html.includes('•••••••••••0004')) problemas.push('el IMEI no va enmascarado')
  if (html.includes(imeiDemo)) problemas.push('el IMEI completo aparece en el documento')
  if (dsn && tipo === 'informe') {
    for (const marca of ['Táctil y multitouch', 'Altavoz y auricular', 'Crujido al máximo volumen', 'Lentes de cámara', 'Grado', 'B']) {
      if (!texto.includes(marca)) problemas.push(`falta «${marca}» (checklist DSN)`)
    }
  }
  if (dsn && tipo === 'certificado') {
    for (const marca of ['Táctil y multitouch', 'Lentes de cámara', 'Altavoz y auricular', 'Puntaje 95/100', 'Grado']) {
      if (!texto.includes(marca)) problemas.push(`falta «${marca}» (certificado DSN)`)
    }
  }
  return problemas
}

/** El certificado es una constancia de una página; el informe puede usar dos. */
const paginasEsperadas = (item) => (item.tipo === 'certificado' ? 1 : item.nombre.endsWith('-a4') ? 2 : 1)

const generados = []
try {
  const casos = [
    { clave: 'inv', nombre: 'checklist de INV (10 ítems)', inspection: inspeccionINV, dsn: false },
    { clave: 'dsn', nombre: 'checklist de la UI de DSN (23 ítems)', inspection: inspeccionDSN, dsn: true },
  ]
  for (const caso of casos) {
    const conInspeccion = { ...unidad, inspection: caso.inspection }
    const datosInforme = await datosDe('/src/lib/printing/informeDispositivo.js', 'datosInformeDispositivo', [conInspeccion, { consulta, base: BASE_APP, emisor: 'Móvil Center (demo)', ahora: HOY }])
    if (datosInforme.enlace !== ENLACE_INFORME) throw new Error(`el informe debe apuntar al informe público (quedó «${datosInforme.enlace}»)`)
    for (const formato of ['a4', 'thermal-80']) {
      const nombre = `informe-${caso.clave}-${formato === 'a4' ? 'a4' : '80mm'}`
      const html = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildInformeDispositivoHtml', [datosInforme, { format: formato }])
      const pdf = await pdfHtml(nombre, html, formato)
      generados.push({ nombre, ...pdf, tipo: 'informe', caso: caso.clave, dsn: caso.dsn, qr: true })
    }
    const lineasInforme = await lineasDe('ticketInformeDispositivo', [datosInforme, { ancho: 80 }])
    const escpos = await pdfTermico(`informe-${caso.clave}-80mm-escpos`, lineasInforme, 80)
    const bytes = await page.evaluate(async (argumentos) => {
      const mod = await import(/* @vite-ignore */ '/src/lib/printing/tickets.js')
      return mod.ticketInformeDispositivo(...argumentos).base64()
    }, [datosInforme, { ancho: 80 }])
    const textoEscpos = Buffer.from(bytes, 'base64').toString('latin1')
    if (!textoEscpos.includes(ENLACE_INFORME)) throw new Error(`el ESC/POS ${caso.clave} no lleva el enlace al informe público`)
    resultados.push({ documento: `informe-${caso.clave}-80mm-escpos`, caso: caso.clave, tipo: 'escpos', paginas: escpos.paginas, qr: ENLACE_INFORME, estado: 'ok', detalle: 'enlace verificado en los bytes ESC/POS' })

    const datosCertificado = await datosDe('/src/lib/printing/certificado.js', 'datosCertificado', [conInspeccion, { verificacion: consulta, base: BASE_APP, emisor: 'Móvil Center (demo)', ahora: HOY }])
    const htmlCertificado = await datosDe('/src/components/shared/OrderReceipt.jsx', 'buildCertificadoHtml', [datosCertificado, { format: 'a4' }])
    const pdfCertificado = await pdfHtml(`certificado-${caso.clave}-a4`, htmlCertificado, 'a4')
    generados.push({ nombre: `certificado-${caso.clave}-a4`, ...pdfCertificado, tipo: 'certificado', caso: caso.clave, dsn: caso.dsn, qr: true, grado: datosCertificado.grado })

  }

  // Verificación del QR: PNG de la primera página → Vision.
  const imagenes = generados.filter((item) => item.qr).map((item) => pngDePdf(item.ruta, join(SALIDA, `${item.nombre}-pagina1.png`)))
  const lecturas = leerQr(imagenes)
  const problemaVision = []
  for (const item of generados.filter((fila) => fila.qr)) {
    const png = join(SALIDA, `${item.nombre}-pagina1.png`)
    const lectura = lecturas[png] || {}
    const visible = item.tipo === 'certificado'
    const esperado = visible ? ENLACE_INFORME : ENLACE_INFORME
    const problemas = []
    if (lectura.estado !== 'OK') problemas.push(`QR ilegible (${lectura.valor || 'sin lectura'})`)
    else if (lectura.valor !== esperado) problemas.push(`el QR apunta a «${lectura.valor}» y no a «${esperado}»`)
    if (item.paginas > paginasEsperadas(item)) problemas.push(`salió en ${item.paginas} páginas (máximo ${paginasEsperadas(item)})`)
    problemas.push(...validarHtml(item.html, { dsn: item.dsn, tipo: item.tipo }))
    const detalle = problemas.join(' · ')
    resultados.push({ documento: item.nombre, caso: item.caso, tipo: item.tipo, paginas: item.paginas, qr: lectura.valor || '', estado: detalle ? 'fallo' : 'ok', ...(detalle ? { detalle } : {}) })
    if (detalle) problemaVision.push(`${item.nombre}: ${detalle}`)
  }
  if (problemaVision.length) {
    writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), enlace: ENLACE_INFORME, sdk: SDK_SWIFT || '(sin -sdk)', resultados }, null, 2)}\n`)
    throw new Error(problemaVision.join(' | '))
  }
} catch (error) {
  resultados.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 400) })
} finally {
  await browser.close()
}

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), enlace: ENLACE_INFORME, sdk: SDK_SWIFT || '(sin -sdk)', resultados }, null, 2)}\n`)

const filas = resultados.map((fila) => `| ${fila.documento} | ${fila.paginas ?? '—'} | ${fila.qr ? `\`${fila.qr}\`` : '—'} | ${fila.estado === 'ok' ? '✅' : '❌'}${fila.detalle ? ` ${fila.detalle}` : ''} |`).join('\n')
writeFileSync(join(SALIDA, 'REPORTE.md'), `# Verificación de PDFs y QR · informe y certificado (#240)

- Fecha: ${new Date().toISOString()}
- Enlace esperado del informe público: \`${ENLACE_INFORME}\`
- Unidad: demo \`demo-unit-5\` (iPhone 15 Pro Max, seminuevo) con IMEI ficticio válido \`${imeiDemo}\`
- Método: PDFs generados con el código de impresión de la app → PNG (sips) → QR decodificado con Vision (\`scripts/decode-qr.swift\`).

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
${filas}

**Qué cubre**: el QR de los PDFs (A4 y 80 mm) y de los ESC/POS apunta al informe público
(\`/u/<serial>\`); el IMEI va enmascarado (nunca el completo); el checklist se imprime con los
dos vocabularios (INV: 10 ítems con observación; DSN: 23 ítems con estados pasa/falla/na,
notas y batería salud → grado B).

**Pendiente de DSN**: la página pública sin sesión. Hoy la ruta existe en la app (pide sesión);
cuando DSN defina la URL pública, se pasa \`enlace\` y el QR apunta ahí sin tocar el diseño.
`)
console.log(`Verificación #240: ${resultados.length - fallos.length}/${resultados.length} OK · QR → ${ENLACE_INFORME}`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
