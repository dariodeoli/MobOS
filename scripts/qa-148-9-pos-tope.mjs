// #148 §9 · POS: monto por encima del tope que el sistema puede guardar
// (los importes viven en columnas de 32 bits: 2.147.483.647).
//
// Reproduce el caso en la demo pública (datos ficticios): pone un precio de
// venta de 5.000.000.000 y confirma. En la rama el guardado se bloquea con el
// detalle del monto; el «antes» (producción) seguía de largo y el backend
// rechazaba sin decir qué campo. Capturas en claro/oscuro y desktop/mobile.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=produccion node scripts/qa-148-9-pos-tope.mjs
// Salida: docs/qa/148-9-pos-tope/<etiqueta>/*.jpg + resultados-<etiqueta>.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/148-9-pos-tope', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const VARIANTES = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
]
const filtro = (process.env.QA_VARIANTES || '').split(',').map(valor => valor.trim()).filter(Boolean)
const variantes = filtro.length ? VARIANTES.filter(v => filtro.includes(v.nombre)) : VARIANTES
const esperar = ms => new Promise(resolve => setTimeout(resolve, ms))

async function entrarDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1400)
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await esperar(2200)
  // La guía de la demo (#201) tapa los clics la primera vez.
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  const aparecio = await guia.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
  if (aparecio) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
}

async function agregarProducto(page, nombre) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(nombre)
  await esperar(900)
  const tarjeta = page
    .getByLabel('Resultados de productos')
    .getByRole('button')
    .filter({ hasText: nombre })
    .first()
  await tarjeta.click()
  await esperar(900)
  await buscar.fill('')
}

const resultados = []
const navegador = await chromium.launch()

for (const variante of variantes) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema }) => {
    try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin almacenamiento */ }
  }, { tema: variante.tema })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', error => errores.push(String(error.message).slice(0, 160)))

  await entrarDemo(page)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
  await esperar(1200)
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 148-9')
  await agregarProducto(page, 'Funda MagSafe')

  // Línea expandida con el precio por encima del tope real.
  const detalle = page.getByRole('button', { name: /^Ver detalle de / }).first()
  if (await detalle.count()) await detalle.click()
  await esperar(400)
  const precio = page.getByLabel(/^Precio de venta de /).first()
  await precio.fill('5.000.000.000')
  await esperar(300)
  const campoMarcado = await precio.getAttribute('aria-invalid')
  const carrito = page.locator('#pos-resumen-venta')
  await carrito.scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: join(SALIDA, `precio-sobre-tope-${variante.nombre}.jpg`), type: 'jpeg', quality: 70 })

  // Confirmar: en la rama el guardado se bloquea con el detalle del monto.
  const boton = page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ })
  let bloqueo = false
  let mensaje = ''
  let creacion = false
  if (await boton.count()) {
    await boton.first().click().catch(() => {})
    await esperar(1800)
    const aviso = page.getByText(/No se puede guardar:/)
    bloqueo = await aviso.isVisible().catch(() => false)
    mensaje = bloqueo ? (await aviso.first().innerText()).replace(/\s+/g, ' ').slice(0, 240) : ''
    creacion = await page.getByText(/Recibo confirmado|Pedido creado|Venta confirmada/).isVisible().catch(() => false)
    await page.screenshot({ path: join(SALIDA, `guardado-${variante.nombre}.jpg`), type: 'jpeg', quality: 70 })
  }
  resultados.push({
    variante: variante.nombre,
    tope: 2147483647,
    campoMarcado: campoMarcado === 'true',
    bloqueo,
    mensaje,
    creacion,
    erroresPagina: errores,
  })
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), resultados }, null, 2))
for (const fila of resultados) {
  console.log(`${fila.variante}: campo marcado ${fila.campoMarcado} · bloqueo ${fila.bloqueo} · creacion ${fila.creacion} · errores ${fila.erroresPagina.length}${fila.mensaje ? ` · ${fila.mensaje}` : ''}`)
}
