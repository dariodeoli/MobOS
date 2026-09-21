// Recorrido funcional del módulo Finanzas en modo demo SIN API real (#194).
//
// Uso: QA_BASE_URL=http://localhost:5215 node scripts/qa-194-demo-finanzas.mjs
// Salida: docs/qa/194/*.jpg + docs/qa/194/resultados.json
//
// Solo navega la demo pública/local (datos aislados en el navegador).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'http://localhost:5215'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/194')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const errores = []
const fallosRed = []
let capturasPaso = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text().slice(0, 300)) })
page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
page.on('response', (respuesta) => {
  if (respuesta.status() >= 400 && respuesta.url().includes('/api/')) fallosRed.push(`${respuesta.status()} ${respuesta.url().slice(0, 160)}`)
})

let contador = 0
async function shot(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  capturasPaso.push(archivo)
}

async function paso(nombre, fn) {
  capturasPaso = []
  const redAntes = fallosRed.length
  try {
    const detalle = await fn()
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, fallosRed: fallosRed.slice(redAntes) })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ paso: nombre, estado: 'fallo', detalle: String(error?.message || error).slice(0, 400), capturas: capturasPaso, fallosRed: fallosRed.slice(redAntes) })
    console.log(`FALLO ${nombre}: ${error?.message || error}`)
    try { await shot(`fallo-${nombre}`) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)
async function ir(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await esperar(1800)
}
async function entrarDemo() {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1000)
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await esperar(2000)
}

try {
  await paso('entrada a la demo', async () => {
    await entrarDemo()
    await shot('panel-demo')
    return `demo abierta en ${BASE}`
  })

  await paso('cuentas y medios ficticios (efectivo USD, tarjeta con procesadora)', async () => {
    await ir('/finanzas/bancos')
    const filas = await page.locator('[data-testid="cuenta-fila"]').count()
    await shot('cuentas-demo')
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.selectOption('#pa-kind', 'CASH')
    await page.selectOption('#pa-currency', 'USD')
    await esperar(300)
    const nombreEfectivo = await page.locator('#pa-name').inputValue()
    await shot('cuenta-efectivo-usd')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(400)
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.selectOption('#pa-kind', 'CARD')
    await page.selectOption('#pa-processor', 'Bancard')
    await esperar(300)
    const nombreTarjeta = await page.locator('#pa-name').inputValue()
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(400)
    await shot('cuentas-con-medios')
    return `cuentas iniciales: ${filas} · nombre automático: "${nombreEfectivo}" / "${nombreTarjeta}"`
  })

  await paso('caja demo: turno, medios y auditoría de efectivo', async () => {
    await ir('/finanzas/caja')
    const abierta = await page.getByText('Abierta', { exact: true }).count()
    const sinApertura = await page.getByText('Sin apertura').count()
    const turno = await page.getByText(/Turno de /).count()
    await shot('caja-turno')
    await page.getByText('Auditoría de efectivo').scrollIntoViewIfNeeded()
    await esperar(600)
    const filasAuditoria = await page.locator('[data-testid="auditoria-fila"]').count()
    const fila = page.getByTestId('auditoria-fila').first()
    await fila.getByRole('combobox').selectOption('VERIFIED')
    await fila.getByRole('button', { name: 'Guardar' }).click()
    await esperar(500)
    await shot('caja-auditoria')
    return `abierta=${abierta} · sin apertura=${sinApertura} · turno=${turno} · filas auditoría=${filasAuditoria}`
  })

  await paso('conciliación demo con lote y diferencia', async () => {
    await ir('/finanzas/conciliacion')
    const filas = await page.locator('[data-testid="conciliacion-fila"]').count()
    await shot('conciliacion-grupos')
    // Un lote cubre una sola cuenta: se eligen los dos cobros de efectivo.
    const fila0 = page.getByTestId('conciliacion-fila').nth(0)
    const fila1 = page.getByTestId('conciliacion-fila').nth(1)
    await fila0.getByRole('checkbox').check()
    await fila1.getByRole('checkbox').check()
    await esperar(400)
    await page.getByLabel('Monto recibido').fill('6.800.000')
    await page.getByPlaceholder('Ej. la procesadora retuvo la comisión del lote').fill('Depósito ficticio con diferencia de prueba')
    await shot('conciliacion-lote-antes')
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    await page.getByText(/Lote conciliado \(demo\)/).waitFor({ timeout: 8000 })
    await esperar(800)
    const lotes = await page.locator('[data-testid="conciliacion-lote"]').count()
    await shot('conciliacion-lote-despues')
    return `items=${filas} · lotes=${lotes}`
  })

  await paso('seguro demo y efecto en el margen', async () => {
    await ir('/analisis/ganancias')
    const sinSeguro = (await page.getByTestId('ganancia-resultado').textContent())?.trim()
    await shot('ganancias-sin-seguro')
    await ir('/configuracion/negocio')
    await page.locator('#seguro-toggle').check({ force: true })
    await esperar(300)
    await shot('seguro-config')
    await page.getByRole('button', { name: 'Guardar seguro' }).click()
    await page.getByText('Seguro guardado en este navegador (demo).').waitFor({ timeout: 8000 })
    await ir('/analisis/ganancias')
    const conSeguro = (await page.getByTestId('ganancia-resultado').textContent())?.trim()
    const badge = await page.getByText('Incluye seguro 25% (demo)').count()
    await shot('ganancias-con-seguro')
    return `resultado sin seguro ${sinSeguro} → con seguro ${conSeguro} (badge: ${badge})`
  })
} finally {
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados, errores, fallosRed }, null, 2))
  await browser.close()
}

console.log(`\nRecorrido terminado: ${resultados.filter((f) => f.estado === 'ok').length}/${resultados.length} pasos OK · ${errores.length} errores de consola · ${fallosRed.length} respuestas API ≥400`)
