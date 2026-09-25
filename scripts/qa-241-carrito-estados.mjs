// #241/#148 · Capturas de los estados del carrito (fila y bloque de cobro):
// listo, falta IMEI, reservado, descuento, cupón, agotado/sobre pedido y
// pagado / no pagado. Corre sobre la demo (ficticia) en claro/oscuro y
// desktop/mobile; el «antes» sale de producción y el «después» de la rama.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.163-produccion node scripts/qa-241-carrito-estados.mjs
// Salida: docs/rediseno/c241f3p5-estados-<etiqueta>/<vista>-<tema>-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs/rediseno', `c241f3p5-estados-${ETIQUETA}`)
mkdirSync(SALIDA, { recursive: true })

const VARIANTES = [
  { nombre: 'desktop-claro', ancho: 1280, alto: 900, tema: null },
  { nombre: 'desktop-oscuro', ancho: 1280, alto: 900, tema: 'dark' },
  { nombre: 'movil-claro', ancho: 390, alto: 844, tema: null },
  { nombre: 'movil-oscuro', ancho: 390, alto: 844, tema: 'dark' },
]

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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

  try {
    await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
    await esperar(1400)
    await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
    await esperar(2200)
    const guia = page.getByRole('button', { name: 'Entendido' })
    if (await guia.count()) await guia.click().catch(() => {})

    await page.goto(`${BASE}/pos`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Buscar producto…').waitFor({ timeout: 25_000 })
    await esperar(1200)
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente estados QA')

    const buscar = page.getByPlaceholder('Buscar producto…')
    const agregar = async (nombre) => {
      for (let intento = 0; intento < 10; intento += 1) {
        await buscar.fill(nombre)
        await esperar(800)
        const tarjeta = page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: nombre }).first()
        if (await tarjeta.count()) { await tarjeta.click(); await esperar(700); return true }
      }
      return false
    }
    const carrito = page.locator('#pos-resumen-venta')
    const filaDe = (nombre) => carrito.locator('.divide-y > div').filter({ hasText: nombre })

    // 1) Accesorio: línea lista.
    await agregar('Funda MagSafe')
    // 2) Equipo serializado: falta IMEI → reserva (si la demo lista unidades).
    await agregar('iPhone 15 Pro Max')
    const filaIphone = filaDe('iPhone 15 Pro Max').first()
    await filaIphone.getByRole('button', { name: /^(Elegir|Cambiar) IMEI de / }).click()
    const dialogo = page.getByRole('dialog', { name: /Elegir IMEI/ })
    const reservar = dialogo.getByRole('button', { name: 'Reservar este' }).first()
    if (await reservar.count()) {
      await reservar.click()
      await esperar(500)
      pasos.push('reserva: sí')
    } else {
      pasos.push('reserva: no (sin unidades en este entorno)')
    }
    await dialogo.getByRole('button', { name: 'Listo' }).click()
    await esperar(400)

    // 3) Descuento de línea en el accesorio (chip ámbar) y cupón DEMO10 en el equipo.
    const filaFunda = filaDe('Funda MagSafe').first()
    await filaFunda.getByRole('button', { name: /^Ver detalle de / }).click()
    await filaFunda.getByLabel(/^Descuento % de /).fill('10')
    await esperar(400)
    await filaFunda.getByRole('button', { name: /^Ver menos detalle de / }).click()
    await esperar(300)
    await filaIphone.getByRole('button', { name: /^Ver detalle de / }).click()
    await filaIphone.getByRole('button', { name: /^(Aplicar|Cambiar) cupón$/ }).click()
    await filaIphone.getByLabel(/^Código de cupón de /).fill('DEMO10')
    await filaIphone.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await esperar(700)
    await filaIphone.getByRole('button', { name: /^Ver menos detalle de / }).click()
    await esperar(300)

    // 4) Cobro: un bloque pagado y otro no pagado.
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
    await pagos.getByLabel('Cuenta de cobro').first().click()
    await page.getByRole('option', { name: /Caja · Guaraníes/ }).first().click()
    await esperar(600)
    await pagos.getByLabel('Monto original').first().fill('300000')
    await esperar(400)
    const dividir = page.getByRole('button', { name: /^Dividir saldo/ })
    if (await dividir.count()) {
      await dividir.click()
      await esperar(500)
      const filaDos = pagos.getByTestId('pago-fila-1')
      await filaDos.getByRole('button', { name: 'Pagado' }).click()
      await esperar(400)
    }

    // Capturas: el carrito (estados de fila) y el cobro (estados de bloque).
    await carrito.scrollIntoViewIfNeeded()
    await esperar(400)
    await page.screenshot({ path: join(SALIDA, `${variante.nombre}-01-carrito.jpg`), type: 'jpeg', quality: 72 })
    await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded()
    await esperar(400)
    await page.screenshot({ path: join(SALIDA, `${variante.nombre}-02-cobro.jpg`), type: 'jpeg', quality: 72 })

    const estadosFilas = await carrito.locator('.divide-y > div').evaluateAll((filas) => filas.map((fila) => fila.dataset.estado || '—'))
    const estadosPagos = await page.getByTestId('pos-cobro').locator('[data-testid^="pago-fila-"]').evaluateAll((filas) => filas.map((fila) => fila.dataset.estado || '—'))
    const chips = await carrito.locator('[data-testid^="linea-"]').evaluateAll((chips2) => chips2.map((chip) => `${chip.dataset.testid}:${(chip.textContent || '').trim().slice(0, 18)}`))
    resultados.push({ variante: variante.nombre, pasos, estadosFilas, estadosPagos, chips, errores })
  } catch (error) {
    errores.push(`sonda: ${String(error.message).slice(0, 220)}`)
    resultados.push({ variante: variante.nombre, pasos, errores })
  }
  await contexto.close()
}

await navegador.close()
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, resultados }, null, 2))
for (const fila of resultados) {
  console.log(`${fila.variante}: filas ${JSON.stringify(fila.estadosFilas || [])} · pagos ${JSON.stringify(fila.estadosPagos || [])} · chips ${JSON.stringify(fila.chips || [])} · ${(fila.pasos || []).join(' · ')} · errores ${fila.errores.length}`)
}
