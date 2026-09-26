#!/usr/bin/env node
// Verificación de la vista de Clientes estilo Pedidos + ojito/popup (#236) en
// la DEMO pública (sin sesión): filas con datos clave, resumen rápido con
// acciones y detalle completo, en desktop y mobile. Sirve para el harness
// local y para producción (post-deploy .140):
//
//   node scripts/qa-236-clientes-demo.mjs                                   # producción
//   MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_OUT=/tmp/qa236 node scripts/qa-236-clientes-demo.mjs
//
// Salida: <QA_OUT>/*.png + resultados.json. Sale 1 si algún paso falla o si la
// demo toca el API de clientes.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-236-clientes-demo')
const API_HOST = process.env.MOBOS_QA_API_HOST || 'api.moboss.online'
mkdirSync(SALIDA, { recursive: true })

const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, pasos: [], capturas: [], observaciones: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()

let contador = 0
async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.png`
  await page.screenshot({ path: join(SALIDA, archivo) })
  resultado.capturas.push(archivo)
  return archivo
}

async function paso(nombre, fn) {
  try {
    const detalle = await fn()
    resultado.pasos.push({ paso: nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultado.pasos.push({ paso: nombre, ok: false, detalle: mensaje })
    resultado.hallazgos.push(`${nombre}: ${mensaje}`)
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

// Cierra cualquier diálogo abierto (defensivo: un paso que falla no debe
// bloquear los siguientes).
const cerrarDialogos = async (page) => {
  for (let intento = 0; intento < 3; intento += 1) {
    const cerrar = page.getByRole('button', { name: 'Cerrar', exact: true })
    if (!(await cerrar.count())) return
    await cerrar.first().click().catch(() => {})
    await page.waitForTimeout(300)
  }
}

const abrirDemo = async (page, perfil = /Vendedor/) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1400)
  const texto = await page.locator('body').innerText()
  resultado.version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0] || resultado.version
  afirmar(/datos ficticios/i.test(texto), 'la entrada no avisa que los datos son ficticios')
  await page.getByRole('button', { name: perfil }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(400)
  }
}

const browser = await chromium.launch({ headless: true })
const llamadasApi = []
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexto.newPage()
page.on('request', (req) => { if (req.url().includes(API_HOST)) llamadasApi.push(req.url().slice(0, 160)) })
page.on('pageerror', (error) => resultado.observaciones.push(`pageerror: ${String(error.message).slice(0, 160)}`))

await paso('entrada a la demo y lista estilo Pedidos', async () => {
  await abrirDemo(page)
  // Navegación directa: el ítem «Clientes» del menú pasó a tener más de una
  // coincidencia accesible (sidebar y menú mobile), así que no se clickea.
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByLabel('Buscar clientes').fill('Lucía')
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.waitFor({ timeout: 20000 })
  const texto = await fila.innerText()
  await shot(page, 'lista-estilo-pedidos')
  // El chip del tipo de cliente pasó a mayúsculas con el rediseño v2
  // (`v2-chip uppercase`): la comparación del texto renderizado es sin caja.
  const textoComparable = texto.toLowerCase()
  for (const esperado of ['Lucía Fernández', '+595 981 123 456', 'Cliente final', 'Gs 7.750.000', 'Gs 1.500.000']) {
    afirmar(textoComparable.includes(esperado.toLowerCase()), `la fila no muestra «${esperado}»: ${plano(texto)}`)
  }
  afirmar(/\d{1,2} [a-z]{3}/i.test(texto), `la fila no muestra la última compra compacta: ${plano(texto)}`)
  afirmar(texto.split('\n').map((linea) => linea.trim()).includes('5'), `la fila no cuenta 5 compras: ${plano(texto)}`)
  // Los encabezados de la vista estilo Pedidos.
  const tabla = await page.getByTestId('clientes-tabla').innerText()
  for (const columna of ['Cliente', 'Tipo', 'Pedidos', 'Total gastado', 'Última compra', 'Deuda']) {
    afirmar(new RegExp(columna, 'i').test(tabla), `falta la columna «${columna}»`)
  }
  return `fila con contacto, tipo, 5 compras, Gs 7.750.000, última compra y deuda Gs 1.500.000`
})

await paso('ojito: resumen rápido con acciones', async () => {
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.getByRole('button', { name: 'Resumen rápido de Lucía Fernández', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Cliente: Lucía Fernández' })
  await popup.waitFor({ timeout: 15000 })
  const texto = plano(await popup.innerText())
  await shot(page, 'resumen-rapido')
  for (const esperado of ['Total gastado', 'Gs 7.750.000', 'Pedidos', 'Última compra', 'Deuda', 'Gs 1.500.000', 'Seguro', 'Activo · 12,5%', 'Últimas compras', 'Nota interna']) {
    afirmar(new RegExp(esperado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(texto), `el resumen no muestra «${esperado}»`)
  }
  afirmar(/MOB-?#?0008/i.test(texto), 'el resumen no lista la última compra MOB-#0008')
  afirmar(/prioridad/.test(texto), 'el resumen no muestra las etiquetas del cliente')
  await afirmar(await popup.getByRole('button', { name: 'Editar' }).count(), 'falta la acción rápida «Editar»')
  await afirmar(await popup.getByRole('button', { name: 'Ver detalle completo' }).count(), 'falta el botón «Ver detalle completo»')
  await afirmar(await popup.getByRole('button', { name: 'Enviar WhatsApp a Lucía Fernández' }).count(), 'falta la acción rápida de WhatsApp')
  resultado.popup = { titulo: 'Cliente: Lucía Fernández', kpis: ['Total gastado', 'Pedidos', 'Última compra', 'Deuda', 'Seguro'] }
  return 'resumen con KPIs, últimas compras, notas y acciones WhatsApp/Editar/detalle'
})

await paso('«Ver detalle completo» abre el perfil (CustomerProfile)', async () => {
  const popup = page.getByRole('dialog', { name: 'Cliente: Lucía Fernández' })
  await popup.getByRole('button', { name: 'Ver detalle completo' }).click()
  await page.getByRole('tab', { name: /^Resumen/ }).waitFor({ timeout: 15000 })
  await shot(page, 'detalle-completo')
  for (const tab of ['Resumen', 'Pedidos', 'Cronología', 'Estadísticas', 'Datos']) {
    afirmar(await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).count(), `el perfil no tiene la pestaña ${tab}`)
  }
  const textoPerfil = await page.getByRole('dialog').innerText()
  afirmar(/TOTAL GASTADO Gs [\d.]+/i.test(plano(textoPerfil)), `el perfil no muestra el total gastado: ${plano(textoPerfil).slice(0, 120)}`)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  return 'el perfil completo abre en Resumen con sus cinco pestañas'
})

await paso('ícono de detalle abre el perfil directo', async () => {
  await cerrarDialogos(page)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.getByRole('button', { name: 'Ver detalle completo de Lucía Fernández', exact: true }).click()
  await page.getByRole('tab', { name: /^Resumen/ }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  return 'abre sin pasar por el resumen rápido'
})

await paso('«Editar» del resumen entra por la pestaña Datos', async () => {
  await cerrarDialogos(page)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.getByRole('button', { name: 'Resumen rápido de Lucía Fernández', exact: true }).click()
  await page.getByRole('dialog', { name: 'Cliente: Lucía Fernández' }).getByRole('button', { name: 'Editar' }).click()
  const datos = page.getByRole('tab', { name: /^Datos/ })
  await datos.waitFor({ timeout: 15000 })
  let activa = false
  for (let intento = 0; intento < 20 && !activa; intento += 1) {
    activa = (await datos.getAttribute('aria-selected')) === 'true'
    if (!activa) await page.waitForTimeout(200)
  }
  afirmar(activa, 'la pestaña Datos no quedó activa')
  await shot(page, 'editar-datos')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  return 'abre el perfil en Datos'
})

// Mobile táctil: los dos accesos visibles y con área de toque.
await paso('mobile: accesos táctiles con aria', async () => {
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const pagina = await movil.newPage()
  await abrirDemo(pagina)
  await pagina.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await pagina.waitForTimeout(1200)
  const resumen = pagina.getByRole('button', { name: 'Resumen rápido de Lucía Fernández', exact: true }).first()
  const detalle = pagina.getByRole('button', { name: 'Ver detalle completo de Lucía Fernández', exact: true }).first()
  await resumen.scrollIntoViewIfNeeded()
  await shot(pagina, 'mobile-acciones')
  const cajaResumen = await resumen.boundingBox()
  const cajaDetalle = await detalle.boundingBox()
  await movil.close()
  afirmar(cajaResumen && cajaResumen.width >= 34 && cajaResumen.height >= 34, `el ojito mide ${cajaResumen?.width}×${cajaResumen?.height} (se espera ≥ 34)`)
  afirmar(cajaDetalle && cajaDetalle.width >= 34 && cajaDetalle.height >= 34, `el detalle mide ${cajaDetalle?.width}×${cajaDetalle?.height} (se espera ≥ 34)`)
  return `ojito ${Math.round(cajaResumen.width)}×${Math.round(cajaResumen.height)} · detalle ${Math.round(cajaDetalle.width)}×${Math.round(cajaDetalle.height)}`
})

await contexto.close()
await browser.close()

// La demo no debe tocar el API de clientes.
const apiClientes = llamadasApi.filter((url) => /\/api\/(customers|message-templates)/.test(url))
resultado.llamadasApi = [...new Set(llamadasApi)]
resultado.demoNoTocaApi = apiClientes.length === 0
if (!resultado.demoNoTocaApi) resultado.hallazgos.push(`la demo llamó al API de clientes: ${apiClientes.join(', ')}`)

const fallos = resultado.pasos.filter((item) => !item.ok)
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultado, null, 2))
console.log(`\nVersión desplegada: ${resultado.version || 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
console.log(`API de clientes en demo: ${resultado.demoNoTocaApi ? 'sin llamadas (OK)' : 'LLAMÓ (FALLO)'}`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length || !resultado.demoNoTocaApi ? 1 : 0
