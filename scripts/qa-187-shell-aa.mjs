// QA #187 · shell/AA/contraste en PRODUCCIÓN.
//
// Recorre las pantallas principales de la demo pública (POS, Resumen, Clientes,
// Inventario) y audita el chrome del shell en claro/oscuro y desktop/móvil con
// el mismo auditor que `e2e/dsn-241-a11y.spec.js` (textos con alfa compuesta
// sobre el fondo real; AA 4.5:1 y 3:1 en texto grande). El shell debe dar 0
// bajos; el contenido se reporta aparte (informativo).
//
//   node scripts/qa-187-shell-aa.mjs
//
// Evidencia: docs/qa/187-shell-aa/produccion/ (capturas + resultado.json).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHELL, auditarContraste, informar } from '../e2e/helpers/contraste.js'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/187-shell-aa/produccion')
mkdirSync(SALIDA, { recursive: true })

const CONTEXTO = ['[role="dialog"]', '[role="status"]', 'footer']
const PANTALLAS = [
  ['/pos', 'pos'],
  ['/resumen', 'resumen'],
  ['/clientes', 'clientes'],
  ['/inventario/unidades', 'inventario'],
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
const fallas = []

for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  for (const [vista, ancho, alto] of [['desktop', 1600, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width: ancho, height: alto })
    await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
    for (const [ruta, pantalla] of PANTALLAS) {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.locator('[data-testid="shell"], [data-testid="ops-tablero"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
      await esperar(1100)
      const med = await auditarContraste(page, SHELL, CONTEXTO)
      const etiqueta = `${pantalla}-${vista}-${tema}`
      informar(etiqueta, med)
      await page.screenshot({ path: join(SALIDA, `shell-${etiqueta}.jpg`), type: 'jpeg', quality: 72 })
      resultados.push({
        pantalla,
        estado: `${vista}-${tema}`,
        medidos: med.medidos,
        bajos: med.bajos.length,
        detalle: med.bajos.slice(0, 6),
        totalBajosContenido: med.totalBajosContenido,
        contenido: med.contenido.slice(0, 4),
      })
      if (med.bajos.length) fallas.push(`${pantalla} ${vista} ${tema}`)

      // El cajón de acciones se abre desde el menú móvil: se audita una vez.
      if (vista === 'mobile' && pantalla === 'pos') {
        await page.getByRole('button', { name: 'Menú', exact: true }).click()
        const menu = page.locator('[role="dialog"][aria-modal="true"]')
        await menu.waitFor({ state: 'visible', timeout: 15_000 })
        const dentro = await auditarContraste(page, [...SHELL, '[role="dialog"][aria-modal="true"]'], CONTEXTO)
        informar(`${pantalla}-${vista}-${tema}-menu`, dentro)
        await page.screenshot({ path: join(SALIDA, `shell-${pantalla}-${vista}-${tema}-menu.jpg`), type: 'jpeg', quality: 72 })
        resultados.push({
          pantalla: `${pantalla}-menu`,
          estado: `${vista}-${tema}`,
          medidos: dentro.medidos,
          bajos: dentro.bajos.length,
          detalle: dentro.bajos.slice(0, 6),
          totalBajosContenido: dentro.totalBajosContenido,
          contenido: dentro.contenido.slice(0, 4),
        })
        if (dentro.bajos.length) fallas.push(`menú ${vista} ${tema}`)
        await page.keyboard.press('Escape')
      }
    }
  }
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), resultados, fallas }, null, 2)}\n`)
await browser.close()

console.log(`\n[187-shell-aa] ${BASE} · v${version || '?'} · ${resultados.length} mediciones · ${fallas.length ? `FALLAS: ${fallas.join(', ')}` : 'shell sin bajos de AA'}`)
if (fallas.length) process.exit(1)
