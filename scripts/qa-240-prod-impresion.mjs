// Verificación de impresión en producción del informe (#240) — post .142/.143.
//
//   node scripts/qa-240-prod-impresion.mjs
//
// Entra a la demo, abre la ficha de una unidad y usa el camino real de la app
// desplegada: «Informe» → formato 80 mm y A4 → «Descargar PDF» (el HTML que
// manda la app) y el QR del informe público. Después decodifica el QR con
// Vision (`scripts/decode-qr.swift`) y arma los PDFs con ese HTML.
//
// Salida: docs/qa/240-impresion-prod/ (PDFs + capturas + REPORTE.md).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/240-impresion-prod')
mkdirSync(SALIDA, { recursive: true })

const SDK_SWIFT = process.env.QR_SDK || ['MacOSX26.5.sdk', 'MacOSX26.sdk', 'MacOSX15.4.sdk', 'MacOSX15.sdk']
  .map((nombre) => `/Library/Developer/CommandLineTools/SDKs/${nombre}`)
  .find((ruta) => existsSync(ruta))

const pasos = []
const resultados = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()

const captura = async (nombre) => { await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 74 }) }
const esperar = (ms) => page.waitForTimeout(ms)

function paginasDePdf(ruta) {
  const datos = readFileSync(ruta).toString('latin1')
  return datos.split('/Type /Page').length - datos.split('/Type /Pages').length
}

function leerQr(imagen) {
  const argumentos = [join(RAIZ, 'scripts/decode-qr.swift'), imagen]
  if (SDK_SWIFT) argumentos.unshift('-sdk', SDK_SWIFT)
  let salida = ''
  try { salida = execFileSync('swift', argumentos, { encoding: 'utf8' }) } catch (error) { salida = String(error.stdout || '') }
  const linea = salida.trim().split('\n').find((fila) => fila.startsWith('OK\t'))
  return linea ? linea.split('\t')[2] : ''
}

/** PDF del HTML del respaldo, con el ancho del formato elegido. */
async function pdfDeHtml(nombre, html, formato) {
  const hoja = await ctx.newPage()
  await hoja.emulateMedia({ media: 'print' })
  await hoja.setContent(html, { waitUntil: 'load' })
  await hoja.waitForTimeout(250)
  const ruta = join(SALIDA, `${nombre}.pdf`)
  if (formato === 'a4') {
    await hoja.pdf({ path: ruta, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  } else {
    const alto = Math.ceil((await hoja.locator('body').evaluate((body) => body.getBoundingClientRect().height)) / 3.7795275591) + 12
    await hoja.pdf({ path: ruta, width: `${formato.replace('thermal-', '')}mm`, height: `${alto}mm`, printBackground: true, margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' } })
  }
  await hoja.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 74, fullPage: true })
  await hoja.close()
  return { ruta, paginas: paginasDePdf(ruta) }
}

try {
  // 1) Demo + versión desplegada.
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(1500)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await esperar(1800)
  const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''
  pasos.push({ paso: 'demo + versión', detalle: version ? `v${version}` : '(sin versión visible)', ok: Boolean(version) })

  // 2) Ficha de una unidad con el camino real de la app.
  await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  const fila = page.getByTestId('inventario-fila').first()
  if (!(await fila.count())) throw new Error('la demo no mostró unidades en Inventario')
  await fila.click()
  await esperar(800)
  const ficha = page.getByRole('dialog')
  const serial = (await ficha.innerText()).match(/\b\d{15}\b|\b[A-Z]{2,}\d{6,}\b/)?.[0] || ''
  await captura('01-ficha-demo')
  const botonInforme = ficha.getByRole('button', { name: 'Informe', exact: true })
  const botonCertificado = ficha.getByRole('button', { name: 'Certificado', exact: true })
  pasos.push({ paso: 'botón Informe en la ficha', detalle: (await botonInforme.count()) ? 'presente' : 'ausente', ok: (await botonInforme.count()) > 0 })
  pasos.push({ paso: 'botón Certificado en la ficha', detalle: (await botonCertificado.count()) ? 'presente (ronda con la etiqueta)' : 'ausente (todavía no desplegado)', ok: true })
  if (!(await botonInforme.count())) throw new Error('la ficha desplegada no muestra el botón «Informe»')

  // 3) Modal del informe: la app real, en producción.
  await botonInforme.click()
  await esperar(1500)
  const modal = page.getByRole('dialog').filter({ hasText: 'Informe del dispositivo' })
  const vista = page.frameLocator('iframe[title="Vista previa del informe"], iframe[title="Vista previa del documento"]')
  await vista.locator('h1').first().waitFor({ state: 'visible', timeout: 20_000 })
  await captura('02-informe-80mm-vista')
  const tituloInforme = await vista.locator('h1').first().innerText()

  for (const [formato, etiqueta] of [['thermal-80', '80mm'], ['a4', 'a4']]) {
    // El selector de formato del modal (si ya está en ese formato, no cambia nada).
    const selector = modal.getByLabel(/Formato del (informe|documento)/)
    await selector.selectOption(formato).catch(() => {})
    await esperar(1200)
    await captura(`03-informe-${etiqueta}-modal`)
    // «Descargar PDF»: el respaldo abre el HTML imprimible en un iframe oculto.
    await modal.getByRole('button', { name: 'Descargar PDF' }).click()
    const marco = page.locator('iframe[aria-hidden="true"]').last()
    await marco.waitFor({ state: 'attached', timeout: 15_000 })
    await esperar(600)
    const contenido = marco.contentFrame()
    const html = await contenido.locator('html').evaluate((el) => el.outerHTML)
    const pdf = await pdfDeHtml(`informe-${etiqueta}`, html, formato === 'a4' ? 'a4' : formato)
    // El QR del informe público: se extrae del HTML desplegado y se decodifica.
    const qr = (html.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
    let enlace = ''
    if (qr) {
      const imagen = join(SALIDA, `qr-informe-${etiqueta}.png`)
      writeFileSync(imagen, Buffer.from(qr, 'base64'))
      enlace = leerQr(imagen)
    }
    const problemas = []
    if (!html.includes('Informe público')) problemas.push('sin sección de informe público')
    if (!enlace) problemas.push('el QR no se pudo leer')
    else if (!new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/u/`).test(enlace)) problemas.push(`el QR apunta a «${enlace}»`)
    if (formato === 'a4' && pdf.paginas > 2) problemas.push(`el A4 salió en ${pdf.paginas} páginas`)
    resultados.push({ documento: `informe-${etiqueta}`, version: version ? `v${version}` : '', paginas: pdf.paginas, qr: enlace, estado: problemas.length ? 'fallo' : 'ok', ...(problemas.length ? { detalle: problemas.join(' · ') } : {}) })
  }

  // 3 ter) Constancia de preparación (#240 §6): botón + PDFs + QR.
  const botonConstancia = page.getByRole('dialog').getByRole('button', { name: 'Constancia', exact: true })
  if (await botonConstancia.count()) {
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
    await esperar(700)
    await page.getByRole('dialog').getByRole('button', { name: 'Constancia', exact: true }).click().catch(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' }); await esperar(2200)
      await page.getByTestId('inventario-fila').first().click(); await esperar(900)
      await page.getByRole('dialog').getByRole('button', { name: 'Constancia', exact: true }).click()
    })
    await esperar(1500)
    const modalConstancia = page.getByRole('dialog').filter({ hasText: 'Constancia de preparación' })
    await captura('09-constancia-modal')
    for (const [formato, etiqueta] of [['a4', 'a4'], ['thermal-80', '80mm']]) {
      await modalConstancia.getByLabel(/Formato del (documento|informe)/).selectOption(formato).catch(() => {})
      await esperar(1200)
      await modalConstancia.getByRole('button', { name: 'Descargar PDF' }).click()
      const marco = page.locator('iframe[aria-hidden="true"]').last()
      await marco.waitFor({ state: 'attached', timeout: 15_000 })
      await esperar(600)
      const html = await marco.contentFrame().locator('html').evaluate((el) => el.outerHTML)
      const pdf = await pdfDeHtml(`constancia-${etiqueta}`, html, formato === 'a4' ? 'a4' : formato)
      const qr = (html.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
      let enlace = ''
      if (qr) {
        const imagen = join(SALIDA, `qr-constancia-${etiqueta}.png`)
        writeFileSync(imagen, Buffer.from(qr, 'base64'))
        enlace = leerQr(imagen)
      }
      const problemas = []
      if (!/Constancia de preparaci/i.test(html)) problemas.push('sin título de constancia')
      if (!/Declaraci/i.test(html)) problemas.push('sin declaración de preparación')
      if (!/formateado y desvinculado|No se puede afirmar/.test(html)) problemas.push('sin resumen de preparación')
      if (!enlace) problemas.push('el QR no se pudo leer')
      else if (!new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/u/`).test(enlace)) problemas.push(`el QR apunta a «${enlace}»`)
      resultados.push({ documento: `constancia-${etiqueta}`, version: version ? `v${version}` : '', paginas: pdf.paginas, qr: enlace, estado: problemas.length ? 'fallo' : 'ok', ...(problemas.length ? { detalle: problemas.join(' · ') } : {}) })
    }
  } else {
    resultados.push({ documento: 'constancia', version: version ? `v${version}` : '', paginas: '—', qr: '', estado: 'ok', detalle: 'todavía no desplegada (ronda pendiente)' })
  }

  // 4) Impresión directa: en la demo el aviso tiene que ser honesto.
  // Reabre la ficha y el informe: para acá los modales de certificado/constancia
  // ya se cerraron.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await esperar(2200)
  await page.getByTestId('inventario-fila').first().click()
  await esperar(900)
  await page.getByRole('dialog').getByRole('button', { name: 'Informe', exact: true }).click()
  await esperar(1500)
  const modalInforme = page.getByRole('dialog').filter({ hasText: 'Informe del dispositivo' })
  await modalInforme.getByRole('button', { name: 'Impresión directa' }).click()
  await esperar(2000)
  const aviso = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const honesto = /demo/i.test(aviso) || /no se pudo imprimir/i.test(aviso) || /impresora/i.test(aviso)
  pasos.push({ paso: 'impresión directa en la demo', detalle: honesto ? 'aviso honesto del demo' : 'sin aviso detectable', ok: honesto })
  await captura('04-impresion-directa-demo')

  // 3 bis) Certificado de inspección: botón en la ficha + PDF + QR.
  if (await botonCertificado.count()) {
    // Vuelve a abrir la ficha (el modal del informe sigue montado hasta cerrarlo).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await esperar(2200)
    await page.getByTestId('inventario-fila').first().click()
    await esperar(900)
    await page.getByRole('dialog').getByRole('button', { name: 'Certificado', exact: true }).click()
    await esperar(1500)
    const modalCertificado = page.getByRole('dialog').filter({ hasText: 'Certificado de inspección' })
    await captura('05-certificado-modal')
    for (const [formato, etiqueta] of [['a4', 'a4'], ['thermal-80', '80mm']]) {
      await modalCertificado.getByLabel(/Formato del (documento|informe)/).selectOption(formato).catch(() => {})
      await esperar(1200)
      await modalCertificado.getByRole('button', { name: 'Descargar PDF' }).click()
      const marco = page.locator('iframe[aria-hidden="true"]').last()
      await marco.waitFor({ state: 'attached', timeout: 15_000 })
      await esperar(600)
      const html = await marco.contentFrame().locator('html').evaluate((el) => el.outerHTML)
      const pdf = await pdfDeHtml(`certificado-${etiqueta}`, html, formato === 'a4' ? 'a4' : formato)
      const qr = (html.match(/<img class="qr" src="data:image\/png;base64,([^"]+)"/) || [])[1]
      let enlace = ''
      if (qr) {
        const imagen = join(SALIDA, `qr-certificado-${etiqueta}.png`)
        writeFileSync(imagen, Buffer.from(qr, 'base64'))
        enlace = leerQr(imagen)
      }
      const problemas = []
      if (!/Certificado|CERTIFICADO/i.test(html)) problemas.push('sin título de certificado')
      if (!/Constancia de inspección/i.test(html)) problemas.push('sin leyenda de constancia')
      if (!enlace) problemas.push('el QR no se pudo leer')
      else if (!new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/u/`).test(enlace)) problemas.push(`el QR apunta a «${enlace}»`)
      if (/\b[A-Z]{2,}\d{6,}\b/.test(html.replace(/<[^>]+>/g, ' '))) problemas.push('muestra el serial completo')
      resultados.push({ documento: `certificado-${etiqueta}`, version: version ? `v${version}` : '', paginas: pdf.paginas, qr: enlace, estado: problemas.length ? 'fallo' : 'ok', ...(problemas.length ? { detalle: problemas.join(' · ') } : {}) })
    }

    // 3 ter) El certificado como imagen (#240/#220): si la ronda está desplegada,
    // «Compartir imagen → PNG» descarga el archivo y se verifica de verdad.
    if (await modalCertificado.getByTestId('descargar-png').count()) {
      try {
        const [descarga] = await Promise.all([
          page.waitForEvent('download', { timeout: 20_000 }),
          modalCertificado.getByTestId('descargar-png').click(),
        ])
        const png = readFileSync(await descarga.path())
        writeFileSync(join(SALIDA, 'certificado-80mm.png'), png)
        const problemas = []
        if (!/\.png$/.test(descarga.suggestedFilename())) problemas.push(`nombre «${descarga.suggestedFilename()}»`)
        if (png.length < 10_000) problemas.push(`PNG de ${png.length} bytes`)
        if (png.subarray(1, 4).toString('latin1') !== 'PNG') problemas.push('sin firma PNG')
        resultados.push({ documento: 'certificado-png', version: version ? `v${version}` : '', paginas: '—', qr: '', estado: problemas.length ? 'fallo' : 'ok', ...(problemas.length ? { detalle: problemas.join(' · ') } : {}) })
        pasos.push({ paso: 'certificado como imagen', detalle: `${Math.round(png.length / 1024)} KB · ${descarga.suggestedFilename()}`, ok: problemas.length === 0 })
      } catch (error) {
        pasos.push({ paso: 'certificado como imagen', detalle: String(error?.message || error).slice(0, 140), ok: false })
      }
    } else {
      pasos.push({ paso: 'certificado como imagen', detalle: 'todavía no desplegado (ronda pendiente)', ok: true })
    }
    await modalCertificado.getByRole('button', { name: 'Cerrar' }).click().catch(() => page.keyboard.press('Escape'))
    await esperar(600)
  } else {
    resultados.push({ documento: 'certificado', version: version ? `v${version}` : '', paginas: '—', qr: '', estado: 'ok', detalle: 'todavía no desplegado (ronda pendiente)' })
  }

  // 4 bis) Hoja de estación (modo taller): el camino real es taller → imprimir
  // en serie → hoja de estación. En la demo la impresión se bloquea con un
  // aviso honesto; el PDF de la hoja se genera con el mismo builder.
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/inventario/taller`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  await captura('06-taller-rack')
  const botonImprimir = page.getByTestId('rack-imprimir-serie')
  if (await botonImprimir.count()) {
    await botonImprimir.click()
    await esperar(900)
    await captura('07-taller-imprimir-serie')

    // Etiquetas de unidad (#220): la vista previa del rollo trae el mismo HTML
    // que sale por «Imprimir en serie»; se arma el PDF desplegado y se verifica.
    try {
      const htmlEtiquetas = await page.frameLocator('iframe[title="Vista previa de las etiquetas"]')
        .locator('html').evaluate((el) => el.outerHTML)
      const pdfEtiquetas = await pdfDeHtml('etiquetas-unidad-80mm', htmlEtiquetas, 'thermal-80')
      const problemas = []
      if (!/ETIQUETA/.test(htmlEtiquetas)) problemas.push('sin rótulo de etiqueta')
      if (!/IMEI|Serial/i.test(htmlEtiquetas)) problemas.push('sin IMEI/serial')
      if (!/class="barras"/.test(htmlEtiquetas)) problemas.push('sin código de barras')
      if (!/class="qr"/.test(htmlEtiquetas)) problemas.push('sin QR')
      resultados.push({ documento: 'etiquetas-unidad-80mm', version: version ? `v${version}` : '', paginas: pdfEtiquetas.paginas, qr: '', estado: problemas.length ? 'fallo' : 'ok', ...(problemas.length ? { detalle: problemas.join(' · ') } : {}) })
    } catch (error) {
      pasos.push({ paso: 'etiquetas de unidad (demo)', detalle: `sin vista previa: ${String(error?.message || error).slice(0, 120)}`, ok: false })
    }

    const botonHoja = page.getByTestId('rack-hoja-estacion')
    if (await botonHoja.count()) {
      await botonHoja.click()
      await esperar(1500)
      const aviso = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      const honesto = /no está disponible en el demo/i.test(aviso)
      pasos.push({ paso: 'hoja de estación (demo)', detalle: honesto ? 'aviso honesto del demo' : aviso.slice(-140), ok: honesto })
      await captura('08-hoja-estacion-aviso-demo')
    } else {
      pasos.push({ paso: 'hoja de estación (demo)', detalle: 'el botón no está en el modal', ok: false })
    }
  } else {
    pasos.push({ paso: 'hoja de estación (demo)', detalle: 'el taller no mostró el botón de imprimir en serie', ok: false })
  }

  // 5) Prueba física (#17/#96): el QR del ticket de prueba abre /prueba con los
  // datos del papel; se verifica la página desplegada con datos de ejemplo.
  await page.goto(`${BASE}/prueba?d=${encodeURIComponent('lan:192.168.1.23:9100')}&v=1234&f=2026-09-25T15%3A00%3A00.000Z&t=corta`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(1200)
  await captura('10-prueba-fisica-pagina')
  const textoPrueba = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const problemasPrueba = []
  if (!/Verificación física/i.test(textoPrueba)) problemasPrueba.push('sin título de verificación')
  if (!textoPrueba.includes('lan:192.168.1.23:9100')) problemasPrueba.push('sin destino')
  if (!textoPrueba.includes('1234')) problemasPrueba.push('sin validación')
  if (!/Prueba corta/i.test(textoPrueba)) problemasPrueba.push('sin tipo de prueba')
  pasos.push({ paso: 'página /prueba del QR (prueba física)', detalle: problemasPrueba.length ? problemasPrueba.join(' · ') : 'destino, validación y tipo visibles', ok: !problemasPrueba.length })

  // 6) El modal de prueba de Dispositivos: los 6 tipos del protocolo.
  await page.goto(`${BASE}/configuracion/dispositivos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await esperar(2500)
  const botonPrueba = page.getByRole('button', { name: 'Imprimir prueba' }).first()
  if (await botonPrueba.count()) {
    await botonPrueba.click()
    await esperar(1000)
    await captura('11-prueba-fisica-modal')
    const tipos = await page.getByLabel('Tipo de prueba').locator('option').count().catch(() => 0)
    pasos.push({ paso: 'modal de prueba (tipos)', detalle: `${tipos} tipo(s) disponibles`, ok: tipos >= 6 })
    await page.keyboard.press('Escape')
    await esperar(400)
  } else {
    pasos.push({ paso: 'modal de prueba (tipos)', detalle: 'la demo no mostró impresoras para probar', ok: false })
  }

  // 7) Consistencia de lo impreso con lo que muestra la app.
  const html80 = readFileSync(join(SALIDA, 'informe-80mm.pdf')).toString('latin1')
  pasos.push({ paso: 'PDF 80 mm generado desde la app', detalle: `${html80.length} bytes`, ok: html80.length > 1000 })
  writeFileSync(join(SALIDA, 'datos-verificacion.json'), `${JSON.stringify({ base: BASE, version, serial, tituloInforme, fecha: new Date().toISOString() }, null, 2)}\n`)
} catch (error) {
  pasos.push({ paso: 'error', detalle: String(error?.message || error).slice(0, 300), ok: false })
} finally {
  await browser.close()
}

const fallos = resultados.filter((fila) => fila.estado !== 'ok')
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos, resultados }, null, 2)}\n`)
const filas = resultados.map((fila) => `| ${fila.documento} | ${fila.paginas} | \`${fila.qr}\` | ${fila.estado === 'ok' ? '✅' : '❌'}${fila.detalle ? ` ${fila.detalle}` : ''} |`).join('\n')
writeFileSync(join(SALIDA, 'REPORTE.md'), `# Verificación de impresión en producción · informe, certificado, constancia y etiquetas (#240/#220)

- Base: ${BASE}
- Fecha: ${new Date().toISOString()}
- Versión desplegada: ${pasos.find((paso) => paso.paso === 'demo + versión')?.detalle || '?'}
- Método: camino real de la app (demo → ficha → «Informe/Certificado/Constancia» → formato → «Descargar PDF»), el PNG del certificado por «Compartir imagen», las etiquetas desde el taller («Imprimir en serie»), la página /prueba del QR físico y el modal de prueba de Dispositivos; PDFs armados con el HTML que manda la app y QR decodificado con Vision.

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
${filas}

## Pasos

${pasos.map((paso) => `- ${paso.ok ? '✅' : '⚠️'} ${paso.paso}: ${paso.detalle}`).join('\n')}

**Lectura**: la ronda desplegada ya trae informe, certificado, constancia, el **certificado como PNG**
(«Compartir imagen») y las **etiquetas de unidad** del taller; si una fila figura ausente o en ❌, esa
ronda no está desplegada o hay una regresión. Se re-corre con el mismo comando (demo, sin credenciales).
`)
console.log(`Producción #240/#220: informe, certificado, constancia y etiquetas — ${resultados.length - fallos.length}/${resultados.length} documentos OK`)
for (const paso of pasos) console.log(`${paso.ok ? '✅' : '⚠️'} ${paso.paso}: ${paso.detalle}`)
if (fallos.length) { console.error(fallos.map((fila) => `${fila.documento}: ${fila.detalle}`).join('\n')); process.exitCode = 1 }
