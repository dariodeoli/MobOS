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
  // F4 (#241): el v2 es el diseño por defecto; esta variante no escribe el
  // flag por dispositivo, así el recorrido valida lo que ve el usuario real.
  { nombre: 'desktop-claro-v2-default', ancho: 1280, alto: 900, tema: null, v2: null },
  { nombre: 'desktop-claro-v2-off', ancho: 1280, alto: 900, tema: null, v2: false },
  { nombre: 'desktop-claro-v2-on', ancho: 1280, alto: 900, tema: null, v2: true },
  { nombre: 'desktop-oscuro-v2-on', ancho: 1280, alto: 900, tema: 'dark', v2: true },
  { nombre: 'movil-claro-v2-default', ancho: 390, alto: 844, tema: null, v2: null },
  { nombre: 'movil-claro-v2-off', ancho: 390, alto: 844, tema: null, v2: false },
  { nombre: 'movil-claro-v2-on', ancho: 390, alto: 844, tema: null, v2: true },
  { nombre: 'movil-oscuro-v2-on', ancho: 390, alto: 844, tema: 'dark', v2: true },
]
const filtro = (process.env.QA_VARIANTES || '').split(',').map(valor => valor.trim()).filter(Boolean)
const soloComparar = process.env.QA_SOLO_COMPARAR === '1'
const variantes = soloComparar ? [] : (filtro.length ? VARIANTES.filter(v => filtro.includes(v.nombre)) : VARIANTES)

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
    // Zoom 2x: las capturas de la fila y del encabezado dejan ver la flechita,
    // el chip del IMEI y el descuento sin agrandar nada a mano.
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema, v2 }) => {
    try {
      if (tema) localStorage.setItem('mobos:theme', tema)
      // v2 = null deja el valor por defecto (F4: v2 activo).
      if (v2 !== null && v2 !== undefined) localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
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
  await page.screenshot({ path: join(SALIDA, `carrito-${variante.nombre}-colapsado.jpg`), type: 'jpeg', quality: 68 })

  // Evidencia por criterio (#243): la fila colapsada (sin cantidad/precio, con
  // total y flechita abajo) y el encabezado del total, en zoom.
  const fila = carrito.locator('.divide-y > div').first()
  await fila.screenshot({ path: join(SALIDA, `fila-colapsada-${variante.nombre}.png`) })
  await page.getByTestId('resumen-compra')
    .screenshot({ path: join(SALIDA, `encabezado-${variante.nombre}.png`) })
    .catch(() => {})

  // Expandir la línea del equipo (la primera) para ver el detalle.
  const detalle = page.getByRole('button', { name: /^Ver detalle de / }).first()
  if (await detalle.count()) {
    await detalle.click()
    await esperar(500)
    await carrito.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SALIDA, `carrito-${variante.nombre}-expandido.jpg`), type: 'jpeg', quality: 68 })
    await fila.screenshot({ path: join(SALIDA, `fila-expandida-${variante.nombre}.png`) })
  }
  const alturasExpandidas = await altoDeFilas(page)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const flagV2 = await page.evaluate(() => document.documentElement.querySelector('.tema-v2') !== null)
  const totalVisible = (await carrito.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)

  // Papelera por línea + confirmación (#243): con la línea desplegada se aplica
  // un descuento en la demo y se captura el diálogo; se cancela para no romper
  // el resto de la corrida.
  const papelera = fila.getByRole('button', { name: /^Eliminar / }).first()
  if (await papelera.count()) {
    const descuento = fila.getByLabel(/^Descuento % de /)
    if (await descuento.count()) {
      await descuento.fill('10')
      await esperar(400)
    }
    await papelera.click()
    await esperar(400)
    const dialogo = page.getByRole('dialog')
    if (await dialogo.count()) {
      await dialogo.screenshot({ path: join(SALIDA, `confirmacion-${variante.nombre}.png`) })
      await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    }
  }

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

const resumen = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), resultados }
if (!soloComparar) writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify(resumen, null, 2))

// Tira comparativa opcional "antes | después": QA_COMPARAR=<etiqueta-antes>,<etiqueta-despues>
// Compone las capturas en zoom de la fila (colapsada/expandida) y del encabezado
// en una sola imagen por criterio.
const comparar = (process.env.QA_COMPARAR || '').split(',').map(valor => valor.trim()).filter(Boolean)
if (comparar.length === 2) {
  const [antes, despues] = comparar
  const raiz = process.env.QA_OUT || 'docs/qa/243'
  const { readFileSync } = await import('node:fs')
  for (const [archivo, titulo] of [
    ['fila-colapsada', 'Línea colapsada'],
    ['fila-expandida', 'Línea expandida (cantidad y precio adentro)'],
    ['encabezado', 'Encabezado “Total de esta venta”'],
  ]) {
    const sufijo = '-desktop-claro-v2-off.png'
    const enData = base64 => `data:image/png;base64,${base64}`
    const filas = [[antes, join(raiz, antes, `${archivo}${sufijo}`)], [despues, join(raiz, despues, `${archivo}${sufijo}`)]]
    const html = `<!doctype html><html><body style="margin:0;background:#0b0f16;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:22px;width:1080px">
      <h1 style="color:#f4f6fa;font-size:17px;margin:0 0 14px">${titulo}</h1>
      ${filas.map(([etiqueta, ruta]) => `
        <div style="margin-bottom:16px">
          <div style="color:#9aa3b2;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${etiqueta}</div>
          <img src="${enData(readFileSync(ruta).toString('base64'))}" style="display:block;max-width:1036px;border-radius:10px;border:1px solid #333b48"/>
        </div>`).join('')}
    </body></html>`
    const contextoCompositor = await navegador.newContext({ viewport: { width: 1080, height: 720 }, deviceScaleFactor: 1 })
    const paginaCompositor = await contextoCompositor.newPage()
    await paginaCompositor.setContent(html, { waitUntil: 'load' })
    await paginaCompositor.screenshot({ path: join(raiz, `comparativa-${archivo}-${antes}-vs-${despues}.png`), fullPage: true })
    await contextoCompositor.close()
  }
  console.log(`comparativa: docs/qa/243/comparativa-{fila-colapsada,fila-expandida,encabezado}-${antes}-vs-${despues}.png`)
}

await navegador.close()

for (const fila of resultados) {
  console.log(
    `${fila.variante}: fila colapsada ${fila.altoFilaColapsada}px · v2 ${fila.scopeV2Aplicado ? 'on' : 'off'} · desborde ${fila.desbordeHorizontal}px · errores ${fila.erroresPagina.length}`,
  )
}
