// #241 · F3 paso 5: el carrito completo del POS (bloque de cobro y modales de
// venta) con el lenguaje v2, detrás del flag `preview v2`.
//
// QA antes/después: por cada vista (1280/390) y tema (claro/oscuro) se arma una
// venta con split (guaraníes + dólares con cotización) y un pago «No pagado»,
// se miden los contrastes AA reales del carrito, el cobro y los modales, y se
// dejan capturas con el flag apagado y prendido en docs/rediseno (con
// MOBOS_CAPTURAS). El default (apagado) no cambia.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { auditarContraste, informar } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const RAICES_POS = ['#pos-resumen-venta', '[data-testid="pos-cobro"]']
const RAICES_MODAL = ['[role="dialog"]']

const preparar = (page, modo, v2) =>
  page.addInitScript(({ modo, v2 }) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin storage */ }
  }, { modo, v2 })

// Cuenta USD activa (la crea la primera vez; el harness se resetea por snapshot).
async function cuentaUsd(page) {
  return page.evaluate(async ({ api }) => {
    const cuentas = await fetch(`${api}/api/payment-accounts`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
    const usd = (Array.isArray(cuentas) ? cuentas : []).find((cuenta) => cuenta.currency === 'USD' && cuenta.isActive)
    if (usd) return usd.name
    const creada = await fetch(`${api}/api/payment-accounts`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cuenta USD V2', currency: 'USD', kind: 'CASH', isActive: true, feePercent: 0 }),
    }).then((r) => r.json()).catch(() => null)
    return creada?.name || 'Cuenta USD V2'
  }, { api: API })
}

// Elige la cuenta del combobox de una fila: abre, espera la lista del propio
// combobox (`aria-controls`, para no cruzar opciones con otra fila), filtra
// escribiendo y elige la opción. Reintenta hasta ver el efecto: bajo carga el
// primer clic puede perderse en el fetch de cuentas o en un re-render de la fila.
async function elegirCuenta(page, fila, nombre, verificar) {
  const combo = fila.getByLabel('Cuenta de cobro')
  await expect(async () => {
    await combo.click()
    await expect(combo).toHaveAttribute('aria-expanded', 'true')
    await combo.fill(nombre)
    const listaId = await combo.getAttribute('aria-controls')
    const opcion = page.locator(`[id="${listaId}"]`).getByRole('option', { name: new RegExp(nombre) })
    await expect(opcion).toBeVisible({ timeout: 3_000 })
    await opcion.click()
    await verificar()
  }).toPass({ timeout: 20_000 })
}

async function armarCobro(page, sufijo) {
  await page.goto('/pos')
  // La lista de cuentas del POS se hidrata al montar: la cuenta USD se crea
  // antes de armar la venta y se recarga para que el desplegable la tenga.
  const usd = await cuentaUsd(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente V2 ${sufijo}`)
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  await page.getByRole('button', { name: new RegExp(SEED.products.funda.name) }).click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  // Split: 25.000 cobrados y 10 USD @ 5.500 (55.000) que cubren la funda de
  // 80.000; el bloque en dólares se marca «No pagado».
  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const filaUno = pagos.getByTestId('pago-fila-0')
  await elegirCuenta(page, filaUno, 'Caja E2E', () => expect(filaUno.getByLabel('Cuenta de cobro')).toHaveValue(/Caja E2E/))
  await filaUno.getByLabel('Monto original').fill('25000')
  await page.getByRole('button', { name: /^Dividir saldo/ }).click()
  const filaDos = pagos.getByTestId('pago-fila-1')
  await elegirCuenta(page, filaDos, usd, () => expect(filaDos.getByLabel(/^Cotización/)).toBeVisible())
  await filaDos.getByLabel(/^Cotización/).fill('5500')
  await filaDos.getByLabel('Monto original').fill('10')
  // El chip pasa a «No pagado» (idempotente: si el clic se pierde en un
  // re-render, reintenta sin volver a togglear).
  await expect(async () => {
    const chip = filaDos.getByRole('button', { name: 'Pagado' })
    if (await chip.count()) await chip.click()
    await expect(filaDos.getByRole('button', { name: 'No pagado' })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded()
}

async function vaciarCarrito(page) {
  const vaciar = page.getByRole('button', { name: 'Vaciar carrito' })
  if (await vaciar.count()) {
    await vaciar.click()
    await expect(page.getByText('Todavía no agregaste productos.')).toBeVisible()
  }
}

for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    test(`${vista} ${tema}: el carrito completo v2 cumple AA y el default no cambia (#241 paso 5)`, async ({ page }) => {
      test.setTimeout(180_000)
      mkdirSync(SHOTS, { recursive: true })
      await page.setViewportSize({ width: ancho, height: alto })

      for (const v2 of [false, true]) {
        const sufijo = `${vista}-${tema}-v2${v2 ? 'on' : 'off'}`
        await preparar(page, modo, v2)
        await armarCobro(page, sufijo)
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-cobro.png` })

        // Carrito + bloque de cobro: AA exigido con el flag prendido; con el
        // flag apagado se informa (default actual del producto).
        const cobro = await auditarContraste(page, RAICES_POS, RAICES_MODAL)
        informar(`pos-${sufijo}-cobro`, cobro)
        if (v2) expect(cobro.bajos, `AA del carrito/cobro v2 (${tema} ${vista})`).toEqual([])

        // Pago completo: el botón «Confirmar venta» (variante success) también
        // tiene que cumplir AA en los dos temas.
        // El chip puede no estar renderizado todavía (la fila se asienta tras
        // los fills): se reintenta clickearlo hasta que aparezca el botón.
        await expect(async () => {
          const chip = page.getByTestId('pago-fila-1').getByRole('button', { name: 'No pagado' })
          if (await chip.count()) await chip.click()
          await expect(page.getByRole('button', { name: /^Confirmar venta/ })).toBeVisible({ timeout: 3000 })
        }).toPass({ timeout: 20_000 })
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-cobro-completo.png` })
        const cobroCompleto = await auditarContraste(page, RAICES_POS, RAICES_MODAL)
        informar(`pos-${sufijo}-cobro-completo`, cobroCompleto)
        if (v2) expect(cobroCompleto.bajos, `AA del pago completo v2 (${tema} ${vista})`).toEqual([])
        // Vuelve a «No pagado» para el resto del QA (chips y modales); mismo
        // reintento idempotente hasta ver el chip en su estado.
        await expect(async () => {
          const chip = page.getByTestId('pago-fila-1').getByRole('button', { name: 'Pagado' })
          if (await chip.count()) await chip.click()
          await expect(page.getByTestId('pago-fila-1').getByRole('button', { name: 'No pagado' })).toBeVisible({ timeout: 3_000 })
        }).toPass({ timeout: 20_000 })

        // Confirmación compartida (ConfirmDialog al eliminar una línea con
        // descuento): se informa su contraste, no se exige (el botón y el modal
        // son de la biblioteca, dominio CMP).
        await page.locator('#pos-resumen-venta').getByRole('button', { name: /^Ver detalle de / }).first().click()
        const descuento = page.locator('#pos-resumen-venta').getByLabel(/^Descuento % de /).first()
        await descuento.fill('10')
        await page.locator('#pos-resumen-venta').getByRole('button', { name: /^Ver menos detalle de / }).first().click()
        await page.locator('#pos-resumen-venta').getByRole('button', { name: /^Eliminar / }).first().click()
        const confirmacion = page.getByRole('dialog', { name: '¿Eliminar la línea?' })
        await expect(confirmacion).toBeVisible()
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-modal-confirmacion.png` })
        const contrasteConfirmacion = await auditarContraste(page, [], RAICES_MODAL)
        informar(`pos-${sufijo}-modal-confirmacion`, contrasteConfirmacion)
        await page.keyboard.press('Escape')

        // Modal «Suspender venta» (y la lista de suspendidas con el borrador).
        await page.getByRole('button', { name: 'Suspender venta' }).click()
        const suspender = page.getByRole('dialog', { name: 'Suspender venta' })
        await expect(suspender).toBeVisible()
        const etiquetaDraft = `QA v2 ${sufijo} ${Date.now().toString(36)}`
        await suspender.getByLabel('Etiqueta (opcional)').fill(etiquetaDraft)
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-modal-suspender.png` })
        const contrasteSuspender = await auditarContraste(page, RAICES_MODAL, [])
        informar(`pos-${sufijo}-modal-suspender`, contrasteSuspender)
        if (v2) expect(contrasteSuspender.bajos, `AA del modal suspender v2 (${tema} ${vista})`).toEqual([])
        await suspender.getByRole('button', { name: 'Suspender venta' }).click()
        await expect(page.getByText(/Venta suspendida/)).toBeVisible({ timeout: 15_000 })

        await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
        const suspendidas = page.getByRole('dialog', { name: 'Ventas suspendidas' })
        await expect(suspendidas.getByText(etiquetaDraft).first()).toBeVisible({ timeout: 10_000 })
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-modal-suspendidas.png` })
        const contrasteSuspendidas = await auditarContraste(page, RAICES_MODAL, [])
        informar(`pos-${sufijo}-modal-suspendidas`, contrasteSuspendidas)
        if (v2) expect(contrasteSuspendidas.bajos, `AA del modal suspendidas v2 (${tema} ${vista})`).toEqual([])
        await page.keyboard.press('Escape')

        // Modal «Producto escaneado»: el lector escribe el código como teclado.
        await page.getByPlaceholder('Buscar producto…').fill(`MOBOS:PROD:${SEED.products.cable.sku}`)
        const escaner = page.getByRole('dialog', { name: 'Producto escaneado' })
        await expect(escaner).toBeVisible({ timeout: 10_000 })
        await page.screenshot({ path: `${SHOTS}/c241f3p5-${sufijo}-modal-escaner.png` })
        const contrasteEscaner = await auditarContraste(page, RAICES_MODAL, [])
        informar(`pos-${sufijo}-modal-escaner`, contrasteEscaner)
        if (v2) expect(contrasteEscaner.bajos, `AA del modal escáner v2 (${tema} ${vista})`).toEqual([])
        await escaner.getByRole('button', { name: 'Cancelar' }).click()

        await vaciarCarrito(page)
      }
    })
  }
}
