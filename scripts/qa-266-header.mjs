// Capturas antes/después del header (#266): candado en lugar del menú de tres
// puntos, chip de usuario (foto + nombre) a Mi perfil y sin íconos de
// persona/recarga.
//
//   node scripts/qa-266-header.mjs                       (producción: antes)
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-266-header.mjs
//
// Evidencia: docs/qa/266-header/<host>/ (pantalla completa, topbar, chip y el
// cajón en mobile). Entra por la demo pública.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/266-header/produccion')
mkdirSync(SALIDA, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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

const medidas = {}
// Foto del estado del header: candado sí, menú de tres puntos no, chip con el
// nombre completo y sin el botón suelto de «Mi cuenta» (ícono de persona).
medidas.estado = await page.evaluate(() => {
  const chip = document.querySelector('[data-testid="shell-mi-cuenta"]')
  return {
    candado: Boolean(document.querySelector('[data-testid="shell-bloquear"]')),
    menuTresPuntos: Boolean(document.querySelector('[data-testid="menu-acciones"]')),
    chip: chip ? { texto: (chip.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), aria: chip.getAttribute('aria-label') } : null,
    botonMiCuentaSuelto: Boolean(document.querySelector('button[aria-label="Mi cuenta"]')),
  }
})
console.log('[266] estado:', JSON.stringify(medidas.estado))
async function capturar(nombre, { clip } = {}) {
  await esperar(600)
  await page.screenshot({ path: join(SALIDA, `${nombre}.jpg`), type: 'jpeg', quality: 80, ...(clip ? { clip } : {}) })
  console.log(`[266] ${nombre}.jpg`)
}

for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.getByText('Facturado', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await capturar(`${tema}-desktop-pantalla`)
  await capturar(`${tema}-desktop-topbar`, { clip: { x: 700, y: 0, width: 580, height: 64 } })
  await capturar(`${tema}-desktop-chip`, { clip: { x: 0, y: 780, width: 240, height: 120 } })
}

// Mobile: el chip vive en el cajón del menú.
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
await capturar('mobile-claro-pantalla', { clip: { x: 220, y: 0, width: 170, height: 60 } })
await page.getByRole('button', { name: 'Menú', exact: true }).click()
await page.locator('[role="dialog"][aria-modal="true"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
await capturar('mobile-claro-cajon')

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
console.log(`[266] ${BASE} · v${version || '?'} · capturas en ${SALIDA}`)
