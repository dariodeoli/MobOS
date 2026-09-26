// Capturas finales POR DOMINIO para el paquete de activación F4 (#241).
// Orden del rollout: inventario → POS → pedidos → clientes → finanzas.
//
//   node scripts/qa-activacion-f4-dominios.mjs                 (producción)
//   QA_BASE_URL=http://localhost:5175 node scripts/qa-activacion-f4-dominios.mjs
//
// Entra por la demo pública (sin credenciales) y recorre cada dominio con sus
// pantallas clave (claro; oscuro y mobile donde suma). Evidencia:
// docs/qa/activacion-f4/dominios/.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/activacion-f4/dominios')
mkdirSync(SALIDA, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)
const capturas = []

async function preparar(vista, tema) {
  const [ancho, alto] = vista === 'mobile' ? [390, 844] : [1280, 900]
  await page.setViewportSize({ width: ancho, height: alto })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, tema)
}

async function visible(locator, timeout = 20_000) {
  await locator.first().waitFor({ state: 'visible', timeout }).catch(() => {})
}

async function foto(nombre) {
  // Espera el shell antes de la foto: evita capturar un estado de transición
  // (el header del shell se pinta al hidratar y puede faltar el menú).
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await esperar(900)
  const archivo = `${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  capturas.push(archivo)
  console.log(`[f4-dominios] ${archivo}`)
}

// Entrada por la demo pública.
await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await esperar(1200)
await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await esperar(1200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guia.getByRole('button', { name: 'Cerrar' }).click()
}
const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''

// ── 1 · Inventario ─────────────────────────────────────────────────────────
await preparar('desktop', 'light')
await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('inventario-fila'))
await foto('01-inventario-lista-desktop-claro')

await page.getByRole('button', { name: 'Ver como cuadrícula' }).first().click().catch(() => {})
await visible(page.getByTestId('inventario-tarjeta'))
await foto('01-inventario-tiles-desktop-claro')
await page.getByRole('button', { name: 'Ver como lista' }).first().click().catch(() => {})

await page.goto(`${BASE}/inventario/taller`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('rack-taller'))
await foto('01-inventario-taller-desktop-claro')

await preparar('desktop', 'dark')
await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('inventario-fila'))
await foto('01-inventario-lista-desktop-oscuro')

await preparar('mobile', 'light')
await page.goto(`${BASE}/inventario/unidades`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('inventario-fila'))
await page.getByTestId('inventario-fila').first().click().catch(() => {})
await visible(page.locator('[role="dialog"]'))
await foto('01-inventario-ficha-mobile-claro')
await page.keyboard.press('Escape').catch(() => {})

// ── 2 · POS ────────────────────────────────────────────────────────────────
async function armarCarrito() {
  await page.getByPlaceholder('Buscar producto…').fill('iPhone 15 Pro').catch(() => {})
  const producto = page.getByRole('button', { name: /iPhone 15 Pro 256GB/ }).first()
  await visible(producto)
  await producto.click().catch(() => {})
  await page.getByText('Productos de esta venta').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
}

await preparar('desktop', 'light')
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByRole('heading', { name: 'Nueva venta' }))
await foto('02-pos-inicio-desktop-claro')

await armarCarrito()
await foto('02-pos-carrito-desktop-claro')
await page.getByRole('button', { name: '+ Agregar pago' }).first().click().catch(() => {})
await visible(page.getByText('Pagos de esta venta'))
await foto('02-pos-cobro-desktop-claro')

await preparar('desktop', 'dark')
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByRole('heading', { name: 'Nueva venta' }))
await foto('02-pos-inicio-desktop-oscuro')

await preparar('mobile', 'light')
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByRole('heading', { name: 'Nueva venta' }))
await armarCarrito()
await foto('02-pos-carrito-mobile-claro')

// ── 3 · Pedidos ────────────────────────────────────────────────────────────
await preparar('desktop', 'light')
await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('pedido-fila'))
await foto('03-pedidos-lista-desktop-claro')
await page.getByTestId('pedido-fila').first().click().catch(() => {})
await visible(page.getByRole('button', { name: /Imprimir comprobante/ }))
await foto('03-pedidos-detalle-desktop-claro')

await preparar('desktop', 'dark')
await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('pedido-fila'))
await foto('03-pedidos-lista-desktop-oscuro')

await preparar('mobile', 'light')
await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('pedido-fila'))
await foto('03-pedidos-lista-mobile-claro')

// ── 4 · Clientes ───────────────────────────────────────────────────────────
await preparar('desktop', 'light')
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('cliente-fila'))
await foto('04-clientes-lista-desktop-claro')
await page.getByRole('button', { name: /Resumen rápido de/ }).first().click().catch(() => {})
await visible(page.locator('[role="dialog"]'))
await foto('04-clientes-resumen-desktop-claro')
await page.keyboard.press('Escape').catch(() => {})

await preparar('desktop', 'dark')
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('cliente-fila'))
await foto('04-clientes-lista-desktop-oscuro')

await preparar('mobile', 'light')
await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
await visible(page.getByTestId('cliente-fila'))
await foto('04-clientes-lista-mobile-claro')

// ── 5 · Finanzas ───────────────────────────────────────────────────────────
await preparar('desktop', 'light')
await page.goto(`${BASE}/finanzas/caja`, { waitUntil: 'domcontentloaded' })
await visible(page.getByText('Saldo esperado'))
await foto('05-finanzas-caja-desktop-claro')
await page.goto(`${BASE}/finanzas/conciliacion`, { waitUntil: 'domcontentloaded' })
await visible(page.getByText('Ingresos conciliables'))
await foto('05-finanzas-conciliacion-desktop-claro')

await preparar('desktop', 'dark')
await page.goto(`${BASE}/finanzas/caja`, { waitUntil: 'domcontentloaded' })
await visible(page.getByText('Saldo esperado'))
await foto('05-finanzas-caja-desktop-oscuro')

await preparar('mobile', 'light')
await page.goto(`${BASE}/finanzas/caja`, { waitUntil: 'domcontentloaded' })
await visible(page.getByText('Saldo esperado'))
await foto('05-finanzas-caja-mobile-claro')

writeFileSync(join(SALIDA, 'capturas.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), capturas }, null, 2)}\n`)
await browser.close()
console.log(`\n[f4-dominios] ${BASE} · v${version || '?'} · ${capturas.length} capturas en ${SALIDA}`)
