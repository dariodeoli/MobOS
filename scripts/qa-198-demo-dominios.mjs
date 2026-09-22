// Consolidación de la verificación del demo público (#198 · #194 · #196):
// dominios de inventario (con IMEI simulado) y capturas claro/oscuro por módulo
// para DSN, más el chequeo transversal (banner, marca del topbar, 0 API).
//
// Uso: node scripts/qa-198-demo-dominios.mjs
//      QA_BASE_URL=<demo> QA_OUT=docs/qa/198-dominios node scripts/qa-198-demo-dominios.mjs
// Salida: <QA_OUT>/*.jpg + resultados.json (con llamadas al API por paso).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/198-dominios')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const llamadasApi = []
const erroresConsola = []
let capturas = 0
let version = null

async function shot(page, nombre) {
  capturas += 1
  const archivo = `${String(capturas).padStart(2, '0')}-${nombre}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  return archivo
}

async function paso(nombre, fn) {
  const capturasPaso = []
  const antes = llamadasApi.length
  try {
    const detalle = await fn(capturasPaso)
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, llamadasApi: llamadasApi.slice(antes) })
    console.log(`OK    ${nombre} — ${detalle ?? ''}`)
  } catch (error) {
    const mensaje = String(error?.message || error).slice(0, 400)
    resultados.push({ paso: nombre, estado: 'fallo', detalle: mensaje, capturas: capturasPaso, llamadasApi: llamadasApi.slice(antes) })
    console.log(`FALLO ${nombre}: ${mensaje}`)
  }
}

function seguirRed(page) {
  page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 250)) })
  page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 250)}`))
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(API_HOST) && url.includes('/api/')) llamadasApi.push(url.slice(0, 200))
  })
}

async function entrarDemo(page, rol = 'Dueño') {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
  await page.getByRole('button', { name: new RegExp(`Entrar como ${rol}`) }).click()
  await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByText(/Modo demo: datos ficticios/).first().waitFor({ state: 'visible', timeout: 20000 })
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
  const texto = await page.locator('body').innerText()
  version = version || (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]
}

const MODULOS = [
  ['/pos', 'pos', /Nueva venta/],
  ['/pedidos', 'pedidos', /Mis pedidos|^Pedidos$/],
  ['/clientes', 'clientes', /^Clientes$/],
  ['/inventario', 'inventario', /Inventario|Unidades/i],
  ['/finanzas', 'finanzas', /Finanzas|^Caja$/],
  ['/configuracion/impresoras', 'impresion', /^Impresoras$/],
]

const browser = await chromium.launch()

// 1) Inventario en demo (con IMEI simulado) — #198 INV.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  seguirRed(page)

  await paso('INV demo: unidades, costos y ficha de la unidad', async (c) => {
    await entrarDemo(page)
    await page.goto(`${BASE}/inventario`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20000 })
    const filas = await page.getByTestId('inventario-fila').count()
    c.push(await shot(page, 'inv-unidades'))
    await page.getByTestId('inventario-fila').first().click()
    await page.getByTestId('unidad-costo').waitFor({ state: 'visible', timeout: 20000 })
    const costo = (await page.getByTestId('unidad-costo').innerText()).replace(/\s+/g, ' ')
    if (!/costo del equipo/i.test(costo)) throw new Error('la ficha no muestra la sección de costo')
    await page.getByTestId('unidad-imei').waitFor({ state: 'visible', timeout: 20000 })
    c.push(await shot(page, 'inv-detalle'))
    return `${filas} unidades en la lista · costo visible (${/Cargado|Pendiente/.exec(costo)?.[0] || 's/d'})`
  })

  await paso('INV demo: verificación IMEI simulada (sin cobro ni API)', async (c) => {
    const imei = page.getByTestId('unidad-imei')
    if (!/Demo: simulado/.test(await imei.innerText())) throw new Error('la ficha no marca la consulta IMEI como simulada en demo')
    await page.getByTestId('imei-precheck').click()
    await page.getByTestId('imei-confirmar').waitFor({ state: 'visible', timeout: 20000 })
    const confirmar = await page.getByTestId('imei-confirmar').innerText()
    if (!/simulada/i.test(confirmar)) throw new Error(`el botón de confirmación no avisa que es simulado: «${confirmar}»`)
    c.push(await shot(page, 'inv-imei-precheck'))
    await page.getByTestId('imei-confirmar').click()
    await page.getByText(/SIMULADO|No verificado|Verificado/).first().waitFor({ state: 'visible', timeout: 20000 })
    const resultado = (await imei.innerText()).replace(/\s+/g, ' ')
    if (!/SIMULADO/i.test(resultado)) throw new Error('el resultado no queda marcado como simulado')
    c.push(await shot(page, 'inv-imei-resultado'))
    return `precheck y resultado simulados (${resultado.slice(0, 90)}…)`
  })

  await paso('INV demo: reservas y alertas visibles', async (c) => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /^Reservas/ }).click()
    await page.waitForTimeout(1000)
    c.push(await shot(page, 'inv-reservas'))
    await page.getByRole('button', { name: /^Alertas/ }).click()
    await page.waitForTimeout(1400)
    const alertas = (await page.locator('body').innerText({ timeout: 10000 })).replace(/\s+/g, ' ').trim()
    c.push(await shot(page, 'inv-alertas'))
    // #213/INV: /inventario/alertas rompía por TDZ (canViewAlerts) y quedaba en blanco.
    if (!alertas) throw new Error('la vista de Alertas quedó en blanco (sin contenido)')
    return `reservas y alertas renderizan en demo (${alertas.slice(0, 70)}…)`
  })

  await paso('INV demo: 0 llamadas al API', async () => {
    if (llamadasApi.length) throw new Error(`el demo llamó al API: ${llamadasApi.join(', ')}`)
    return 'ninguna request a /api/'
  })

  await ctx.close()
}

// 2) Capturas claro/oscuro por módulo (DSN) + banner, marca y 0 API.
for (const modo of ['claro', 'oscuro']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (modo === 'oscuro') {
    await ctx.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  }
  const page = await ctx.newPage()
  seguirRed(page)
  await entrarDemo(page)

  for (const [ruta, nombre, esperado] of MODULOS) {
    await paso(`${modo}: módulo ${nombre}`, async (c) => {
      await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
      await page.getByText(/Modo demo: datos ficticios/).first().waitFor({ state: 'visible', timeout: 20000 })
      await page.getByRole('heading', { name: esperado }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 20000 })
      const marca = (await page.getByTestId('shell-tienda').evaluate((el) => el.textContent)).trim()
      if (marca !== 'MobOS') throw new Error(`el topbar muestra «${marca}» (se esperaba MobOS)`)
      c.push(await shot(page, `${modo}-${nombre}`))
      return `${ruta} · banner + marca + contenido`
    })
  }

  await ctx.close()
}

await browser.close()

const fallos = resultados.filter((r) => r.estado === 'fallo')
const salida = {
  verificado: new Date().toISOString(),
  base: BASE,
  version,
  llamadasApi,
  erroresConsola,
  resultados,
  resumen: { pasos: resultados.length, ok: resultados.length - fallos.length, fallos: fallos.length },
}
writeFileSync(join(SALIDA, 'resultados.json'), `${JSON.stringify(salida, null, 2)}\n`)
console.log(`\n${salida.resumen.ok}/${salida.resumen.pasos} pasos OK · ${fallos.length} fallos · salida en ${SALIDA}`)
if (fallos.length) process.exitCode = 1
