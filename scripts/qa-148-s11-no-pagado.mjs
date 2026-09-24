// Capturas de «marcar como no pagado» por bloque (#148 §11) en la demo:
// el bloque pagado, el bloque marcado como no pagado con su saldo pendiente, y
// el botón principal en modo parcial.
//
// Uso: QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=rama-148-s11 node scripts/qa-148-s11-no-pagado.mjs
// Salida: docs/qa/148-s11/no-pagado/<etiqueta>/0X-*.jpg + resultados.json
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const BASE = (process.env.QA_BASE_URL || 'https://app.moboss.online').replace(/\/$/, '')
const ETIQUETA = process.env.QA_ETIQUETA || 'post-deploy'
const SALIDA = join(process.env.QA_OUT || 'docs', 'qa', '148-s11', 'no-pagado', ETIQUETA)
mkdirSync(SALIDA, { recursive: true })

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errores = []

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 })
const page = await contexto.newPage()
page.on('pageerror', (error) => errores.push(String(error.message).slice(0, 160)))

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
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente §11')
  await page.getByPlaceholder('Buscar producto…').fill('Funda MagSafe')
  await esperar(900)
  await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: 'Funda MagSafe' }).first().click()
  await esperar(700)

  // Dos bloques: 60.000 cobrados con caja y 120.000 que no se cobran
  // (tarjeta rechazada, por ejemplo).
  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  let fila = null
  for (const monto of ['60000', '120000']) {
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    fila = pagos.getByTestId(`pago-fila-${(await pagos.getByTestId(/pago-fila/).count()) - 1}`)
    await fila.getByLabel('Cuenta de cobro').click()
    await page.getByRole('option', { name: /Caja · Guaraníes/ }).first().click()
    await esperar(800)
    await fila.getByLabel('Monto original').fill(monto)
    await page.getByText(`Equivalente: Gs ${Number(monto).toLocaleString('es-PY')}`).first().waitFor({ timeout: 10_000 })
  }
  await pagos.scrollIntoViewIfNeeded()
  await esperar(400)
  await page.screenshot({ path: join(SALIDA, '01-bloques-pagados.jpg'), type: 'jpeg', quality: 72 })

  // Se marca el segundo bloque como no pagado: no suma al cobrado y el saldo
  // queda pendiente; la venta se guarda como parcial.
  const chipPagado = await fila.getByRole('button', { name: 'Pagado' }).getAttribute('aria-pressed')
  await fila.getByRole('button', { name: 'Pagado' }).click()
  await esperar(500)
  await pagos.scrollIntoViewIfNeeded()
  await esperar(300)
  await page.screenshot({ path: join(SALIDA, '02-no-pagado.jpg'), type: 'jpeg', quality: 72 })
  // Tercera toma: los tiles del cobro y el botón parcial.
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ }).scrollIntoViewIfNeeded().catch(() => {})
  await esperar(300)
  await page.screenshot({ path: join(SALIDA, '03-parcial.jpg'), type: 'jpeg', quality: 72 })
  const pendiente = (await pagos.getByTestId('cobro-pendiente').innerText().catch(() => '')).replace(/\s+/g, ' ')
  const pagado = (await pagos.getByTestId('cobro-pagado').innerText().catch(() => '')).replace(/\s+/g, ' ')
  const boton = (await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ }).innerText().catch(() => '')).replace(/\s+/g, ' ')

  writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify({ base: BASE, etiqueta: ETIQUETA, chipPagado, pagado, pendiente, boton, errores }, null, 2))
} catch (error) {
  errores.push(String(error.message).slice(0, 300))
}

await contexto.close()
await navegador.close()
console.log(`§11 no pagado: ${errores.length ? `ERROR ${errores[0]}` : 'capturas listas'} · errores ${errores.length}`)
