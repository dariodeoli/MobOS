#!/usr/bin/env node
// Verificación en producción (#240/#249): el certificado embebible abre con
// `?embed=1` (seguimiento visto/no visto de CRM, con INV) y los targets de
// Clientes miden ≥44 px en el celular (390) y en tablet (768).
//
//   node scripts/qa-240-249-produccion.mjs
//   MOBOS_QA_URL=http://localhost:5210 MOBOS_QA_OUT=/tmp/qa240249 node scripts/qa-240-249-produccion.mjs
//
// Salida: <QA_OUT>/*.png + resultados.json (versión desplegada, medidas y
// resultado por paso). Sale 1 si un target baja de 44 o el certificado no abre.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = String(process.env.MOBOS_QA_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.MOBOS_QA_OUT || join(RAIZ, 'docs/QA-240-249-produccion')
const SERIAL = process.env.MOBOS_QA_SERIAL || '356789012345678' // equipo demo de Lucía (MOB-0008)
mkdirSync(SALIDA, { recursive: true })

const resultado = { url: BASE, fecha: new Date().toISOString(), version: null, medidas: [], pasos: [], capturas: [] }
const pendientes = []
const afirmar = (condicion, mensaje) => { if (!condicion) throw new Error(mensaje) }

let contador = 0
async function shot(page, nombre, fullPage = false) {
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
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

const caja = async (locator) => {
  const rect = await locator.boundingBox()
  return rect ? { ancho: Math.round(rect.width), alto: Math.round(rect.height) } : null
}

async function medir(nombre, locator, minimo = 44) {
  const medida = await caja(locator)
  afirmar(medida, `${nombre}: no se encontró el control`)
  resultado.medidas.push({ control: nombre, ...medida })
  afirmar(medida.ancho >= minimo && medida.alto >= minimo, `${nombre}: ${medida.ancho}×${medida.alto} < ${minimo}`)
  return medida
}

const browser = await chromium.launch({ headless: true })
const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await contexto.newPage()

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1400)
resultado.version = ((await page.locator('body').innerText()).match(/v\d+\.\d+\.\d+/) || [null])[0] || null
await page.getByRole('button', { name: /Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
await page.waitForTimeout(1200)
if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) {
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(300)
}

await paso('#249 · clientes a 390: acciones, chips y lote ≥44 px', async () => {
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  const filas = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Enviar WhatsApp a/ }) })
  await filas.first().waitFor({ timeout: 20000 })
  const fila = filas.first()
  const ojito = await medir('Resumen rápido', fila.getByRole('button', { name: /Resumen rápido de/ }).first())
  const wa = await medir('WhatsApp', fila.getByRole('button', { name: /Enviar WhatsApp a/ }).first())
  await medir('Elegir plantilla', fila.getByRole('button', { name: /Elegir plantilla de WhatsApp para/ }).first())
  await medir('Chip Todos', page.getByRole('button', { name: 'Todos', exact: true }).first())
  await medir('Área de la casilla de lote', page.locator('label:has(input[aria-label^="Seleccionar a "])').first())
  await shot(page, 'clientes-390')
  await page.getByTestId('clientes-tabla').evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(200)
  await shot(page, 'clientes-acciones-390')
  return `ojito ${ojito.ancho}×${ojito.alto} · WhatsApp ${wa.ancho}×${wa.alto} · resto ≥44`
})

await paso('#249 · clientes a 768: los mismos targets ≥44 px', async () => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const fila = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Enviar WhatsApp a/ }) }).first()
  await fila.waitFor({ timeout: 20000 })
  const ojito = await medir('Tablet · Resumen rápido', fila.getByRole('button', { name: /Resumen rápido de/ }).first())
  await medir('Tablet · WhatsApp', fila.getByRole('button', { name: /Enviar WhatsApp a/ }).first())
  await medir('Tablet · chip Con deuda', page.getByRole('button', { name: 'Con deuda', exact: true }).first())
  await shot(page, 'clientes-768')
  return `ojito ${ojito.ancho}×${ojito.alto}`
})

await paso('#240 · el certificado embebible abre con ?embed=1', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/u/${encodeURIComponent(SERIAL)}?demo=1&embed=1`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Informe de dispositivo').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  const texto = await page.locator('body').innerText()
  afirmar(/Aurora Móviles/.test(texto), 'el certificado no muestra la tienda')
  afirmar(/No es un certificado oficial/.test(texto), 'falta el aviso del informe')
  await shot(page, 'certificado-embebible-390', true)
  return `informe embebible de ${SERIAL} abierto en el subdominio de la app`
})

await paso('#240 · los mensajes de la tienda se ven en el portal demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  const seccion = page.getByTestId('portal-mensajes')
  await seccion.waitFor({ timeout: 20000 })
  const texto = await seccion.innerText()
  afirmar(/Mensajes de la tienda/.test(await page.locator('body').innerText()), 'falta la sección de mensajes')
  afirmar(/listo para retirar/i.test(texto), `no aparece el mensaje sembrado: ${texto.slice(0, 120)}`)
  afirmar(/Nuevo/.test(texto), 'el mensaje sin abrir no llega marcado como Nuevo')
  await shot(page, 'portal-mensajes-demo', true)
  return 'sección «Mensajes de la tienda» con el chip Nuevo'
})

await paso('#240 · los beneficios (saldo a favor y puntos) se ven en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  const seccion = page.getByTestId('portal-beneficios')
  await seccion.waitFor({ timeout: 20000 })
  const texto = await seccion.innerText()
  afirmar(/saldo a favor/i.test(texto), `no aparece el saldo a favor: ${texto.slice(0, 120)}`)
  afirmar(/250\.000/.test(texto), 'no aparece el monto del saldo a favor')
  afirmar(/puntos/i.test(texto), 'no aparecen los puntos')
  afirmar(/45\.000/.test(texto), 'no aparece el monto de los puntos')
  await shot(page, 'portal-beneficios-demo', true)
  return 'saldo a favor Gs 250.000 · puntos Gs 45.000'
})

await paso('#240 · las reservas vigentes se ven en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-carlos-rapido`, { waitUntil: 'domcontentloaded' })
  const seccion = page.getByTestId('portal-reservas')
  await seccion.waitFor({ timeout: 20000 })
  const texto = await seccion.innerText()
  afirmar(/tus reservas/i.test(texto), `no aparece la sección de reservas: ${texto.slice(0, 120)}`)
  afirmar(/iPhone 13/.test(texto), 'no aparece el equipo reservado')
  afirmar(/Hasta|Vence hoy/.test(texto), 'no aparece el vencimiento de la reserva')
  await shot(page, 'portal-reservas-demo', true)
  return 'reserva de iPhone 13 con su vencimiento'
})

await paso('#240 · el historial de pagos se ve en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  const seccion = page.getByTestId('portal-pagos')
  await seccion.waitFor({ timeout: 20000 })
  const texto = await seccion.innerText()
  afirmar(/total pagado/i.test(texto), `no aparece el total pagado: ${texto.slice(0, 120)}`)
  afirmar(/MOB-#0008|MOB-#0005/.test(texto), 'no aparecen los pedidos del historial')
  afirmar(/Efectivo|Transferencia|Tarjeta/.test(texto), 'no aparece el medio de pago')
  await shot(page, 'portal-pagos-demo', true)
  return 'historial con total pagado y medios legibles'
})

await paso('#240 · el seguimiento de la entrega se ve en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  const pasos = page.getByTestId('portal-pasos-entrega').first()
  await pasos.waitFor({ timeout: 20000 })
  const texto = await pasos.innerText()
  afirmar(/seguimiento de envío/i.test(texto), `no aparece el encabezado del seguimiento: ${texto.slice(0, 120)}`)
  afirmar(/En camino al cliente/.test(texto), 'no aparece el paso actual del envío')
  afirmar(/En preparación/.test(texto), 'no aparece el primer paso del envío')
  await shot(page, 'portal-seguimiento-demo', true)
  return 'pasos del envío con el actual, su etiqueta y fecha'
})

await paso('#240 · las cotizaciones con su aviso se ven en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-lucia-rapido`, { waitUntil: 'domcontentloaded' })
  const seccion = page.getByTestId('portal-cotizaciones')
  await seccion.waitFor({ timeout: 20000 })
  const texto = await seccion.innerText()
  afirmar(/COT-#0018/.test(texto), `no aparece la cotización: ${texto.slice(0, 120)}`)
  afirmar(/Vence en 2 días/.test(texto), 'no aparece la validez de la cotización')
  afirmar(/Ver cotización/.test(texto), 'no aparece el enlace para abrirla')
  const avisos = await page.getByTestId('portal-avisos').innerText()
  afirmar(/Tu cotización COT-#0018 vence en 2 días/.test(avisos), `falta el aviso de la cotización: ${avisos.slice(0, 160)}`)
  await shot(page, 'portal-cotizaciones-demo', true)
  return 'COT-#0018 vigente con aviso accionable'
})

await paso('#240 · el taller y la garantía se siguen en la cuenta demo', async () => {
  await page.goto(`${BASE}/cuenta/demo-demo-cliente-fernando-completo`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Servicio técnico').first().waitFor({ timeout: 20000 })
  const cuerpo = await page.locator('body').innerText()
  afirmar(/OS-0005|iPhone 11/.test(cuerpo), 'no aparece la orden de servicio demo')
  afirmar(/Diagnóstico/.test(cuerpo), 'no aparece el estado del taller')
  afirmar(/Garantías activas/.test(cuerpo), 'no aparece la garantía activa')
  await shot(page, 'portal-taller-garantia-demo', true)
  return 'OS-0005 en diagnóstico + garantía activa'
})

await paso('#240 · la vitrina sigue la entrega (nuevo)', async () => {
  await page.goto(`${BASE}/portal/demo-demo-cliente-lucia-completo`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Tus pedidos').first().waitFor({ timeout: 20000 })
  if (!(await page.getByTestId('portal-pasos-entrega').count())) {
    pendientes.push('seguimiento de la entrega en la vitrina (viaja en la próxima integración)')
    return 'pendiente de deploy: la vitrina todavía no muestra los pasos'
  }
  const pasos = page.getByTestId('portal-pasos-entrega').first()
  const texto = await pasos.innerText()
  afirmar(/seguimiento de envío/i.test(texto), `no aparece el seguimiento en la vitrina: ${texto.slice(0, 120)}`)
  afirmar(/En camino al cliente/.test(texto), 'no aparece el paso actual en la vitrina')
  await shot(page, 'portal-vitrina-seguimiento-demo', true)
  return 'pasos del envío también en la vitrina'
})

await contexto.close()
await browser.close()

const fallos = resultado.pasos.filter((item) => !item.ok)
resultado.pendientes = pendientes
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultado, null, 2))
console.log(`\nVersión desplegada: ${resultado.version || 'desconocida'}`)
console.log(`Pasos: ${resultado.pasos.length - fallos.length}/${resultado.pasos.length} OK · capturas: ${resultado.capturas.length}`)
if (pendientes.length) console.log(`Pendientes de deploy: ${pendientes.join(' · ')}`)
if (fallos.length) console.log(`Fallos: ${fallos.map((item) => `${item.paso} (${item.detalle})`).join(' · ')}`)
process.exitCode = fallos.length ? 1 : 0
