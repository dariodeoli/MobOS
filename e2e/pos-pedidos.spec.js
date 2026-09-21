import { test, expect } from '@playwright/test'
import { codigoPedido } from '../src/utils/pedido.js'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Navegar a Pedidos muestra la lista (sin popups inesperados) y el detalle
// abre/cierra desde la fila.
test('pedidos: la lista abre sin popups y el detalle se abre y cierra', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error?.message || error)))
  await page.goto('/ventas')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  await page.getByRole('button', { name: 'Mis pedidos' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByTestId("pedido-fila").first()).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // La grilla de cada fila tiene 11 celdas (la última, la vista rápida) y la
  // fecha entra completa: nada descolgado ni cortado.
  const celdas = page.getByTestId("pedido-fila").first().locator(":scope > div > *")
  await expect(celdas).toHaveCount(11)
  const fecha = celdas.nth(1)
  expect(await fecha.evaluate(elemento => elemento.scrollWidth <= elemento.clientWidth + 1)).toBeTruthy()

  await page.reload()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El clic lleva a la página exclusiva del pedido (no a un panel).
  await page.getByTestId('pedido-fila').first().click()
  await expect(page).toHaveURL(/\/pedidos\/[a-z0-9-]+$/i)
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a pedidos' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
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
  await page.goto('/pedidos')
  const ordenes = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const objetivo = ordenes[0]
  expect(objetivo?.id).toBeTruthy()

  // Simula que el pedido no vino en la lista: la página queda vacía.
  await page.route(/\/api\/orders\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`/pedidos/${objetivo.id}`)
  await expect(page.getByText(codigoPedido(objetivo.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
})

// Impresión del pedido: A4 y el rollo de 58 mm con diseño vertical propio.
test('pedidos: el comprobante ofrece A4 y 58 mm con diseño propio', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()

  const formato = page.getByLabel('Formato de impresión')
  await expect(formato).toBeVisible()
  const opciones = await formato.locator('option').allTextContents()
  expect(opciones).toEqual(['A4', '58 mm'])

  const frame = page.locator('iframe[title="Vista previa del comprobante"]')
  // Los tres modelos: rápido identifica empresa y sucursal; el detallado imprime
  // la cronología del pedido.
  await page.getByLabel('Tipo de comprobante').selectOption('rapido')
  await expect(frame).toHaveAttribute('srcdoc', /Empresa/, { timeout: 15000 })
  await page.getByLabel('Tipo de comprobante').selectOption('detallado')
  await expect(frame).toHaveAttribute('srcdoc', /Cronología/, { timeout: 15000 })

  // 58 mm: una columna, total destacado y alto dinámico (no el A4 encogido).
  await formato.selectOption('thermal-58')
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:58mm auto;margin:3mm\}/, { timeout: 15000 })
  await expect(frame).toHaveAttribute('srcdoc', /class="t58"/)
  await expect(frame).toHaveAttribute('srcdoc', /class="row total"/)
  await expect(frame).toHaveAttribute('srcdoc', /nofiscal/)

  await formato.selectOption('a4')
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:A4;margin:18mm 16mm\}/, { timeout: 15000 })
})

// La cronología tiene que mostrar a la persona real que creó el pedido, no un
// genérico "Sistema": el actor sale del usuario que confirmó la venta.
test('pedidos: la cronología muestra al vendedor que creó el pedido', async ({ page }) => {
  await page.goto('/pedidos')
  const fila = page
    .getByTestId('pedido-fila')
    .filter({ hasText: codigoPedido(SEED.seedOrderNumber) })
    .first()
  await expect(fila).toBeVisible()
  await fila.click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()

  const creado = page.locator('article').filter({ hasText: 'Pedido creado' }).first()
  await expect(creado).toBeVisible()
  await expect(creado).not.toContainText('Sistema')
  await expect(creado).toContainText('Vendedor')
})
