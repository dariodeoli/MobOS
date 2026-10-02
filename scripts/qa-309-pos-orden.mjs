// #309 · Capturas del POS (orden de trabajo, densidad y feedback): el catálogo
// antes del cliente, la ficha elegida en una línea, el carrito fijo con el
// total único, la barra fija del celular (Total + acción) y las herramientas
// bajo «Más». Corre sobre la demo en claro/oscuro y desktop/mobile; el «antes»
// sale de producción y el «después» de la rama.
//
// Uso: QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-309 node scripts/qa-309-pos-orden.mjs
// Salida: docs/qa/309/<etiqueta>/<vista>-<tema>-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/309', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const TODAS = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'dark' },
]
const VARIANTES = TODAS.filter((v) => !process.env.QA_VARIANTE || v.nombre === process.env.QA_VARIANTE)

const ESPERA = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RUTA_RESULTADOS = join(SALIDA, 'resultados.json')
let previos = []
try { previos = JSON.parse(readFileSync(RUTA_RESULTADOS, 'utf8')).resultados || [] } catch { previos = [] }
const resultados = []
const navegador = await chromium.launch()

// Posición/estilo de un elemento (por id o data-testid).
async function medida(page, selector) {
  const loc = page.locator(selector.startsWith('#') ? selector : `[data-testid="${selector}"]`).first()
  if (!(await loc.count())) return null
  return loc.evaluate((el) => {
    const vista = el.ownerDocument.defaultView
    const r = el.getBoundingClientRect()
    return {
      y: Math.round(r.y + vista.scrollY),
      position: vista.getComputedStyle(el).position,
      display: vista.getComputedStyle(el).display,
      texto: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 200),
    }
  })
}

for (const variante of VARIANTES) {
  const contexto = await navegador.newContext({
    viewport: { width: variante.ancho, height: variante.alto },
    deviceScaleFactor: 2,
  })
  await contexto.addInitScript(({ tema }) => {
    try { if (tema) localStorage.setItem('mobos:theme', tema) } catch { /* sin storage */ }
  }, { tema: variante.tema })
  const page = await contexto.newPage()
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))
  const pasos = []
  const captura = (sufijo) => page.screenshot({ path: join(SALIDA, `${variante.nombre}-${sufijo}.jpg`), type: 'jpeg', quality: 74 })

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await ESPERA(1400)
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).first().click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await ESPERA(2000)
    const entendido = page.getByRole('button', { name: 'Entendido' })
    if (await entendido.count()) await entendido.click().catch(() => {})

    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await ESPERA(1200)

    // 1) Arranque: catálogo y búsqueda antes del cliente.
    await captura('01-arranque')
    const productos = await medida(page, 'pos-bloque-productos')
    const cliente = await medida(page, 'pos-bloque-cliente')
    pasos.push(`orden: productos ${productos?.y} · cliente ${cliente?.y} → ${productos && cliente && productos.y < cliente.y ? 'productos primero' : 'revisar'}`)

    // 2) Cliente elegido (la ficha se liga sola por nombre exacto).
    const buscador = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
    await buscador.fill('Lucía Fernández')
    await ESPERA(1200)
    const elegido = await medida(page, 'cliente-elegido')
    if (!elegido) {
      // Fallback: elegir de las sugerencias.
      const sugerencia = page.getByRole('button', { name: /Lucía Fernández/ }).first()
      if (await sugerencia.count()) { await sugerencia.click(); await ESPERA(800) }
    }
    const elegido2 = await medida(page, 'cliente-elegido')
    pasos.push(`cliente en una línea: ${elegido2 ? 'sí' : 'no'}`)

    // 3) Carrito con un producto: fijo, con el total único.
    const buscar = page.getByPlaceholder('Buscar producto…')
    await buscar.fill('Funda MagSafe')
    await ESPERA(800)
    const tarjeta = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'Funda MagSafe' }).first()
    if (await tarjeta.count()) { await tarjeta.click(); await ESPERA(800) }
    const cart = await medida(page, '#pos-resumen-venta')
    const total = await medida(page, 'carrito-total')
    const franja = await medida(page, 'resumen-compra')
    pasos.push(`carrito: ${cart?.position} · total ${total?.texto || '—'} · franja ${franja?.texto ? (franja.texto.includes('Gs') ? 'con importe' : 'sin importe') : '—'}`)
    await page.getByTestId('resumen-compra').scrollIntoViewIfNeeded().catch(() => {})
    await ESPERA(300)
    await captura('02-carrito')

    // 4) Barra del celular (Total + acción fijos) y menú «Más».
    const barra = await medida(page, 'pos-barra-accion')
    pasos.push(`barra de acción: ${barra ? `${barra.position} (${barra.display}) · ${barra.texto.slice(0, 60)}` : 'no existe'}`)
    if (barra && barra.display !== 'none') {
      await captura('03-barra-movil')
    }
    const mas = page.getByTestId('pos-mas')
    if (await mas.count()) {
      await mas.click()
      await ESPERA(500)
      await captura('04-mas')
      const items = await page.locator('[role="menu"] [role="menuitem"]').evaluateAll((botones) => botones.map((b) => b.textContent.trim()))
      pasos.push(`«Más»: ${items.join(' · ')}`)
    } else {
      pasos.push('«Más»: no existe (versión anterior)')
    }

    // 5) #308 · Venta segura: sin productos no se cobra.
    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await ESPERA(1200)
    const agregarPago = page.getByRole('button', { name: '+ Agregar pago' })
    const canjear = page.getByRole('button', { name: '+ Canjear gift card' })
    const sinProductos = {
      agregarPagoDeshabilitado: await agregarPago.isDisabled().catch(() => null),
      canjearDeshabilitado: await canjear.isDisabled().catch(() => null),
      aviso: await medida(page, 'cobro-sin-productos'),
    }
    pasos.push(`sin productos: pago ${sinProductos.agregarPagoDeshabilitado === true ? 'bloqueado' : 'habilitado'} · gift card ${sinProductos.canjearDeshabilitado === true ? 'bloqueada' : 'habilitada'}`)
    await captura('05-sin-productos')

    // 6) #308 · Variante obligatoria: la familia pide elegir antes de sumar.
    await buscar.fill('Protector 17 Pro Max')
    await ESPERA(900)
    const familia = page.getByRole('button', { name: /Protector 17 Pro Max/ }).first()
    let selectorVariante = null
    if (await familia.count()) {
      await familia.click()
      await ESPERA(700)
      const opciones = page.getByTestId('variante-opcion')
      selectorVariante = {
        visible: await page.getByTestId('selector-variante').isVisible().catch(() => false),
        opciones: await opciones.count(),
      }
      pasos.push(`variantes: ${selectorVariante.visible ? `${selectorVariante.opciones} opciones` : 'sin selector'}`)
      if (selectorVariante.visible) {
        await captura('06-variantes')
        await opciones.first().click()
        await ESPERA(700)
      }
    }

    // 7) #308 · El selector de IMEI no cierra sin decisión.
    const fila = page.locator('#pos-resumen-venta [data-estado="falta-imei"]').first()
    let imeiBloqueado = null
    if (await fila.count()) {
      await fila.getByRole('button', { name: /^(Elegir|Cambiar) IMEI de / }).click()
      await ESPERA(700)
      const dialogo = page.getByRole('dialog', { name: /Elegir IMEI/ })
      imeiBloqueado = {
        listoDeshabilitado: await dialogo.getByRole('button', { name: 'Listo' }).isDisabled().catch(() => null),
        aviso: await dialogo.getByTestId('imei-falta-eleccion').isVisible().catch(() => false),
      }
      pasos.push(`IMEI: Listo ${imeiBloqueado.listoDeshabilitado === true ? 'bloqueado sin decisión' : 'habilitado'}`)
      await captura('07-imei-bloqueado')
      await page.keyboard.press('Escape')
    }

    resultados.push({
      variante: variante.nombre,
      pasos,
      medidas: { productos, cliente, elegido: elegido2, cart, total, franja, barra, sinProductos, selectorVariante, imeiBloqueado },
      errores,
    })
  } catch (error) {
    errores.push(`sonda: ${String(error.message).slice(0, 220)}`)
    const previa = previos.find((r) => r.variante === variante.nombre)
    if (previa?.medidas) resultados.push({ ...previa, intentos: [...(previa.intentos || []), { etiqueta: ETIQUETA, errores }] })
    else resultados.push({ variante: variante.nombre, pasos, errores })
  }
  await contexto.close()
}

await navegador.close()
const orden = TODAS.map((v) => v.nombre)
const nombres = [...new Set([...previos.map((r) => r.variante), ...resultados.map((r) => r.variante)])]
const mezcla = nombres
  .map((nombre) => resultados.find((r) => r.variante === nombre) || previos.find((r) => r.variante === nombre))
  .sort((a, b) => orden.indexOf(a.variante) - orden.indexOf(b.variante))
writeFileSync(RUTA_RESULTADOS, JSON.stringify({ base: BASE, etiqueta: ETIQUETA, resultados: mezcla }, null, 2))
for (const fila of mezcla) {
  console.log(`${fila.variante}: ${(fila.pasos || []).join(' · ')} · errores ${fila.errores.length}`)
}
