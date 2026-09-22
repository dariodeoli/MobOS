#!/usr/bin/env node
// Verificación de la VALUACIÓN DE TRADE-IN CON GRADO (#240 ítem 7) en la DEMO
// pública: base del catálogo ficticio, hallazgos y grado con su detalle, y el
// valor final que llena el acuerdo. Sirve para el harness local y para
// producción (post-deploy .142):
//
//   node scripts/qa-240-valuacion-demo.mjs
//   MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_OUT=/tmp/qa240 node scripts/qa-240-valuacion-demo.mjs
//
// Salida: <QA_OUT>/*.png + resultados.json. Sale 1 si algún paso falla o si la
// demo consulta la tabla de valores del API.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-240-7-valuacion-grado-demo')
const API_HOST = process.env.MOBOS_QA_API_HOST || 'api.moboss.online'
const MODELO = process.env.MOBOS_QA_MODELO || 'iPhone 13 128GB'
mkdirSync(SALIDA, { recursive: true })

const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, pasos: [], capturas: [], llamadasApi: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()
const gs = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`

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
const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await contexto.newPage()
page.on('request', (req) => { if (req.url().includes(API_HOST)) resultado.llamadasApi.push(req.url().slice(0, 160)) })
page.on('pageerror', (error) => resultado.hallazgos.push(`pageerror: ${String(error.message).slice(0, 160)}`))

const valorDeLaLinea = async (locator) => {
  const texto = plano(await locator.innerText())
  const montos = texto.match(/Gs ([\d.]+)/g) || []
  return { texto, base: Number((montos[0] || '').replace(/\D/g, '')) || 0, final: Number(((montos[montos.length - 1] || '').replace(/\D/g, ''))) || 0 }
}

await paso('entrada a la demo y herramienta de trade-in', async () => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1400)
  resultado.version = ((await page.locator('body').innerText()).match(/v\d+\.\d+\.\d+/) || [null])[0] || null
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(400)
  }
  await page.goto(`${BASE}/trade-in`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Modelo y capacidad').waitFor({ timeout: 20000 })
  await page.getByLabel('Modelo y capacidad').fill(MODELO)
  await page.getByLabel('IMEI / serial').fill('356789102345678')
  await page.waitForTimeout(800)
  contador += 1
  await page.screenshot({ path: join(SALIDA, '01-base-demo.png'), fullPage: true })
  resultado.capturas.push('01-base-demo.png')
  return `demo ${resultado.version || 'sin versión'} · modelo ${MODELO}`
})

await paso('base del catálogo demo (sin API de valores)', async () => {
  const sugerencia = page.getByText(/Valor sugerido:/)
  await sugerencia.waitFor({ timeout: 15000 })
  const { texto, base } = await valorDeLaLinea(sugerencia)
  afirmar(base > 0, `no apareció el valor base de la demo: ${texto}`)
  afirmar(!resultado.llamadasApi.some((url) => /device-valuations/.test(url)), 'la demo consultó la tabla de valores del API')
  resultado.base = base
  return texto
})

await paso('hallazgos y grado descuentan con su detalle', async () => {
  await page.getByRole('checkbox', { name: /Pantalla rota o con fallas/ }).check()
  await page.getByRole('checkbox', { name: /Botones con fallas/ }).check()
  const valuada = page.getByRole('status').filter({ hasText: 'por grado y hallazgos' })
  await valuada.first().waitFor({ timeout: 15000 })
  const { base, final } = await valorDeLaLinea(valuada.first())
  afirmar(base === resultado.base, `la base cambió: ${base} vs ${resultado.base}`)
  // Pantalla 18% + botones 5% + grado C 12% = 35%.
  const esperado = Math.round(resultado.base * 0.65)
  afirmar(Math.abs(final - esperado) <= 1000, `el valor final no es el esperado (${final} vs ${esperado})`)
  const detalle = plano(await page.locator('fieldset').innerText())
  afirmar(/Grado C/.test(detalle), `no se ve el grado sugerido C: ${detalle.slice(0, 160)}`)
  afirmar(new RegExp(`−18% · −${gs(resultado.base * 0.18)}`).test(detalle), `falta el descuento de pantalla: ${detalle.slice(0, 200)}`)
  afirmar(new RegExp(`−5% · −${gs(resultado.base * 0.05)}`).test(detalle), `falta el descuento de botones: ${detalle.slice(0, 200)}`)
  afirmar(new RegExp(`−12% · −${gs(resultado.base * 0.12)}`).test(detalle), `falta el descuento del grado: ${detalle.slice(0, 200)}`)
  await shot(page, 'con-grado-y-hallazgos')
  return `base ${gs(resultado.base)} → −35% → ${gs(final)}`
})

await paso('el grado se sugiere según los hallazgos', async () => {
  await page.getByRole('checkbox', { name: /Botones con fallas/ }).uncheck()
  // Solo pantalla (mayor) → grado C: 18% + 12% = 30%.
  const valuada = page.getByRole('status').filter({ hasText: 'por grado y hallazgos' })
  const { final } = await valorDeLaLinea(valuada.first())
  const esperado = Math.round(resultado.base * 0.70)
  afirmar(Math.abs(final - esperado) <= 1000, `con un solo hallazgo mayor el valor no es el esperado (${final} vs ${esperado})`)
  await page.getByRole('checkbox', { name: /Pantalla rota o con fallas/ }).uncheck()
  const sinHallazgos = await valorDeLaLinea(page.getByText(/Valor sugerido:/))
  afirmar(sinHallazgos.base === resultado.base, 'sin hallazgos tiene que volver a la base')
  await shot(page, 'grado-sugerido')
  return `un hallazgo mayor → ${gs(final)} · sin hallazgos → ${gs(resultado.base)}`
})

await paso('«Usar» lleva el valor al acuerdo acordado', async () => {
  await page.getByRole('checkbox', { name: /Pantalla rota o con fallas/ }).check()
  await page.getByRole('button', { name: 'Usar' }).last().click()
  const acuerdo = await page.getByLabel('Valor de toma acordado (Gs)').inputValue()
  const esperado = Math.round(resultado.base * 0.70)
  afirmar(Number(acuerdo.replace(/\D/g, '')) === esperado, `el valor acordado no coincide: ${acuerdo}`)
  await page.getByLabel('Detalle de la condición').fill('Pantalla impecable, caja original')
  await shot(page, 'acuerdo-con-valuacion')
  return `acordado ${acuerdo}`
})

await contexto.close()
await browser.close()

const fallos = resultado.pasos.filter((item) => !item.ok)
resultado.llamadasApi = [...new Set(resultado.llamadasApi)]
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultado, null, 2))
console.log(`\nVersión desplegada: ${resultado.version || 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length ? 1 : 0
