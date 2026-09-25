// Verificación de contraste AA del shell v2 en PRODUCCIÓN (#241).
//
// La medición local vive en `e2e/dsn-241-a11y.spec.js`; acá se corre el mismo
// auditor contra el host real, entrando por la demo pública (app.moboss.online/
// demo) para no depender de credenciales. Mide el chrome del shell (barra,
// topbar, barra inferior, cajón y avisos) en claro/oscuro y desktop/mobile,
// deja capturas y sale con código 1 si el shell baja de AA.
//
//   node scripts/qa-241-shell-produccion.mjs
//
// Evidencia: docs/qa/241-shell-produccion/ (capturas + resultado.json).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHELL, auditarContraste, informar } from '../e2e/helpers/contraste.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/241-shell-produccion')
mkdirSync(SALIDA, { recursive: true })

const CONTEXTO = ['[role="dialog"]', '[role="status"]', 'footer']

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
const fallas = []

for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width: ancho, height: alto })
    await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 30_000 })
    await esperar(1200)

    const shell = await auditarContraste(page, SHELL, CONTEXTO)
    informar(`shell-${vista}-${tema}`, shell)
    await page.screenshot({ path: join(SALIDA, `shell-${tema}-${vista}.jpg`), type: 'jpeg', quality: 72 })
    resultados.push({ estado: `${vista}-${tema}`, medidos: shell.medidos, bajos: shell.bajos.length, detalle: shell.bajos })
    if (shell.bajos.length) fallas.push(`shell ${vista} ${tema}`)

    if (vista === 'mobile') {
      await page.getByRole('button', { name: 'Menú', exact: true }).click()
      const menu = page.locator('[role="dialog"][aria-modal="true"]')
      await menu.waitFor({ state: 'visible', timeout: 15_000 })
      const dentro = await auditarContraste(page, [...SHELL, '[role="dialog"][aria-modal="true"]'], CONTEXTO)
      informar(`shell-${vista}-${tema}-menu`, dentro)
      await page.screenshot({ path: join(SALIDA, `shell-${tema}-${vista}-menu.jpg`), type: 'jpeg', quality: 72 })
      resultados.push({ estado: `${vista}-${tema}-menu`, medidos: dentro.medidos, bajos: dentro.bajos.length, detalle: dentro.bajos })
      if (dentro.bajos.length) fallas.push(`menú ${vista} ${tema}`)
      await page.keyboard.press('Escape')
    }
  }
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), resultados, fallas }, null, 2)}\n`)
await browser.close()

console.log(`\n[shell-aa-produccion] ${BASE} · v${version || '?'} · ${fallas.length ? `FALLAS: ${fallas.join(', ')}` : 'sin bajos de AA'}`)
if (fallas.length) process.exit(1)
