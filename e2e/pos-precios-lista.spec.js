// Listas de precios en el POS (issue #28): un cliente con lista asignada ve el
// precio de lista (no el minorista) y el escalón por cantidad al cambiar la
// cantidad, con el origen visible en la fila.
//
// La lista y la ficha se crean con la sesión de administración por API; la
// venta se arma con la sesión sembrada del vendedor.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test('POS: un cliente con lista ve el precio de lista y su escalón por cantidad', async ({ browser, page }) => {
  const stamp = Date.now().toString(36)
  const nombreLista = `Lista E2E ${stamp}`
  const nombreCliente = `Cliente Lista ${stamp}`
  const precioLista = 39000
  const precioEscalon = 35000

  const admin = await browser.newContext({
    storageState: new URL('./.auth/admin.json', import.meta.url).pathname,
  })
  const adminPage = await admin.newPage()
  try {
    const creado = await adminPage.evaluate(
      async ({ api, nombreLista, nombreCliente, precioLista, precioEscalon, sku }) => {
        const productos = await (await fetch(`${api}/api/products`, { credentials: 'include' })).json()
        const cable = (productos || []).find((producto) => producto.sku === sku)
        if (!cable) return { error: 'producto E2E no encontrado' }
        const listResponse = await fetch(`${api}/api/price-lists`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nombreLista,
            items: [
              {
                scope: 'PRODUCT',
                productId: cable.id,
                unitPricePyg: precioLista,
                tiers: [{ minQty: 2, unitPricePyg: precioEscalon }],
              },
            ],
          }),
        })
        if (!listResponse.ok) return { error: `lista HTTP ${listResponse.status}` }
        const lista = await listResponse.json()
        const customerResponse = await fetch(`${api}/api/customers`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nombreCliente, priceListId: lista.id }),
        })
        if (!customerResponse.ok) return { error: `cliente HTTP ${customerResponse.status}` }
        return { listId: lista.id, customerId: (await customerResponse.json()).id }
      },
      {
        api: API,
        nombreLista,
        nombreCliente,
        precioLista,
        precioEscalon,
        sku: SEED.products.cable.sku,
      },
    )
    expect(creado.error).toBeUndefined()
    expect(creado.listId).toBeTruthy()
    expect(creado.customerId).toBeTruthy()

    await page.goto('/ventas')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(nombreCliente)
    await page.getByRole('button', { name: new RegExp(nombreCliente) }).click()
    await expect(page.getByText('Cliente seleccionado')).toBeVisible()

    await page.getByPlaceholder('Buscar producto…').fill('Cable')
    await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()

    const precio = page.getByLabel(`Precio de venta de ${SEED.products.cable.name}`)
    await expect(precio).toHaveValue('39.000')
    await expect(page.getByText(`Lista ${nombreLista}`)).toBeVisible()

    // Al subir la cantidad entra el escalón del ítem de lista.
    await page.getByLabel(`Cantidad de ${SEED.products.cable.name}`).fill('2')
    await expect(precio).toHaveValue('35.000')
    await expect(page.getByText('2+ unidades')).toBeVisible()
  } finally {
    await admin.close()
  }
})
