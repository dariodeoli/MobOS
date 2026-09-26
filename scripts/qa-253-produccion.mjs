// Verificación en producción de #253 (lead PLT): los 7 grupos de Configuración,
// la cuenta personal desde el avatar, la entrada única de Precios y las rutas
// viejas. Usa la demo pública (datos ficticios locales) para no necesitar
// credenciales: cubre estructura, navegación y los grupos que funcionan en demo.
//
// Uso: node scripts/qa-253-produccion.mjs
//      QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/253-config/produccion node scripts/qa-253-produccion.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/253-config/produccion')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const erroresConsola = []
let capturas = 0

async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const caps = []
  try {
    const detalle = await fn(caps)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: caps })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 300)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: caps })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

// Grupo → contenido que lo identifica (los que en demo muestran su aviso se
// validan por ese aviso; siguen siendo parte de la estructura).
const GRUPOS = [
  ['mi-cuenta', 'Mi cuenta', 'Tu perfil'],
  ['organizacion', 'Organización', 'Datos de la tienda'],
  ['equipo', 'Equipo y acceso', 'Integrantes'],
  ['comercial', 'Comercial', 'Seguro de ventas'],
  ['seguridad', 'Seguridad y auditoría', 'Seguridad de la cuenta'],
  ['dispositivos', 'Dispositivos', 'Configurá y probá tus impresoras térmicas'],
  ['sistema', 'Sistema', 'Estado del sistema'],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 200)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 200)}`))

let version = ''
await paso('entrar a la demo y conocer la versión desplegada', async (caps) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL(/\/resumen$/, { timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).getByRole('button', { name: 'Cerrar' }).click({ timeout: 4000 }).catch(() => {})
  const pie = (await page.getByText(/v\d+\.\d+\.\d+/).first().textContent().catch(() => '')) || ''
  version = (pie.match(/v\d+\.\d+\.\d+/) || [])[0] || ''
  caps.push(await shot(page, 'demo-dueño'))
  return `versión ${version || 'no visible'}`
})

await paso('Configuración tiene los 7 grupos con su contenido', async (caps) => {
  await page.goto(`${BASE}/configuracion/mi-cuenta`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="config-grupos"] [role="tab"]').first().waitFor({ timeout: 30_000 })
  const grupos = await page.locator('[data-testid="config-grupos"] [role="tab"]').count()
  if (grupos !== 7) throw new Error(`se esperaban 7 grupos y hay ${grupos}`)
  for (const [slug, label, contenido] of GRUPOS) {
    await page.goto(`${BASE}/configuracion/${slug}`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').filter({ hasText: label }).waitFor({ timeout: 30_000 })
    await page.getByText(contenido).first().waitFor({ timeout: 30_000 })
    caps.push(await shot(page, `grupo-${slug}`))
  }
  return `${grupos} grupos verificados`
})

await paso('Mi cuenta se abre desde el avatar', async (caps) => {
  await page.goto(`${BASE}/resumen`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('shell-mi-cuenta').click()
  await page.waitForURL(/\/mi-cuenta$/, { timeout: 20_000 })
  await page.getByText('Tu perfil').first().waitFor({ timeout: 20_000 })
  caps.push(await shot(page, 'mi-cuenta-avatar'))
  return 'avatar → /mi-cuenta'
})

await paso('Precios: una sola entrada y su pantalla abre', async (caps) => {
  await page.goto(`${BASE}/precios`, { waitUntil: 'domcontentloaded' })
  await page.locator('h1').filter({ hasText: 'Precios' }).waitFor({ timeout: 20_000 })
  const enMenu = await page.locator('aside nav').getByRole('button', { name: 'Precios', exact: true }).count()
  if (enMenu !== 1) throw new Error(`el menú tiene ${enMenu} entradas de Precios`)
  // Con datos reales se ven las listas; en la demo se explica que piden cuenta.
  const listas = page.getByRole('heading', { name: 'Listas de precios' })
  const avisoDemo = page.getByText('Las listas de precios se configuran con una cuenta real')
  const visto = await Promise.race([
    listas.waitFor({ timeout: 20_000 }).then(() => 'listas'),
    avisoDemo.waitFor({ timeout: 20_000 }).then(() => 'aviso demo'),
  ])
  caps.push(await shot(page, 'precios'))
  return `una entrada de menú · ${visto}`
})

await paso('rutas viejas: identidad → /mi-cuenta y documentación → Ayuda', async () => {
  await page.goto(`${BASE}/configuracion/identidad`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/mi-cuenta$/, { timeout: 20_000 })
  await page.goto(`${BASE}/configuracion/documentacion`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/ayuda\/ayuda$/, { timeout: 20_000 })
  return 'redirecciones vivas'
})

const resumen = {
  verificado: new Date().toISOString(),
  base: BASE,
  version,
  erroresConsola,
  resultados,
  resumen: {
    pasos: resultados.length,
    ok: resultados.filter((r) => r.estado === 'ok').length,
    fallos: resultados.filter((r) => r.estado === 'fallo').length,
  },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(resumen, null, 2)}\n`)
console.log(`\n${resumen.resumen.ok}/${resumen.resumen.pasos} pasos OK · errores de consola: ${erroresConsola.length}`)

await browser.close()
if (resumen.resumen.fallos) process.exitCode = 1
