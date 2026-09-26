// Ejemplo de los impresos en serie del taller (#240): la **hoja de estación**
// (una por carril) y los **certificados de inspección** (uno por equipo) que el
// rack manda con los mismos builders que la app.
//
//   npx vite --port 5277 --strictPort --host 127.0.0.1 &
//   QA_BASE_URL=http://127.0.0.1:5277 node scripts/ejemplo-taller-impresos.mjs
//
// Salida: docs/taller-impresos-ejemplo/ (PDFs + JPG + datos).
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listDemoBranches, listDemoLocations, listDemoUnits } from '../src/lib/demoInventory.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5277'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/taller-impresos-ejemplo')
mkdirSync(SALIDA, { recursive: true })

const BASE_APP = 'https://app.moboss.online'
const HOY = new Date('2026-09-26T10:00:00Z')
const enDias = (dias) => new Date(HOY.getTime() + dias * 86_400_000).toISOString()

// Unidades demo reales del repo, con inspección de ejemplo (estados de INV) en
// algunas: es lo que muestra la hoja y lo que firma el certificado.
const demo = listDemoUnits('', 'active')
const conUbicacion = (unidad) => ({
  ...unidad,
  branch: listDemoBranches().find((rama) => rama.id === unidad.branchId) || undefined,
  location: listDemoLocations(unidad.branchId).find((lugar) => lugar.id === unidad.locationId) || undefined,
})
const inspeccionDe = (grado, puntaje, extra = {}) => ({
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
  bateriaPct: String(extra.bateria || 89),
  bateriaCiclos: extra.ciclos || '312',
  puntaje,
  grado,
  inspeccionadoAt: enDias(-1),
  inspeccionadoPor: 'Jorge Villalba',
  ...extra,
})

const unidades = demo.slice(0, 6).map(conUbicacion)
if (unidades.length < 6) throw new Error('la demo no tiene 6 unidades activas para el ejemplo')
// Una verificada y con grado, otra pendiente: los tres carriles del rack.
const grupos = [
  { estacion: 'Por verificar', unidades: unidades.slice(0, 2) },
  { estacion: 'Verificado', unidades: [{ ...unidades[2], inspection: inspeccionDe('B', 82) }, { ...unidades[3], inspection: inspeccionDe('C', 68) }] },
  { estacion: 'Listo para vender', unidades: [{ ...unidades[4], inspection: inspeccionDe('A', 96, { bateria: 92, ciclos: '188' }) }, { ...unidades[5], inspection: inspeccionDe('A', 94) }] },
]

// Consulta IMEI de ejemplo (en la demo real figura como simulada).
const consultaDe = (serial) => ({
  imei: serial,
  status: 'verificado',
  resolvedAt: enDias(-1),
  normalized: [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Off' },
    { clave: 'simLock', etiqueta: 'SIM lock', valor: 'Unlocked' },
    { clave: 'mdm', etiqueta: 'MDM', valor: 'Apagado' },
  ],
})

const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1240, height: 1600 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

async function pdfHtml(nombre, html, formato = 'a4') {
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(300)
  const ruta = join(SALIDA, `${nombre}.pdf`)
  if (formato === 'a4') {
    await page.pdf({ path: ruta, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } })
  } else {
    const alto = Math.ceil((await page.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await page.pdf({ path: ruta, width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  const paginas = readFileSync(ruta).toString('latin1').split('/Type /Page').length - readFileSync(ruta).toString('latin1').split('/Type /Pages').length
  pasos.push({ documento: nombre, archivo: `${nombre}.pdf`, formato: formato === 'a4' ? 'A4' : formato, paginas })
}

try {
  // 1) Hoja de estación en serie: una hoja por carril.
  const htmlHojas = await page.evaluate(async ({ grupos, hoy }) => {
    const { buildStationSheetsHtml } = await import('/src/lib/printing/hojaEstacion.js')
    return buildStationSheetsHtml(grupos, { fecha: new Date(hoy) })
  }, { grupos, hoy: HOY.toISOString() })
  await pdfHtml('hoja-estacion-serie', htmlHojas)

  // 1 bis) Hoja individual de un carril (el botón «Hoja de estación»), para
  // comparar con la serie.
  const htmlHoja = await page.evaluate(async ({ unidades, hoy }) => {
    const { buildStationSheetHtml } = await import('/src/lib/printing/hojaEstacion.js')
    return buildStationSheetHtml(unidades, { estacion: 'Por verificar', fecha: new Date(hoy) })
  }, { unidades: grupos[0].unidades, hoy: HOY.toISOString() })
  await pdfHtml('hoja-estacion-por-verificar', htmlHoja)

  // 2) Certificados finales en serie: uno por equipo verificado.
  const listas = grupos.find((grupo) => grupo.estacion === 'Listo para vender').unidades
  const htmlCertificados = await page.evaluate(async ({ unidades, consultas, base, emisor, hoy }) => {
    const { datosCertificado } = await import('/src/lib/printing/certificado.js')
    const { buildCertificadosHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    const datos = unidades.map((unidad, indice) => datosCertificado(unidad, {
      verificacion: consultas[indice],
      base,
      emisor,
      ahora: new Date(hoy),
    }))
    return buildCertificadosHtml(datos, { format: 'a4' })
  }, {
    unidades: listas,
    consultas: listas.map((unidad) => consultaDe(unidad.serial)),
    base: BASE_APP,
    emisor: 'Móvil Center (demo)',
    hoy: HOY.toISOString(),
  })
  await pdfHtml('certificados-serie', htmlCertificados)

  writeFileSync(join(SALIDA, 'datos-ejemplo.json'), `${JSON.stringify({
    estaciones: grupos.map((grupo) => ({ estacion: grupo.estacion, equipos: grupo.unidades.map((unidad) => ({ modelo: unidad.product?.name, serial: unidad.serial, grado: unidad.inspection?.grado || null })) })),
    generado: new Date().toISOString(),
  }, null, 2)}\n`)
} catch (error) {
  pasos.push({ documento: 'error', estado: 'fallo', detalle: String(error?.message || error).slice(0, 400) })
} finally {
  await browser.close()
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2)}\n`)
console.log(`Impresos del taller #240: ${pasos.length} documentos`)
for (const paso of pasos) console.log(`- ${paso.documento} → ${paso.archivo}${paso.paginas ? ` (${paso.paginas} pág.)` : ''}`)
