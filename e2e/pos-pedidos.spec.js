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

  // El clic lleva a la página exclusiva del pedido (no a un panel).
  await page.getByTestId('pedido-fila').first().click()
  await expect(page).toHaveURL(/\/pos\/pedidos\/[a-z0-9-]+$/i)
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a pedidos' }).click()
  await expect(page).toHaveURL(/\/pos\/pedidos$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El ícono de acciones abre la vista rápida en panel sin redirigir.
  const urlLista = page.url()
  await page.getByRole('button', { name: /Vista rápida de/ }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveURL(urlLista)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
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
  await expect(page.getByText(codigoPedido(objetivo.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
})

// Impresión del pedido: sin 58 mm, con 80 mm y A4 centrados y con márgenes.
test('pedidos: el comprobante ofrece A4 y 80 mm centrados', async ({ page }) => {
  await page.goto('/pos/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()

  const formato = page.getByLabel('Formato de impresión')
  await expect(formato).toBeVisible()
  const opciones = await formato.locator('option').allTextContents()
  expect(opciones).toEqual(['A4', '80 mm'])
  expect(opciones).not.toContain('58 mm')

  await formato.selectOption('thermal-80')
  const frame = page.locator('iframe[title="Vista previa del comprobante"]')
  await expect(frame).toHaveAttribute('srcdoc', /size:80mm auto/, { timeout: 15000 })
  await expect(frame).toHaveAttribute('srcdoc', /margin:0 auto/)
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:80mm auto;margin:5mm 4mm\}/)

  await formato.selectOption('a4')
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:A4;margin:18mm 16mm\}/, { timeout: 15000 })
})
