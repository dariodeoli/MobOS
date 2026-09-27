// #149 — Cliente ocasional: pedido sin ficha, crear la ficha desde el pedido en
// un clic (reusa el buscador/alta rápida del POS), cambiar y quitar el cliente
// con auditoría y cronología.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-149-cliente-ocasional'

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
  await page.screenshot({ path: `${SHOTS}/01-pedido-ocasional.png` })

  // Crear la ficha desde el pedido en un clic (buscador/alta rápida del POS).
  await crear.click()
  const modal = page.getByTestId('cliente-del-pedido')
  const campo = modal.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  const guardar = modal.getByTestId('cliente-del-pedido-guardar')
  // Campo controlado: si el evento de tipeo se pierde durante el montaje del
  // modal, el valor queda sin estado y el botón deshabilitado; se reintenta.
  await expect(async () => {
    await campo.fill(`Ocasional ${marca}`)
    await expect(guardar).toBeEnabled({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/02-crear-ficha.png` })
  await guardar.click()
  await expect(page.getByText('Ficha creada desde el pedido', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('pedido-quitar-cliente')).toBeVisible({ timeout: 15000 })

  // Cambiar por una ficha existente.
  await page.getByTestId('pedido-cambiar-cliente').click()
  const modalCambio = page.getByTestId('cliente-del-pedido')
  const campoCambio = modalCambio.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  const guardarCambio = modalCambio.getByTestId('cliente-del-pedido-guardar')
  // Con el nombre exacto, el buscador del POS liga la ficha sola.
  await expect(async () => {
    await campoCambio.fill(`Cambio ${marca}`)
    await expect(modalCambio.getByText('Cliente seleccionado')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await guardarCambio.click()
  await expect(page.getByText('Cliente vinculado al pedido', { exact: true })).toBeVisible({ timeout: 15000 })

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
  await page.screenshot({ path: `${SHOTS}/03-cronologia-cambios.png` })
})
