// Finanzas → Caja (#199): turno con cobro en efectivo, auditoría del rango y
// cierre con arqueo, contra datos reales del arnés. Deja la caja abierta con
// la apertura de 100.000 como la espera `admin.spec.js`.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearCobroEfectivo(page, sufijo) {
  return page.evaluate(async ({ api, sufijo }) => {
    const post = async (path, body) => {
      const respuesta = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
    }
    // Producto propio del test: no depende del stock que dejen otras specs.
    const producto = await post('/api/products', { name: `QA Caja ${sufijo}`, sku: `QA-CAJA-${sufijo}`, pricePyg: 250000, stock: 5 })
    const orden = await post('/api/orders', {
      items: [{ productId: producto.data.id, description: producto.data.name, quantity: 1, unitPricePyg: producto.data.pricePyg }],
      payments: [{ method: 'CASH', amountPyg: producto.data.pricePyg, status: 'CONFIRMED', reference: `CAJA-${sufijo}` }],
    })
    return { status: orden.status, orden: orden.data }
  }, { api: API, sufijo })
}
test.describe('finanzas · caja', () => {
  test('el efectivo cobrado se audita y el cierre calcula la diferencia', async ({ page }) => {
    // Primero una página de la app: el fetch con cookies sale del mismo origen.
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const cobro = await crearCobroEfectivo(page, sufijo)
    expect(cobro.status, JSON.stringify(cobro.orden)).toBe(201)
    const numero = cobro.orden.orderNumber

    await page.goto('/finanzas/caja')
    await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()

    // La sesión puede venir abierta (admin.spec) o cerrada (otra corrida):
    // se espera el estado y se abre solo si hace falta.
    await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible()
    if (await page.getByRole('heading', { name: 'Abrir caja' }).count()) {
      await page.locator('#opening').fill('100000')
      await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    }
    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()

    // El cobro entra en "Auditoría de medios" (efectivo) y en la auditoría del rango.
    await page.getByText('Entradas por medio de pago').scrollIntoViewIfNeeded()
    await expect(page.getByText(/Efectivo/).first()).toBeVisible()

    const filaCobro = page.getByTestId('auditoria-fila').filter({ hasText: numero })
    await expect(filaCobro).toBeVisible()
    const estadoSelect = filaCobro.getByRole('combobox')
    await estadoSelect.selectOption('VERIFIED')
    await expect(estadoSelect).toHaveValue('VERIFIED')
    const guardar = filaCobro.getByRole('button', { name: 'Guardar' })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    // El badge es un span; la opción del selector tiene el mismo texto.
    const badgeVerificado = filaCobro.locator('span').filter({ hasText: /^Verificado$/ }).first()
    await expect(badgeVerificado).toBeVisible()

    // Persistencia de la marca: al recargar sigue verificada.
    await page.reload()
    const filaRecargada = page.getByTestId('auditoria-fila').filter({ hasText: numero })
    await expect(filaRecargada.locator('span').filter({ hasText: /^Verificado$/ }).first()).toBeVisible()

    // Cierre con el esperado exacto: diferencia 0 y estado "Cerrada".
    const esperado = await page.evaluate(async (api) => {
      const respuesta = await fetch(`${api}/api/cash`, { credentials: 'include' })
      const data = await respuesta.json()
      return Number(data?.session?.expectedPyg ?? data?.expectedPyg ?? 0)
    }, API)
    expect(esperado).toBeGreaterThan(0)
    await page.locator('#counted').fill(String(esperado))
    await page.getByRole('button', { name: /Cerrar caja/ }).click()
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()

    // Se restaura el estado que espera la suite: caja abierta con 100.000.
    await page.locator('#opening').fill('100000')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
  })
})
