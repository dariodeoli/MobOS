// Capturas finales del rollout v2 para el paquete de activación de F4 (#241).
//
//   node scripts/qa-activacion-f4-capturas.mjs                 (producción)
//   QA_BASE_URL=http://localhost:5175 node scripts/qa-activacion-f4-capturas.mjs
//
// Entra por la demo pública (sin credenciales) y recorre las pantallas clave en
// desktop (1280) y mobile (390), claro y oscuro. Si una pantalla no está
// disponible en el host, se informa y se sigue. Evidencia:
// docs/qa/activacion-f4/.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/activacion-f4')
mkdirSync(SALIDA, { recursive: true })

const PANTALLAS = [
  ['resumen', '/resumen', (page) => page.getByText('Facturado').first()],
  ['pos', '/pos', (page) => page.getByRole('heading', { name: 'Nueva venta' })],
  ['pedidos', '/pedidos', (page) => page.getByTestId('pedido-fila').first()],
  ['clientes', '/clientes', (page) => page.getByTestId('cliente-fila').first()],
  ['inventario', '/inventario/unidades', (page) => page.getByTestId('inventario-fila').first()],
  ['finanzas-caja', '/finanzas/caja', (page) => page.getByText('Saldo esperado').first()],
  ['configuracion', '/configuracion/mi-cuenta', (page) => page.getByRole('tab', { name: 'Mi cuenta' }).first()],
  ['ops', '/ops', (page) => page.getByTestId('ops-tablero')],
]

const COMBOS = [
  ['desktop-claro', 1280, 900, 'light'],
  ['desktop-oscuro', 1280, 900, 'dark'],
  ['mobile-claro', 390, 844, 'light'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
const esperar = (ms) => page.waitForTimeout(ms)

// Entrada por la demo pública (misma superficie que ve un cliente).
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

const resultados = []
for (const [combo, ancho, alto, tema] of COMBOS) {
  for (const [nombre, ruta, listo] of PANTALLAS) {
    // En oscuro alcanza con las pantallas que más se usan; mobile solo claro.
    if (combo === 'desktop-oscuro' && !['resumen', 'pos', 'ops'].includes(nombre)) continue
    if (combo === 'mobile-claro' && !['pos', 'pedidos', 'configuracion', 'ops'].includes(nombre)) continue
    try {
      await page.setViewportSize({ width: ancho, height: alto })
      await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, tema)
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await listo(page).waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {})
      await esperar(1200)
      const archivo = `${nombre}-${combo}.jpg`
      await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
      resultados.push({ pantalla: nombre, combo, archivo })
      console.log(`[f4] ${archivo}`)
    } catch (error) {
      console.log(`[f4] ${nombre} ${combo}: no se pudo capturar (${String(error.message || error).split('\n')[0]})`)
    }
  }
}

writeFileSync(join(SALIDA, 'capturas.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), resultados }, null, 2)}\n`)
await browser.close()
console.log(`\n[f4] ${BASE} · v${version || '?'} · ${resultados.length} capturas en ${SALIDA}`)
