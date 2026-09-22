// Verificación del demo público de IMPRESIÓN (#194 y #196).
//
// Spec reutilizable: corre contra cualquier base (local o producción) y
// verifica que la pantalla de Impresoras del demo anónimo se vea y funcione con
// DATOS FICTICIOS: banner, impresoras, estados honestos, auto-validación del
// código, cola con cancelación individual/lote, anti-duplicados y prueba
// simulada. Falla si impresión llama al backend real (no hay sesión en el demo)
// y reporta aparte las llamadas de otros módulos.
//
// Uso local:   QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-194-impresion-demo.mjs
// Uso prod:    QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/196-impresion-prod node scripts/qa-194-impresion-demo.mjs
// Salida: docs/qa/<carpeta>/*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:5273'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/194-impresion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
// Solo llamadas al API: los módulos de dev de vite viven en /src/lib/api/*.js.
page.on('request', (peticion) => {
  const url = peticion.url()
  if (url.includes('/src/')) return
  if (/\/api\//.test(url)) llamadasApi.push(`${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`)
})
const esDeImpresion = (llamada) => /\/api\/print/.test(llamada)

let contador = 0
async function shot(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72, fullPage: false })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(async (captura) => { capturas.push(await captura); return capturas.at(-1) })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await shot(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)
const filaDe = (validacion) => page.getByRole('row').filter({ hasText: validacion })

await paso('entrada a la demo como dueño', async (captura) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1200)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await esperar(2000)
  await captura(shot('panel-demo'))
  return 'demo abierta como dueño'
})

await paso('Impresoras en demo: banner de ficticios y dos impresoras', async (captura) => {
  await page.goto(`${BASE}/configuracion/impresoras`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  await captura(shot('impresoras-demo'))
  const texto = await page.locator('body').innerText()
  const banner = /Datos ficticios de demostración/i.test(texto)
  const mostrador = /Térmica mostrador/.test(texto)
  const deposito = /Térmica depósito/.test(texto)
  if (!banner || !mostrador || !deposito) throw new Error(`faltan datos demo (banner=${banner} mostrador=${mostrador} deposito=${deposito})`)
  return 'banner de ficticios + 2 impresoras demo visibles'
})

await paso('actividad demo con estados honestos', async (captura) => {
  await page.getByRole('button', { name: /Actividad de impresión/ }).click().catch(() => {})
  await esperar(800)
  await captura(shot('actividad-demo'))
  const texto = await page.locator('body').innerText()
  const estados = ['pendiente', 'aceptado', 'incierto', 'fallido', 'cancelado'].filter((estado) => new RegExp(estado, 'i').test(texto))
  const inputs = await page.getByLabel(/Número secreto de la validación/).count()
  if (estados.length < 5) throw new Error(`estados visibles: ${estados.join(', ') || 'ninguno'}`)
  if (inputs < 3) throw new Error(`inputs de validación: ${inputs}`)
  return `estados=${estados.join('/')} · inputs de validación=${inputs}`
})

await paso('auto-validación demo: 1 dígito valida solo', async (captura) => {
  const fila = filaDe('DEMO-01')
  await fila.getByLabel(/Número secreto de la validación DEMO-01/).fill('4')
  await expectVisible(fila.getByText('✓ en papel'), 8000, 'la fila DEMO-01 no pasó a confirmada')
  await captura(shot('validacion-un-digito'))
  return 'escribir el dígito ficticio confirmó sin apretar Confirmar'
})

await paso('auto-validación demo: 4 dígitos y aviso de no coincide', async (captura) => {
  const fila = filaDe('DEMO-02')
  const entrada = fila.getByLabel(/Número secreto de la validación DEMO-02/)
  await entrada.fill('9999')
  await expectVisible(page.getByText('No coincide', { exact: true }).first(), 8000, 'no avisó del número incorrecto')
  await captura(shot('validacion-no-coincide'))
  await entrada.fill('1234')
  await expectVisible(fila.getByText('✓ en papel'), 8000, 'no confirmó al completar los 4 dígitos')
  await captura(shot('validacion-cuatro-digitos'))
  return 'avisó con el número incorrecto y confirmó al completar el largo'
})

await paso('cola demo: pendientes y fallidos con reintento simulado', async (captura) => {
  await page.getByRole('button', { name: 'Ver cola' }).click()
  await esperar(900)
  await captura(shot('cola-modal'))
  const dialogo = page.getByRole('dialog')
  const texto = await dialogo.innerText()
  const pendientes = /pendientes del agente \(2\)/i.test(texto)
  const fallidos = /fallidos \(1\)/i.test(texto)
  if (!pendientes || !fallidos) throw new Error(`la cola demo no muestra las secciones esperadas (${texto.slice(0, 120).replace(/\s+/g, ' ')})`)
  await dialogo.getByRole('button', { name: 'Reintentar fallidos' }).click()
  await expectVisible(page.getByText(/Reintento simulado \(demo\)/).first(), 6000, 'no avisó del reintento simulado')
  await captura(shot('cola-reintento-simulado'))
  await page.keyboard.press('Escape')
  return 'cola con pendientes/fallidos y reintento simulado avisado'
})

await paso('prueba de impresión demo simulada', async (captura) => {
  await page.getByRole('button', { name: 'Imprimir prueba' }).first().click()
  await esperar(700)
  await page.getByRole('dialog').getByRole('button', { name: 'Imprimir prueba' }).click()
  await expectVisible(page.getByText(/Prueba simulada \(demo\)/).first(), 6000, 'no avisó de la prueba simulada')
  await captura(shot('prueba-simulada'))
  return 'la prueba avisa que es simulada y no envía nada'
})

await paso('cancelación demo: individual y en lote desde la cola', async (captura) => {
  await page.getByRole('button', { name: 'Ver cola' }).click()
  await esperar(700)
  const dialogo = page.getByRole('dialog')
  await captura(shot('cola-antes-de-cancelar'))
  const individual = dialogo.getByRole('button', { name: 'Cancelar', exact: true }).first()
  await individual.click()
  await expectVisible(page.getByText(/Trabajo cancelado \(demo\)|trabajos cancelados \(demo\)/).first(), 6000, 'no avisó la cancelación individual')
  await captura(shot('cola-cancelacion-individual'))
  const enLote = dialogo.getByRole('button', { name: /Cancelar pendientes/ })
  if (await enLote.count()) {
    await enLote.click()
    await expectVisible(page.getByText(/trabajos cancelados \(demo\)/).first(), 6000, 'no avisó la cancelación en lote')
    await captura(shot('cola-cancelacion-lote'))
  }
  await page.keyboard.press('Escape')
  return 'cancelación individual y en lote con aviso de demo'
})

await paso('anti-duplicados demo: aviso de duplicado y «Reimprimir igual»', async (captura) => {
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('pedido-fila').first()
  if (!(await fila.count())) throw new Error('la lista de pedidos de la demo no cargó filas')
  await fila.click()
  await esperar(1500)
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await esperar(600)
  await page.getByRole('dialog').getByRole('button', { name: 'Impresión directa' }).click()
  await expectVisible(page.getByText(/Comprobante encolado \(demo\)/).first(), 8000, 'el primer encolado demo no avisó')
  await captura(shot('duplicado-primer-encolado'))
  await page.getByRole('dialog').getByRole('button', { name: 'Impresión directa' }).click()
  const reimprimir = page.getByRole('button', { name: 'Reimprimir igual' })
  await expectVisible(reimprimir, 8000, 'no apareció el aviso de duplicado con «Reimprimir igual»')
  await captura(shot('duplicado-aviso'))
  await reimprimir.click()
  await expectVisible(page.getByText(/Reimpresión encolada \(demo\)/).first(), 8000, '«Reimprimir igual» no encoló la copia demo')
  await captura(shot('duplicado-reimprimir'))
  return 'el segundo click avisó del duplicado y «Reimprimir igual» sumó una copia ficticia'
})

const tokenDelComprobante = async (page) => {
  const marco = page.locator('iframe[title="Vista previa del comprobante"]')
  await marco.waitFor({ state: 'attached', timeout: 15000 })
  const html = await marco.evaluate((nodo) => nodo.getAttribute('srcdoc') || '')
  const encontrado = html.match(/\/pedidos\/([A-Za-z0-9._-]+)/)
  return encontrado ? encontrado[1] : ''
}

await paso('QR del comprobante en demo: token ficticio estable y por nivel (#204)', async (captura) => {
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('pedido-fila').first()
  if (!(await fila.count())) throw new Error('la lista de pedidos de la demo no cargó filas')
  await fila.click()
  await esperar(1500)
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await esperar(1200)
  // #208: el nivel por defecto sin preferencia es «Rápido»; se fija «Completo»
  // para comparar la reimpresión del mismo nivel.
  await page.getByRole('radio', { name: /Comprobante Completo/ }).click()
  await esperar(800)
  await captura(shot('qr-comprobante-demo'))
  const tokenCompleto = await tokenDelComprobante(page)
  if (!/^demo-/.test(tokenCompleto)) throw new Error(`el QR demo no usa un token ficticio: ${tokenCompleto || '(vacío)'}`)
  const html = await page.locator('iframe[title="Vista previa del comprobante"]').evaluate((nodo) => nodo.getAttribute('srcdoc') || '')
  if (/MOBOS:/.test(html)) throw new Error('el QR demo usa el esquema viejo MOBOS:')
  if (!/https?:\/\//.test(html)) throw new Error('el QR demo no apunta a una URL absoluta de la app')
  // Cambiar de nivel emite el token de ese nivel…
  await page.getByRole('radio', { name: /Comprobante Detallado/ }).click()
  await esperar(1200)
  const tokenDetallado = await tokenDelComprobante(page)
  if (!tokenDetallado || tokenDetallado === tokenCompleto) throw new Error(`el nivel detallado reutilizó el token de completo: ${tokenDetallado}`)
  await captura(shot('qr-demo-nivel-detallado'))
  // …y volver al nivel original reutiliza el mismo token (reimpresión).
  await page.getByRole('radio', { name: /Comprobante Completo/ }).click()
  await esperar(1200)
  const tokenReimpreso = await tokenDelComprobante(page)
  if (tokenReimpreso !== tokenCompleto) throw new Error(`reimprimir el mismo nivel cambió el token: ${tokenReimpreso} vs ${tokenCompleto}`)
  return `token ficticio estable por nivel (${tokenCompleto}) y reimpresión con el mismo token`
})

async function expectVisible(locator, timeout, mensaje) {
  try {
    await locator.waitFor({ state: 'visible', timeout })
  } catch {
    throw new Error(mensaje)
  }
}

await browser.close()
const llamadasImpresion = llamadasApi.filter(esDeImpresion)
const llamadasOtros = llamadasApi.filter((llamada) => !esDeImpresion(llamada))
const erroresRed = erroresConsola.filter((mensaje) => /Failed to load resource|ERR_|net::/i.test(mensaje))
const erroresOtros = erroresConsola.filter((mensaje) => !erroresRed.includes(mensaje))
const informe = {
  base: BASE,
  fecha: new Date().toISOString(),
  resultados,
  llamadasAlApi: llamadasApi,
  llamadasDeImpresion: llamadasImpresion,
  llamadasDeOtrosModulos: llamadasOtros,
  erroresConsola,
  erroresDeRed: erroresRed,
  erroresOtros,
  veredicto: {
    pasosOk: resultados.filter((fila) => fila.estado === 'ok').length,
    pasosTotal: resultados.length,
    llamadasDeImpresion: llamadasImpresion.length,
    llamadasDeOtrosModulos: llamadasOtros.length,
    erroresDeRed: erroresRed.length,
  },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(informe, null, 2)}\n`)
console.log(`\nResultados: ${SALIDA}/resultados.json`)
console.log(`Impresión → llamadas al API: ${llamadasImpresion.length} · pasos OK: ${informe.veredicto.pasosOk}/${informe.veredicto.pasosTotal}`)
console.log(`Otros módulos → llamadas: ${llamadasOtros.length} · errores de red: ${erroresRed.length} · otros errores: ${erroresOtros.length}`)
if (llamadasOtros.length) console.log(['(hallazgos de otros módulos)', ...new Set(llamadasOtros)].slice(0, 10).join('\n'))
// Falla si la impresión tocó el API o si un paso quedó en fallo; lo ajeno y lo
// no-aplicable se reporta sin romper el veredicto.
if (llamadasImpresion.length) { console.error('IMPRESIÓN llamó al API real:'); console.error(llamadasImpresion.slice(0, 8).join('\n')); process.exitCode = 1 }
if (resultados.some((fila) => fila.estado === 'fallo')) process.exitCode = 1
