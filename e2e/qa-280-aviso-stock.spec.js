// #280 · Aviso de INV al vendedor (cross-dominio INV→POS): cuando cambia el
// stock o la disponibilidad de un producto comprometido (una venta sin stock),
// el vendedor lo ve en la campana del panel, con el pedido como destino.
// Sin spam: un aviso por pedido y producto, solo el último cambio.
//
// El inventario lo mueve un contexto de administración (INV); el aviso se
// verifica en la sesión del vendedor (POS). Capturas: docs/qa/280-aviso-stock/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_280_CAPTURAS || join('docs', 'qa', '280-aviso-stock')

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`

test('#280 · el vendedor recibe el aviso de INV cuando cambia el stock de su venta comprometida', async ({ page, browser }) => {
  mkdirSync(DIR, { recursive: true })
  const id = marca()
  const serial = `QA280${id}`.toUpperCase()

  // INV: un contexto de administración mueve el inventario (producto y unidad).
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  let productoId = ''
  try {
    await adminPage.goto('/inventario/unidades')
    const alta = await apiPagina(adminPage, '/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: `QA280 equipo ${id}`, sku: `QA280-${id}`, category: 'Celulares', pricePyg: 1200000, costPyg: 900000, stock: 0, branchId: SEED.branchId }),
    })
    expect(alta.status, JSON.stringify(alta.body)).toBe(201)
    productoId = alta.body.id

    // POS: el vendedor vende sin stock (sobre pedido) → necesidad comprometida.
    await page.goto('/pos')
    const venta = await apiPagina(page, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `QA280-${id}`,
        items: [{ productId: productoId, description: `QA280 equipo ${id}`, quantity: 1, unitPricePyg: 1200000, backorder: true }],
        payment: { method: 'CASH', amountPyg: 1200000 },
      }),
    })
    expect(venta.status, JSON.stringify(venta.body)).toBe(201)

    // La campana abre con «Actualizar»: sin cambios en el inventario no hay aviso.
    const abrirPanel = async () => {
      const panel = page.getByTestId('notificaciones-panel')
      if (!(await panel.isVisible().catch(() => false))) await page.getByTestId('notificaciones-aviso').click()
      await expect(panel).toBeVisible()
      await panel.getByRole('button', { name: 'Actualizar' }).click()
      return panel
    }
    const panel = await abrirPanel()
    const avisoDe = (titulo) => panel.getByRole('button', { name: new RegExp(titulo) }).filter({ hasText: `QA280-${id}` })
    await expect(avisoDe('Ya hay stock para tu pedido')).toHaveCount(0)

    // INV: llega la unidad al depósito → el compromiso se puede cumplir.
    const unidad = await apiPagina(adminPage, '/api/inventory-units', {
      method: 'POST',
      body: JSON.stringify({ productId: productoId, serial, branchId: SEED.branchId, condition: 'NEW' }),
    })
    expect(unidad.status, JSON.stringify(unidad.body)).toBe(201)

    await panel.getByRole('button', { name: 'Actualizar' }).click()
    const llegada = avisoDe('Ya hay stock para tu pedido')
    await expect(llegada).toBeVisible({ timeout: 20_000 })
    await expect(llegada).toContainText(`QA280-${id}`)
    // Sin spam: un solo aviso por pedido y producto.
    await expect(avisoDe('Ya hay stock para tu pedido')).toHaveCount(1)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({ path: join(DIR, 'aviso-llegada-claro-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(DIR, 'aviso-llegada-claro-mobile.png') })
    await page.setViewportSize({ width: 1280, height: 900 })

    // INV: se da de baja la unidad → el aviso pasa a «quedó sin stock».
    const baja = await apiPagina(adminPage, '/api/inventory-units', {
      method: 'PATCH',
      body: JSON.stringify({ id: unidad.body.id, action: 'remove', reason: 'Cierre QA #280' }),
    })
    expect(baja.status, JSON.stringify(baja.body)).toBe(200)
    await panel.getByRole('button', { name: 'Actualizar' }).click()
    const sinStock = avisoDe('Tu pedido quedó sin stock')
    await expect(sinStock).toBeVisible({ timeout: 20_000 })
    await expect(avisoDe('Ya hay stock para tu pedido')).toHaveCount(0)
    await expect(avisoDe('Tu pedido quedó sin stock')).toHaveCount(1)
    await page.screenshot({ path: join(DIR, 'aviso-sin-stock-claro-desktop.png') })

    // El aviso lleva al pedido: el vendedor actúa desde donde corresponde.
    await sinStock.click()
    await expect(page).toHaveURL(new RegExp(`/pedidos/${venta.body.id}`), { timeout: 20_000 })
  } finally {
    // Limpieza: el producto de prueba no queda en el catálogo.
    if (productoId) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(productoId)}`, { method: 'DELETE' }).catch(() => {})
    await adminCtx.close()
  }
})
