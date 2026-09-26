// Recorrido funcional del POS (flujo del vendedor) en PRODUCCIÓN sobre /demo (#187).
//
// Uso: node scripts/qa-187-pos-demo.mjs
// Salida: docs/qa/187/*.jpg + docs/qa/187/resultados.json
//
// Solo navega la demo pública (datos aislados en el navegador): no toca cuentas
// reales ni datos de una tienda.
/* global window, document */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BASE = process.env.QA_BASE_URL || 'https://app.moboss.online'
const SALIDA = process.env.QA_OUT || join(RAIZ, 'docs/qa/187')
mkdirSync(SALIDA, { recursive: true })

const resultados = []
const errores = []
const fallosRed = []
const pedidosFallidos = []
let capturasPaso = []
let contador = 0
let version = ''

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (msg) => { if (msg.type() === 'error') errores.push(msg.text().slice(0, 400)) })
page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))
page.on('response', (respuesta) => {
  if (respuesta.status() >= 400 && respuesta.url().includes('/api/')) fallosRed.push(`${respuesta.status()} ${respuesta.url().slice(0, 160)}`)
})
page.on('requestfailed', (pedido) => {
  pedidosFallidos.push(`${pedido.failure()?.errorText || 'falló'} ${pedido.url().slice(0, 160)}`)
})

async function shot(nombre) {
  contador += 1
  const limpio = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const archivo = `${String(contador).padStart(2, '0')}-${limpio}.jpg`
  await page.screenshot({ path: join(SALIDA, archivo), type: 'jpeg', quality: 72 })
  capturasPaso.push(archivo)
  return archivo
}

async function paso(nombre, fn) {
  capturasPaso = []
  const erroresAntes = errores.length
  const redAntes = fallosRed.length
  try {
    const detalle = await fn()
    resultados.push({ paso: nombre, estado: 'ok', detalle: detalle ?? '', capturas: capturasPaso, erroresConsola: errores.slice(erroresAntes), fallosRed: fallosRed.slice(redAntes) })
    console.log(`OK    ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  } catch (error) {
    resultados.push({ paso: nombre, estado: 'fallo', detalle: String(error?.message || error).slice(0, 500), capturas: capturasPaso, erroresConsola: errores.slice(erroresAntes), fallosRed: fallosRed.slice(redAntes) })
    console.log(`FALLO ${nombre}: ${error?.message || error}`)
    try { await shot(`fallo-${nombre}`) } catch { /* sin captura */ }
  }
}

const esperar = (ms) => page.waitForTimeout(ms)
const texto = (locator) => locator.first().innerText().then((valor) => valor.replace(/\s+/g, ' ').trim())
const totalVenta = () => page.locator('[data-testid="resumen-compra"]').innerText().then((valor) => valor.replace(/\s+/g, ' ').trim())
const principal = () => page.getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).last()
async function ir(ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' })
  await esperar(2200)
}
async function entrarDemo(rol = 'Vendedor') {
  await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
  await esperar(1400)
  await page.getByRole('button', { name: new RegExp(`Entrar como ${rol}`) }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
  await esperar(2500)
}
async function agregarProducto(nombre) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(nombre)
  await esperar(900)
  const opcion = page.getByRole('option', { name: new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
  if (await opcion.count()) await opcion.first().click()
  else await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: nombre }).first().click()
  await esperar(900)
  await buscar.fill('')
}
// El cobro arranca sin bloques: se agrega uno y se elige la cuenta en el
// buscador de cuentas (nombre, banco, titular o número).
// Elige la cuenta pedida en el bloque `indice`; si el combo ya viene con la
// cuenta puesta (#209) no aparecen opciones y se sigue sin cambiar nada.
async function elegirCuentaBloque(indice, cuenta) {
  const combo = page.getByLabel('Cuenta de cobro').nth(indice)
  await combo.click()
  await combo.fill(cuenta)
  await esperar(900)
  const opcion = page.getByRole('option').filter({ hasText: new RegExp(cuenta.split(' ')[0], 'i') }).first()
  if (await opcion.count()) { await opcion.click(); await esperar(800); return true }
  await page.keyboard.press('Escape')
  await esperar(300)
  return false
}
async function agregarPago(cuenta, monto) {
  await page.getByRole('button', { name: /\+ Agregar pago/ }).first().click()
  await esperar(1000)
  const indice = (await page.getByLabel('Cuenta de cobro').count()) - 1
  await elegirCuentaBloque(indice, cuenta)
  const montoInput = page.getByLabel('Monto original').nth(indice)
  for (let i = 0; i < 20 && (await montoInput.isDisabled()); i += 1) {
    if (await elegirCuentaBloque(indice, cuenta)) break
    await esperar(300)
  }
  if (await montoInput.isDisabled()) throw new Error('el monto quedó deshabilitado: la cuenta no se pudo elegir')
  await montoInput.fill(String(monto))
  await esperar(900)
}

try {
  // ── Entrada a la demo: perfil vendedor ───────────────────────────────
  await paso('entrada a la demo como vendedor', async () => {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1400)
    const cuerpoDemo = await page.locator('body').innerText()
    version = (cuerpoDemo.match(/v\d+\.\d+\.\d+/) || [''])[0]
    await shot('acceso-demo')
    const perfiles = (await page.getByText('Vendedor', { exact: true }).count()) + (await page.getByText('Dueño', { exact: true }).count())
    await entrarDemo('Vendedor')
    await shot('panel-vendedor')
    // F4 (#241): sin tocar el flag por dispositivo, el v2 tiene que estar activo
    // (es el diseño por defecto); el alcance lo marca la clase del shell.
    const v2 = await page.evaluate(() => document.querySelector('.tema-v2') !== null)
    const nav = await texto(page.locator('nav').first())
    return `versión desplegada: ${version || '(sin versión en el pie)'} · perfiles: ${perfiles} · v2 por defecto: ${v2} · menú: ${nav.slice(0, 150)}`
  })

  // ── POS: venta en una sola pantalla con carrito visible ──────────────
  await paso('pos: venta en una sola pantalla (carrito visible sin salir)', async () => {
    await ir('/pos')
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 20000 })
    await page.locator('[data-testid="resumen-compra"]').waitFor({ timeout: 15000 })
    const medidas = await page.evaluate(() => {
      const caja = (selector) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { bottom: Math.round(r.bottom), visible: r.bottom <= window.innerHeight + 1 && r.top >= -1 }
      }
      return { buscador: caja('input[placeholder="Buscar producto…"]'), total: caja('[data-testid="resumen-compra"]'), ventana: window.innerHeight }
    })
    await shot('pos-pantalla-unica')
    return `buscador visible: ${medidas.buscador?.visible} (bottom ${medidas.buscador?.bottom}/${medidas.ventana}) · total visible: ${medidas.total?.visible} (bottom ${medidas.total?.bottom}/${medidas.ventana}) · hoy visible: ${await page.getByText(/^Hoy: /).count()}`
  })

  // ── Catálogo: sugerencias y alta al carrito ──────────────────────────
  await paso('catalogo: buscar y agregar con modelo y capacidad', async () => {
    await page.getByPlaceholder('Buscar producto…').fill('iPhone 15 Pro')
    await esperar(900)
    const sugerencias = (await page.getByRole('option').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean)
    await shot('catalogo-resultados')
    await page.getByRole('option', { name: /iPhone 15 Pro 256GB Titanio/i }).first().click()
    await esperar(900)
    await page.getByPlaceholder('Buscar producto…').fill('')
    await shot('producto-agregado')
    return `sugerencias: ${sugerencias.slice(0, 3).join(' | ')} · carrito: ${(await totalVenta()).slice(0, 150)}`
  })

  // ── Carrito: segundo producto, cantidad y descuento ──────────────────
  await paso('carrito: fila colapsada (#243), cantidad 2 y descuento', async () => {
    await agregarProducto('Funda MagSafe Transparente')
    // La línea arranca ultra-colapsada (#243): solo nombre, total y papelera.
    const filaColapsada = await texto(page.locator('#pos-resumen-venta .divide-y > div').first())
    await shot('carrito-colapsado')
    // Se despliega para editar cantidad y precio.
    await page.getByRole('button', { name: 'Ver detalle de iPhone 15 Pro 256GB Titanio' }).click()
    await page.getByLabel('Cantidad de iPhone 15 Pro 256GB Titanio').fill('2')
    await esperar(700)
    const conCantidad = await totalVenta()
    await page.locator('#descuento-extra-gs').fill('100000')
    await esperar(700)
    const conDescuento = await totalVenta()
    await shot('carrito-descuento')
    await page.getByRole('button', { name: 'Borrar descuento' }).click()
    await esperar(700)
    const sinDescuento = await totalVenta()
    await shot('carrito-sin-descuento')
    return `colapsada: ${filaColapsada.slice(0, 110)} · 2 u.: ${conCantidad.slice(0, 100)} · con descuento: ${conDescuento.slice(0, 100)} · borrado: ${sinDescuento.slice(0, 100)}`
  })

  // ── Cliente: cartera demo + alta por nombre nuevo ────────────────────
  await paso('cliente: buscador con la cartera demo y alta por nombre nuevo', async () => {
    const campo = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
    await campo.fill('Lucía')
    await esperar(1100)
    const sugerencia = page.getByRole('button', { name: /Lucía Fernández/ })
    const hayClienteDemo = (await sugerencia.count()) > 0
    await shot('cliente-demo-sugerencia')
    let fichaElegida = false
    if (hayClienteDemo) {
      await sugerencia.first().click()
      await esperar(700)
      fichaElegida = (await page.getByText('Cliente seleccionado').count()) > 0
      await page.getByRole('button', { name: /Quitar cliente/ }).click()
      await esperar(400)
    }
    await campo.fill('Cliente QA 187')
    await esperar(900)
    await shot('cliente-nuevo')
    const label = await texto(principal())
    return `demo «Lucía Fernández» visible: ${hayClienteDemo} · ficha elegida: ${fichaElegida} · alta por nombre nuevo → botón: "${label}"`
  })

  // ── Borradores: suspender, listar y retomar (#148 §20) ───────────────
  await paso('borradores: suspender, listar y retomar (demo en el navegador)', async () => {
    await page.getByRole('button', { name: 'Suspender venta' }).click()
    const modal = page.getByRole('dialog', { name: 'Suspender venta' }).filter({ visible: true }).first()
    await modal.waitFor({ timeout: 10000 })
    await modal.getByLabel('Etiqueta (opcional)').fill('QA 187 borrador')
    await shot('borrador-modal')
    await modal.getByRole('button', { name: 'Suspender venta' }).click()
    await page.getByText(/Venta suspendida en la demo/).waitFor({ timeout: 10000 })
    const aviso = await texto(page.getByText(/Venta suspendida en la demo/))
    await shot('borrador-aviso')
    await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
    const lista = page.getByRole('dialog', { name: 'Ventas suspendidas' }).filter({ visible: true }).first()
    await lista.waitFor({ timeout: 10000 })
    const filas = await lista.getByText('QA 187 borrador').count()
    await shot('borradores-listado')
    // Enlace público: en la demo avisa que no se genera (honesto).
    await lista.getByRole('button', { name: 'Enlace público' }).first().click()
    await esperar(600)
    const enlaceDemo = await page.getByText('En la demo el enlace público no se genera.').count()
    await shot('borrador-enlace-demo')
    // Recuperar: el carrito vuelve completo y el borrador sale de la lista.
    await lista.getByRole('button', { name: 'Recuperar' }).first().click()
    await esperar(1400)
    const trasRecuperar = await page.locator('[data-testid="resumen-compra"]').innerText().catch(() => '')
    await shot('borrador-recuperado')
    return `aviso: "${aviso.slice(0, 90)}" · filas con la etiqueta: ${filas} · enlace demo avisa: ${Boolean(enlaceDemo)} · carrito recuperado: ${trasRecuperar.replace(/\s+/g, ' ').slice(0, 120)}`
  })

  // ── Split: pago parcial + Dividir saldo ──────────────────────────────
  await paso('split: parcial con dividir saldo y segundo medio', async () => {
    await agregarPago('Caja · Guaraníes', 3000000)
    const botonDividir = page.getByRole('button', { name: /Dividir saldo/ })
    const hayDividir = await botonDividir.count()
    const textoDividir = hayDividir ? await texto(botonDividir) : ''
    const parcial = await texto(principal())
    await shot('split-parcial')
    let prefill = ''
    if (hayDividir) {
      await botonDividir.first().click()
      await esperar(1100)
      prefill = await page.getByLabel('Monto original').nth(1).inputValue()
      await elegirCuentaBloque(1, 'Itaú')
    }
    const bloques = await page.getByLabel('Monto original').count()
    await shot('split-dividido')
    return `bloques: ${bloques} · «${textoDividir}» · saldo precargado: ${prefill} · botón con parcial: "${parcial}" → "${await texto(principal())}"`
  })

  // ── Entrega: delivery con costo ──────────────────────────────────────
  await paso('entrega: delivery con costo y retiro sin monto', async () => {
    await page.locator('#entrega').selectOption('Delivery')
    await esperar(600)
    await page.locator('#monto-entrega').fill('30000')
    await esperar(900)
    const conDelivery = await totalVenta()
    await shot('entrega-delivery')
    await page.locator('#entrega').selectOption('Retiro en tienda')
    await esperar(700)
    const deshabilitado = await page.locator('#monto-entrega').isDisabled()
    await shot('entrega-retiro')
    return `con delivery: ${conDelivery.slice(0, 120)} · monto deshabilitado en retiro: ${deshabilitado}`
  })

  // ── Cierre de venta: cubrir el saldo y confirmar ─────────────────────
  await paso('venta: cubrir el saldo, confirmar y vaciar el carrito', async () => {
    const botonDividir = page.getByRole('button', { name: /Dividir saldo/ })
    if (await botonDividir.count()) {
      const pendiente = Number((((await texto(botonDividir)).match(/[\d.]+/g) || []).join('').replace(/\./g, ''))) || 0
      const montos = page.getByLabel('Monto original')
      const ultimo = montos.nth((await montos.count()) - 1)
      const actual = Number(String(await ultimo.inputValue()).replace(/\D/g, '')) || 0
      if (pendiente > 0) {
        await ultimo.fill(String(actual + pendiente))
        await esperar(1100)
      }
    }
    const etiqueta = await texto(principal())
    const diaAntes = ((await totalVenta()).match(/TU DÍA[^]*$/i) || [''])[0].replace(/\s+/g, ' ')
    await shot('venta-antes-de-confirmar')
    const boton = principal()
    for (let intento = 0; intento < 25 && (await boton.isDisabled()); intento += 1) await esperar(300)
    if (await boton.isDisabled()) throw new Error(`el botón principal quedó deshabilitado con el saldo cubierto ("${etiqueta}")`)
    await boton.click()
    await esperar(3200)
    const cuerpo = await page.locator('body').innerText()
    const confirmacion = (cuerpo.match(/Venta registrada[^\n]*/) || cuerpo.match(/Cambio simulado en la demo[^\n]*/) || [''])[0]
    const notaDemo = /no se guardó en la tienda real/.test(cuerpo)
    const diaDespues = ((await totalVenta()).match(/TU DÍA[^]*$/i) || [''])[0].replace(/\s+/g, ' ')
    await shot('venta-confirmada')
    return `botón: "${etiqueta}" · confirmación: "${confirmacion.replace(/\s+/g, ' ').slice(0, 120)}" · nota demo: ${Boolean(notaDemo)} · TU DÍA: "${diaAntes}" → "${diaDespues}"`
  })

  // ── Analytics: métricas del POS (demo con datos locales) ─────────────
  await paso('analytics: métricas del POS y período', async () => {
    await page.getByRole('button', { name: 'Analytics' }).click()
    const modal = page.getByRole('dialog', { name: /Analytics del POS/ }).filter({ visible: true }).first()
    await modal.waitFor({ timeout: 15000 })
    await modal.getByText(/Ventas de hoy/i).first().waitFor({ timeout: 15000 }).catch(() => {})
    await esperar(400)
    const cuerpo = await modal.innerText()
    await shot('analytics-modal')
    let periodo7 = false
    const boton7 = modal.getByRole('tab', { name: '7 días' })
    if ((await boton7.count()) > 0) {
      await boton7.click()
      await esperar(1200)
      periodo7 = true
      await shot('analytics-7-dias')
    }
    await page.keyboard.press('Escape')
    await esperar(600)
    return `7 días: ${periodo7} · top productos: ${/Top productos/i.test(cuerpo)} · ventas por vendedor: ${/Ventas por vendedor/i.test(cuerpo)} · cobros netos por tipo: ${/Cobros netos por tipo/i.test(cuerpo)} · cobros netos por cuenta: ${/Cobros netos por cuenta/i.test(cuerpo)}`
  })

  // ── Móvil: POS con carrito accesible a 390 px ────────────────────────
  await paso('movil 390x844: POS con carrito accesible', async () => {
    const movil = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pag = await movil.newPage()
    await pag.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await pag.waitForTimeout(1200)
    await pag.getByRole('button', { name: /^(Entrar como )?Vendedor\b/ }).first().click()
    await pag.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30000 })
    await pag.waitForTimeout(2400)
    await pag.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await pag.waitForTimeout(2400)
    const desborde = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    contador += 1
    const captura = `${String(contador).padStart(2, '0')}-pos-movil.jpg`
    await pag.screenshot({ path: join(SALIDA, captura), type: 'jpeg', quality: 72 })
    capturasPaso.push(captura)
    const buscar = pag.getByPlaceholder('Buscar producto…')
    const hayBuscador = await buscar.count()
    if (hayBuscador) {
      await buscar.fill('Funda Silicona Negra')
      await pag.waitForTimeout(900)
      const opcion = pag.getByRole('option', { name: /Funda Silicona Negra/i })
      if (await opcion.count()) await opcion.first().click()
      else await pag.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'Funda Silicona Negra' }).first().click()
      await pag.waitForTimeout(1000)
    }
    contador += 1
    const captura2 = `${String(contador).padStart(2, '0')}-pos-movil-carrito.jpg`
    await pag.screenshot({ path: join(SALIDA, captura2), type: 'jpeg', quality: 72 })
    capturasPaso.push(captura2)
    const total = await pag.locator('[data-testid="resumen-compra"]').innerText().catch(() => '')
    const desborde2 = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await movil.close()
    return `desborde horizontal: ${desborde}px → ${desborde2}px · buscador: ${hayBuscador > 0} · total: ${total.replace(/\s+/g, ' ').slice(0, 110)}`
  })

  // ── Ruido de consola/red propio de la demo ───────────────────────────
  await paso('diagnostico: consola y red', async () => {
    const endpoints = {}
    for (const fila of fallosRed) {
      const clave = fila.split(' ').slice(1).join(' ').replace(BASE, '').split('?')[0]
      endpoints[clave] = (endpoints[clave] || 0) + 1
    }
    const top = Object.entries(endpoints).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([url, veces]) => `${veces}× ${url}`).join(' | ')
    const consola = {}
    for (const fila of errores) {
      const clave = fila.replace(/https?:\/\/\S+/g, 'URL').slice(0, 80)
      consola[clave] = (consola[clave] || 0) + 1
    }
    const topConsola = Object.entries(consola).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([msg, veces]) => `${veces}× ${msg}`).join(' | ')
    return `errores de consola: ${errores.length} · API ≥400: ${fallosRed.length} · pedidos fallidos: ${pedidosFallidos.length} · top endpoints: ${top} · consola: ${topConsola}`
  })
} finally {
  const resumen = {
    base: BASE,
    version: version || '(no detectada)',
    fecha: new Date().toISOString(),
    viewport: { desktop: '1440x900', movil: '390x844' },
    metodo: 'Playwright headless (chromium) sobre la demo pública',
    pasos: resultados,
    errores,
    fallosRed,
    pedidosFallidos,
  }
  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resumen, null, 2))
  await browser.close()
  const fallos = resultados.filter((r) => r.estado === 'fallo').length
  console.log(`\nVersión: ${version || '?'} · pasos: ${resultados.length} · fallos: ${fallos} · capturas: ${contador}`)
  console.log(`Salida: ${SALIDA}`)
}
