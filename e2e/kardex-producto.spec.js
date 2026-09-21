// Kardex por producto (#106): movimientos con saldo corrido desde compras,
// altas de unidades y la carga inicial, con export. Se arma un producto único
// por corrida (la base e2e es persistente) y se limpia al final.
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test('el kardex muestra el saldo corrido y exporta el mismo rango', async ({ page }) => {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
  const sku = `ZZ-KARDEX-${marca}`
  const nombre = `Producto kardex ${marca}`
  const serial = `KX${marca}`.slice(0, 15)

  // Primero la app: el fetch con cookies necesita el origen del panel.
  await page.goto('/productos')
  const alta = await page.evaluate(async ({ api, sku, nombre, serial, branchId }) => {
    const producto = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, name: nombre, category: 'Accesorios', pricePyg: 150000, costPyg: 90000, stock: 3, branchId }),
    })
    const datos = await producto.json()
    if (!producto.ok) return { error: datos }
    const compra = await fetch(`${api}/api/purchases`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName: `Proveedor E2E ${sku}`, branchId, lines: [{ productId: datos.id, quantity: 2, unitCostPyg: 95000 }] }),
    })
    const orden = await compra.json()
    if (!compra.ok) return { error: orden }
    const recepcion = await fetch(`${api}/api/purchases`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orden.id, action: 'receive' }),
    })
    if (!recepcion.ok) return { error: await recepcion.json() }
    const unidad = await fetch(`${api}/api/inventory-units`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: datos.id, serial, branchId }),
    })
    if (!unidad.ok) return { error: await unidad.json() }
    return { id: datos.id }
  }, { api: API, sku, nombre, serial, branchId: SEED.branchId })

  expect(alta.error).toBeFalsy()
  const productId = alta.id

  try {
    const campo = page.getByLabel('Buscar productos')
    await campo.fill(sku)
    await campo.press('Enter')
    await expect(page.getByTestId('producto-fila')).toHaveCount(1)
    await page.getByTestId('producto-fila').first().click()

    // El detalle abre con el stock actual y el acceso al kardex.
    await expect(page.getByRole('dialog').getByText(nombre)).toBeVisible()
    await page.getByTestId('kardex-abrir').click()

    const modal = page.getByRole('dialog').filter({ has: page.getByTestId('kardex-tabla') })
    const tabla = modal.getByTestId('kardex-tabla')
    await expect(tabla).toBeVisible()

    // Stock 6 = 3 de alta + 2 de la compra + 1 de la unidad recibida.
    await expect(modal.getByText('Stock actual: 6')).toBeVisible()
    await expect(modal.getByText('Entradas: 6')).toBeVisible()
    await expect(modal.getByText('Saldo inicial', { exact: true })).toBeVisible()
    const movimientos = modal.getByTestId('kardex-movimiento')
    await expect(movimientos).toHaveCount(3)
    await expect(modal.getByText('Compra recibida')).toBeVisible()
    await expect(modal.getByText('Unidad recibida')).toBeVisible()
    await expect(modal.getByText('Alta del producto')).toBeVisible()
    // El saldo corrido cierra en el stock actual.
    await expect(movimientos.last().getByText('6', { exact: true })).toBeVisible()

    // Export del mismo rango que se está viendo.
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      modal.getByTestId('kardex-exportar').click(),
    ])
    expect(descarga.suggestedFilename()).toBe(`mobos-kardex-${sku}.csv`)
    const csv = await readFile(await descarga.path(), 'utf8')
    expect(csv).toContain('Saldo inicial')
    expect(csv).toContain('Compra recibida')
    expect(csv).toContain('Unidad recibida')
    expect(csv.split('\r\n')[0]).toContain('Fecha;Movimiento;Detalle;Referencia;Usuario;Entrada;Salida;Saldo')
  } finally {
    await page.evaluate(async ({ api, id }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    }, { api: API, id: productId })
  }
})
