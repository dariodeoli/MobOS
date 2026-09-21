// Finanzas → Conciliación (#199): ingresos por cuenta/procesadora, lote de un
// depósito contra los pagos que cubre, diferencia con observación y
// trazabilidad hasta el pedido, contra datos reales del arnés.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearCuentaYPago(page, { sufijo, kind, processor, amount }) {
  return page.evaluate(async ({ api, sufijo, kind, processor, amount }) => {
    const post = async (path, body) => {
      const respuesta = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
    }
    // Producto propio del test: no depende del stock que dejen otras specs.
    const producto = await post('/api/products', { name: `QA Conciliación ${sufijo}`, sku: `QA-CONC-${sufijo}`, pricePyg: amount, stock: 5 })
    const cuenta = await post('/api/payment-accounts', {
      name: `QA Conciliación ${kind} ${sufijo}`,
      kind,
      currency: 'PYG',
      ...(kind === 'TRANSFER' ? { bank: 'Banco QA', holder: 'Titular QA', accountNumber: `QA-${sufijo}` } : {}),
      ...(processor ? { processor } : {}),
    })
    const orden = await post('/api/orders', {
      items: [{ productId: producto.data.id, description: producto.data.name, quantity: 1, unitPricePyg: producto.data.pricePyg }],
      payments: [{ accountId: cuenta.data.id, originalAmount: String(amount), exchangeRatePyg: '1', amountPyg: amount, method: kind, status: 'CONFIRMED', reference: `CONC-${sufijo}` }],
    })
    return { cuenta: cuenta.data, orden: orden.data, status: orden.status, cuentaStatus: cuenta.status, productoStatus: producto.status }
  }, { api: API, sufijo, kind, processor, amount })
}

test.describe('finanzas · conciliación', () => {
  test('ingresos por procesadora y lote con diferencia y trazabilidad', async ({ page }) => {
    // Primero una página de la app: el fetch con cookies sale del mismo origen.
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const pago = await crearCuentaYPago(page, { sufijo, kind: 'CARD', processor: 'Bancard', amount: 250000 })
    expect(pago.status).toBe(201)
    const numero = pago.orden.orderNumber

    await page.goto('/finanzas/conciliacion?rango=hoy')
    await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible()

    // Filtro por procesadora: aparece Bancard con el pago recién creado.
    await page.getByLabel('Procesadora').selectOption({ label: 'Bancard' })
    const fila = page.getByTestId('conciliacion-fila').filter({ hasText: numero })
    await expect(fila).toBeVisible()
    await expect(fila.getByText('Bancard')).toBeVisible()
    await expect(fila.getByText('Por conciliar')).toBeVisible()

    // Diferencia sin observación: el botón queda bloqueado.
    await fila.getByRole('checkbox').check()
    await page.getByLabel('Monto recibido').fill('240000')
    await expect(page.getByRole('button', { name: 'Conciliar lote' })).toBeDisabled()

    // Con observación: el lote queda "Con diferencia".
    await page.getByPlaceholder('Ej. la procesadora retuvo la comisión del lote').fill('Comisión de la procesadora')
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    await expect(page.getByText(/Lote conciliado/)).toBeVisible()
    await expect(page.getByTestId('conciliacion-lote').first().getByText('Con diferencia')).toBeVisible()
    await expect(page.getByTestId('conciliacion-lote').first().getByText('Comisión de la procesadora')).toBeVisible()
    await expect(fila.getByText('Conciliado')).toBeVisible()

    // Trazabilidad: "Ver pedido" abre el detalle con sus pagos.
    await fila.getByRole('button', { name: 'Ver pedido' }).click()
    await expect(page.getByText(`Pagos · ${numero}`)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('un lote no puede mezclar cuentas', async ({ page }) => {
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const uno = await crearCuentaYPago(page, { sufijo: `${sufijo}A`, kind: 'TRANSFER', amount: 150000 })
    const dos = await crearCuentaYPago(page, { sufijo: `${sufijo}B`, kind: 'TRANSFER', amount: 160000 })
    expect(uno.status, JSON.stringify({ producto: uno.productoStatus, cuenta: uno.cuentaStatus, orden: uno.orden })).toBe(201)
    expect(dos.status, JSON.stringify({ producto: dos.productoStatus, cuenta: dos.cuentaStatus, orden: dos.orden })).toBe(201)

    await page.goto('/finanzas/conciliacion?rango=hoy')
    const filaUno = page.getByTestId('conciliacion-fila').filter({ hasText: uno.orden.orderNumber })
    const filaDos = page.getByTestId('conciliacion-fila').filter({ hasText: dos.orden.orderNumber })
    await expect(filaUno).toBeVisible()
    await expect(filaDos).toBeVisible()
    await filaUno.getByRole('checkbox').check()
    await filaDos.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    // El servidor rechaza el lote mixto y el error queda visible.
    await expect(page.getByText(/misma cuenta/)).toBeVisible()
  })
})
