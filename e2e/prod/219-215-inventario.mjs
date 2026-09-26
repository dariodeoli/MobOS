// Verificación en producción (#219/#215) del flujo de tránsito/recepción y del
// checklist de inspección del inventario, sobre la demo pública: la recepción
// de una unidad en tránsito la deja disponible en stock, el checklist se marca
// y guarda con grado/puntaje, persiste al reabrir y la verificación física deja
// firmado al usuario demo.
//
// Uso: node e2e/prod/219-215-inventario.mjs
//   QA_APP (default https://app.moboss.online) · QA_OUT para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const APP = (process.env.QA_APP || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/219-215-produccion')
mkdirSync(SALIDA, { recursive: true })

const resultado = {
  base: APP,
  version: '',
  fecha: new Date().toISOString(),
  metodo: 'Playwright headless (chromium) sobre la demo pública de producción',
  serialTransito: '',
  serialChecklist: '',
  pasos: [],
  erroresConsola: [],
  hallazgos: [],
}
let capturaN = 0

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') resultado.erroresConsola.push(msg.text().slice(0, 220)) })
page.on('pageerror', (error) => resultado.erroresConsola.push(`pageerror: ${error.message.slice(0, 220)}`))

const esperar = (ms) => page.waitForTimeout(ms)
async function captura(nombre, locator) {
  capturaN += 1
  const limpio = String(nombre).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  const archivo = `${String(capturaN).padStart(2, '0')}-${limpio}.jpg`
  const destino = { path: join(SALIDA, archivo), type: 'jpeg', quality: 78 }
  if (locator) await locator.screenshot(destino)
  else await page.screenshot({ ...destino, quality: 75, fullPage: false })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  try {
    const detalle = await fn(async (nombreCaptura, locator) => { const archivo = await captura(nombreCaptura, locator); capturas.push(archivo); return archivo })
    resultado.pasos.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultado.pasos.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas })
    resultado.hallazgos.push(`${nombre}: ${mensaje}`)
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

async function irA(ruta) { await page.goto(`${APP}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await esperar(1800) }
const buscarUnidad = async (serial) => {
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  return page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
}

await paso('entrada a la demo como dueño', async (shot) => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  resultado.version = version ? version[1] : ''
  await shot('acceso-demo')
  return `versión ${resultado.version || '?'}`
})

await paso('tránsito: la unidad en tránsito abre su recepción', async (shot) => {
  await irA('/inventario/transito')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  const texto = (await fila.innerText()).replace(/\s+/g, ' ')
  if (!/tránsito/i.test(texto)) throw new Error(`la fila no está en tránsito: ${texto.slice(0, 90)}`)
  await shot('transito-listado')
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 15000 })
  const serial = (await ficha.locator('span.font-mono').first().innerText().catch(() => '')).trim()
  resultado.serialTransito = serial
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await llegada.waitFor({ state: 'visible', timeout: 15000 })
  await esperar(500)
  const deposito = llegada.locator('select').first()
  const opciones = await deposito.locator('option').evaluateAll((nodos) => nodos.map((nodo) => nodo.value).filter(Boolean))
  if (!opciones.length) throw new Error('la recepción no ofrece depósitos de destino')
  await deposito.selectOption(opciones[0])
  if (!(await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).count())) throw new Error('la recepción no ofrece reimprimir la etiqueta')
  await shot('recepcion-transito')
  return `unidad ${serial || 'demo'} en tránsito · recepción con depósito (${opciones.length}) y reimpresión`
})

await paso('recepción confirmada: la unidad sale del tránsito', async (shot) => {
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await llegada.getByRole('button', { name: 'Confirmar recepción' }).click()
  await page.getByText(/recibido en sucursal y disponible en stock/i).waitFor({ state: 'visible', timeout: 20000 })
  await esperar(900)
  await shot('recepcion-confirmada')
  // La demo guarda en memoria de la pestaña (#204): la mutación se verifica en el
  // mismo documento, que es donde el refresh de la pantalla la refleja.
  await page.keyboard.press('Escape')
  await esperar(700)
  const serial = resultado.serialTransito
  const siguen = serial ? await page.getByTestId('inventario-fila').filter({ hasText: serial }).count() : -1
  if (siguen > 0) throw new Error(`la unidad ${serial} sigue listada en tránsito tras la recepción`)
  await shot('transito-sin-la-unidad')
  return `aviso de recepción visible${serial ? ` · ${serial} ya no está en la lista de tránsito` : ''}`
})

await paso('checklist: se marca, guarda y calcula grado/puntaje', async (shot) => {
  await irA('/inventario/unidades')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 15000 })
  const serial = (await ficha.locator('span.font-mono').first().innerText().catch(() => '')).trim()
  resultado.serialChecklist = serial
  const checklist = ficha.getByTestId('unidad-phonecheck')
  await checklist.scrollIntoViewIfNeeded()
  await checklist.getByRole('button', { name: 'Bien', exact: true }).nth(0).click()
  await checklist.getByRole('button', { name: 'Con observación', exact: true }).nth(1).click()
  await ficha.getByLabel('Batería %', { exact: true }).fill('91')
  await ficha.getByLabel('Ciclos de batería', { exact: true }).fill('240')
  await ficha.getByLabel('Repuestos no OEM', { exact: true }).fill('Pantalla no original (QA prod)')
  await checklist.getByTestId('unidad-phonecheck-guardar').click()
  await page.getByText('Inspección guardada.').waitFor({ state: 'visible', timeout: 20000 })
  await esperar(900)
  const oficial = checklist.getByTestId('unidad-phonecheck-oficial')
  await oficial.waitFor({ state: 'visible', timeout: 15000 })
  const textoOficial = (await oficial.innerText()).replace(/\s+/g, ' ')
  const progreso = (await checklist.getByTestId('unidad-phonecheck-progreso').innerText()).replace(/\s+/g, ' ')
  if (!/Grado [ABC]/.test(textoOficial)) throw new Error(`el grado oficial no se calculó: ${textoOficial}`)
  if (!/\d+ de \d+ con resultado/.test(progreso)) throw new Error(`el progreso no se actualizó: ${progreso}`)
  await shot('checklist-guardado')
  return `checklist de ${serial || 'unidad demo'} · ${textoOficial} · ${progreso}`
})

await paso('checklist: persiste al cerrar y reabrir la ficha', async (shot) => {
  // Sin recargar: en la demo el estado vive en memoria de la pestaña (#204).
  await page.keyboard.press('Escape')
  await esperar(500)
  const serial = resultado.serialChecklist
  let fila
  if (serial) fila = await buscarUnidad(serial)
  else fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 15000 })
  const checklist = ficha.getByTestId('unidad-phonecheck')
  await checklist.scrollIntoViewIfNeeded()
  await checklist.getByTestId('unidad-phonecheck-oficial').waitFor({ state: 'visible', timeout: 15000 })
  const texto = (await checklist.getByTestId('unidad-phonecheck-oficial').innerText()).replace(/\s+/g, ' ')
  await ficha.getByLabel('Repuestos no OEM', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  const repuestos = await ficha.getByLabel('Repuestos no OEM', { exact: true }).inputValue()
  if (!/Pantalla no original/.test(repuestos)) throw new Error(`los repuestos no-OEM no persistieron: "${repuestos}"`)
  await shot('checklist-persistido')
  return `${texto} · repuestos no-OEM persistidos`
})

await paso('verificación funcional: un usuario demo firma con su foto', async (shot) => {
  const serial = resultado.serialChecklist
  let ficha = page.getByRole('dialog')
  const antes = (await ficha.innerText()).replace(/\s+/g, ' ')
  const boton = ficha.getByRole('button', { name: '✓ Verificado' })
  if (await boton.count()) {
    await boton.click()
    await page.getByText(/verificado\./i).waitFor({ state: 'visible', timeout: 20000 })
    await esperar(700)
  }
  // Se reabre la ficha para leer la firma ya persistida en la demo.
  await page.keyboard.press('Escape')
  await esperar(500)
  const fila = serial ? await buscarUnidad(serial) : page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  await fila.click()
  ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 15000 })
  const firma = ficha.locator('img[alt^="Foto de"]').first()
  await firma.waitFor({ state: 'visible', timeout: 15000 })
  const src = await firma.getAttribute('src')
  if (!/^data:image\/svg\+xml/.test(String(src))) throw new Error('la firma no muestra la foto ficticia del usuario demo')
  const despues = (await ficha.innerText()).replace(/\s+/g, ' ')
  if (!/Verificado por/.test(despues)) throw new Error('la ficha no muestra «Verificado por» tras firmar')
  await shot('verificacion-firmada')
  return `firma demo con foto (${antes.includes('Sin verificación') || antes.includes('Sin verificar') ? 'venía sin verificar' : 'se sumó otra'})`
})

await paso('equipo demo: nombres y correos ficticios (sin «demo»)', async (shot) => {
  await irA('/configuracion/equipo')
  const filas = page.getByTestId('integrante-fila')
  await filas.first().waitFor({ state: 'visible', timeout: 25000 })
  const textos = (await filas.allInnerTexts()).map((texto) => texto.replace(/\s+/g, ' '))
  const correos = textos.map((texto) => (texto.match(/35\d{6}@[\w.-]+/) || [])[0]).filter(Boolean)
  if (correos.length < 4) throw new Error(`se esperaban ≥4 correos que empiecen con 35: ${correos.join(', ') || 'ninguno'}`)
  const conDemo = textos.filter((texto) => /demo/i.test(texto))
  if (conDemo.length) throw new Error(`el equipo demo menciona «demo»: ${conDemo[0].slice(0, 80)}`)
  // #219: foto de perfil ficticia (data URI local) en cada integrante demo.
  const fotos = filas.locator('img[alt^="Foto de"]')
  const cantidadFotos = await fotos.count()
  if (cantidadFotos < 4) throw new Error(`el equipo demo muestra ${cantidadFotos} fotos, se esperaban ≥4`)
  for (const src of await fotos.evaluateAll((nodos) => nodos.slice(0, 8).map((nodo) => nodo.getAttribute('src') || ''))) {
    if (!/^data:image\/svg\+xml/.test(src)) throw new Error(`la foto demo no es local: ${String(src).slice(0, 60)}`)
  }
  await shot('equipo-demo')
  return `${correos.length} integrantes demo con foto · correos 35… sin «demo» (p. ej. ${correos[0]})`
})

await browser.close()

resultado.veredicto = {
  pasosOk: resultado.pasos.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultado.pasos.length,
  hallazgos: resultado.hallazgos.length,
  erroresConsola: resultado.erroresConsola.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resultado, null, 2)}\n`)

const reporte = [
  '# Verificación en producción · #219/#215 (tránsito/recepción y checklist)',
  '',
  `- Base: ${APP}`,
  `- Versión desplegada: v${resultado.version || '?'}`,
  `- Fecha: ${resultado.fecha}`,
  `- Método: ${resultado.metodo}`,
  `- Unidad de tránsito: ${resultado.serialTransito || '(tomada del listado)'} · unidad del checklist: ${resultado.serialChecklist || '(tomada del listado)'}`,
  '',
  '## Pasos',
  '',
  ...resultado.pasos.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Hallazgos',
  '',
  ...(resultado.hallazgos.length ? resultado.hallazgos.map((texto) => `- ${texto}`) : ['- Sin hallazgos: tránsito/recepción y checklist funcionan en la demo pública.']),
  '',
  `Errores de consola observados: ${resultado.erroresConsola.length}.`,
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${reporte.join('\n')}\n`)

const fallos = resultado.pasos.filter((fila) => fila.estado !== 'ok')
console.log(`#219/#215 producción: ${resultado.veredicto.pasosOk}/${resultado.veredicto.pasosTotal} pasos OK · ${resultado.hallazgos.length} hallazgos`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
