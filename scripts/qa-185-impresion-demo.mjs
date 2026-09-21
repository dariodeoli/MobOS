// Recorrido interactivo de impresión en PRODUCCIÓN sobre /demo (#185).
//
// MOS-PRN documentó 5 pasos (cola/cancelación, anti-duplicados, auto-validación,
// estados honestos y QR) que no pudo ejecutar por falta de navegador conectado.
// Este script intenta los 5 pasos con Playwright headless contra la demo pública
// y reporta con evidencia qué es verificable en /demo y qué no (la demo es un
// modo local sin API: el monitor de impresión no tiene trabajos reales).
//
// Uso: node scripts/qa-185-impresion-demo.mjs
// Salida: docs/qa/185-impresion/*.jpg + resultados.json
// Solo navega la demo pública: no usa sesiones ni datos reales.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/185-impresion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const fallosRed = []
const erroresConsola = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message.slice(0, 300)}`))
page.on('response', (respuesta) => {
  if (respuesta.status() >= 400 && respuesta.url().includes('/api/')) fallosRed.push(`${respuesta.status()} ${respuesta.url().slice(0, 140)}`)
})

let contador = 0
async function shot(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturas = []
  const antes = fallosRed.length
  try {
    const detalle = await fn((captura) => { capturas.push(captura); return captura })
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas, fallosRed: fallosRed.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas, fallosRed: fallosRed.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
    try { capturas.push(await shot(`fallo-${nombre}`)) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)

await paso('entrada a la demo como dueño', async () => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1200)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await esperar(2500)
  await shot('panel-demo')
  return 'demo abierta como dueño'
})

await paso('pantalla de Impresoras: qué muestra la demo', async () => {
  await page.goto(`${BASE}/configuracion/impresoras`, { waitUntil: 'domcontentloaded' })
  await esperar(3000)
  await shot('impresoras-demo')
  const texto = await page.locator('body').innerText()
  const resumen = {
    titulo: /Impresoras/.test(texto),
    verCola: /Ver cola/i.test(texto),
    actividad: /Actividad de impresión/i.test(texto),
    sinImpresoras: /Sin impresoras|Todavía no|No hay/i.test(texto),
    filasCola: await page.getByRole('row').count(),
    inputsValidacion: await page.getByLabel(/Número secreto de la validación/).count(),
    botonesCancelar: await page.getByRole('button', { name: /Cancelar/i }).count(),
  }
  return JSON.stringify(resumen)
})

await paso('paso 1 · cola con cancelación individual y en lote', async () => {
  const verCola = page.getByRole('button', { name: 'Ver cola' })
  if (await verCola.count() === 0) return 'NO DISPONIBLE en /demo: no existe el acceso a la cola (sin backend real)'
  await verCola.first().click()
  await esperar(1200)
  await shot('cola-modal')
  const dialogo = page.getByRole('dialog')
  const texto = (await dialogo.innerText().catch(() => '')) || ''
  const filas = await dialogo.getByRole('row').count()
  const cancelar = await dialogo.getByRole('button', { name: /Cancelar/i }).count()
  return `modal abierto · filas=${filas} · botones cancelar=${cancelar} · ${texto.slice(0, 120).replace(/\s+/g, ' ')}`
})

await paso('paso 2 · anti-duplicados (requiere trabajos pendientes)', async () => {
  const filas = await page.getByRole('row').count()
  const avisoDuplicado = await page.getByText(/ya hay una impresión pendiente|Reimprimir igual/i).count()
  return `filas en pantalla=${filas} · avisos de duplicado=${avisoDuplicado} · sin trabajos encolables en /demo (no hay cola real): no ejercitable`
})

await paso('paso 3 · auto-validación del código del papel', async () => {
  const inputs = await page.getByLabel(/Número secreto de la validación/).count()
  const confirmado = await page.getByText(/Confirmado en papel|✓ en papel/).count()
  return `inputs de validación=${inputs} · estados "en papel"=${confirmado} · sin trabajos de prueba reales en /demo: no ejercitable`
})

await paso('paso 4 · estados honestos (pendiente/incierto/fallido)', async () => {
  const texto = await page.locator('body').innerText()
  const estados = ['Pendiente', 'Incierto', 'Fallido', 'Cancelado'].filter((estado) => new RegExp(estado, 'i').test(texto))
  return `estados visibles en pantalla: ${estados.join(', ') || 'ninguno'} · sin filas de cola en /demo: no ejercitable`
})

await paso('paso 5 · QR del pedido y regenerar acceso', async () => {
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await esperar(2500)
  const fila = page.getByTestId('pedido-fila').first()
  if (await fila.count() === 0) return 'NO DISPONIBLE: la lista de pedidos de la demo no cargó filas'
  await fila.click()
  await esperar(2000)
  await shot('pedido-detalle')
  const texto = await page.locator('body').innerText()
  const qr = /Acceso del cliente|Regenerar acceso QR|Vista digital|Código QR/i.test(texto)
  const boton = await page.getByRole('button', { name: 'Regenerar acceso QR' }).count()
  return `detalle abierto · bloque QR/acceso visible=${qr} · botón regenerar=${boton} · ${qr ? '' : 'la demo no carga accesos (esDemo omite la API)'}`
})

await browser.close()
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados, fallosRed, erroresConsola }, null, 2)}\n`)
console.log(`\nResultados: ${SALIDA}/resultados.json`)
console.log(`Fallos de red: ${fallosRed.length} · errores de consola: ${erroresConsola.length}`)
