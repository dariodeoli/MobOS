// Cierre visual de la demo (#213): recorre la demo pública como dueño y
// verifica que cada módulo muestre la experiencia completa con datos ficticios
// (empresa, equipo, clientes, inventario, pedidos, pagos, finanzas,
// autorizaciones y taller). Deja capturas claro y un reporte por pantalla.
//
//   node scripts/qa-213-demo-visual.mjs
//   QA_BASE_URL / QA_OUT para apuntar a otro host o salida.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/213-demo-visual')
mkdirSync(SALIDA, { recursive: true })

const PANTALLAS = [
  ['01-inicio', '/resumen', 'Facturado'],
  ['02-pos', '/pos', 'Nueva venta'],
  ['03-pedidos', '/pedidos', 'pedido-fila'],
  ['04-clientes', '/clientes', 'cliente-fila'],
  ['05-inventario', '/inventario/unidades', 'inventario-fila'],
  ['06-taller-rack', '/inventario/taller', 'rack-taller'],
  ['07-compras', '/compras', 'compra-fila'],
  ['08-finanzas-caja', '/finanzas/caja', 'Saldo esperado'],
  ['09-finanzas-bancos', '/finanzas/bancos', 'cuenta-fila'],
  ['10-finanzas-gastos', '/finanzas/gastos', 'gasto-fila'],
  ['11-finanzas-creditos', '/finanzas/creditos', 'credito-fila'],
  ['12-finanzas-conciliacion', '/finanzas/conciliacion', 'Ingresos conciliables'],
  ['13-autorizaciones', '/autorizaciones', 'autorizacion-fila'],
  ['14-servicio', '/servicio', 'servicio-fila'],
  ['15-equipo', '/configuracion/equipo', 'integrante-fila'],
  ['16-inventario-reservas', '/inventario/reservas', 'reserva-fila'],
  ['17-garantias', '/garantias', 'garantia-fila'],
  ['18-finanzas-cuotas', '/finanzas/cuotas', 'cuota-fila'],
  ['19-finanzas-comisiones', '/finanzas/comisiones', 'comision-fila'],
  ['20-finanzas-publicidad', '/finanzas/publicidad', 'anuncio-fila'],
  ['21-trade-in', '/trade-in', 'Trade-In'],
  ['22-impresion', '/configuracion/dispositivos', 'Impresora'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

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

<<<<<<< HEAD
const pantallas = []
for (const [nombre, ruta, señal] of PANTALLAS) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  // Espera la señal (testid o texto) para no medir la pantalla en carga.
  const porTestidLoc = page.locator(`[data-testid="${señal}"]`)
  const porTextoLoc = page.getByText(señal, { exact: false })
  await porTestidLoc.first().or(porTextoLoc.first()).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await esperar(800)
  const porTestid = await porTestidLoc.count().catch(() => 0)
  const porTexto = porTestid > 0 ? 0 : await porTextoLoc.count().catch(() => 0)
  const texto = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180)
  const vacio = /No hay |Todavía no|no disponible|vacío|Sin resultados|Sin solicitudes|Sin movimientos|Sin productos/i.test(texto)
  const archivo = `${nombre}-desktop-claro.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  pantallas.push({ pantalla: nombre, ruta, señal, elementos: porTestid || porTexto, vacio, archivo, texto })
  console.log(`[213] ${nombre}: ${porTestid || porTexto} × ${señal}${vacio ? ' · POSIBLE VACÍO' : ''}`)
=======
// El cierre pide la demo en claro, oscuro y móvil (el oscuro faltaba).
const MOVIL = new Set(['01-inicio', '02-pos', '03-pedidos', '04-clientes', '05-inventario', '13-autorizaciones', '21-trade-in', '22-impresion'])
const COMBOS = [
  ['desktop-claro', 1280, 900, 'light', null],
  ['desktop-oscuro', 1280, 900, 'dark', null],
  ['mobile-claro', 390, 844, 'light', MOVIL],
]

const pantallas = []
for (const [combo, ancho, alto, tema, solo] of COMBOS) {
  for (const [nombre, ruta, señal] of PANTALLAS) {
    if (solo && !solo.has(nombre)) continue
    await page.setViewportSize({ width: ancho, height: alto })
    await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, tema)
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    // Espera la señal (testid o texto) para no medir la pantalla en carga.
    const porTestidLoc = page.locator(`[data-testid="${señal}"]`)
    const porTextoLoc = page.getByText(señal, { exact: false })
    await porTestidLoc.first().or(porTextoLoc.first()).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await esperar(800)
    const porTestid = await porTestidLoc.count().catch(() => 0)
    const porTexto = porTestid > 0 ? 0 : await porTextoLoc.count().catch(() => 0)
    const texto = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 180)
    const vacio = /No hay |Todavía no|no disponible|vacío|Sin resultados|Sin solicitudes|Sin movimientos/i.test(texto)
    const archivo = `${nombre}-${combo}.jpg`
    await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
    pantallas.push({ pantalla: nombre, combo, tema, ruta, señal, elementos: porTestid || porTexto, vacio, archivo, texto })
    console.log(`[213] ${nombre} (${combo}): ${porTestid || porTexto} × ${señal}${vacio ? ' · POSIBLE VACÍO' : ''}`)
  }
>>>>>>> origin/slot/diseno
}

writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), pantallas }, null, 2)}\n`)
await browser.close()
const vacias = pantallas.filter((p) => p.vacio).map((p) => p.pantalla)
console.log(`\n[213] ${BASE} · v${version || '?'} · ${pantallas.length} pantallas · posibles vacías: ${vacias.length ? vacias.join(', ') : 'ninguna'}`)
