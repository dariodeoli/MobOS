// QA #187 (CRM): recorrido funcional headless contra PRODUCCIÓN.
// Demo (Dueño/Vendedor) para Clientes + públicos sin sesión (tokens inválidos).
// No escribe nada en producción: la demo vive en localStorage del navegador.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = 'https://app.moboss.online'
const PORTAL = 'https://clientes.moboss.online'
const SHOTS = process.env.QA187_SHOTS || '/tmp/qa187'
mkdirSync(SHOTS, { recursive: true })

const hallazgos = []
const erroresConsola = []
const paso = async (nombre, fn) => {
  try { await fn(); console.log(`ok · ${nombre}`) } catch (cause) { hallazgos.push(`${nombre}: ${cause.message}`); console.log(`FALLA · ${nombre}: ${cause.message}`) }
}
const anotar = (texto) => { hallazgos.push(texto); console.log(`nota · ${texto}`) }

const browser = await chromium.launch({ headless: true })
const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await contexto.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(`${msg.text()}`.slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${error.message}`.slice(0, 200)))

// ── 1. Demo · Dueño · Clientes ──────────────────────────────────────────────
await paso('demo: abre /demo y entra como Dueño', async () => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/01-demo-entrada.png`, fullPage: false })
})

const nav = page.locator('aside nav, nav').first()
await paso('demo: Clientes visible en el menú y abre la vista', async () => {
  await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/02-demo-clientes.png`, fullPage: false })
})

// Crea un cliente demo (queda solo en el navegador).
const marca = `QA187${Date.now().toString(36).toUpperCase()}`
await paso('demo: alta con primer y segundo nombre', async () => {
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  await page.getByLabel('Primer nombre', { exact: true }).fill('Cliente')
  await page.getByLabel(/Segundo nombre/).fill(marca)
  const modal = page.locator('form').filter({ hasText: 'Límite de crédito (Gs)' })
  await modal.getByPlaceholder('981 123 456').fill('0981222333')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/03-demo-alta.png`, fullPage: false })
})

await paso('demo: la búsqueda instantánea encuentra al cliente y el teléfono va con +595', async () => {
  await page.getByLabel('Buscar clientes').fill(marca)
  await page.waitForTimeout(600)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await fila.waitFor({ timeout: 10000 })
  const texto = await fila.innerText()
  if (!texto.includes('+595 981 223 333')) throw new Error(`teléfono sin formato +595: ${texto}`)
  await page.screenshot({ path: `${SHOTS}/04-demo-busqueda.png`, fullPage: false })
})

await paso('demo: filtros segmentados responden', async () => {
  await page.getByRole('button', { name: 'Mayoristas', exact: true }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/05-demo-filtro.png`, fullPage: false })
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
})

await paso('demo: vista mobile 390 sin scroll horizontal', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  if (sw > cw + 1) throw new Error(`scroll horizontal en mobile: ${sw} > ${cw}`)
  await page.screenshot({ path: `${SHOTS}/06-demo-mobile.png`, fullPage: false })
  await page.setViewportSize({ width: 1280, height: 900 })
})

await paso('demo: clic en la fila (¿abre la ficha?)', async () => {
  await page.getByLabel('Buscar clientes').fill(marca)
  await page.waitForTimeout(600)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await fila.click()
  await page.waitForTimeout(800)
  const dialogo = await page.getByRole('dialog').count()
  await page.screenshot({ path: `${SHOTS}/07-demo-clic-fila.png`, fullPage: false })
  if (!dialogo) anotar('demo: el clic en la fila no abre la ficha del cliente (en demo la ficha está deshabilitada por diseño)')
})

// ── 2. Demo · Vendedor · QA por rol ────────────────────────────────────────
await paso('demo: entra como Vendedor y ve Clientes', async () => {
  await contexto.clearCookies()
  const pagina2 = await contexto.newPage()
  await pagina2.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await pagina2.getByRole('button', { name: /Vendedor/ }).first().click()
  await pagina2.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60000 })
  await pagina2.waitForTimeout(1200)
  const nav2 = pagina2.locator('aside nav, nav').first()
  await nav2.getByRole('button', { name: 'Clientes', exact: true }).click()
  await pagina2.waitForTimeout(800)
  await pagina2.screenshot({ path: `${SHOTS}/08-demo-vendedor.png`, fullPage: false })
  await pagina2.close()
})

// ── 3. Públicos sin sesión (tokens inválidos) ──────────────────────────────
const anonimo = await browser.newContext({ viewport: { width: 390, height: 844 } })
const publica = await anonimo.newPage()
const erroresPublicos = []
publica.on('pageerror', (error) => erroresPublicos.push(error.message))

for (const [ruta, etiqueta] of [['/cuenta/token-inexistente-qa187', 'cuenta'], ['/portal/token-inexistente-qa187', 'vitrina'], ['/garantia/token-inexistente-qa187', 'garantia']]) {
  await paso(`público: ${etiqueta} con token inválido muestra error genérico`, async () => {
    await publica.goto(`${PORTAL}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await publica.waitForTimeout(1500)
    await publica.screenshot({ path: `${SHOTS}/10-publico-${etiqueta}.png`, fullPage: false })
    const texto = (await publica.locator('body').innerText()).toLowerCase()
    if (!texto.includes('no encontrada') && !texto.includes('no es válido') && !texto.includes('venció')) throw new Error(`sin mensaje de error visible: ${texto.slice(0, 120)}`)
    const { sw, cw } = await publica.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    if (sw > cw + 1) throw new Error(`scroll horizontal: ${sw} > ${cw}`)
  })
}

await paso('público: la entrada del portal carga sin sesión', async () => {
  await publica.goto(`${PORTAL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await publica.waitForTimeout(1200)
  await publica.screenshot({ path: `${SHOTS}/11-publico-entrada.png`, fullPage: false })
})

// ── 4. Sondas de API en producción ─────────────────────────────────────────
const api = 'https://api.moboss.online'
const sonda = async (ruta) => {
  const res = await fetch(`${api}${ruta}`, { headers: { 'x-forwarded-for': '203.0.113.187' } })
  return res.status
}
const apiResultados = {
  portal: await sonda('/api/portal/token-inexistente-qa187'),
  vitrina: await sonda('/api/public/portal/token-inexistente-qa187'),
  garantia: await sonda('/api/public/warranty/token-inexistente-qa187'),
}
let rateLimit = 0
for (let i = 0; i < 35; i += 1) {
  const status = await sonda('/api/public/warranty/token-inexistente-qa187')
  if (status === 429) rateLimit += 1
}
console.log('api:', JSON.stringify(apiResultados), 'rate-limit-429:', rateLimit)

// ── 5. Versión desplegada visible ──────────────────────────────────────────
let version = ''
await paso('app: versión en el pie', async () => {
  await page.goto(`${APP}/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
  const pie = await page.locator('footer, [class*="footer"]').first().innerText().catch(() => '')
  version = (pie.match(/v?\d+\.\d+\.\d+/) || [''])[0]
  await page.screenshot({ path: `${SHOTS}/12-demo-pie.png`, fullPage: false })
})

await browser.close()
writeFileSync(`${SHOTS}/resumen.json`, JSON.stringify({ hallazgos, erroresConsola, erroresPublicos, apiResultados, rateLimit, version }, null, 2))
console.log('--- RESUMEN ---')
console.log(JSON.stringify({ hallazgos, erroresConsola: erroresConsola.slice(0, 5), erroresPublicos: erroresPublicos.slice(0, 3), apiResultados, rateLimit, version }, null, 2))
