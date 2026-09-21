// Verificación post-deploy de Finanzas en el demo público anónimo (#196/#185).
//
// Uso: node scripts/qa-196-demo-finanzas-produccion.mjs
// Base: QA_BASE_URL (default https://app.moboss.online) · Salida: docs/qa/196/
//
// Los ítems que dependen del deploy de #194 (conciliación, auditoría de caja y
// seguro simulable) se registran como "pendiente" con su evidencia, sin frenar
// el resto del recorrido. Las llamadas al API real se listan y deben ser cero.
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/196')
mkdirSync(SALIDA, { recursive: true })

const PENDIENTE = Symbol('pendiente')
const pendiente = (detalle) => ({ [PENDIENTE]: true, detalle })

const resultados = []
const llamadasApi = []
const erroresConsola = []
let contador = 0
let capturasPaso = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 140)) })
page.on('request', (req) => { if (req.url().includes(API_HOST)) llamadasApi.push(req.url().slice(0, 160)) })

async function shot(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  capturasPaso.push(archivo)
}

async function paso(nombre, fn) {
  capturasPaso = []
  const apiAntes = llamadasApi.length
  try {
    const detalle = await fn()
    if (detalle?.[PENDIENTE]) {
      resultados.push({ paso: nombre, estado: 'pendiente', detalle: detalle.detalle, capturas: capturasPaso, api: llamadasApi.slice(apiAntes) })
      console.log(`PENDIENTE ${nombre}: ${detalle.detalle}`)
      return
    }
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, api: llamadasApi.slice(apiAntes) })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ paso: nombre, estado: 'fallo', detalle: String(error?.message || error).slice(0, 400), capturas: capturasPaso, api: llamadasApi.slice(apiAntes) })
    console.log(`FALLO ${nombre}: ${error?.message || error}`)
    try { await shot(`fallo-${nombre}`) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)
const visible = async (locator, timeout = 12000) => locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
async function ir(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await esperar(1600)
}
async function crearCuenta(kind, campos, nombreEsperado) {
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.locator('[data-testid="cuenta-form"]').waitFor()
  await page.selectOption('#pa-kind', kind)
  if (campos.banco) {
    await page.fill('#pa-bank', campos.banco)
    await page.getByRole('option', { name: new RegExp(campos.banco) }).first().click()
  }
  if (campos.procesadora) await page.selectOption('#pa-processor', campos.procesadora)
  if (campos.currency) await page.selectOption('#pa-currency', campos.currency)
  for (const selector of ['#pa-holder', '#pa-document', '#pa-number', '#pa-pix-key', '#pa-reference']) {
    if (campos[selector]) await page.fill(selector, campos[selector])
  }
  const nombre = await page.locator('#pa-name').inputValue()
  if (nombreEsperado && !nombreEsperado.test(nombre)) throw new Error(`nombre automático inesperado: "${nombre}" (esperaba ${nombreEsperado})`)
  await page.getByRole('button', { name: 'Guardar cuenta' }).click()
  await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
  await esperar(300)
  return nombre
}

try {
  await paso('entrada anónima a la demo (Dueño)', async () => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1200)
    await shot('demo-acceso')
    await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
    await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'), { timeout: 30000 })
    await esperar(1800)
    const banner = await visible(page.getByText(/los datos son ficticios/))
    await shot('panel-demo')
    if (!banner) throw new Error('no se ve el banner de datos ficticios')
    return 'demo anónima abierta con banner de datos ficticios'
  })

  await paso('cuentas y medios (efectivo multi-moneda, transferencia, tarjeta, Pix, USDT, canje)', async () => {
    await ir('/finanzas/bancos')
    await page.getByRole('heading', { name: 'Bancos y cuentas' }).waitFor({ timeout: 15000 })
    const iniciales = await page.locator('[data-testid="cuenta-fila"]').count()
    const creadas = []
    creadas.push(await crearCuenta('CASH', { currency: 'USD' }, /Efectivo USD/))
    creadas.push(await crearCuenta('TRANSFER', { banco: 'Itaú', '#pa-holder': 'Titular Demo', '#pa-document': '3.456.789-0', '#pa-number': '1234' }, /Itaú.*Titular Demo.*Cuenta 1234/))
    creadas.push(await crearCuenta('CARD', { procesadora: 'Bancard' }, /Bancard/))
    creadas.push(await crearCuenta('PIX', { '#pa-holder': 'Titular Demo', '#pa-pix-key': 'demo@example.com' }, /Pix - Titular Demo/))
    creadas.push(await crearCuenta('CRYPTO', { '#pa-holder': 'Titular Demo', '#pa-reference': 'TRC20 · demo' }, /USDT - Titular Demo/))
    creadas.push(await crearCuenta('TRADE_IN', { '#pa-reference': 'Equipo demo' }, /Canje/))
    // Monedas fijas de Pix y USDT.
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.selectOption('#pa-kind', 'PIX')
    const pixBrl = await visible(page.getByText('BRL · Reales'), 5000)
    await page.selectOption('#pa-kind', 'CRYPTO')
    const usdtUsd = await visible(page.getByText('USD · Dólares'), 5000)
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await shot('cuentas-medios')
    const finales = await page.locator('[data-testid="cuenta-fila"]').count()
    return `iniciales=${iniciales} → finales=${finales} · nombres: ${creadas.join(' | ')} · Pix BRL fija=${pixBrl} · USDT USD fija=${usdtUsd}`
  })

  await paso('caja: turno abierto y arqueo', async () => {
    await ir('/finanzas/caja')
    const abierta = await visible(page.getByText('Abierta', { exact: true }))
    const sinApertura = await page.getByText('Sin apertura').count()
    const turno = await visible(page.getByText(/Turno de /))
    await shot('caja')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await esperar(500)
    await shot('caja-cierre')
    if (!abierta) throw new Error('la caja demo no muestra el estado abierto')
    if (sinApertura > 0) return pendiente(`la caja demo muestra "Sin apertura" (fix #188 pendiente de deploy)`)
    return `estado abierto · turno visible=${turno}`
  })

  await paso('caja: auditoría de medios y de efectivo en demo', async () => {
    const medios = await visible(page.getByText('Entradas por medio de pago'), 8000)
    const efectivo = await visible(page.getByText('Auditoría de efectivo'), 8000)
    if (!medios || !efectivo) {
      await shot('caja-auditoria-pendiente')
      return pendiente(`auditoría visible: medios=${medios} · efectivo=${efectivo} (demo de #194 pendiente de deploy)`)
    }
    const filas = await page.locator('[data-testid="auditoria-fila"]').count()
    await shot('caja-auditoria')
    return `auditoría visible con ${filas} operación(es) ficticias`
  })

  await paso('conciliación con datos ficticios', async () => {
    await ir('/finanzas/conciliacion')
    const disponible = await visible(page.getByText('Demo: cobros y cuentas ficticios'), 10000)
    if (!disponible) {
      const avisoDemo = await visible(page.getByText(/Conciliación no está disponible en la demo/), 5000)
      await shot('conciliacion-pendiente')
      if (avisoDemo) return pendiente('la demo muestra "Conciliación no está disponible" (demo de #194 pendiente de deploy)')
      throw new Error('la conciliación demo no muestra ni datos ni el aviso de demo')
    }
    const filas = page.getByTestId('conciliacion-fila')
    await expectFilas(filas)
    await filas.nth(0).getByRole('checkbox').check()
    await filas.nth(1).getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    await page.getByText(/Lote conciliado \(demo\)/).waitFor({ timeout: 8000 })
    await esperar(600)
    const lotes = await page.locator('[data-testid="conciliacion-lote"]').count()
    await shot('conciliacion-lote')
    return `${await filas.count()} pagos ficticios · lotes=${lotes}`
  })

  await paso('seguro y efecto en el margen', async () => {
    await ir('/configuracion/negocio')
    await page.locator('#seguro-toggle').waitFor({ state: 'attached', timeout: 15000 })
    const faltaSesion = await page.getByText('Falta sesión').count()
    if (faltaSesion > 0) throw new Error('la demo muestra "Falta sesión" al abrir el seguro')
    const guardar = page.getByRole('button', { name: 'Guardar seguro' })
    if (!(await guardar.isEnabled())) {
      await page.locator('#seguro-toggle').scrollIntoViewIfNeeded()
      await shot('seguro-demo')
      return pendiente('el seguro está deshabilitado con nota de demo (simulación de #194 pendiente de deploy)')
    }
    await page.locator('#seguro-toggle').check({ force: true })
    await guardar.click()
    await page.getByText('Seguro guardado en este navegador (demo).').waitFor({ timeout: 8000 })
    await shot('seguro-guardado')
    await ir('/analisis/ganancias')
    const badge = await visible(page.getByText('Incluye seguro 25% (demo)'))
    await shot('ganancias-con-seguro')
    if (!badge) throw new Error('el margen no muestra el seguro aplicado')
    return 'seguro guardado y aplicado al margen'
  })
} finally {
  const resumen = {
    base: BASE,
    fecha: new Date().toISOString(),
    resultados,
    llamadasApi: [...new Set(llamadasApi)],
    erroresConsola: [...new Set(erroresConsola)],
  }
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resumen, null, 2))
  await browser.close()
}

const fallos = resultados.filter((fila) => fila.estado === 'fallo').length
const pendientes = resultados.filter((fila) => fila.estado === 'pendiente').length
console.log(`\nVerificación terminada: ${resultados.filter((f) => f.estado === 'ok').length}/${resultados.length} OK · ${pendientes} pendiente(s) de deploy · ${fallos} fallo(s) · llamadas al API: ${[...new Set(llamadasApi)].length}`)
if (fallos) process.exitCode = 1

async function expectFilas(locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 10000 })
}
