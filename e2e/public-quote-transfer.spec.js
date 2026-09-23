// Cotización pública (aceptar/rechazar) y remito público de transferencia con
// recepción desde el QR. El panel genera el enlace y el cliente/destino lo
// resuelve sin sesión, una sola vez por documento.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cotización pública se acepta una sola vez y el enlace se regenera', async ({ page }) => {
  await page.goto('/resumen')
  const marca = Date.now()
  const creada = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente QR ${marca}`, items: [{ description: 'Equipo QR', quantity: 1, unitPricePyg: 300000 }] }),
  })
  expect(creada.status).toBe(201)
  const token = creada.body.publicToken
  expect(token).toBeTruthy()

  await page.goto(`/cotizacion/${token}`)
  await expect(page.getByRole('heading', { name: creada.body.number })).toBeVisible()
  await expect(page.getByText('Equipo QR')).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar cotización' }).click()
  await expect(page.getByText('Aceptada', { exact: true })).toBeVisible()

  const doble = await api(page, `/api/quotes/public/${token}`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) })
  expect(doble.status).toBe(409)

  // El modal interno muestra el QR y regenerar invalida el enlace anterior.
  await page.goto('/cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: creada.body.number }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  await expect(page.getByAltText('QR de la cotización')).toBeVisible()
  await page.getByRole('button', { name: 'Regenerar' }).click()
  await expect(page.getByText('Enlace regenerado: el anterior dejó de funcionar.')).toBeVisible()

  const viejo = await api(page, `/api/quotes/public/${token}`)
  expect(viejo.status).toBe(404)
})

test('el remito público confirma la recepción y suma el stock de destino', async ({ page }) => {
  await page.goto('/resumen')
  const marca = Date.now()
  const destino = await api(page, '/api/branches', { method: 'POST', body: JSON.stringify({ name: `Sucursal remito ${marca}` }) })
  expect(destino.status).toBe(201)
  const serial = `E2E-REM-${marca}`
  const sku = `E2E-REM-SKU-${marca}`
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku, name: `Equipo remito ${marca}`, pricePyg: 100000, stock: 1, branchId: 'e2e-branch-1', imei: serial }) })
  expect(producto.status).toBe(201)
  const traslado = await api(page, '/api/transfers', { method: 'POST', body: JSON.stringify({ sourceBranchId: 'e2e-branch-1', destinationBranchId: destino.body.id, lines: [{ productId: producto.body.id, quantity: 1, serials: [serial] }] }) })
  expect(traslado.status).toBe(201)
  const token = traslado.body.publicToken
  expect(token).toBeTruthy()

  await page.goto(`/remito/${token}`)
  await expect(page.getByText(`Equipo remito ${marca}`)).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByText(/Recepción confirmada/)).toBeVisible()

  const doble = await api(page, `/api/transfers/public/${token}`, { method: 'POST', body: JSON.stringify({ action: 'receive' }) })
  expect(doble.status).toBe(409)

  // El catálogo viene paginado (200) y ordenado por nombre: con cientos de
  // productos de corridas previas la fila podía quedar fuera de la página y el
  // test era inestable. Se busca por SKU (único) y se espera el stock.
  await expect.poll(async () => {
    const productos = await api(page, `/api/products?q=${encodeURIComponent(sku)}`)
    const enDestino = (productos.body || []).find((row) => row.sku === sku && row.branchId === destino.body.id)
    return enDestino?.stock
  }, { message: 'la sucursal destino tiene que sumar el stock del remito', timeout: 15_000 }).toBe(1)

  // El panel ofrece el QR del remito para imprimirlo o compartirlo.
  await page.goto('/inventario/traslados')
  const fila = page.getByTestId('traslado-fila').filter({ hasText: `Equipo remito ${marca}` }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  await expect(page.getByAltText('QR del remito')).toBeVisible()
})
