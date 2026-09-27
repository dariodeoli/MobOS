// Revisión visual de Configuración (#253): recorre los 7 grupos con el
// contenido YA cargado (sin esqueletos) y captura claro/oscuro desktop y
// mobile, midiendo desbordes y el estado del riel.
//
//   node scripts/qa-config-revision.mjs
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-config-revision.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/253-config-nav/revision-contenido')
mkdirSync(SALIDA, { recursive: true })

const GRUPOS = [
  ['mi-cuenta', 'Mi cuenta'], ['organizacion', 'Organización'], ['equipo', 'Equipo y acceso'],
  ['comercial', 'Comercial'], ['seguridad', 'Seguridad y auditoría'], ['dispositivos', 'Dispositivos'], ['sistema', 'Sistema'],
]

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

async function conContenido(slug, listo) {
  await page.goto(`${BASE}/configuracion/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  // Esperar el contenido real: nada de aria-busy ni esqueletos.
  await page.locator('main [aria-busy="true"]').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
  await page.getByTestId('config-grupo-descripcion').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  if (listo) await page.getByRole('heading', { name: listo }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await esperar(900)
}

const medidas = {}
for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  for (const [slug] of GRUPOS) {
    await conContenido(slug)
    medidas[`${slug}-${tema}`] = await page.evaluate(() => ({
      desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      esqueletos: document.querySelectorAll('main [aria-busy="true"]').length,
      riel: Boolean(document.querySelector('[data-testid="config-grupos"]')),
    }))
    await page.screenshot({ path: join(SALIDA, `${slug}-${tema}-desktop.jpg`), type: 'jpeg', quality: 76 })
  }
}

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
for (const [slug] of GRUPOS) {
  await conContenido(slug)
  medidas[`${slug}-mobile`] = await page.evaluate(() => ({
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    esqueletos: document.querySelectorAll('main [aria-busy="true"]').length,
  }))
  await page.screenshot({ path: join(SALIDA, `${slug}-claro-mobile.jpg`), type: 'jpeg', quality: 76 })
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
const problemas = Object.entries(medidas).filter(([, m]) => m.desborde || m.esqueletos)
console.log(`[config] ${BASE} · v${version || '?'} · ${Object.keys(medidas).length} capturas · problemas: ${problemas.length ? JSON.stringify(problemas) : 'ninguno'}`)
