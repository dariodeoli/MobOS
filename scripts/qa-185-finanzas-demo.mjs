// Recorrido funcional del módulo Finanzas en PRODUCCIÓN sobre /demo (#185).
//
// Uso: node scripts/qa-185-finanzas-demo.mjs
// Salida: docs/qa/185/*.jpg + docs/qa/185/resultados.json
//
// Solo navega la demo pública (datos aislados en el navegador): no toca
// cuentas reales ni datos de una tienda.
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/185')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const errores = []
const fallosRed = []
const pedidosFallidos = []
let capturasPaso = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text().slice(0, 400)) })
page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
page.on('response', (respuesta) => {
  if (respuesta.status() >= 400 && respuesta.url().includes('/api/')) fallosRed.push(`${respuesta.status()} ${respuesta.url().slice(0, 160)}`)
})
page.on('requestfailed', (pedido) => {
  pedidosFallidos.push(`${pedido.failure()?.errorText || 'falló'} ${pedido.url().slice(0, 160)}`)
})

let contador = 0
async function shot(nombre) {
  contador += 1
  const archivo = `${String(contador).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  capturasPaso.push(archivo)
  return archivo
}

async function paso(nombre, fn) {
  capturasPaso = []
  const erroresAntes = errores.length
  const redAntes = fallosRed.length
  try {
    const detalle = await fn()
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, erroresConsola: errores.slice(erroresAntes), fallosRed: fallosRed.slice(redAntes) })
    console.log(`OK    ${nombre}`)
  } catch (error) {
    resultados.push({ paso: nombre, estado: 'fallo', detalle: String(error?.message || error).slice(0, 500), capturas: capturasPaso, erroresConsola: errores.slice(erroresAntes), fallosRed: fallosRed.slice(redAntes) })
    console.log(`FALLO ${nombre}: ${error?.message || error}`)
    try { await shot(`fallo-${nombre}`) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const valor = (selector) => page.locator(selector).inputValue()
async function ir(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await esperar(1800)
}

try {
  await paso('entrada a la demo', async () => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1200)
    await shot('acceso-demo')
    await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
    await esperar(2500)
    // La guía de la demo se abre sola la primera vez por pestaña (#201).
    const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
    if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
    await esperar(800)
    await shot('panel-demo')
    const nav = await page.getByText('Finanzas', { exact: true }).first().isVisible()
    return `demo abierta como dueño · menú Finanzas visible: ${nav}`
  })

  // ── Cuentas de cobro ────────────────────────────────────────────────
  await paso('bancos: estado inicial', async () => {
    await ir('/finanzas/bancos')
    await page.getByRole('heading', { name: 'Bancos y cuentas' }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Añadir cuenta' }).waitFor({ timeout: 10000 })
    await esperar(600)
    const filas = await page.locator('[data-testid="cuenta-fila"]').count()
    const nombres = await page.locator('[data-testid="cuenta-fila"] b').allTextContents()
    await shot('bancos-inicial')
    return `${filas} cuentas demo: ${nombres.map((n) => n.trim()).join(' | ')}`
  })

  await paso('efectivo: campos contextuales y nombre automático (Gs/USD/otra)', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'CASH')
    await esperar(300)
    const campos = {
      banco: await page.locator('#pa-bank').count(),
      titular: await page.locator('#pa-holder').count(),
      documento: await page.locator('#pa-document').count(),
      numeroCuenta: await page.locator('#pa-number').count(),
      comision: await page.locator('#pa-feePercent-toggle').count(),
      acreditacion: await page.locator('#pa-settlementDays-toggle').count(),
      moneda: await page.locator('#pa-currency').count(),
      monedaPersonalizada: await page.locator('#pa-currency-label').count(),
    }
    await shot('efectivo-gs-contextual')
    const nombreGs = await valor('#pa-name')

    await page.selectOption('#pa-currency', 'USD')
    await esperar(300)
    const nombreUsd = await valor('#pa-name')

    await page.fill('#pa-currency-label', 'ARS')
    await esperar(300)
    const nombreArs = await valor('#pa-name')
    await shot('efectivo-multimoneda')

    await page.fill('#pa-currency-label', '')
    await page.selectOption('#pa-currency', 'PYG')
    await esperar(200)
    return `campos visibles: ${JSON.stringify(campos)} · nombres sugeridos: "${nombreGs}" / "${nombreUsd}" / "${nombreArs}"`
  })

  await paso('efectivo: guardar la cuenta', async () => {
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(500)
    const nombres = await page.locator('[data-testid="cuenta-fila"] b').allTextContents()
    await shot('efectivo-guardado')
    return `cuentas ahora: ${nombres.map((n) => n.trim()).join(' | ')}`
  })

  await paso('transferencia: banco, titular, documento, cuenta y nombre automático', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'TRANSFER')
    await esperar(300)
    const campos = {
      banco: await page.locator('#pa-bank').count(),
      titular: await page.locator('#pa-holder').count(),
      documento: await page.locator('#pa-document').count(),
      numeroCuenta: await page.locator('#pa-number').count(),
      comision: await page.locator('#pa-feePercent-toggle').count(),
      acreditacion: await page.locator('#pa-settlementDays-toggle').count(),
    }
    await page.fill('#pa-bank', 'Itaú')
    await page.getByRole('option', { name: /Itaú/ }).first().click()
    await esperar(300)
    const nombreBanco = await valor('#pa-name')
    await page.fill('#pa-holder', 'Darío Deoli')
    await esperar(300)
    const nombreTitular = await valor('#pa-name')
    await page.fill('#pa-document', '3.456.789-0')
    await page.fill('#pa-number', '1234')
    await esperar(300)
    const nombreCuenta = await valor('#pa-name')
    await shot('transferencia-contextual')
    return `campos: ${JSON.stringify(campos)} · nombre: "${nombreBanco}" → "${nombreTitular}" → "${nombreCuenta}"`
  })

  await paso('transferencia: guardar', async () => {
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(500)
    const fila = await page.locator('[data-testid="cuenta-fila"]').filter({ hasText: 'Darío Deoli' }).count()
    await shot('transferencia-guardada')
    return `fila con titular visible: ${fila}`
  })

  await paso('tarjeta: procesadoras, comisión y acreditación', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'CARD')
    await esperar(300)
    const opciones = await page.locator('#pa-processor option').allTextContents()
    await page.selectOption('#pa-processor', 'Bancard')
    await page.locator('#pa-feePercent-toggle').click({ force: true })
    await esperar(200)
    await page.locator('#pa-feePercent').fill('3')
    await page.locator('#pa-settlementDays-toggle').click({ force: true })
    await esperar(200)
    await page.locator('#pa-settlementDays').fill('2')
    await esperar(300)
    const nombre = await valor('#pa-name')
    await shot('tarjeta-contextual')
    const comision = await page.locator('#pa-feePercent').inputValue()
    const acreditacion = await page.locator('#pa-settlementDays').inputValue()
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(500)
    await shot('tarjeta-guardada')
    return `procesadoras: ${opciones.filter(Boolean).join('/')} · elegida Bancard · comisión ${comision}% · acredita ${acreditacion} días · nombre "${nombre}"`
  })

  await paso('Pix: moneda fija BRL y llave', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'PIX')
    await esperar(400)
    const monedaFija = await page.locator('#pa-currency').count()
    const etiquetaMoneda = await page.locator('text=BRL · Reales').count()
    const llave = await page.locator('#pa-pix-key').count()
    await page.fill('#pa-holder', 'Darío Deoli')
    await page.fill('#pa-pix-key', 'dario@example.com')
    await esperar(300)
    const nombre = await valor('#pa-name')
    await shot('pix-contextual')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(400)
    return `selector de moneda: ${monedaFija} (0 = fija) · etiqueta BRL visible: ${etiquetaMoneda} · llave Pix: ${llave} · nombre "${nombre}"`
  })

  await paso('USDT - Cripto: moneda fija USD y referencia', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'CRYPTO')
    await esperar(400)
    const monedaFija = await page.locator('#pa-currency').count()
    const referencia = await page.locator('#pa-reference').count()
    await page.fill('#pa-holder', 'Darío Deoli')
    await page.fill('#pa-reference', 'TRC20 · TQn9...')
    await esperar(300)
    const nombre = await valor('#pa-name')
    await shot('usdt-contextual')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(400)
    return `selector de moneda: ${monedaFija} (0 = fija) · referencia: ${referencia} · nombre "${nombre}"`
  })

  await paso('canje: referencia/valor y guardado', async () => {
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    await page.selectOption('#pa-kind', 'TRADE_IN')
    await esperar(400)
    await page.fill('#pa-reference', 'Equipo recibido, valor acordado')
    await esperar(300)
    const nombre = await valor('#pa-name')
    await shot('canje-contextual')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(600)
    const filas = await page.locator('[data-testid="cuenta-fila"]').count()
    await shot('bancos-final')
    return `nombre "${nombre}" · filas finales: ${filas}`
  })

  await paso('bancos: tabla completa y edición de una cuenta', async () => {
    contador += 1
    const completo = `${String(contador).padStart(2, '0')}-bancos-tabla-completa.jpg`
    await page.screenshot({ path: join(SALIDA, completo), type: 'jpeg', quality: 72, fullPage: true })
    capturasPaso.push(completo)
    // Editar la tarjeta (Bancard): los campos vuelven precargados y el nombre
    // se conserva si se edita a mano.
    const fila = page.locator('[data-testid="cuenta-fila"]').filter({ hasText: 'Bancard' }).first()
    await fila.getByRole('button', { name: /Editar/ }).click()
    await page.locator('[data-testid="cuenta-form"]').waitFor()
    const precargado = { procesadora: await valor('#pa-processor'), comision: await valor('#pa-feePercent'), acreditacion: await valor('#pa-settlementDays') }
    await page.fill('#pa-name', 'Tarjeta Bancard mostrador')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await page.getByText('Cuenta guardada.').waitFor({ timeout: 8000 })
    await esperar(500)
    const quedo = await page.locator('[data-testid="cuenta-fila"]').filter({ hasText: 'Tarjeta Bancard mostrador' }).count()
    await shot('bancos-edicion')
    return `precargado: ${JSON.stringify(precargado)} · nombre manual conservado: ${quedo === 1}`
  })

  await paso('bancos en móvil (390px) sin desborde', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ir('/finanzas/bancos')
    await page.getByRole('heading', { name: 'Bancos y cuentas' }).waitFor({ timeout: 15000 })
    await esperar(700)
    const desborde = await overflow()
    await shot('bancos-mobile')
    await page.setViewportSize({ width: 1440, height: 900 })
    return `desborde horizontal: ${desborde}px`
  })

  // ── Conciliación ────────────────────────────────────────────────────
  await paso('conciliación en la demo', async () => {
    await ir('/finanzas/conciliacion')
    await esperar(1800)
    await page.getByRole('heading', { name: 'Conciliación y trazabilidad' }).waitFor({ timeout: 15000 })
    const resumen = await Promise.all(['Ingresos conciliables', 'Conciliado', 'Por conciliar', 'Diferencia de lotes'].map((titulo) => page.getByText(titulo).count()))
    const filas = await page.getByTestId('conciliacion-fila').count()
    const lotes = await page.getByTestId('conciliacion-lote').count()
    await shot('conciliacion')
    return `resumen completo: ${resumen.every((n) => n > 0)} · pagos listados: ${filas} · lotes: ${lotes}`
  })

  // ── Caja y auditoría ────────────────────────────────────────────────
  await paso('caja: turno, arqueo y auditoría en la demo', async () => {
    await ir('/finanzas/caja')
    await esperar(1800)
    const abrir = await page.getByRole('button', { name: /Abrir caja|Abrir turno/ }).count()
    const abierta = await page.getByText('Abierta', { exact: true }).count()
    const turno = (await page.getByText(/Turno de/).first().textContent().catch(() => '')) || ''
    const medios = await page.getByText('Entradas por medio de pago').count()
    const auditoriaEfectivo = await page.getByText('Auditoría de efectivo').count()
    await shot('caja')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await esperar(600)
    await shot('caja-auditoria')
    return `turno abierto: ${abierta > 0} (${turno.trim()}) · botón de apertura: ${abrir} · medios: ${medios} · auditoría de efectivo: ${auditoriaEfectivo}`
  })

  // ── Seguro y margen ─────────────────────────────────────────────────
  await paso('seguro de ventas en Configuración (demo)', async () => {
    await ir('/configuracion/negocio')
    await esperar(1500)
    const seguro = await page.getByText('Seguro de ventas').count()
    const toggle = await page.locator('#seguro-toggle').count()
    await shot('seguro-config')
    if (toggle) {
      await page.locator('#seguro-toggle').click({ force: true })
      await esperar(300)
      const pct = await page.locator('#seguro-pct').inputValue().catch(() => '')
      const ayuda = await page.locator('text=Costo real = costo + seguro').count()
      await shot('seguro-porcentaje')
      // En la demo el guardado va contra la API real: se verifica qué pasa.
      const guardar = page.getByRole('button', { name: 'Guardar seguro' })
      let aviso = 'sin botón de guardado'
      if (await guardar.count()) {
        await guardar.click()
        await esperar(1500)
        aviso = (await page.locator('[role="alert"], [role="status"]').allTextContents()).filter(Boolean).join(' | ').slice(0, 200) || 'sin aviso visible'
        await shot('seguro-guardar-demo')
      }
      return `sección visible: ${seguro} · toggle: ${toggle} · % propuesto: "${pct}" · ayuda de fórmula: ${ayuda} · guardar en demo → ${aviso}`
    }
    return `sección visible: ${seguro} · toggle: ${toggle}`
  })

  await paso('resumen y ganancias en la demo', async () => {
    await ir('/resumen')
    await esperar(1800)
    const facturado = await page.getByText('Facturado', { exact: true }).count()
    await shot('resumen-demo')
    await ir('/analisis/ganancias')
    await esperar(1800)
    const comoSeCalcula = await page.getByRole('heading', { name: 'Cómo se calcula' }).count()
    const resultado = await page.locator('[data-testid="ganancia-resultado"]').textContent().catch(() => '')
    await shot('ganancias-demo')
    return `Resumen con Facturado: ${facturado} · Ganancias con desglose: ${comoSeCalcula} · resultado mostrado: ${resultado?.trim()}`
  })
} finally {
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados, errores, fallosRed, pedidosFallidos }, null, 2))
  await browser.close()
}

console.log(`\nRecorrido terminado: ${resultados.filter((f) => f.estado === 'ok').length}/${resultados.length} pasos OK · ${errores.length} errores de consola · ${fallosRed.length} respuestas API ≥400 · ${pedidosFallidos.length} pedidos fallidos`)
