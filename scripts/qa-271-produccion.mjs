// Verificación post-deploy de #271 en PRODUCCIÓN (sin sesión real).
//
// Dos comprobaciones honestas de lo verificable sin credenciales:
//  1. El bundle publicado incluye la revalidación del fix (`cache:"no-cache"` en
//     el mismo asset que pide `/avatar`) — prueba de que el arreglo viaja.
//  2. Las superficies del avatar en la demo se ven bien en claro/oscuro/móvil
//     (avatares presentes, sin imágenes rotas) con capturas.
//
// El «sin flash» del bloqueo requiere sesión real: se verificó localmente con el
// fix aplicado (docs/QA-VERIFICACION-271-277.md, 0/3) y lo cubre el spec de CI
// `qa-271-avatar-sin-flash`. Acá se documenta esa limitación.
//
//   node scripts/qa-271-produccion.mjs
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/post-deploy-v191/avatar')
mkdirSync(SALIDA, { recursive: true })

// ── 1. Marcador del fix en el bundle ────────────────────────────────────────
const absoluta = (ruta) => new URL(ruta, `${BASE}/`).toString()
async function texto(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : '' } catch { return '' }
}
const html = await texto(BASE)
const assets = new Set()
for (const m of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) assets.add(m[1])
for (const asset of [...assets]) {
  const js = await texto(absoluta(asset))
  for (const m of js.matchAll(/assets\/[A-Za-z0-9._-]+\.js/g)) assets.add(m[0])
}
const bundle = { assets: assets.size, conMarcador: [], sinMarcador: [] }
for (const asset of assets) {
  const js = await texto(absoluta(asset))
  if (!js) continue
  if (js.includes('no-cache') && js.includes('/avatar')) bundle.conMarcador.push(asset)
  else if (js.includes('/avatar')) bundle.sinMarcador.push(asset)
}

// La API del avatar no expone datos sin sesión (el host del API es distinto del
// de la app: en app.* los `/api` inexistentes caen al HTML del SPA).
const API = process.env.QA_API_URL || 'https://api.moboss.online'
let apiSinSesion = 0
try { apiSinSesion = (await fetch(`${API}/api/users/demo/avatar`)).status } catch { apiSinSesion = -1 }

// ── 2. Superficies del avatar en la demo (claro/oscuro/móvil) ───────────────
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

const medir = () => page.evaluate(() => {
  const fotos = [...document.querySelectorAll('img[alt^="Foto de"]')]
  return {
    avatares: fotos.length,
    rotas: fotos.filter((img) => img.complete && img.naturalWidth === 0).length,
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }
})

const superficies = {}
for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)
  for (const [ruta, nombre] of [['/configuracion/equipo', 'equipo'], ['/configuracion/mi-cuenta', 'mi-cuenta']]) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('main [aria-busy="true"]').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
    await esperar(1200)
    superficies[`${nombre}-${tema}`] = await medir()
    await page.screenshot({ path: join(SALIDA, `avatar-${nombre}-${tema}-desktop.jpg`), type: 'jpeg', quality: 76 })
  }
}

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
for (const [ruta, nombre] of [['/configuracion/equipo', 'equipo'], ['/configuracion/mi-cuenta', 'mi-cuenta']]) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('main [aria-busy="true"]').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
  await esperar(1200)
  superficies[`${nombre}-mobile`] = await medir()
  await page.screenshot({ path: join(SALIDA, `avatar-${nombre}-claro-mobile.jpg`), type: 'jpeg', quality: 76 })
}

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ base: BASE, version, fecha: new Date().toISOString(), bundle, apiSinSesion, superficies }, null, 2)}\n`)
await browser.close()
console.log(`[271-prod] ${BASE} · v${version || '?'} · assets: ${bundle.assets} · con marcador no-cache+/avatar: ${bundle.conMarcador.length} · API sin sesión: HTTP ${apiSinSesion} · avatares: ${Object.entries(superficies).map(([k, v]) => `${k}=${v.avatares}${v.rotas ? ` (rotas ${v.rotas})` : ''}`).join(' · ')}`)
