import { test, expect } from '@playwright/test'
import { codigoPedido } from '../src/utils/pedido.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Navegar a Pedidos muestra la lista (sin popups inesperados) y el detalle
// abre/cierra desde la fila.
test('pedidos: la lista abre sin popups y el detalle se abre y cierra', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error?.message || error)))
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  await page.getByRole('button', { name: 'Mis pedidos' }).click()
  await expect(page).toHaveURL(/\/pos\/pedidos$/)
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page).toHaveURL(/\/pos\/pedidos$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  expect(errores, `Errores de página: ${errores.join(' | ')}`).toEqual([])
})

// Enlace directo a un pedido que NO está en la página cargada: el drawer tiene
// que resolverlo por API (antes quedaba un popup vacío y fijo).
test('pedidos: enlace directo a un pedido fuera de la página lo resuelve por API', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const ordenes = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const objetivo = ordenes[0]
  expect(objetivo?.id).toBeTruthy()

  // Simula que el pedido no vino en la lista: la página queda vacía.
  await page.route(/\/api\/orders\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`/pos/pedidos/${objetivo.id}`)
  const detalle = page.getByRole('dialog')
  await expect(detalle).toBeVisible()
  await expect(detalle).toContainText(codigoPedido(objetivo.orderNumber))
})
