// #593: real unit detail with simulated PATCH errors/success; local synthetic fixtures.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
for (const width of [1440, 390]) {
  test(`Apple catalog scope and retry preserve variant editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await page.goto('/inventario/unidades')
    const fixture = await page.evaluate(async ({ api, branchId }) => {
      const send = async (path, data) => {
        const r = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!r.ok) throw new Error(`Synthetic fixture HTTP${r.status}`)
        return r.json()
      }
      const mark = Date.now().toString(36)
      const product = await send('/api/products', { name: `iPhone 15 QA593 ${mark}`, model: 'iPhone 15', capacity: '128GB', color: 'Negro', sku: `QA593-${mark}`, pricePyg: 3000000, stock: 0, branchId })
      const unit = await send('/api/inventory-units', { productId: product.id, branchId, serial: `QA593-${mark}`, condition: 'NEW', costPyg: 2000000 })
      return { product, unit }
    }, { api: API, branchId: SEED.branchId })
    await page.goto(`/inventario/unidades?producto=${fixture.product.id}`)
    if (width < 768) await page.getByRole('button', { name: new RegExp(`Ver detalles de ${fixture.product.name}`) }).click()
    else await page.getByTestId('inventario-fila').filter({ hasText: fixture.unit.serial.slice(-4) }).first().click()
    const field = page.getByTestId('unidad-variante-apple')
    await field.getByRole('button', { name: 'Editar variante apple', exact: true }).click()
    await expect(field.getByText(/catálogo de todas las unidades/)).toBeVisible()
    const requests = []
    await page.route('**/api/inventory-units', async route => {
      if (route.request().method() !== 'PATCH') return route.continue()
      requests.push(route.request().postDataJSON())
      await route.fulfill(requests.length === 1
        ? { status: 409, json: { message: 'Conflicto de catálogo simulado' } }
        : { status: 200, json: fixture.unit })
    })
    await field.getByLabel('Modelo Apple').fill('iPhone 15 Pro')
    await field.getByTestId('unidad-variante-apple-guardar').click()
    expect(requests).toHaveLength(0)
    await expect(field.getByLabel('Modelo Apple')).toHaveValue('iPhone 15 Pro')
    await field.getByRole('checkbox', { name: /Confirmo actualizar el catálogo/ }).check()
    await field.getByTestId('unidad-variante-apple-guardar').click()
    await expect(page.getByText('Conflicto de catálogo simulado')).toBeVisible()
    await expect(field.getByLabel('Modelo Apple')).toHaveValue('iPhone 15 Pro')
    await field.getByTestId('unidad-variante-apple-guardar').click()
    await expect(field.getByLabel('Modelo Apple')).toHaveCount(0)
    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual({ id: fixture.unit.id, action: 'variant', variantScope: 'PRODUCT', model: 'iPhone 15 Pro', capacity: '128GB', color: 'Negro' })
    expect(requests[1]).toEqual(requests[0])
  })
}
