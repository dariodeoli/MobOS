#!/usr/bin/env node
// Verificación post-deploy (#240 ítem 3): el INFORME EN EL PORTAL del cliente y
// el COMPARTIR POR WHATSAPP con el link público. Corre contra la demo pública
// (sin sesión) y sirve para el harness local y para producción post-.143:
//
//   node scripts/qa-240-informe-portal-demo.mjs
//   MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_OUT=/tmp/qa240p node scripts/qa-240-informe-portal-demo.mjs
//
// Salida: <QA_OUT>/*.png + resultados.json (versión desplegada y resultado por
// paso). Sale 1 si algún paso falla o si la demo toca el API de clientes.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-240-informe-portal')
const API_HOST = process.env.MOBOS_QA_API_HOST || 'api.moboss.online'
const SERIAL = process.env.MOBOS_QA_SERIAL || '356789012345678' // equipo demo de Lucía (MOB-0008)
mkdirSync(SALIDA, { recursive: true })

const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, serial: SERIAL, pasos: [], capturas: [], llamadasApi: [], hallazgos: [] }
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }
const plano = (texto) => String(texto || '').replace(/\s+/g, ' ').trim()

let contador = 0
async function shot(page, nombre, fullPage = true) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.png`
  await page.screenshot({ path: join(SALIDA, archivo), fullPage })
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

const abrirDemo = async (perfil = /Vendedor/) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1400)
  resultado.version = ((await page.locator('body').innerText()).match(/v\d+\.\d+\.\d+/) || [null])[0] || resultado.version
  await page.getByRole('button', { name: perfil }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(400)
  }
}

await paso('entrada a la demo y ficha del cliente con el equipo', async () => {
  await abrirDemo()
  await page.goto(`${BASE}/clientes?cliente=demo-cliente-lucia`, { waitUntil: 'domcontentloaded' })
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  const fila = ficha.getByTestId('perfil-dispositivo-fila').first()
  await fila.waitFor({ timeout: 20000 })
  await shot(page, 'ficha-equipo-acciones', false)
  return `demo ${resultado.version || 'sin versión'} · equipo con acciones de informe`
})

await paso('compartir por WhatsApp lleva el link público del informe', async () => {
  const ficha = page.getByRole('dialog')
  const boton = ficha.getByRole('button', { name: /Compartir informe del equipo .* por WhatsApp/ }).first()
  afirmar(await boton.count(), 'no aparece la acción de WhatsApp del informe')
  const [popup] = await Promise.all([
    contexto.waitForEvent('page', { timeout: 20000 }),
    boton.click(),
  ])
  let url = popup.url()
  for (let intento = 0; intento < 20 && !/wa\.me|api\.whatsapp\.com/.test(url); intento += 1) {
    await page.waitForTimeout(200)
    url = popup.url()
  }
  await popup.close().catch(() => {})
  afirmar(/wa\.me|api\.whatsapp\.com/.test(url), `el compartir no abrió WhatsApp: ${url.slice(0, 120)}`)
  const decodificado = decodeURIComponent(url).replace(/\+/g, ' ')
  afirmar(decodificado.includes(`/u/${SERIAL}`), `el mensaje no lleva el link del informe: ${decodificado.slice(0, 200)}`)
  afirmar(/Informe de dispositivo|informe del equipo/i.test(decodificado), `el mensaje no menciona el informe: ${decodificado.slice(0, 200)}`)
  return `WhatsApp con el link /u/${SERIAL}`
})

await paso('el portal del cliente lista los informes de sus equipos', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const seccion = page.getByText('Informes de tus equipos')
  await seccion.waitFor({ timeout: 20000 })
  const enlace = page.getByRole('link', { name: 'Ver informe' }).first()
  afirmar(await enlace.count(), 'no aparece el enlace «Ver informe» del equipo')
  const href = await enlace.getAttribute('href')
  afirmar(href && href.includes('/u/'), `el enlace no apunta al informe público: ${href}`)
  await shot(page, 'portal-informes')
  return `sección en el portal · enlace ${href}`
})

await paso('el informe público abre desde el portal', async () => {
  await page.getByRole('link', { name: 'Ver informe' }).first().click()
  await page.getByText('Informe de dispositivo').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  const texto = plano(await page.locator('body').innerText())
  afirmar(/Aurora Móviles/.test(texto), 'el informe no muestra la tienda')
  afirmar(/Serial/.test(texto) && /34678|…/.test(texto), 'el informe no muestra el serial enmascarado')
  afirmar(/No es un certificado oficial/.test(texto), 'falta el aviso de informe informativo')
  await shot(page, 'informe-publico-desde-portal')
  return 'el informe abre con los datos del equipo y su aviso'
})

await contexto.close()
await browser.close()

const apiClientes = resultado.llamadasApi.filter((url) => /\/api\/(customers|message-templates)/.test(url))
resultado.llamadasApi = [...new Set(resultado.llamadasApi)]
resultado.demoNoTocaApi = apiClientes.length === 0
if (!resultado.demoNoTocaApi) resultado.hallazgos.push(`la demo llamó al API de clientes: ${apiClientes.join(', ')}`)

const fallos = resultado.pasos.filter((item) => !item.ok)
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultado, null, 2))
console.log(`\nVersión desplegada: ${resultado.version || 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length || !resultado.demoNoTocaApi ? 1 : 0
