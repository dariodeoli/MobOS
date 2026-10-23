// Capturas de la web móvil (390x844) con la demo, para comparar con el simulador.
// Usa los mismos pasos que el simulador (scripts/ios-paridad-pasos.mjs).
// Uso: BASE_URL=http://127.0.0.1:5173 OUT=/ruta [TEMA=dark] node scripts/ios-paridad-web.mjs
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { pasos, prelude } from './ios-paridad-pasos.mjs'

const base = process.env.BASE_URL || 'http://127.0.0.1:5173'
const out = process.env.OUT || '/tmp/mobos-paridad/web'
const tema = process.env.TEMA === 'dark' ? 'dark' : 'light'
await mkdir(out, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, baseURL: base })
const page = await context.newPage()
await page.addInitScript((t) => {
  localStorage.setItem('mobos:theme', t)
  sessionStorage.setItem('mobos:demo-guia-vista', '1')
}, tema)
await page.addInitScript(prelude)
// PERMITIR_FUENTES=1 deja pasar Google Fonts (para medir el «antes» de las fuentes remotas).
await page.route(/https:\/\//, (r) => (process.env.PERMITIR_FUENTES === '1' && /fonts\.(googleapis|gstatic)\.com/.test(r.request().url()) ? r.continue() : r.abort()))
await page.route('**/api/**', (r) => { if (!new URL(r.request().url()).pathname.startsWith('/api/')) return r.continue(); return r.fulfill({ status: 503, json: { error: 'Demo local aislada' } }) })
page.on('pageerror', (e) => console.log('pageerror', e.message))

await page.goto('/login', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
for (const paso of pasos) {
  try {
    await page.evaluate(`(async () => { await ${JSON.stringify('')}; ${prelude}; ${paso.js} })()`)
  } catch (e) {
    // La navegación completa (location.assign) destruye el contexto: se reintenta tras cargar.
    if (/context|navigat/i.test(String(e))) await page.waitForLoadState('domcontentloaded'); else console.log('fallo', paso.nombre, String(e).split('\n')[0])
  }
  await page.waitForTimeout(paso.espera || 600)
  if (paso.silencioso) continue
  await page.screenshot({ path: `${out}/${paso.nombre}.png` })
  console.log('captura', paso.nombre)
}
await browser.close()
