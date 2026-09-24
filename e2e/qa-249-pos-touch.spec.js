// #249 · POS táctil: mide cajas reales a 390 px (mobile, target ≥44) y a 768 px
// (el layout vuelve compacto, sin perder la densidad del escritorio).
// Cubre lo que pidió Dario: carrito ultra-colapsado, cobros/split y entrega.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

async function caja(locator) {
  const rect = await locator.first().evaluate((node) => {
    const r = node.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })
  return rect
}

async function toque(locator, etiqueta, minimo = 44) {
  const { w, h } = await caja(locator)
  expect(h, `${etiqueta}: alto real (${w}x${h})`).toBeGreaterThanOrEqual(minimo)
  expect(w, `${etiqueta}: ancho real (${w}x${h})`).toBeGreaterThanOrEqual(minimo)
}

async function armarCarrito(page) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 249')
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  return {
    carrito: page.locator('#pos-resumen-venta'),
    fila: page.locator('#pos-resumen-venta .divide-y > div').first(),
  }
}

test('mobile 390: carrito, cobros y entrega llegan al target de 44', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { carrito, fila } = await armarCarrito(page)
  const cable = SEED.products.cable.name

  // Carrito ultra-colapsado: chevron, IMEI, papelera y vaciar.
  await toque(fila.getByRole('button', { name: `Ver detalle de ${cable}` }), 'chevron de la línea')
  await toque(fila.getByRole('button', { name: `Elegir IMEI de ${cable} (pendiente)` }), 'IMEI de la línea')
  await toque(fila.getByRole('button', { name: `Eliminar ${cable}` }), 'papelera de la línea')
  await toque(carrito.getByRole('button', { name: 'Vaciar carrito' }), 'vaciar carrito')

  // Línea expandida: cantidad, precio, color/descuento y cupón.
  await fila.getByRole('button', { name: `Ver detalle de ${cable}` }).click()
  await toque(fila.getByLabel(`Cantidad de ${cable}`), 'cantidad')
  await toque(fila.getByLabel(`Precio de venta de ${cable}`), 'precio de venta')
  await toque(fila.getByLabel(`Descuento % de ${cable}`), 'descuento %')
  await toque(fila.getByLabel(`Descuento fijo de ${cable}`), 'descuento fijo')
  await toque(fila.getByRole('button', { name: 'Aplicar cupón' }), 'aplicar cupón')
  await fila.getByLabel(`Descuento % de ${cable}`).fill('10')
  await expect(fila.getByText('descuento − Gs 4.500')).toBeVisible()
  await toque(carrito.getByRole('button', { name: 'Borrar descuento' }), 'borrar descuento')

  // Cobros/split: agregar pago, cuenta, monto y la papelera de la fila.
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await pagos.getByLabel('Cuenta de cobro').first().click()
  await page.getByRole('option', { name: /Caja E2E/ }).first().click()
  await toque(pagos.getByLabel('Cuenta de cobro').first(), 'cuenta de cobro')
  await toque(pagos.getByLabel('Monto original').first(), 'monto original')
  await toque(pagos.getByRole('button', { name: 'Eliminar pago 1' }), 'eliminar pago')
  await toque(page.getByRole('button', { name: '+ Agregar pago' }), 'agregar pago')
  await toque(page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ }), 'botón principal')

  // Entrega.
  await toque(page.getByLabel('Entrega'), 'selector de entrega')
  await toque(page.getByLabel(/Monto del delivery|Costo (de la encomienda|del envío)/), 'monto del delivery')
  await toque(page.getByLabel('Observación'), 'observación')
})

test('768: el POS vuelve compacto y no pierde densidad', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  const { fila } = await armarCarrito(page)
  const cable = SEED.products.cable.name

  // La fila colapsada mantiene el alto del escritorio y los íconos vuelven
  // chicos (mobile-first + md:), como en inventario/clientes (#249/#246).
  const filaColapsada = await caja(fila)
  expect(filaColapsada.h, `fila colapsada compacta (${filaColapsada.h}px)`).toBeLessThanOrEqual(70)
  const chevron = await caja(fila.getByRole('button', { name: `Ver detalle de ${cable}` }))
  expect(chevron.h, `chevron compacto (${chevron.h}px)`).toBeLessThanOrEqual(36)
  const papelera = await caja(fila.getByRole('button', { name: `Eliminar ${cable}` }))
  expect(papelera.h, `papelera compacta (${papelera.h}px)`).toBeLessThanOrEqual(32)
})
