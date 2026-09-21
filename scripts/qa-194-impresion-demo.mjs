// QA del modo demo para impresión (#194).
//
// Verifica que la pantalla de Impresoras se vea y funcione con DATOS DEMO
// (impresoras, cola, actividad, verificación en papel) y que NO se llame al
// backend real: el arnés corre contra un server local de la app (solo front) y
// falla si aparece alguna request a /api/**.
//
// Uso:  QA_BASE_URL=http://127.0.0.1:5273 node scripts/qa-194-impresion-demo.mjs
// Salida: docs/qa/194-impresion/*.jpg + resultados.json
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
  const mostrador = /Térmica mostrador \(demo\)/.test(texto)
  const deposito = /Térmica depósito \(demo\)/.test(texto)
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
// Falla si la impresión tocó el API o si un paso no quedó OK; lo ajeno se reporta.
if (llamadasImpresion.length) { console.error('IMPRESIÓN llamó al API real:'); console.error(llamadasImpresion.slice(0, 8).join('\n')); process.exitCode = 1 }
if (resultados.some((fila) => fila.estado !== 'ok')) process.exitCode = 1
