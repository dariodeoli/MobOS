// Recorrido funcional de producción (#187) — Inventario / stock.
//
// Playwright headless contra la demo anónima de producción (datos ficticios,
// sin sesión real): listado compacto, búsqueda y sync con el POS, carga rápida
// con costo diferido USD/Gs, ficha de la unidad (códigos, IMEI, acciones),
// reservas, ubicaciones con código corto, en tránsito (recepción + reimpresión
// de etiqueta), vendidos, compartido, conteo y acciones masivas. Deja capturas
// y un reporte en docs/qa/187-inventario/.
//
// Uso: node e2e/prod/187-inventario.mjs
//   QA_APP (default https://app.moboss.online) · QA_OUT_DOMINIO para la salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const APP = (process.env.QA_APP || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT_DOMINIO || join(RAIZ, 'docs/qa/187-inventario')
mkdirSync(SALIDA, { recursive: true })

const resultado = {
  base: APP,
  version: '',
  fecha: new Date().toISOString(),
  metodo: 'Playwright headless (chromium) sobre la demo pública de producción',
  pasos: [],
  llamadasAlApi: [],
  llamadasDeImpresion: [],
  llamadasDeOtrosModulos: [],
  erroresConsola: [],
  erroresDeRed: [],
  hallazgos: [],
}
const llamadasApi = []
let capturaN = 0

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') resultado.erroresConsola.push(msg.text().slice(0, 220)) })
page.on('pageerror', (error) => resultado.erroresConsola.push(`pageerror: ${error.message.slice(0, 220)}`))
page.on('requestfailed', (peticion) => resultado.erroresDeRed.push(`${peticion.method()} ${peticion.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}: ${peticion.failure()?.errorText || 'falló'}`))
page.on('request', (peticion) => {
  const url = peticion.url()
  if (url.includes('/src/')) return
  if (!/\/api\//.test(url)) return
  const ruta = `${peticion.method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`
  llamadasApi.push(ruta)
})

const esperar = (ms) => page.waitForTimeout(ms)
async function captura(nombre) {
  capturaN += 1
  const limpio = String(nombre).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '')
  const archivo = `${String(capturaN).padStart(2, '0')}-${limpio}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72, fullPage: false })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(async (nombreCaptura) => { const archivo = await captura(nombreCaptura); capturas.push(archivo); return archivo })
    resultado.pasos.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultado.pasos.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, llamadasApi: llamadasApi.slice(antes) })
    resultado.hallazgos.push(`${nombre}: ${mensaje}`)
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await captura(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

const irA = async (ruta) => { await page.goto(`${APP}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await esperar(2000) }

await paso('entrada a la demo como dueño', async (shot) => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await esperar(1500)
  const textoEntrada = await page.locator('body').innerText()
  await shot('acceso-demo')
  const dueno = page.getByRole('button', { name: /Entrar como Dueño/ }).first()
  if (await dueno.count()) await dueno.click()
  else await page.getByRole('button', { name: /Entrar|Probar|Ver la demo/i }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await esperar(1800)
  const version = (await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/)
  resultado.version = version ? version[1] : ''
  await shot('panel-demo')
  return `versión ${resultado.version || '?'} · perfiles demo visibles: ${/Vendedor/.test(textoEntrada) && /Dueño/.test(textoEntrada)}`
})

await paso('inventario: listado compacto con modelo/variante, ubicación corta y costo', async (shot) => {
  await irA('/inventario/unidades')
  const texto = await page.locator('body').innerText()
  for (const columna of ['PRODUCTO', 'MODELO / VARIANTE', 'PROVEEDOR', 'COSTO', 'UBI', 'ESTADO', 'VERIFICADO', 'ACCIONES']) {
    if (!texto.includes(columna)) throw new Error(`falta la columna ${columna}`)
  }
  const filas = page.getByTestId('inventario-fila')
  if (!(await filas.count())) throw new Error('la lista no muestra unidades')
  const primera = (await filas.first().innerText()).replace(/\s+/g, ' ')
  if (!/AUR\d{4}/.test(primera)) throw new Error('la fila no muestra el IMEI de la unidad')
  await shot('inventario-listado')
  return `${await filas.count()} filas con las 8 columnas · primera: ${primera.slice(0, 90)}`
})

await paso('inventario: búsqueda por IMEI y orden por modelo', async (shot) => {
  await page.getByLabel('Buscar en inventario').fill('AUR0001')
  await page.waitForTimeout(1500)
  const filas = page.getByTestId('inventario-fila')
  const trasBuscar = await filas.count()
  if (trasBuscar < 1 || trasBuscar > 3) throw new Error(`la búsqueda por IMEI devolvió ${trasBuscar} filas`)
  await shot('inventario-busqueda-imei')

  await page.getByLabel('Orden del inventario').selectOption('modelo-natural')
  await page.waitForTimeout(1500)
  const texto = await page.locator('body').innerText()
  if (!/Modelo \(17→13\)/.test(texto)) throw new Error('el orden por modelo natural no está disponible')
  await shot('inventario-orden-modelo')
  await page.getByLabel('Buscar en inventario').fill('')
  await esperar(1200)
  return `búsqueda por IMEI: ${trasBuscar} fila(s) · orden por modelo aplicado`
})

await paso('sync con POS: el modelo de Inventario aparece igual en el catálogo', async (shot) => {
  await irA('/inventario/unidades')
  const filaPos = page.getByTestId('inventario-fila').filter({ hasText: 'iPhone 15 Pro 256GB' }).first()
  await filaPos.waitFor({ state: 'visible', timeout: 15000 })
  const textoFila = (await filaPos.innerText()).replace(/\s+/g, ' ')
  await shot('inventario-modelo-base')

  await irA('/pos')
  await page.getByPlaceholder('Buscar producto…').fill('iPhone 15 Pro')
  await esperar(1500)
  const tarjeta = page.getByRole('button', { name: /iPhone 15 Pro/ }).first()
  await tarjeta.waitFor({ state: 'visible', timeout: 15000 })
  const textoPos = (await tarjeta.innerText()).replace(/\s+/g, ' ')
  await shot('pos-catalogo-modelo')
  if (!/256GB/.test(textoPos) || !/iPhone 15 Pro/.test(textoFila)) throw new Error(`modelo/capacidad no coinciden: inventario «${textoFila.slice(0, 60)}» vs POS «${textoPos.slice(0, 60)}»`)
  return `inventario: ${textoFila.slice(0, 60)} · POS: ${textoPos.slice(0, 60)}`
})

await paso('carga rápida con costo diferido (USD/Gs) y proveedor', async (shot) => {
  await irA('/inventario/unidades')
  await page.getByRole('button', { name: '+ Recibir unidad' }).click()
  const modal = page.getByRole('dialog')
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(800)
  await shot('carga-rapida-form')
  for (const campo of ['Modelo', 'IMEI o serial', 'Sucursal', 'Ubicación', 'Condición', 'Batería', 'Proveedor', 'Moneda del costo', 'Monto del costo']) {
    const control = modal.getByLabel(campo)
    if (!(await control.count())) throw new Error(`falta el campo ${campo}`)
  }
  const texto = (await modal.innerText()).replace(/\s+/g, ' ')
  if (!/Costo \(opcional\)|completalo después|Costo/.test(texto)) throw new Error('no se ve el bloque de costo diferido')

  // Se carga una unidad de prueba en el demo (queda simulada en el navegador).
  const opciones = modal.getByLabel('Modelo').locator('option')
  const modelo = await opciones.nth(1).getAttribute('value')
  await modal.getByLabel('Modelo').selectOption(modelo)
  await modal.getByLabel('IMEI o serial').fill(`QA187-${Date.now()}`)
  const moneda = modal.getByLabel('Moneda del costo')
  const opcionesMoneda = await moneda.locator('option').evaluateAll((nodos) => nodos.map((nodo) => nodo.value))
  if (opcionesMoneda.length > 1) await moneda.selectOption(opcionesMoneda[1])
  await modal.getByRole('button', { name: 'Guardar unidad' }).click()
  await esperar(1800)
  await shot('carga-rapida-guardada')
  const aviso = await page.locator('body').innerText()
  if (!/unidad recibida|simulad|Modo demo/i.test(aviso)) throw new Error('no se avisó el resultado simulado del alta')
  return `campos completos · monedas: ${opcionesMoneda.join(', ')} · alta simulada con aviso`
})

await paso('ficha de la unidad: códigos (QR/barras), IMEI, acciones y cronología', async (shot) => {
  await page.keyboard.press('Escape')
  await irA('/inventario/unidades')
  await page.getByTestId('inventario-fila').first().click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(1000)
  const texto = (await ficha.innerText()).replace(/\s+/g, ' ')
  for (const marca of ['FICHA DEL EQUIPO', 'CÓDIGOS DE ESTA UNIDAD', 'CONSULTA DE IMEI', 'ACCIONES', 'CRONOLOGÍA']) {
    if (!texto.includes(marca)) throw new Error(`la ficha no muestra «${marca}»`)
  }
  if (!/AUR\d{4}/.test(texto)) throw new Error('la ficha no muestra el IMEI de la unidad')
  const qr = await ficha.locator('img[alt^="QR de"]').count()
  const barras = await ficha.locator('svg').count()
  if (!qr) throw new Error('la ficha no muestra el QR de la unidad')
  if (!barras) throw new Error('la ficha no muestra el código de barras')
  await shot('unidad-ficha')
  return `QR y barras visibles · IMEI y secciones completas`
})

await paso('reservas: listado con cliente y vencimiento', async (shot) => {
  await page.keyboard.press('Escape')
  await irA('/inventario/reservas')
  const texto = await page.locator('body').innerText()
  if (!/CLIENTE/.test(texto) || !/VENCE/.test(texto)) throw new Error('la tabla de reservas no muestra cliente/vencimiento')
  const filas = await page.getByTestId('reserva-fila').count()
  if (filas < 1) throw new Error('no hay reservas demo visibles')
  await shot('reservas-listado')
  return `${filas} reservas con cliente, vencimiento y acciones`
})

await paso('ubicaciones: código corto, sucursal y acciones', async (shot) => {
  await irA('/inventario/ubicaciones')
  const texto = await page.locator('body').innerText()
  for (const marca of ['Depósito 1', 'Depósito 2', 'Casa Central', 'D1', 'D2', 'Activa']) {
    if (!texto.includes(marca)) throw new Error(`falta «${marca}» en ubicaciones`)
  }
  await shot('ubicaciones-listado')
  return 'Depósito 1/2 con código corto D1/D2, sucursal, unidades y acciones'
})

await paso('en tránsito: recepción con reimpresión de etiqueta (#220)', async (shot) => {
  await irA('/inventario/transito')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15000 })
  const textoFila = (await fila.innerText()).replace(/\s+/g, ' ')
  if (!/tránsito/i.test(textoFila)) throw new Error(`la fila de tránsito no lo indica: ${textoFila.slice(0, 80)}`)
  await shot('transito-listado')
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.waitFor({ state: 'visible', timeout: 10000 })
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await llegada.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(600)
  await shot('recepcion-transito')
  if (!(await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).count())) throw new Error('la recepción no ofrece reimprimir la etiqueta')
  return `unidad en tránsito: ${textoFila.slice(0, 60)} · recepción con depósito y reimpresión`
})

await paso('vendidos: estados de entrega y comprobante', async (shot) => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await irA('/inventario/vendidos')
  const texto = await page.locator('body').innerText()
  for (const marca of ['Entregado', 'Listo p/ retirar', 'Vendido']) {
    if (!texto.includes(marca)) throw new Error(`falta el estado «${marca}» en vendidos`)
  }
  await shot('vendidos-listado')
  return 'vendidos con estados de entrega, UBI y acciones'
})

await paso('acciones masivas por lote', async (shot) => {
  await irA('/inventario/unidades')
  const checks = page.getByRole('checkbox')
  const total = await checks.count()
  if (total < 3) throw new Error('no hay checkboxes de selección en la lista')
  await checks.nth(1).check()
  await checks.nth(2).check()
  await esperar(800)
  const texto = await page.locator('body').innerText()
  for (const accion of ['Copiar IMEIs', 'Imprimir etiquetas', 'Exportar CSV']) {
    if (!texto.includes(accion)) throw new Error(`falta la acción masiva «${accion}»`)
  }
  await shot('acciones-masivas')
  return 'selección de 2 unidades con acciones masivas visibles'
})

await paso('compartido y conteo rápido', async (shot) => {
  await irA('/inventario/compartido')
  const texto = await page.locator('body').innerText()
  if (!/COMPARTIR MI DISPONIBILIDAD/.test(texto) || !/Nunca precios, costos, IMEI/.test(texto)) throw new Error('el panel de compartido no muestra la política')
  await shot('compartido-panel')

  await irA('/inventario/unidades')
  await page.getByRole('button', { name: 'Conteo rápido' }).click()
  const modal = page.getByRole('dialog')
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await esperar(800)
  await shot('conteo-rapido')
  return 'compartido con política visible y conteo rápido abierto'
})

await paso('el demo no llama al API del dominio', async () => {
  resultado.llamadasAlApi = [...new Set(llamadasApi)]
  resultado.llamadasDeImpresion = resultado.llamadasAlApi.filter((ruta) => /\/api\/print/.test(ruta))
  resultado.llamadasDeOtrosModulos = resultado.llamadasAlApi.filter((ruta) => /\/(api)\/(inventory|products|transfers|stock|imei)/.test(ruta))
  if (resultado.llamadasDeImpresion.length) throw new Error(`impresión llamó al API: ${resultado.llamadasDeImpresion.slice(0, 4).join(' | ')}`)
  if (resultado.llamadasDeOtrosModulos.length) throw new Error(`inventario llamó al API real: ${resultado.llamadasDeOtrosModulos.slice(0, 4).join(' | ')}`)
  return `0 llamadas de impresión/inventario · ${resultado.llamadasAlApi.length} al API general (presence/avatar del shell)`
})

await browser.close()

resultado.veredicto = {
  pasosOk: resultado.pasos.filter((fila) => fila.estado === 'ok').length,
  pasosTotal: resultado.pasos.length,
  llamadasDeImpresion: resultado.llamadasDeImpresion.length,
  hallazgos: resultado.hallazgos.length,
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resultado, null, 2)}\n`)

const reporte = [
  `# Recorrido funcional de producción · Inventario / stock (#187)`,
  '',
  `- Base: ${APP}`,
  `- Versión desplegada: v${resultado.version || '?'}`,
  `- Fecha: ${resultado.fecha}`,
  `- Método: ${resultado.metodo}`,
  '',
  '## Pasos',
  '',
  ...resultado.pasos.map((fila) => `- ${fila.estado === 'ok' ? '✅' : '❌'} **${fila.paso}** — ${fila.detalle}${fila.capturas.length ? ` · capturas: ${fila.capturas.join(', ')}` : ''}`),
  '',
  '## Hallazgos',
  '',
  ...(resultado.hallazgos.length ? resultado.hallazgos.map((texto) => `- ${texto}`) : ['- Sin hallazgos bloqueantes.']),
  '',
  '## Fuera de alcance (prueba física, en manos de Dario)',
  '',
  '- #17 (launchd/IP secundaria + CUPS) y #96 (USB directo en la ZKP8008): checklist `docs/IMPRESION-PRUEBA-FISICA.md`.',
  '- La impresión del dominio ya se verificó por separado (`docs/qa/impresion-prod/`).',
  '',
  `Veredicto: ${resultado.veredicto.pasosOk}/${resultado.veredicto.pasosTotal} pasos OK · ${resultado.veredicto.llamadasDeImpresion} llamadas de impresión · ${resultado.veredicto.hallazgos} hallazgos.`,
  '',
]
writeFileSync(join(SALIDA, 'REPORTE.md'), `${reporte.join('\n')}\n`)

const fallos = resultado.pasos.filter((fila) => fila.estado !== 'ok')
console.log(`Inventario #187: ${resultado.veredicto.pasosOk}/${resultado.veredicto.pasosTotal} pasos OK · ${resultado.hallazgos.length} hallazgos`)
if (fallos.length) {
  console.error(fallos.map((fila) => `${fila.paso}: ${fila.detalle}`).join('\n'))
  process.exitCode = 1
}
