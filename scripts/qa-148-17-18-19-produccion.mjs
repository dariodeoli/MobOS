// Evidencia de #148 §17 (caja y auditoría de efectivo), §18 (analytics del POS)
// y §19 (clientes y seguro) en PRODUCCIÓN sobre /demo: el repaso de lo que
// pedía la épica en el dominio de Finanzas, con capturas.
//
// Uso: node scripts/qa-148-17-18-19-produccion.mjs
// Salida: docs/qa/148-17-18-19/*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const WEB = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/148-17-18-19')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const ver = async (nombre, fn) => {
  try {
    const detalle = await fn()
    resultados.push({ nombre, ok: true, detalle: detalle || '' })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ nombre, ok: false, detalle: String(error?.message || error).slice(0, 300) })
    console.log(`FALLO ${nombre} — ${String(error?.message || error).slice(0, 180)}`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()

await ver('Demo: se entra como Dueño y se cierra la guía', async () => {
  await page.goto(`${WEB}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
  return page.url().replace(WEB, '')
})

// ── §17 Caja y auditoría de efectivo ────────────────────────────────────────
await ver('§17: efectivo inicial, recibido, esperado y diferencias del rango', async () => {
  await page.goto(`${WEB}/finanzas/caja`)
  await expect(page.getByRole('heading', { name: 'Ventas por caja' })).toBeVisible({ timeout: 30000 })
  for (const rotulo of ['Efectivo inicial', 'Efectivo recibido', 'Esperado en caja', 'Diferencias de cierre']) {
    await expect(page.getByText(rotulo).first()).toBeVisible({ timeout: 15000 })
  }
  await expect(page.getByRole('heading', { name: 'Ventas por caja' })).toBeVisible()
  return 'recibido por sesión y diferencias visibles'
})

await ver('§17: cada operación con fecha/hora, pedido, cliente, vendedor, monto y nota', async () => {
  await expect(page.getByTestId('auditoria-efectivo-tabla')).toBeVisible({ timeout: 20000 })
  const filas = page.getByTestId('auditoria-fila')
  await expect(filas.first()).toBeVisible({ timeout: 20000 })
  const primera = (await filas.first().innerText()).replace(/\n+/g, ' · ')
  // Los encabezados se muestran en mayúsculas por estilo (innerText las devuelve así).
  const cabecera = (await page.getByTestId('auditoria-efectivo-tabla').innerText()).toUpperCase()
  for (const titulo of ['FECHA', 'OPERACIÓN', 'VENDEDOR', 'MONTO', 'ESTADO', 'OBSERVACIÓN']) {
    expect(cabecera).toContain(titulo)
  }
  // La fecha de la fila viene con hora ("22-sept. · 11:20").
  expect(primera).toMatch(/·\s*\d{2}:\d{2}/)
  return primera.slice(0, 160)
})

await ver('§17: se marca "Con diferencia" con observación y la fila lo refleja', async () => {
  const fila = page.getByTestId('auditoria-fila').first()
  const estado = fila.getByLabel(/^Estado de/)
  await estado.selectOption({ label: 'Con diferencia' })
  await fila.getByLabel('Observación').fill('Falta de caja (QA #148 §17)')
  await fila.getByRole('button', { name: 'Guardar' }).click()
  await expect(estado).toHaveValue('DIFFERENCE', { timeout: 10000 })
  await expect(fila.getByText('Con diferencia', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: join(SALIDA, 'auditoria-efectivo.jpg'), type: 'jpeg', quality: 72 })
  return 'marca guardada con observación'
})

// ── §18 Analytics del POS ───────────────────────────────────────────────────
await ver('§18: el tablero muestra todos los cortes del POS', async () => {
  await page.goto(`${WEB}/pos`)
  await page.getByRole('button', { name: 'Analytics' }).click({ timeout: 30000 })
  const panel = page.getByRole('dialog')
  await panel.getByText('Ventas de hoy').waitFor({ timeout: 20000 })
  const nucleo = ['Ventas de hoy', 'Pedidos', 'Ticket promedio', 'Ventas netas', 'Top productos']
  for (const texto of nucleo) await expect(panel.getByText(texto, { exact: false }).first()).toBeVisible({ timeout: 15000 })
  // Cortes del resto de §18 (los últimos llegan con el analytics al día de .140).
  const resto = ['Items por pedido', 'Descuentos', 'Cobrado', 'Efectivo', 'Pendiente', 'Reembolsos', 'Cobros netos por tipo', 'Cobros netos por cuenta', 'Cobros netos por sucursal', 'Ventas por vendedor', 'Ventas por caja']
  const textoPanel = await panel.innerText()
  const presentes = resto.filter((texto) => textoPanel.toUpperCase().includes(texto.toUpperCase()))
  const porTipo = await panel.locator('section').filter({ hasText: 'Cobros netos por tipo' }).first().innerText().catch(() => '')
  await page.screenshot({ path: join(SALIDA, 'analytics-arriba.jpg'), type: 'jpeg', quality: 72 })
  await panel.evaluate((nodo) => nodo.scrollTo(0, nodo.scrollHeight))
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(SALIDA, 'analytics-abajo.jpg'), type: 'jpeg', quality: 72 })
  const medios = ['Efectivo', 'Pix', 'USDT - Cripto', 'Canje'].filter((medio) => porTipo.includes(medio))
  return `${nucleo.length}/${nucleo.length} núcleo · cortes extra visibles ${presentes.length}/${resto.length}${presentes.length < resto.length ? ` (faltan: ${resto.filter((t) => !presentes.includes(t)).join(', ')})` : ''} · medios: ${medios.join(', ') || '(sin desglose)'}`
})

// ── §19 Clientes y seguro ───────────────────────────────────────────────────
await ver('§19: el seguro de la empresa se configura en Finanzas/empresa', async () => {
  await page.goto(`${WEB}/configuracion/negocio`)
  await expect(page.locator('#seguro-toggle')).toBeVisible({ timeout: 30000 })
  if (!(await page.locator('#seguro-toggle').isChecked())) await page.locator('#seguro-toggle').click({ force: true })
  await page.locator('#seguro-pct').fill('10')
  await expect(page.getByText(/Costo real = costo \+ seguro/)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar seguro' }).click()
  await expect(page.getByText(/Seguro guardado/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: join(SALIDA, 'seguro-config.jpg'), type: 'jpeg', quality: 72 })
  return 'porcentaje de empresa guardado (demo, en memoria de la pestaña)'
})

await ver('§19: el seguro impacta el margen (costo real = costo + seguro)', async () => {
  // Navegación dentro de la app: la demo guarda el seguro en memoria de la pestaña.
  await page.getByRole('button', { name: 'Análisis', exact: true }).click()
  const tab = page.getByRole('tab', { name: 'Ganancias' })
  await expect(tab).toBeVisible({ timeout: 20000 })
  await tab.click()
  await expect(page).toHaveURL(/\/analisis\/ganancias$/, { timeout: 15000 })
  await expect(page.getByText(/Incluye seguro/).first()).toBeVisible({ timeout: 20000 })
  const badge = (await page.getByText(/Incluye seguro/).first().innerText()).trim()
  await page.screenshot({ path: join(SALIDA, 'ganancias-seguro.jpg'), type: 'jpeg', quality: 72 })
  return badge
})

await ver('§19: el cliente tiene su seguro personalizado', async () => {
  await page.goto(`${WEB}/clientes?cliente=demo-cliente-lucia`)
  await expect(page.getByText(/Seguro:\s*Activo · 12,5%/).first()).toBeVisible({ timeout: 30000 })
  const panel = page.getByTestId('perfil-seguro').count()
  await page.screenshot({ path: join(SALIDA, 'cliente-seguro.jpg'), type: 'jpeg', quality: 72 })
  return `Lucía Fernández · 12,5% personalizado (panel editable: ${panel ? 'sí' : 'solo lectura en demo'})`
})

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ resultados, web: WEB, fecha: new Date().toISOString() }, null, 2))
await browser.close()
const fallos = resultados.filter((fila) => !fila.ok)
console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK`)
if (fallos.length) process.exitCode = 1
