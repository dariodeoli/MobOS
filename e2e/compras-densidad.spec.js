// Rediseño Lote 6-B (#167): Compras y Proveedores en filas compactas, sin
// scroll horizontal en desktop y con las acciones a la vista (íconos con
// tooltip de la biblioteca compartida). Autosuficiente: crea su compra.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

test('compras y proveedores: filas compactas, sin scroll y acciones visibles', async ({ page }) => {
  const clave = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
  const proveedor = `Proveedor Lote6 ${clave}`
  await page.goto('/inventario/unidades')
  const compra = await page.evaluate(async ({ api, branchId, proveedor, clave }) => {
    const pedir = async (ruta, opciones = {}) => {
      const respuesta = await fetch(`${api}/api/${ruta}`, { credentials: 'include', headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined, ...opciones })
      const payload = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`${ruta}: ${payload?.message || respuesta.status}`)
      return payload
    }
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-L6B-${clave}`, name: `Producto lote 6B ${clave}`, category: 'Accesorios', pricePyg: 120000, costPyg: 80000, stock: 0, branchId }) })
    const orden = await pedir('purchases', { method: 'POST', body: JSON.stringify({ supplierName: proveedor, branchId, lines: [{ productId: producto.id, quantity: 2, unitCostPyg: 80000 }] }) })
    return { id: orden.id, productId: producto.id }
  }, { api: API, branchId: SEED.branchId, proveedor, clave })
  expect(compra.id).toBeTruthy()

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/compras')
  const tabla = page.getByTestId('compras-tabla')
  await expect(tabla).toBeVisible()
  const fila = page.getByTestId('compra-fila').filter({ hasText: proveedor }).first()
  await expect(fila).toBeVisible()

  // Sin scroll horizontal en desktop.
  const desborde = await tabla.evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
  expect(desborde.scrollWidth).toBeLessThanOrEqual(desborde.clientWidth + 1)

  // Acciones a la vista (íconos con tooltip): recibir, adjuntos, historial.
  await expect(fila.getByRole('button', { name: 'Recibir mercadería' })).toBeVisible()
  await expect(fila.getByRole('button', { name: 'Adjuntos de la compra' })).toBeVisible()
  await expect(fila.getByRole('button', { name: 'Historial de la compra' })).toBeVisible()

  // Proveedores: filas compactas con acciones visibles.
  await page.getByRole('button', { name: 'Proveedores' }).click()
  const modal = page.getByRole('dialog', { name: 'Proveedores' })
  await expect(modal).toBeVisible()
  const tablaProveedores = modal.getByTestId('proveedores-tabla')
  await expect(tablaProveedores).toBeVisible()
  const filaProveedor = modal.getByTestId('proveedor-fila').filter({ hasText: proveedor }).first()
  await expect(filaProveedor).toBeVisible()
  await expect(filaProveedor.getByRole('button', { name: `Editar ${proveedor}` })).toBeVisible()
  await expect(filaProveedor.getByRole('button', { name: `Historial de ${proveedor}` })).toBeVisible()
  const desbordeProveedores = await tablaProveedores.evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
  expect(desbordeProveedores.scrollWidth).toBeLessThanOrEqual(desbordeProveedores.clientWidth + 1)

  // Limpieza: la compra queda en borrador sin stock; se da de baja el producto.
  await page.evaluate(async ({ api, productId }) => {
    await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, { api: API, productId: compra.productId })
})
