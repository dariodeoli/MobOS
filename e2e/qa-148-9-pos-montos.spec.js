// #148 §9 · POS: un monto por encima del tope que el sistema puede guardar
// (los importes viven en columnas de 32 bits) no puede guardarse en silencio.
// Los campos ya lo marcan (MoneyInput); al confirmar, el guardado se bloquea y
// el aviso dice qué monto revisar. Antes se llegaba al backend, que rechazaba
// sin señalar el campo (reporte de Finanzas en la épica #148).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const PRODUCTO = SEED.products.cable.name

async function contarPedidos(page) {
  return page.evaluate(async (api) => {
    const filas = await fetch(`${api}/api/orders`, { credentials: 'include' }).then(r => r.json())
    return Array.isArray(filas) ? filas.length : 0
  }, API)
}

test('POS: un precio sobre el tope bloquea el guardado y explica qué monto revisar (#148 §9)', async ({ page }) => {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // Cliente y producto (accesorio del seed: no pide IMEI).
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente tope ${Date.now().toString(36)}`)
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(PRODUCTO)
  const tarjeta = page.getByRole('button', { name: new RegExp(PRODUCTO) }).first()
  await expect(tarjeta).toBeVisible({ timeout: 15_000 })
  await tarjeta.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  // Precio de venta por encima del tope real (2.147.483.647): el campo lo marca.
  await page.getByRole('button', { name: `Ver detalle de ${PRODUCTO}` }).click()
  const precio = page.getByLabel(`Precio de venta de ${PRODUCTO}`)
  await precio.fill('5.000.000.000')
  await expect(precio).toHaveAttribute('aria-invalid', 'true')

  // Confirmar queda bloqueado con el detalle del monto y no crea el pedido.
  const antes = await contarPedidos(page)
  await page.getByTestId('pos-cobro').getByRole('button', { name: /Confirmar venta|Crear pedido|Guardar pedido/ }).click()
  const aviso = page.getByText(/No se puede guardar: el precio de .+ \(Gs 5\.000\.000\.000\) supera el máximo que el sistema puede guardar \(Gs 2\.147\.483\.647\)\./)
  await expect(aviso).toBeVisible()
  // El aviso queda a la vista aunque el usuario esté en el cobro (no hace
  // falta scrollear a mano para enterarse de por qué no se guardó).
  await expect(aviso).toBeInViewport()
  expect(await contarPedidos(page)).toBe(antes)
})
