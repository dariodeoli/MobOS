// Rediseño Lote 6-B (#167): Compras y Proveedores en filas compactas, sin
// scroll horizontal en desktop y con las acciones a la vista (íconos con
// tooltip de la biblioteca compartida). Autosuficiente: crea su compra.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
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

// #259: en Compras el proveedor se elige con el buscador (abreviatura o nombre)
// y un nombre nuevo se puede crear desde el mismo campo.
test('compras: buscador de proveedores y alta desde el campo (#259)', async ({ page }) => {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
  const sufijo = Math.random().toString(36).slice(2, 7).toUpperCase()
  const codigo = `ZZCOMBO${sufijo}`
  const nombre = `Proveedor Combo QA ${id} ${sufijo}`
  const nuevo = `Proveedor Nuevo QA ${id} ${sufijo}`
  // El proveedor se crea antes de entrar: Compras carga el catálogo al montar.
  await page.goto('/pos')
  const proveedor = await page.evaluate(async ({ api, nombre, codigo }) => {
    const respuesta = await fetch(`${api}/api/suppliers`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, code: codigo }) })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `suppliers: ${respuesta.status}`)
    return datos
  }, { api: API, nombre, codigo })

  try {
    await page.goto('/compras')
    const campo = page.locator('#compra-proveedor')
    await expect(campo).toBeVisible({ timeout: 20_000 })

    // La abreviatura filtra y al elegir queda abreviatura + nombre.
    await campo.fill(codigo.toLowerCase())
    const lista = page.getByRole('listbox', { name: 'Proveedores' })
    const opcion = lista.getByRole('option').filter({ hasText: nombre })
    await expect(opcion).toHaveCount(1)
    await expect(opcion).toContainText(codigo)
    await opcion.click()
    await expect(campo).toHaveValue(`${codigo} · ${nombre}`)

    // Un nombre nuevo se crea desde el campo (abre el alta con el nombre puesto).
    await campo.fill(nuevo)
    const crear = page.getByRole('option', { name: new RegExp(`Crear «${nuevo}»`) })
    await expect(crear).toBeVisible()
    await crear.click()
    await expect(page.getByPlaceholder('Nombre del proveedor')).toHaveValue(nuevo)
    mkdirSync('test-results/qa-259-proveedores', { recursive: true })
    await page.screenshot({ path: 'test-results/qa-259-proveedores/compras-alta-proveedor.jpg', type: 'jpeg', quality: 78 })
  } finally {
    await page.evaluate(async ({ api, id }) => {
      await fetch(`${api}/api/suppliers`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isActive: false }) }).catch(() => {})
    }, { api: API, id: proveedor.id })
  }
})
