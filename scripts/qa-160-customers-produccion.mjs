#!/usr/bin/env node
// Verificación §19 (Customers) en una CUENTA REAL (no demo): listado ordenado
// por actividad reciente y perfil completo (antigüedad, total gastado, órdenes,
// últimas órdenes, direcciones, notas, RUC, tags, minorista/mayorista, paga
// impuestos) + seguro del cliente. Solo lectura: no escribe ni un dato.
//
// Requisito: una sesión real exportada.
//   npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login
//   (iniciar sesión en la ventana, entrar al panel y cerrarla)
//
// Uso:
//   node scripts/qa-160-customers-produccion.mjs
//   MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_STORAGE_STATE=e2e/.auth/admin.json node scripts/qa-160-customers-produccion.mjs
//   node scripts/qa-160-customers-produccion.mjs --config
//
// Salida: <QA_OUT>/*.png + resultados.json (valores del perfil, capturas y
// hallazgos). Sale 1 si un paso falla o si falta un ítem de §19.

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ESTADO = String(process.env.MOBOS_QA_STORAGE_STATE || '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-160-perfil-produccion')
const SOLO_CONFIG = process.argv.includes('--config')

const faltantes = []
if (!ESTADO) faltantes.push('MOBOS_QA_STORAGE_STATE (sesión real exportada)')
else if (!existsSync(ESTADO)) faltantes.push(`MOBOS_QA_STORAGE_STATE no existe: ${ESTADO}`)

if (SOLO_CONFIG || faltantes.length) {
  console.log(JSON.stringify({ url: BASE, storageState: ESTADO || null, salida: SALIDA, faltantes, listo: faltantes.length === 0 }, null, 2))
  if (faltantes.length) {
    console.error(`\n✖ Falta configurar: ${faltantes.join('; ')}`)
    process.exit(2)
  }
  process.exit(0)
}

mkdirSync(SALIDA, { recursive: true })
const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, pasos: [], perfil: {}, capturas: [], observaciones: [], hallazgos: [] }
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

const browser = await chromium.launch({ headless: true })
const contexto = await browser.newContext({ storageState: ESTADO, viewport: { width: 1440, height: 900 } })
const page = await contexto.newPage()
const consultas = []
page.on('request', (req) => { if (/\/api\/customers/.test(req.url())) consultas.push(req.url().slice(0, 220)) })
page.on('pageerror', (error) => resultado.observaciones.push(`pageerror: ${String(error.message).slice(0, 160)}`))

const etiquetasResumen = ['Total gastado', 'Saldo pendiente', 'Órdenes activas', 'Pedidos', 'Última compra', 'Antigüedad', 'RUC', 'Paga impuestos', 'Dirección', 'Etiquetas', 'Últimas órdenes']

await paso('sesión real válida y Clientes cargado', async () => {
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  afirmar(!page.url().includes('/login'), 'la sesión no es válida (redirigió a /login)')
  const texto = await page.locator('body').innerText()
  resultado.version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0] || null
  const filas = await page.getByTestId('cliente-fila').count()
  afirmar(filas > 0, 'el listado no muestra clientes')
  await shot(page, 'listado-clientes')
  return `${filas} clientes visibles · versión ${resultado.version || 'sin versión en el pie'}`
})

await paso('listado ordenado por actividad reciente', async () => {
  const orden = page.getByLabel('Ordenar clientes')
  const valor = await orden.inputValue()
  afirmar(valor === 'recientes', `el orden por defecto no es «Recientes» (es «${valor}»)`)
  afirmar(consultas.some((url) => /orden=actividad/.test(url)), 'la consulta al API no pidió el orden por actividad')
  await shot(page, 'listado-recientes')
  return 'orden «Recientes» pedido al servidor (orden=actividad)'
})

await paso('perfil §19: resumen (antigüedad, gastado, órdenes, últimas órdenes)', async () => {
  const filas = page.getByTestId('cliente-fila')
  const totales = await filas.evaluateAll((nodos) => nodos.map((nodo) => {
    const montos = nodo.innerText.match(/Gs [\d.]+/g) || []
    return Number((montos[montos.length - 1] || '').replace(/\D/g, '')) || 0
  }))
  const indice = totales.indexOf(Math.max(...totales))
  const fila = filas.nth(indice >= 0 ? indice : 0)
  const nombre = (await fila.innerText()).split('\n')[0].trim()
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Total gastado', { exact: false }).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(700)
  await shot(page, 'perfil-resumen')
  const texto = plano(await ficha.innerText())
  for (const item of etiquetasResumen) afirmar(new RegExp(item, 'i').test(texto), `el Resumen no muestra «${item}»`)
  afirmar(/Cliente final|Mayorista/i.test(texto), 'no se ve el tipo (minorista/mayorista)')
  resultado.perfil = {
    nombre,
    tipo: /Mayorista/i.test(texto) ? 'mayorista' : 'cliente final',
    totalGastado: (texto.match(/TOTAL GASTADO (Gs [\d.]+)/i) || [])[1] || '',
    saldoPendiente: (texto.match(/SALDO PENDIENTE (Gs [\d.]+)/i) || [])[1] || '',
    pedidos: (texto.match(/PEDIDOS (\d+)/i) || [])[1] || '',
    ordenesActivas: (texto.match(/ÓRDENES ACTIVAS (\d+)/i) || [])[1] || '',
    antiguedad: (texto.match(/Antigüedad: ([^·]+)/i) || [])[1]?.trim() || '',
    ruc: (texto.match(/RUC: ([^·]+)/i) || [])[1]?.trim() || '',
    pagaImpuestos: (texto.match(/Paga impuestos: ([^·]+)/i) || [])[1]?.trim() || '',
    direccion: (texto.match(/Dirección: ([^·]+)/i) || [])[1]?.trim() || '',
    etiquetas: (texto.match(/Etiquetas: ([^·]+)/i) || [])[1]?.trim() || '',
  }
  if (resultado.perfil.pedidos === '0') resultado.observaciones.push(`el cliente con mayor gasto (${nombre}) no tiene pedidos listados`)
  return `${nombre} · ${resultado.perfil.totalGastado} · ${resultado.perfil.pedidos} pedidos · ${resultado.perfil.tipo}`
})

await paso('perfil §19: pedidos del cliente y equipos', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await page.waitForTimeout(800)
  await shot(page, 'perfil-pedidos')
  const texto = plano(await ficha.innerText())
  afirmar(/Pedidos/.test(texto), 'la pestaña Pedidos no muestra la tabla')
  const numeros = [...new Set(texto.match(/[A-Z]{2,3}-#\d+/g) || [])]
  resultado.perfil.pedidosListados = numeros.slice(0, 5)
  return numeros.length ? `${numeros.length} pedidos listados (${numeros.slice(0, 3).join(', ')})` : 'sin pedidos listados'
})

await paso('perfil §19: estadísticas del cliente', async () => {
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
  await page.waitForTimeout(900)
  await shot(page, 'perfil-estadisticas')
  const texto = plano(await ficha.innerText())
  resultado.perfil.ticketPromedio = (texto.match(/TICKET PROMEDIO (Gs [\d.]+)/i) || [])[1] || ''
  resultado.perfil.frecuencia = (texto.match(/FRECUENCIA ([^·]+)/i) || [])[1]?.trim() || ''
  resultado.perfil.compras = (texto.match(/COMPRAS (\d+)/i) || [])[1] || ''
  afirmar(/Ticket promedio/i.test(texto), 'las Estadísticas no muestran el ticket promedio')
  afirmar(/Frecuencia/i.test(texto), 'las Estadísticas no muestran la frecuencia')
  return `compras ${resultado.perfil.compras} · ${resultado.perfil.ticketPromedio} · ${resultado.perfil.frecuencia}`
})

await paso('perfil §19: direcciones, notas y seguro', async () => {
  const ficha = page.getByRole('dialog')
  // Buscamos un cliente con direcciones cargadas para dejar la evidencia completa.
  let direcciones = 0
  for (let intento = 0; intento < 4; intento += 1) {
    await ficha.getByRole('tab', { name: /^Datos/ }).click()
    await page.waitForTimeout(700)
    direcciones = await ficha.getByTestId('perfil-direcciones').locator('li').count().catch(() => 0)
    if (direcciones > 0) break
    await ficha.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
    await page.waitForTimeout(400)
    const siguiente = page.getByTestId('cliente-fila').nth(intento + 1)
    if (!(await siguiente.count())) break
    await siguiente.click()
    await ficha.getByText('Total gastado', { exact: false }).first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(500)
  }
  await shot(page, 'perfil-direcciones-notas-seguro')
  const texto = plano(await ficha.innerText())
  afirmar(/Direcciones/i.test(texto), 'la pestaña Datos no muestra la sección Direcciones')
  afirmar(/Nota interna/i.test(texto), 'la pestaña Datos no muestra la nota interna')
  afirmar(/Nota pública/i.test(texto), 'la pestaña Datos no muestra la nota pública')
  afirmar(/Seguro del cliente/i.test(texto), 'la pestaña Datos no muestra el seguro del cliente')
  const seguro = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  const pct = await ficha.getByLabel('Porcentaje del cliente').inputValue().catch(() => '')
  resultado.perfil.direcciones = direcciones
  resultado.perfil.seguroActivo = (await seguro.count()) ? await seguro.isChecked() : null
  resultado.perfil.seguroPct = pct
  if (direcciones === 0) resultado.observaciones.push('ninguno de los primeros clientes con pedidos tiene direcciones cargadas')
  return `${direcciones} dirección(es) · seguro ${resultado.perfil.seguroActivo ? 'activo' : 'inactivo'}${pct ? ` · ${pct}%` : ''}`
})

await contexto.close()
await browser.close()

const fallos = resultado.pasos.filter((item) => !item.ok)
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultado, null, 2))
console.log(`\nVersión: ${resultado.version || 'desconocida'} · pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
if (resultado.observaciones.length) console.log(`Observaciones: ${resultado.observaciones.length} (ver resultados.json)`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length ? 1 : 0
