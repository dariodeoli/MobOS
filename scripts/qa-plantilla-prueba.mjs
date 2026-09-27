// Capturas antes/después del editor de la plantilla del ticket de prueba
// (PRN + diseño): se abre «Imprimir prueba» en la ficha de la impresora demo y
// se fotografían el editor y la vista previa en claro, oscuro y móvil.
//
//   node scripts/qa-plantilla-prueba.mjs                 (producción: antes)
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-plantilla-prueba.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/plantilla-prueba/produccion')
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

async function abrirEditor() {
  await page.goto(`${BASE}/configuracion/dispositivos`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  const tarjeta = page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: 'Térmica mostrador' }).first()
  await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 })
  await esperar(900)
  return page.getByRole('dialog')
}

const medidas = {}
for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  const dialogo = await abrirEditor()
  medidas[`editor-${tema}`] = await page.evaluate(({ testId }) => ({
    editor: Boolean(document.querySelector(`[data-testid="${testId}"]`)),
  }), { testId: 'plantilla-prueba' })
  await page.screenshot({ path: join(SALIDA, `editor-${tema}-desktop.jpg`), type: 'jpeg', quality: 76 })
  await dialogo.screenshot({ path: join(SALIDA, `editor-${tema}-desktop-modal.jpg`), type: 'jpeg', quality: 78 })

  // Editor en acción (solo si esta versión trae la plantilla): 58 mm, 2 copias
  // y sin corte sobre el ticket de la impresora de 80 mm.
  if (medidas[`editor-${tema}`].editor && tema === 'claro') {
    const editor = dialogo.getByTestId('plantilla-prueba')
    await editor.getByRole('button', { name: '58 mm' }).click()
    await editor.getByLabel('Corte').selectOption('ninguno')
    await editor.getByRole('button', { name: 'Una copia más' }).click()
    await esperar(700)
    await dialogo.screenshot({ path: join(SALIDA, 'editor-58-sin-corte-2-copias-desktop.jpg'), type: 'jpeg', quality: 78 })
  }
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await esperar(500)
}

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
const dialogo = await abrirEditor()
medidas['editor-mobile'] = await page.evaluate(({ testId }) => ({
  editor: Boolean(document.querySelector(`[data-testid="${testId}"]`)),
  desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
}), { testId: 'plantilla-prueba' })
await dialogo.screenshot({ path: join(SALIDA, 'editor-claro-mobile.jpg'), type: 'jpeg', quality: 78 })
await page.screenshot({ path: join(SALIDA, 'editor-claro-mobile-pantalla.jpg'), type: 'jpeg', quality: 76 })

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), medidas }, null, 2)}\n`)
await browser.close()
console.log(`[plantilla-prueba] ${BASE} · v${version || '?'} · editor: ${Object.values(medidas).filter((m) => m.editor).length}/${Object.keys(medidas).length}`)
