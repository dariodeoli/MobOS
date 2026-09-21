// Verificación en producción del diálogo del comprobante (#207 80 mm, #208
// iconos + último usado, #209 último usado de cuenta/entrega en el POS).
// Uso: QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/208 node scripts/qa-208-comprobante.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const OUT = process.env.QA_OUT || 'docs/qa/208'
mkdirSync(OUT, { recursive: true })
const pasos = []
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
let n = 0
const shot = async (nombre) => { n += 1; const f = `${String(n).padStart(2, '0')}-${nombre}.jpg`; await page.screenshot({ path: join(OUT, f), type: 'jpeg', quality: 72 }); return f }
const paso = async (nombre, fn) => {
  try { const detalle = await fn(); pasos.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', captura: await shot(nombre).catch(() => '') }); console.log(`OK    ${nombre} — ${detalle}`) }
  catch (e) { pasos.push({ paso: nombre, estado: 'fallo', detalle: String(e?.message || e).slice(0, 300) }); console.log(`FALLO ${nombre}: ${e?.message || e}`); await shot(`fallo-${nombre}`).catch(() => '') }
}
await paso('entrada demo y venta rapida', async () => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500)
  const version = ((await page.locator('body').innerText()).match(/v\d+\.\d+\.\d+/) || [''])[0]
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/demo'), { timeout: 30000 }); await page.waitForTimeout(2400)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2400)
  await page.locator('input[placeholder="Buscar cliente o escribir un nombre nuevo"]').fill('Comprobante QA')
  await page.waitForTimeout(600)
  await page.getByPlaceholder('Buscar producto…').fill('Funda MagSafe'); await page.waitForTimeout(900)
  await page.getByRole('option', { name: /Funda MagSafe/i }).first().click(); await page.waitForTimeout(900)
  await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click(); await page.waitForTimeout(900)
  const cuenta = page.getByLabel('Cuenta de cobro').first()
  await cuenta.click(); await cuenta.fill('Caja'); await page.waitForTimeout(800)
  await page.getByRole('option').filter({ hasText: /Caja demo · Gs/i }).first().click(); await page.waitForTimeout(800)
  const total = ((await page.locator('[data-testid="resumen-compra"]').innerText()).match(/Gs ([\d.]+)/) || [])[1]?.replace(/\./g, '') || '150000'
  await page.getByLabel('Monto original').first().fill(total); await page.waitForTimeout(900)
  return `versión ${version} · total ${total}`
})
await paso('abrir el dialogo del comprobante', async () => {
  const principal = page.getByRole('button', { name: /Confirmar venta/ }).last()
  for (let i = 0; i < 20 && (await principal.isDisabled()); i += 1) await page.waitForTimeout(300)
  await principal.click()
  // La confirmación con las acciones vive 2.5 s: hay que abrir el comprobante ahí.
  const abrir = page.getByRole('button', { name: /Imprimir comprobante/i }).first()
  await abrir.waitFor({ state: 'visible', timeout: 8000 })
  await abrir.click()
  await page.waitForTimeout(2600)
  const grupoNivel = page.getByRole('radiogroup', { name: 'Tipo de comprobante' })
  const grupoFormato = page.getByRole('radiogroup', { name: 'Formato de impresión' })
  const hayIconos = (await grupoNivel.count()) > 0 && (await grupoFormato.count()) > 0
  const nivelElegido = hayIconos ? await grupoNivel.getByRole('radio', { checked: true }).innerText().catch(() => '') : ''
  const formatoElegido = hayIconos ? await grupoFormato.getByRole('radio', { checked: true }).innerText().catch(() => '') : ''
  const selects = await page.getByLabel('Tipo de comprobante').evaluateAll((els) => els.map((el) => el.tagName).join(','))
  const ancho = await page.evaluate(() => {
    const el = [...document.querySelectorAll('img, div')].find((nodo) => /max-w-\[(302|219)px\]/.test(String(nodo.className)))
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })
  return `iconos: ${hayIconos} · nivel elegido: "${nivelElegido.replace(/\s+/g, ' ')}" · formato elegido: "${formatoElegido.replace(/\s+/g, ' ')}" · ancho vista previa: ${ancho}px · controles viejos: ${selects || 'ninguno'}`
})
await paso('memoria del ultimo usado en el dialogo', async () => {
  const grupoNivel = page.getByRole('radiogroup', { name: 'Tipo de comprobante' })
  if ((await grupoNivel.count()) === 0) throw new Error('sin iconos todavía (lote sin desplegar)')
  await grupoNivel.getByRole('radio', { name: /Comprobante Completo/ }).click(); await page.waitForTimeout(600)
  await page.getByRole('radiogroup', { name: 'Formato de impresión' }).getByRole('radio', { name: /Formato 58 mm/ }).click(); await page.waitForTimeout(800)
  const guardado = await page.evaluate(() => [localStorage.getItem('mobos:comprobante:nivel'), localStorage.getItem('mobos:comprobante:formato')].join('|'))
  await page.keyboard.press('Escape'); await page.waitForTimeout(700)
  const reabrir = page.getByRole('button', { name: /Imprimir comprobante/i }).first()
  if (await reabrir.count()) await reabrir.click()
  else await page.getByText(/Imprimir comprobante/i).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  const nivel = await page.getByRole('radiogroup', { name: 'Tipo de comprobante' }).getByRole('radio', { checked: true }).innerText().catch(() => '')
  const formato = await page.getByRole('radiogroup', { name: 'Formato de impresión' }).getByRole('radio', { checked: true }).innerText().catch(() => '')
  return `guardado: ${guardado} · al reabrir: "${nivel.replace(/\s+/g, ' ')}" + "${formato.replace(/\s+/g, ' ')}"`
})
await paso('ultimo usado en el POS (#209): entrega y cuenta', async () => {
  await page.keyboard.press('Escape'); await page.waitForTimeout(600)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2400)
  const entrega = await page.locator('#entrega').inputValue().catch(() => '(sin selector)')
  await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click().catch(() => {}); await page.waitForTimeout(900)
  const cuenta = await page.getByLabel('Cuenta de cobro').first().inputValue().catch(() => '(sin cuenta)')
  return `entrega recordada: "${entrega}" · cuenta recordada: "${cuenta}"`
})
writeFileSync(join(OUT, 'resultados.json'), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos }, null, 2))
await browser.close()
console.log(`\nPasos: ${pasos.length} · fallos: ${pasos.filter((p) => p.estado === 'fallo').length}`)
