// #149 — Cliente ocasional: pedido sin ficha, crear la ficha desde el pedido en
// un clic (reusa el buscador/alta rápida del POS), cambiar y quitar el cliente
// con auditoría y cronología.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: SEED.api, path, options })
}

test('cliente ocasional: crear ficha, cambiar y quitar con cronología', async ({ page }) => {
  // Con la página abierta (origen real) se preparan producto, pedido ocasional
  // y una ficha existente para el cambio.
  await page.goto('/pedidos')
  const marca = Date.now().toString(36).toUpperCase()
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `OCAS-${marca}`, name: 'Producto ocasional', pricePyg: 120000, stock: 5 }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const pedido = await api(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `OCAS-${marca}`, items: [{ productId: producto.body.id, description: 'Producto ocasional', quantity: 1, unitPricePyg: 120000 }], payment: { method: 'CASH', amountPyg: 120000 } }) })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
  const ficha = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cambio ${marca}`, phone: `0986${String(Date.now()).slice(-6)}` }) })
  expect(ficha.status, JSON.stringify(ficha.body)).toBe(201)

  await page.goto('/pedidos')
  await page.getByLabel('Buscar pedidos').fill(`OCAS-${marca}`)
  const fila = page.getByTestId('pedido-fila').filter({ hasText: `OCAS-${marca}` }).first()
  await expect(fila).toBeVisible({ timeout: 15000 })
  await fila.click()
  const crear = page.getByTestId('pedido-crear-ficha')
  // La sección «Cliente» puede venir plegada: se abre por su encabezado
  // (resumen «Consumidor final»), que es único en la pantalla.
  if (!(await crear.isVisible().catch(() => false))) await page.getByRole('button', { name: /Consumidor final/ }).first().click()

  // Ocasional: sin ficha, con las dos salidas (asignar una existente o crear).
  await expect(page.getByTestId('pedido-asignar-cliente')).toBeVisible({ timeout: 15000 })
  await expect(crear).toBeVisible()

  // Crear la ficha desde el pedido en un clic (buscador/alta rápida del POS).
  await crear.click()
  const modal = page.getByTestId('cliente-del-pedido')
  await modal.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Ocasional ${marca}`)
  await modal.getByTestId('cliente-del-pedido-guardar').click()
  await expect(page.getByText('Ficha creada desde el pedido')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('pedido-quitar-cliente')).toBeVisible({ timeout: 15000 })

  // Cambiar por una ficha existente.
  await page.getByTestId('pedido-cambiar-cliente').click()
  const modalCambio = page.getByTestId('cliente-del-pedido')
  await modalCambio.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cambio ${marca}`)
  // Con el nombre exacto, el buscador del POS liga la ficha sola.
  await expect(modalCambio.getByText('Cliente seleccionado')).toBeVisible({ timeout: 10000 })
  await modalCambio.getByTestId('cliente-del-pedido-guardar').click()
  await expect(page.getByText('Cliente vinculado al pedido')).toBeVisible({ timeout: 15000 })

  // Quitar el cliente: el pedido vuelve a ser ocasional.
  await page.getByTestId('pedido-quitar-cliente').click()
  await page.getByRole('button', { name: 'Quitar cliente', exact: true }).last().click()
  await expect(page.getByText('Cliente quitado.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('pedido-asignar-cliente')).toBeVisible({ timeout: 15000 })

  // Cronología: los tres movimientos quedaron auditados.
  const cronologia = page.getByRole('button', { name: /^Cronología/ })
  if ((await cronologia.getAttribute('aria-expanded')) !== 'true') await cronologia.click()
  await expect(page.getByText(/Ficha creada desde el pedido/).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/^Cliente: /).first()).toBeVisible()
  await expect(page.getByText(/Cliente quitado/).first()).toBeVisible()
})
