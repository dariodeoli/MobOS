// Capturas antes/después del recortador de foto (#perfil): abre el recortador
// con una foto VERTICAL de prueba (600×1200) y mide cómo entra la imagen.
//
//   node scripts/qa-recorte-foto.mjs                 (producción: antes)
//   QA_BASE_URL=http://localhost:5203 QA_OUT=... node scripts/qa-recorte-foto.mjs
//
// Entra por la demo pública (sin credenciales) y sube la foto por el input de
// «Subir foto» de Mi cuenta. Evidencia: docs/qa/recorte-perfil/<host>/.
/* global document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/recorte-perfil/produccion')
mkdirSync(SALIDA, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

// Foto vertical de prueba con marcas (1 arriba, 2 medio, 3 abajo) para que se
// note qué parte entra en el recorte.
const dataUrl = await (async () => {
  const p = await ctx.newPage()
  const url = await p.evaluate(() => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 600
    lienzo.height = 1200
    const ctx = lienzo.getContext('2d')
    ctx.fillStyle = '#101826'
    ctx.fillRect(0, 0, 600, 1200)
    ctx.fillStyle = '#10b981'
    ctx.fillRect(0, 0, 600, 120)
    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 160px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('1', 300, 260)
    ctx.fillText('2', 300, 680)
    ctx.fillText('3', 300, 1100)
    return lienzo.toDataURL('image/png')
  })
  await p.close()
  return url
})()
const rutaFoto = join(SALIDA, 'foto-vertical-600x1200.png')
writeFileSync(rutaFoto, Buffer.from(dataUrl.split(',')[1], 'base64'))

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
await page.waitForTimeout(1200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)) {
  await guia.getByRole('button', { name: 'Cerrar' }).click()
}
const version = ((await page.locator('body').innerText()).match(/v(\d+\.\d+\.\d+)/) || [])[1] || ''

await page.goto(`${BASE}/configuracion/mi-cuenta`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.locator('[data-testid="shell"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
await page.getByText('Mi foto', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
await page.locator('input[type="file"]').first().setInputFiles(rutaFoto)

const modal = page.getByRole('dialog').filter({ hasText: 'Recortar foto' }).first()
await modal.waitFor({ state: 'visible', timeout: 20_000 })
await page.waitForTimeout(800)
const imagen = modal.getByAltText('Foto a recortar')
const caja = await imagen.boundingBox().catch(() => null)
const medida = {
  version,
  base: BASE,
  foto: '600x1200 (vertical)',
  alAbrir: caja ? { ancho: Math.round(caja.width), alto: Math.round(caja.height) } : null,
  contenedor: 240,
}
await page.screenshot({ path: join(SALIDA, '01-al-abrir.jpg'), type: 'jpeg', quality: 78 })

// El usuario decide el zoom: 2,5× sobre el ajuste (setter nativo para que React
// registre el cambio del input controlado).
await modal.locator('input[type="range"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, '2.5')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(400)
const cajaZoom = await imagen.boundingBox().catch(() => null)
medida.alZoom = cajaZoom ? { ancho: Math.round(cajaZoom.width), alto: Math.round(cajaZoom.height) } : null
await page.screenshot({ path: join(SALIDA, '02-zoom-2.5x.jpg'), type: 'jpeg', quality: 78 })

writeFileSync(join(SALIDA, 'resultado.json'), `${JSON.stringify({ ...medida, fecha: new Date().toISOString() }, null, 2)}\n`)
await browser.close()
console.log(`[recorte] ${BASE} · v${version || '?'} · al abrir: ${JSON.stringify(medida.alAbrir)} · 2,5×: ${JSON.stringify(medida.alZoom)}`)
