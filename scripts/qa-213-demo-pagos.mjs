#!/usr/bin/env node
// QA #213 — historial demo en producción: pagos divididos y medios variados.
// Verifica que la cuenta del cliente (demo session-only) muestre los movimientos
// reales de cada pedido y el historial con los medios de pago variados, sin
// llamar al API real.
//
//   node scripts/qa-213-demo-pagos.mjs                                # producción
//   MOBOS_QA_URL=http://localhost:5210 MOBOS_QA_OUT=/tmp/qa213 node scripts/qa-213-demo-pagos.mjs
//
// Salida: <QA_OUT>/*.png + resultados.json. Sale 1 si un paso falla o si la
// demo toca el API real.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.MOBOS_QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-213-demo-clientes-pedidos/demo-pagos-prod')
mkdirSync(SALIDA, { recursive: true })

const VERSION_MINIMA = '1.0.184'
const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, pasos: [], capturas: [], apiReal: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()
const compararVersion = (a, b) => {
  const [x, y, z] = String(a).split('.').map(Number)
  const [p, q, r] = String(b).split('.').map(Number)
  return x - p || y - q || z - r
}

let contador = 0
async function shot(page, nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.png`
  await page.screenshot({ path: join(SALIDA, archivo), fullPage: true })
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
const contexto = await browser.newContext({ viewport: { width: 1280, height: 1200 } })
const page = await contexto.newPage()
page.on('request', (req) => { if (req.url().includes(API_HOST)) resultado.apiReal.push(req.url().slice(0, 160)) })
page.on('pageerror', (error) => resultado.hallazgos.push(`pageerror: ${String(error.message).slice(0, 160)}`))

// La versión y el modo demo se leen desde `/demo` (el portal no muestra la
// versión y, sin la marca de demo, la app llama a /api/auth/me).
const abrirDemo = async () => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1400)
  resultado.version = ((await page.locator('body').innerText()).match(/v\d+\.\d+\.\d+/) || [null])[0]?.slice(1) || null
  afirmar(resultado.version && compararVersion(resultado.version, VERSION_MINIMA) >= 0, `versión ${resultado.version} < ${VERSION_MINIMA}`)
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click().catch(() => {})
    await page.waitForTimeout(300)
  }
}

await paso('la cuenta demo (Lucía) reparte el pago parcial en dos movimientos', async () => {
  await abrirDemo()
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1400)
  const boton = page.getByTestId('pedido-detalle-boton').first()
  await boton.waitFor({ timeout: 20000 })
  await boton.click()
  const detalle = page.getByTestId('pedido-detalle').first()
  const texto = plano(await detalle.innerText())
  afirmar(/Tus pagos de este pedido/i.test(texto), 'no aparece el bloque de pagos del pedido')
  afirmar(/Efectivo/.test(texto) && /1\.000\.000/.test(texto), `no aparece el primer movimiento (Efectivo 1.000.000): ${texto.slice(0, 160)}`)
  afirmar(/Transferencia/.test(texto) && /500\.000/.test(texto), `no aparece el segundo movimiento (Transferencia 500.000): ${texto.slice(0, 160)}`)
  await shot(page, 'lucia-partial-dividido')
  return 'MOB-#0008 con Efectivo 1.000.000 + Transferencia 500.000'
})

await paso('el historial demo muestra los medios variados (USDT, Pix, Tarjeta)', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-distribuidora-rapido`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const pagos = page.getByTestId('portal-pagos')
  await pagos.waitFor({ timeout: 20000 })
  const texto = plano(await pagos.innerText())
  for (const [medio, monto] of [['USDT - Cripto', '5.500.000'], ['Transferencia', '8.000.000'], ['Tarjeta / POS', '4.500.000'], ['Pix', '8.000.000']]) {
    afirmar(new RegExp(medio.replace(/[/-]/g, '.')).test(texto), `falta el medio ${medio}: ${texto.slice(0, 200)}`)
    afirmar(texto.includes(monto), `falta el monto ${monto} del historial`)
  }
  const boton = page.getByTestId('pedido-detalle-boton').first()
  await boton.click()
  const detalle = plano(await page.getByTestId('pedido-detalle').first().innerText())
  afirmar(/Transferencia/.test(detalle) && /8\.000\.000/.test(detalle), 'el pedido no muestra su pago por transferencia')
  afirmar(/Tarjeta/.test(detalle) && /4\.500\.000/.test(detalle), 'el pedido no muestra su pago con tarjeta')
  await shot(page, 'historial-medios-variados')
  return 'USDT · Transferencia · Tarjeta · Pix en el historial y split en el pedido'
})

await browser.close()

resultado.apiReal = [...new Set(resultado.apiReal)]
const fallos = resultado.pasos.filter((item) => !item.ok)
const apiLimpio = resultado.apiReal.length === 0
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ ...resultado, apiLimpio }, null, 2))
console.log(`\nVersión desplegada: ${resultado.version ? `v${resultado.version}` : 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
console.log(`API real: ${apiLimpio ? 'sin llamadas (OK)' : `LLAMÓ: ${resultado.apiReal.join(', ')}`}`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length || !apiLimpio ? 1 : 0
