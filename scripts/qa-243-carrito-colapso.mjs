// Capturas del carrito ultra-colapsado (#243) y del lenguaje v2 del POS
// detrás del flag `mobos:tema-v2` (#241, F4 por dominio).
//
// Verifica en la demo pública (datos ficticios, aislados en el navegador):
//   - la línea colapsada (nombre + IMEI + total + chevron, sin cantidad/precio)
//   - la línea expandida (cantidad, precio, lista, descuento, cupón, stock)
//   - el alto de la fila colapsada (antes/después del colapso máximo)
//   - claro/oscuro, desktop 1280 y mobile 390, con y sin el flag v2
//
// Uso:
//   QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.144 node scripts/qa-243-carrito-colapso.mjs
//   QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.144 QA_VARIANTES=desktop-claro-v2-off node scripts/qa-243-carrito-colapso.mjs
// Salida: docs/qa/243/<etiqueta>/carrito-*.jpg + resultados-<etiqueta>.json
/* global window, document, localStorage */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/243', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const VARIANTES = [
  { nombre: 'desktop-claro-v2-off', ancho: 1280, alto: 900, tema: null, v2: false },
  { nombre: 'desktop-claro-v2-on', ancho: 1280, alto: 900, tema: null, v2: true },
  { nombre: 'desktop-oscuro-v2-on', ancho: 1280, alto: 900, tema: 'dark', v2: true },
  { nombre: 'movil-claro-v2-off', ancho: 390, alto: 844, tema: null, v2: false },
  { nombre: 'movil-claro-v2-on', ancho: 390, alto: 844, tema: null, v2: true },
  { nombre: 'movil-oscuro-v2-on', ancho: 390, alto: 844, tema: 'dark', v2: true },
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

async function altoDeFilas(page) {
  return page.evaluate(() => {
    const filas = [...document.querySelectorAll('#pos-resumen-venta .divide-y > div')]
    return filas.map(fila => Math.round(fila.getBoundingClientRect().height))
  })
}

const resultados = []
const navegador = await chromium.launch()

for (const variante of variantes) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
  })
  await contexto.addInitScript(({ tema, v2 }) => {
    try {
      if (tema) localStorage.setItem('mobos:theme', tema)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin almacenamiento */ }
  }, { tema: variante.tema, v2: variante.v2 })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', error => errores.push(String(error.message).slice(0, 160)))

  await entrarDemo(page)
  await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
  await esperar(1200)
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 243')
  await agregarProducto(page, 'iPhone 15 Pro')
  await agregarProducto(page, 'Funda MagSafe')

  const carrito = page.locator('#pos-resumen-venta')
  await carrito.scrollIntoViewIfNeeded()
  await esperar(400)
  const alturasColapsadas = await altoDeFilas(page)
  await page.screenshot({ path: join(SALIDA, `carrito-${variante.nombre}-colapsado.jpg`), type: 'jpeg', quality: 74 })

  // Expandir la línea del equipo (la primera) para ver el detalle.
  const detalle = page.getByRole('button', { name: /^Ver detalle de / }).first()
  if (await detalle.count()) {
    await detalle.click()
    await esperar(500)
    await carrito.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SALIDA, `carrito-${variante.nombre}-expandido.jpg`), type: 'jpeg', quality: 74 })
  }
  const alturasExpandidas = await altoDeFilas(page)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const flagV2 = await page.evaluate(() => document.documentElement.querySelector('.tema-v2') !== null)
  const totalVisible = (await carrito.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)

  resultados.push({
    variante: variante.nombre,
    ancho: variante.ancho,
    altoFilaColapsada: alturasColapsadas[0] ?? null,
    alturasColapsadas,
    alturasExpandidas,
    desbordeHorizontal: desborde,
    scopeV2Aplicado: flagV2,
    totalVisible,
    erroresPagina: errores,
  })
  await contexto.close()
}

await navegador.close()
const resumen = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), resultados }
writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify(resumen, null, 2))
for (const fila of resultados) {
  console.log(
    `${fila.variante}: fila colapsada ${fila.altoFilaColapsada}px · v2 ${fila.scopeV2Aplicado ? 'on' : 'off'} · desborde ${fila.desbordeHorizontal}px · errores ${fila.erroresPagina.length}`,
  )
}
