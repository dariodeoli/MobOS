// Barrido fino de accesibilidad y elementos muertos del POS (#205).
// Uso: BASE=<demo> QA_OUT=docs/qa/205 node scripts/qa-205-a11y-pos.mjs
// Evidencia: docs/qa/205/resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire('/Users/fredd/.herdr/worktrees/mobos/MOS-POS/scripts/')
const { chromium } = require('@playwright/test')
const BASE = process.env.BASE || 'https://app.moboss.online'
const OUT = process.env.QA_OUT || 'docs/qa/205'
mkdirSync(OUT, { recursive: true })
const informe = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1400)
await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/demo'), { timeout: 30000 })
await page.waitForTimeout(2400)
const auditar = async (etiqueta, ruta) => {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const datos = await page.evaluate(() => {
    const visible = (el) => el.getClientRects().length > 0
    const botones = [...document.querySelectorAll('button, [role="button"]')].filter(visible)
    const sinNombre = botones.filter((el) => {
      // textContent (no innerText): el contenido dentro de <details> cerrados no se
      // renderiza y daría falsos positivos de botones "sin nombre".
      const texto = (el.textContent || '').trim()
      const aria = el.getAttribute('aria-label') || el.getAttribute('title')
      const img = el.querySelector('img[alt]')?.getAttribute('alt')
      return !texto && !aria && !img
    }).map((el) => `<${el.tagName.toLowerCase()} class="${(el.className || '').toString().slice(0, 70)}">`)
    const campos = [...document.querySelectorAll('input, select, textarea')].filter(visible)
    const sinEtiqueta = campos.filter((el) => {
      const id = el.id
      const etiqueta = id && document.querySelector(`label[for="${CSS.escape(id)}"]`)
      return !etiqueta && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.placeholder && !el.closest('label')
    }).map((el) => `<${el.tagName.toLowerCase()} type="${el.type || ''}" class="${(el.className || '').toString().slice(0, 60)}">`)
    const imagenes = [...document.querySelectorAll('img')].filter(visible).filter((el) => !el.hasAttribute('alt')).length
    const vacios = [...document.querySelectorAll('p, span, div')].filter(visible).map((el) => (el.innerText || '').trim()).filter((t) => /^(No hay|Sin |Todavía no|Aún no|Sin datos)/i.test(t) && t.length < 90).slice(0, 6)
    return { botones: botones.length, sinNombre, campos: campos.length, sinEtiqueta, imagenesSinAlt: imagenes, vacios }
  })
  informe.push({ pantalla: etiqueta, ...datos })
  console.log(`\n[${etiqueta}] botones ${datos.botones} · sin nombre accesible ${datos.sinNombre.length}`)
  datos.sinNombre.slice(0, 6).forEach((b) => console.log('   ', b))
  console.log(`  campos ${datos.campos} · sin etiqueta ${datos.sinEtiqueta.length}`)
  datos.sinEtiqueta.slice(0, 6).forEach((c) => console.log('   ', c))
  console.log(`  imgs sin alt: ${datos.imagenesSinAlt} · vacíos: ${datos.vacios.join(' | ').slice(0, 200)}`)
}
await auditar('POS', '/pos')
await auditar('Pedidos', '/pedidos')
await auditar('Delivery', '/delivery')
writeFileSync(`${OUT}/resultados.json`, JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pantallas: informe }, null, 2))
await browser.close()
