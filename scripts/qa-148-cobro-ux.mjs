// #148 §5/§11 · Capturas del cobro (UX): cápsula de la cuenta elegida (banco,
// titular, número, moneda y saldo si aplica), monto grande que no se corta,
// botón principal ordenado con el naranja del pago parcial y resumen «Total de
// esta venta» sólido con el botón arriba. Corre sobre la demo en claro/oscuro y
// desktop/mobile; el «antes» sale de producción y el «después» de la rama.
//
// Uso: QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=rama-148-cobro node scripts/qa-148-cobro-ux.mjs
// Salida: docs/qa/148-s11/cobro-ux/<etiqueta>/<vista>-<tema>-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/qa/148-s11/cobro-ux', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const TODAS = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'dark' },
]
// QA_VARIANTE=desktop-oscuro reintenta una sola vista (red inestable).
const VARIANTES = TODAS.filter((v) => !process.env.QA_VARIANTE || v.nombre === process.env.QA_VARIANTE)

const ESPERA = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// El resultados.json se completa por variante (upsert): correr una sola vista
// con QA_VARIANTE reintenta esa captura sin borrar las otras. Si la corrida
// nueva falla y había una medición previa, se conserva y se anota el intento.
const RUTA_RESULTADOS = join(SALIDA, 'resultados.json')
let previos = []
try { previos = JSON.parse(readFileSync(RUTA_RESULTADOS, 'utf8')).resultados || [] } catch { previos = [] }
const resultados = []
const navegador = await chromium.launch()

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
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await ESPERA(2200)
    const entendido = page.getByRole('button', { name: 'Entendido' })
    if (await entendido.count()) await entendido.click().catch(() => {})

    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await ESPERA(1200)
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente cobro QA')
    const buscar = page.getByPlaceholder('Buscar producto…')
    for (const producto of ['Funda MagSafe', 'Cargador USB-C']) {
      await buscar.fill(producto)
      await ESPERA(800)
      const tarjeta = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: producto }).first()
      if (await tarjeta.count()) { await tarjeta.click(); await ESPERA(700); pasos.push(`producto: ${producto}`) }
      else pasos.push(`sin producto: ${producto}`)
    }

    // Pago con una cuenta bancaria: cápsula + monto parcial.
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    await ESPERA(600)
    const fila = page.getByTestId('pago-fila-0')
    await fila.getByLabel('Cuenta de cobro').click()
    await ESPERA(500)
    const opcion = page.getByRole('option', { name: /Itaú · Cuenta corriente/ }).first()
    if (await opcion.count()) { await opcion.click(); pasos.push('cuenta: Itaú · Cuenta corriente') }
    else pasos.push('cuenta: sin opción bancaria')
    await ESPERA(800)
    await fila.getByLabel('Monto original').fill('100000')
    await ESPERA(700)

    // 1) Cápsula con saldo pendiente + botón de pedido parcial (naranja).
    await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded().catch(() => {})
    await ESPERA(400)
    await captura('01-capsula-parcial')
    // 2) Monto grande: entra completo.
    await fila.getByLabel('Monto original').fill('99000000000').catch(() => {})
    await ESPERA(600)
    await captura('02-monto-grande')
    const medidaMonto = await page.getByLabel('Monto original').evaluate((input) => {
      const vista = input.ownerDocument.defaultView
      const cs = vista.getComputedStyle(input)
      const ctx = input.ownerDocument.createElement('canvas').getContext('2d')
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      return {
        largo: ctx.measureText(input.value).width,
        disponible: input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      }
    }).catch(() => null)
    // 3) Pago completo: botón verde ordenado.
    const total = await page.getByTestId('resumen-compra').innerText().catch(() => '')
    const monto = (total.match(/Gs ([\d.]+)/) || [])[1] || ''
    await fila.getByLabel('Monto original').fill('0').catch(() => {})
    await ESPERA(300)
    const cuentas = (await page.getByTestId('resumen-compra').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)
    if (cuentas) pasos.push(`resumen: ${cuentas}`)
    if (monto) await fila.getByLabel('Monto original').fill(monto.replace(/\./g, '')).catch(() => {})
    await ESPERA(700)
    await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded().catch(() => {})
    await captura('03-boton-completo')

    // 4) Resumen sólido y orden (botón arriba, resumen abajo) al pie.
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)').catch(() => {})
    await ESPERA(500)
    await captura('04-resumen')

    const capsula = page.getByTestId('cuenta-capsula')
    const saldo = page.getByTestId('cuenta-capsula-saldo')
    const resumen = page.getByTestId('resumen-compra')
    const boton = page.locator('button[type="submit"]').filter({ hasText: /Crear pedido|Confirmar venta|Guardar pedido/ }).first()
    const hayCapsula = await capsula.count()
    const haySaldo = await saldo.count()
    const hayResumen = await resumen.count()
    const hayBoton = await boton.count()
    const estilo = hayResumen ? await resumen.evaluate((el) => {
      const cs = el.ownerDocument.defaultView.getComputedStyle(el)
      return { fondo: cs.backgroundColor, imagen: cs.backgroundImage }
    }) : null
    const cajaBoton = hayBoton ? await boton.boundingBox() : null
    const cajaResumen = hayResumen ? await resumen.boundingBox() : null
    const ancho = await page.evaluate('({ scroll: document.documentElement.scrollWidth, vista: document.documentElement.clientWidth })')
    const medicion = {
      capsula: hayCapsula ? (await capsula.innerText()).replace(/\s+/g, ' ').slice(0, 200) : null,
      saldo: haySaldo ? (await saldo.innerText()).replace(/\s+/g, ' ') : null,
      resumenFondo: estilo?.fondo || null,
      resumenImagen: estilo?.imagen || null,
      boton: cajaBoton ? {
        texto: (await boton.innerText()).replace(/\s+/g, ' ').trim(),
        alto: Math.round(cajaBoton.height),
        fondo: await boton.evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).backgroundColor),
      } : null,
      orden: cajaBoton && cajaResumen ? (cajaBoton.y < cajaResumen.y ? 'botón arriba' : 'resumen arriba') : null,
      scrollAncho: ancho.scroll,
      vista: ancho.vista,
    }
    pasos.push(`medida monto: ${medidaMonto ? `${Math.round(medidaMonto.largo)}px en ${Math.round(medidaMonto.disponible)}px` : 'sin campo'}`)
    resultados.push({ variante: variante.nombre, pasos, medicion, errores })
  } catch (error) {
    errores.push(`sonda: ${String(error.message).slice(0, 220)}`)
    const previa = previos.find((r) => r.variante === variante.nombre)
    if (previa?.medicion) resultados.push({ ...previa, intentos: [...(previa.intentos || []), { etiqueta: ETIQUETA, errores }] })
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
  const m = fila.medicion || {}
  console.log(`${fila.variante}: cápsula ${m.capsula ? 'sí' : 'no'} · saldo ${m.saldo || '—'} · resumen ${m.resumenFondo || '—'} ${m.resumenImagen === 'none' ? '(sin degradado)' : `(${m.resumenImagen})`} · botón ${m.boton ? `${m.boton.alto}px ${m.boton.fondo}` : '—'} · orden ${m.orden || '—'} · overflow ${m.scrollAncho === m.vista ? 'no' : `sí (${m.scrollAncho}>${m.vista})`} · errores ${fila.errores.length}`)
}
