// Verificación en producción (#273/#275): venta sin cliente (Cliente ocasional)
// y navegación al detalle del pedido al confirmar, con el carrito vacío al volver.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const SALIDA = process.env.QA_OUT || 'docs/qa/273-275-produccion'
mkdirSync(SALIDA, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const page = await contexto.newPage()
const errores = []
page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)))

await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await esperar(1400)
await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/demo'), { timeout: 30_000 })
await esperar(2200)
const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
if (await guia.isVisible().catch(() => false)) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})

await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
await esperar(1200)
// Sin cliente: tiene que poder confirmarse como «Cliente ocasional».
const buscar = page.getByPlaceholder('Buscar producto…')
await buscar.fill('Funda MagSafe')
await esperar(900)
await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'Funda MagSafe' }).first().click()
await esperar(900)
await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
// #275: al confirmar se abre el detalle del pedido con su número.
const navego = await page.waitForURL(/\/pedidos\//, { timeout: 20_000 }).then(() => true).catch(() => false)
await esperar(1500)
const url = await page.evaluate('location.pathname')
const titulo = await page.locator('h1').first().innerText().catch(() => '')
const numeroVisible = /MOB-#?\d{4}/.test(await page.locator('body').innerText())
await page.screenshot({ path: join(SALIDA, 'detalle-pedido.jpg'), type: 'jpeg', quality: 72 }).catch(() => {})
// Al volver, el carrito queda vacío.
await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
await esperar(1800)
const carrito = await page.getByTestId('resumen-compra').innerText().catch(() => '')
const carritoVacio = /0 productos/.test(carrito)

const resultados = { base: BASE, fecha: new Date().toISOString(), navegoAlDetalle: navego, url, titulo, numeroVisible, carritoVacio, erroresPagina: errores }
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2))
console.log(JSON.stringify(resultados))
await navegador.close()
