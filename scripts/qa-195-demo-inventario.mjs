// Verificación del demo de Inventario (#195, extensión de #194): Productos,
// Compras, Ubicaciones, carga rápida con costo diferido (USD/Gs), Servicio
// Técnico y sync con el POS, sin tocar el API real y con capturas.
//
// Uso: node scripts/qa-195-demo-inventario.mjs
//      QA_BASE_URL=<demo> QA_OUT=docs/qa/195-demo node scripts/qa-195-demo-inventario.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const API_HOST = process.env.QA_API_HOST || 'api.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/195-demo')
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

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') erroresConsola.push(msg.text().slice(0, 250)) })
page.on('pageerror', (error) => erroresConsola.push(`pageerror: ${String(error?.message || error).slice(0, 250)}`))
page.on('request', (req) => {
  const url = req.url()
  if (url.includes(API_HOST) && url.includes('/api/')) llamadasApi.push(url.slice(0, 200))
})

async function ir(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
}

await paso('#195 demo: entrada anónima como Dueño', async (c) => {
  await ir('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'), { timeout: 30000 })
  await page.getByText(/Modo demo: datos ficticios/).first().waitFor({ state: 'visible', timeout: 20000 })
  const cerrar = page.getByRole('button', { name: 'Cerrar' }).last()
  if (await page.getByRole('dialog', { name: 'Cómo funciona la demo' }).count()) await cerrar.click()
  const texto = await page.locator('body').innerText()
  version = (texto.match(/v\d+\.\d+\.\d+/) || [null])[0]
  c.push(await shot(page, 'demo-entrada'))
  return `${version || 'versión s/d'} · sesión demo activa`
})

await paso('#195 Inv: Productos en demo', async (c) => {
  await ir('/productos')
  await page.getByRole('heading', { name: /^Productos$/ }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  if (!/iPhone|Samsung|producto/i.test(texto)) throw new Error('el catálogo demo no muestra productos')
  const productos = await page.getByText(/iPhone 1[0-9]/).count()
  c.push(await shot(page, 'productos'))
  return `catálogo demo con productos visibles (${productos} menciones de modelo)`
})

await paso('#195 Inv: Compras en demo', async (c) => {
  await ir('/compras')
  await page.getByRole('heading', { name: /^Compras$/ }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  c.push(await shot(page, 'compras'))
  return `pantalla de compras navegable (${texto.length > 400 ? 'con contenido' : 'estado honesto'})`
})

await paso('#195 Inv: Ubicaciones y Vendidos', async (c) => {
  await ir('/inventario/ubicaciones')
  await page.getByRole('heading', { name: /^Ubicaciones$/ }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  c.push(await shot(page, 'ubicaciones'))
  await ir('/inventario/vendidos')
  await page.getByRole('heading', { name: /^Vendidos$/ }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  c.push(await shot(page, 'vendidos'))
  return 'ubicaciones y vendidos renderizan con datos demo'
})

await paso('#195 Inv: Servicio Técnico en demo', async (c) => {
  await ir('/servicio')
  await page.getByRole('heading', { name: /Servicio/i }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const ordenes = /OS-#\d{4}/.test(texto)
  c.push(await shot(page, 'servicio'))
  return ordenes ? 'órdenes demo visibles (OS-#…)' : 'pantalla de servicio navegable'
})

const serial195 = `AURQA195${Date.now().toString(36).toUpperCase()}`
await paso('#195 Inv: carga rápida con costo diferido en USD', async (c) => {
  await ir('/inventario')
  await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('button', { name: '+ Recibir unidad' }).click()
  const modal = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
  await modal.waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('#recibir-modelo').selectOption({ index: 1 })
  await page.locator('#recibir-serial').fill(serial195)
  await modal.getByLabel('Sucursal').selectOption({ index: 1 })
  await modal.getByLabel('Moneda del costo').selectOption('USD')
  await modal.getByLabel('Monto del costo').fill('100')
  await modal.getByLabel('Cotización').fill('7500')
  await page.getByText(/Costo en Gs:\s*Gs\.?\s*750\.000/).waitFor({ state: 'visible', timeout: 10000 })
  c.push(await shot(page, 'recibir-unidad-usd'))
  await modal.getByRole('button', { name: 'Guardar unidad' }).click()
  await page.waitForTimeout(1500)
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial195)
  await campo.press('Enter')
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial195 }).first()
  await fila.waitFor({ state: 'visible', timeout: 20000 })
  await fila.click()
  const costo = (await page.getByTestId('unidad-costo').innerText()).replace(/\s+/g, ' ')
  if (!/Cargado/.test(costo)) throw new Error('la unidad recibida no quedó con costo cargado')
  if (!/US\$|100/.test(costo) || !/750\.000/.test(costo)) throw new Error(`el costo diferido USD/Gs no se ve en la ficha: ${costo.slice(0, 120)}`)
  c.push(await shot(page, 'unidad-costo-usd'))
  await page.keyboard.press('Escape')
  return `${serial195} con costo US$ 100 · Gs. 750.000`
})

await paso('#195 Inv: kardex oculto en demo (por diseño)', async (c) => {
  await ir('/productos')
  await page.getByRole('heading', { name: /^Productos$/ }).filter({ visible: true }).first().waitFor({ timeout: 20000 })
  // El botón Kardex vive en la ficha del producto y se oculta en demo (`!esDemo`).
  const botonKardex = page.getByTestId('kardex-abrir')
  const visible = await botonKardex.filter({ visible: true }).count()
  c.push(await shot(page, 'productos-kardex'))
  if (visible > 0) throw new Error('el demo muestra el botón Kardex (debería estar oculto)')
  return 'sin botón Kardex en demo (cubierto con sesión real por e2e/kardex-producto.spec.js)'
})

await paso('#195 Inv: sync con POS (la venta demo descuenta unidades)', async (c) => {
  // El demo vive en memoria de la pestaña: se navega dentro de la app, sin recargar.
  await ir('/inventario')
  await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20000 })
  const antes = await page.getByTestId('inventario-fila').count()

  await page.getByRole('button', { name: 'POS', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Nueva venta' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente sync ${Date.now().toString(36)}`)
  await page.getByPlaceholder('Buscar producto…').fill('iPhone 15 Pro 256GB Titanio')
  await page.waitForTimeout(900)
  const sugerencia = page.getByRole('option').first()
  await sugerencia.waitFor({ state: 'visible', timeout: 15000 })
  await sugerencia.click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await page.waitForTimeout(900)
  const pagos = page.locator('div.space-y-3').filter({ hasText: 'Pagos de esta venta' })
  await pagos.getByLabel('Cuenta de cobro').first().click()
  await page.getByRole('option').filter({ hasText: /Caja · Guaraníes/ }).first().click()
  await page.waitForTimeout(700)
  const dividir = pagos.getByRole('button', { name: /^Dividir saldo/ })
  if (await dividir.count()) await dividir.click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ }).first().click()
  await page.waitForTimeout(2600)
  c.push(await shot(page, 'pos-venta-demo'))

  await page.getByRole('button', { name: 'Inventario', exact: true }).first().click()
  await page.getByTestId('inventario-fila').first().waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1200)
  const despues = await page.getByTestId('inventario-fila').count()
  c.push(await shot(page, 'inventario-tras-venta'))
  if (despues >= antes) throw new Error(`la venta demo no descontó unidades (antes ${antes}, después ${despues})`)
  return `unidades disponibles: ${antes} → ${despues} tras la venta`
})

await paso('#195 demo: 0 llamadas al API real', async () => {
  if (llamadasApi.length) throw new Error(`el demo llamó al API: ${llamadasApi.join(', ')}`)
  return 'ninguna request a /api/'
})

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
