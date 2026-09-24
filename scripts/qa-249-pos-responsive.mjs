// Auditoría responsive del POS (#249): mide cajas reales y captura las cinco
// superficies del pedido en mobile (360/390/414) y tablet (768):
//   carrito colapsado · cobros/split · entrega · teclado (bloqueo/PIN) ·
//   menú de tres puntos
// Corre sobre la demo pública (datos ficticios, sin tocar datos reales), así se
// puede repetir post-deploy.
//
// Uso:
//   QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.153-produccion node scripts/qa-249-pos-responsive.mjs
//   QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-249 node scripts/qa-249-pos-responsive.mjs
// Salida: docs/qa/249-pos-responsive/<etiqueta>/<viewport>-<area>.jpg +
//         resultados-<etiqueta>.json (cajas, cortos <44, errores de página)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/249-pos-responsive', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const VIEWPORTS = [
  { nombre: '360', ancho: 360, alto: 740 },
  { nombre: '390', ancho: 390, alto: 844 },
  { nombre: '414', ancho: 414, alto: 896 },
  { nombre: '768', ancho: 768, alto: 1024 },
]
const TOQUE = 44 // target táctil recomendado (#249)
// En mobile (<768) se exige el target; desde 768 (md:) el diseño vuelve a ser
// compacto, como en la pasada de inventario.
let esMovil = true

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function entrarDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1400)
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  await esperar(2200)
  // Guía de bienvenida de la demo (primera visita).
  const guia = page.getByRole('button', { name: 'Entendido' })
  if (await guia.count()) await guia.click().catch(() => {})
}

async function agregarProducto(page, nombre) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(nombre)
  await esperar(900)
  await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: nombre }).first().click()
  await esperar(700)
  await buscar.fill('')
}

// Mide una caja real y marca si queda por debajo del target táctil.
async function medir(page, etiqueta, locator) {
  try {
    const objetivo = locator.first()
    if (!(await objetivo.count())) return { etiqueta, estado: 'no-visible' }
    const caja = await objetivo.boundingBox()
    if (!caja) return { etiqueta, estado: 'sin-caja' }
    const ancho = Math.round(caja.width)
    const alto = Math.round(caja.height)
    return {
      etiqueta,
      ancho,
      alto,
      corto: esMovil && (ancho < TOQUE || alto < TOQUE),
      estado: 'medido',
    }
  } catch (error) {
    return { etiqueta, estado: 'error', detalle: String(error.message).slice(0, 120) }
  }
}

const resultados = []
const navegador = await chromium.launch()

for (const viewport of VIEWPORTS) {
  esMovil = viewport.ancho < 768
  const contexto = await navegador.newContext({
    viewport: { width: viewport.ancho, height: viewport.alto },
    deviceScaleFactor: 2,
  })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  const medidas = []

  try {
    await entrarDemo(page)

    // ── POS: carrito ultra-colapsado + cobros/split y entrega ──────────────
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await esperar(1200)
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 249')
    await agregarProducto(page, 'Funda MagSafe')

    const carrito = page.locator('#pos-resumen-venta')
    await carrito.scrollIntoViewIfNeeded()
    await esperar(400)
    medidas.push(await medir(page, 'carrito · chevron de la línea', carrito.getByRole('button', { name: /^(Ver detalle|Ver menos detalle) de / })))
    medidas.push(await medir(page, 'carrito · IMEI de la línea', carrito.getByRole('button', { name: /^(Elegir|Cambiar) IMEI de / })))
    medidas.push(await medir(page, 'carrito · papelera de la línea', carrito.getByRole('button', { name: /^Eliminar / })))
    medidas.push(await medir(page, 'carrito · vaciar', carrito.getByRole('button', { name: 'Vaciar carrito' })))
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-carrito-colapsado.jpg`), type: 'jpeg', quality: 70 })

    // Línea expandida: cantidad, precio, color, descuento y cupón.
    await carrito.getByRole('button', { name: /^Ver detalle de / }).first().click()
    await esperar(500)
    medidas.push(await medir(page, 'línea · cantidad', carrito.getByLabel(/^Cantidad de /).first()))
    medidas.push(await medir(page, 'línea · precio de venta', carrito.getByLabel(/^Precio de venta de /).first()))
    medidas.push(await medir(page, 'línea · color', carrito.getByLabel(/^Color de /).first()))
    medidas.push(await medir(page, 'línea · descuento %', carrito.getByLabel(/^Descuento % de /).first()))
    medidas.push(await medir(page, 'línea · descuento fijo', carrito.getByLabel(/^Descuento fijo de /).first()))
    medidas.push(await medir(page, 'línea · aplicar cupón', carrito.getByRole('button', { name: /^(Aplicar|Cambiar) cupón$/ }).first()))
    medidas.push(await medir(page, 'línea · quitar IMEI', carrito.getByRole('button', { name: 'Quitar IMEI' })))
    // El descuento de línea habilita «Borrar descuento» en el pie del carrito.
    const descuentoLinea = carrito.getByLabel(/^Descuento % de /).first()
    if (await descuentoLinea.count()) await descuentoLinea.fill('10')
    await esperar(400)
    medidas.push(await medir(page, 'carrito · borrar descuento', carrito.getByRole('button', { name: 'Borrar descuento' })))
    await carrito.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-linea-expandida.jpg`), type: 'jpeg', quality: 70 })
    await carrito.getByRole('button', { name: /^Ver menos detalle de / }).first().click().catch(() => {})
    await esperar(300)

    // Cobros/split: un pago en guaraníes y otro en dólares con cotización.
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    await esperar(400)
    const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
    await pagos.getByLabel('Cuenta de cobro').first().click()
    await page.getByRole('option', { name: /Caja · Guaraníes/ }).first().click()
    await esperar(400)
    // Un monto parcial deja saldo: así aparece «Dividir saldo» (si se cobra
    // todo, el botón desaparece y no hay split que medir).
    await pagos.getByLabel('Monto original').first().fill('25000')
    await esperar(400)
    const dividir = page.getByRole('button', { name: /^Dividir saldo/ })
    medidas.push(await medir(page, 'cobros · dividir saldo', dividir))
    if (await dividir.count()) await dividir.click()
    await esperar(400)
    await pagos.getByLabel('Cuenta de cobro').nth(1).click()
    await page.getByRole('option', { name: /Caja · Dólares/ }).first().click()
    await esperar(500)
    medidas.push(await medir(page, 'cobros · cuenta de cobro', pagos.getByLabel('Cuenta de cobro').first()))
    medidas.push(await medir(page, 'cobros · monto original', pagos.getByLabel('Monto original').first()))
    medidas.push(await medir(page, 'cobros · cotización', pagos.getByLabel(/^Cotización/).first()))
    medidas.push(await medir(page, 'cobros · agregar pago', page.getByRole('button', { name: '+ Agregar pago' })))
    medidas.push(await medir(page, 'cobros · quitar pago', pagos.getByRole('button', { name: /^Eliminar pago/ }).first()))
    medidas.push(await medir(page, 'cobros · botón principal', page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ })))
    await page.getByText('Cobro y entrega').first().scrollIntoViewIfNeeded().catch(() => {})
    await esperar(400)
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-cobros-split.jpg`), type: 'jpeg', quality: 70 })

    // Entrega y observación.
    medidas.push(await medir(page, 'entrega · selector', page.getByLabel('Entrega')))
    medidas.push(await medir(page, 'entrega · monto delivery', page.getByLabel(/Monto del delivery|Costo (de la encomienda|del envío)/)))
    medidas.push(await medir(page, 'entrega · observación', page.getByLabel('Observación')))
    await page.getByLabel('Entrega').scrollIntoViewIfNeeded().catch(() => {})
    await esperar(300)
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-entrega.jpg`), type: 'jpeg', quality: 70 })

    // ── Menú de tres puntos ────────────────────────────────────────────────
    await page.getByTestId('menu-acciones').scrollIntoViewIfNeeded().catch(() => {})
    medidas.push(await medir(page, 'menú · disparador', page.getByTestId('menu-acciones')))
    await page.getByTestId('menu-acciones').click()
    await esperar(400)
    const menu = page.getByTestId('menu-acciones-lista')
    const items = menu.getByRole('menuitem')
    const totalItems = await items.count()
    for (let i = 0; i < totalItems; i += 1) {
      const nombre = (await items.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 30)
      medidas.push(await medir(page, `menú · ítem ${nombre || i + 1}`, items.nth(i)))
    }
    await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-menu-tres-puntos.jpg`), type: 'jpeg', quality: 70 })

    // ── Bloqueo/PIN (teclado) ──────────────────────────────────────────────
    const bloquear = menu.getByRole('menuitem', { name: 'Bloquear pantalla', exact: true })
    if (await bloquear.count()) {
      await bloquear.click()
      const bloqueo = page.getByTestId('pantalla-bloqueada')
      await bloqueo.waitFor({ timeout: 10_000 })
      await esperar(600)
      medidas.push(await medir(page, 'bloqueo · campo del PIN', page.locator('#lock-pin')))
      await page.screenshot({ path: join(SALIDA, `${viewport.nombre}-bloqueo-pin.jpg`), type: 'jpeg', quality: 70 })
    }
  } catch (error) {
    errores.push(`auditoría: ${String(error.message).slice(0, 200)}`)
  }

  resultados.push({
    viewport: viewport.nombre,
    ancho: viewport.ancho,
    medidas,
    cortos: medidas.filter((m) => m.corto).length,
    erroresPagina: errores,
  })
  await contexto.close()
}

await navegador.close()
const resumen = { base: BASE, etiqueta: ETIQUETA, fecha: new Date().toISOString(), toque: TOQUE, resultados }
writeFileSync(join(SALIDA, `resultados-${ETIQUETA}.json`), JSON.stringify(resumen, null, 2))

for (const fila of resultados) {
  const cortos = fila.medidas.filter((m) => m.corto).map((m) => `${m.etiqueta} ${m.ancho}x${m.alto}`)
  console.log(
    `${fila.viewport}: ${fila.medidas.filter((m) => m.estado === 'medido').length} medidas · ${fila.cortos} por debajo de ${TOQUE}px${cortos.length ? ` → ${cortos.join(' | ')}` : ''} · errores ${fila.erroresPagina.length}`,
  )
}
