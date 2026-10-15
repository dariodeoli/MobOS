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

// #429: debajo de 768 px el cliente y el carrito viven en hojas (acción «Agregar cliente»
// y barra del carrito). `abrirCarrito: false` deja la hoja cerrada (para usar las acciones del inicio).
async function armarCarrito(page, { abrirCarrito = true } = {}) {
  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()
  const movil = page.viewportSize().width < 768
  if (movil) {
    await page.getByTestId('accion-cliente').click()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 249')
    await page.getByTestId('hoja-cliente').getByRole('button', { name: 'Listo' }).click()
  } else await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Cliente QA 249')
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  if (movil && abrirCarrito) await page.getByTestId('pos-barra-carrito-abrir').click()
  return {
    carrito: page.locator('#pos-resumen-venta'),
    fila: page.locator('#pos-resumen-venta .divide-y > div').first(),
  }
}

test('mobile 390: carrito, cobros y entrega llegan al target de 44', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { carrito, fila } = await armarCarrito(page)
  const cable = SEED.products.cable.name

  // Carrito ultra-colapsado: chevron, papelera y vaciar.
  await toque(fila.getByRole('button', { name: `Ver detalle de ${cable}` }), 'chevron de la línea')
  await toque(fila.getByRole('button', { name: `Eliminar ${cable}` }), 'papelera de la línea')
  await toque(carrito.getByRole('button', { name: 'Vaciar carrito' }), 'vaciar carrito')

  // Equipo serializado: el chip de IMEI (que solo aparece cuando la línea lo
  // pide) también llega a 44. #429: la hoja del carrito se cierra para buscar y se reabre.
  await page.keyboard.press('Escape')
  await page.getByPlaceholder('Buscar producto…').fill(SEED.products.iphone.name)
  await expect(page.getByRole('button', { name: new RegExp(SEED.products.iphone.name) }).first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: new RegExp(SEED.products.iphone.name) }).first().click()
  await page.getByTestId('pos-barra-carrito-abrir').click()
  const filaIphone = page.locator('#pos-resumen-venta .divide-y > div').filter({ hasText: SEED.products.iphone.name })
  await toque(filaIphone.getByRole('button', { name: `Elegir IMEI de ${SEED.products.iphone.name} (pendiente)` }), 'IMEI de la línea')

  // Línea expandida: cantidad, precio, color/descuento y cupón.
  await fila.getByRole('button', { name: `Ver detalle de ${cable}` }).click()
  await toque(fila.getByLabel(`Cantidad de ${cable}`), 'cantidad')
  await toque(fila.getByLabel(`Precio de venta de ${cable}`), 'precio de venta')
  await toque(fila.getByLabel(`Descuento % de ${cable}`), 'descuento %')
  await toque(fila.getByLabel(`Descuento fijo de ${cable}`), 'descuento fijo')
  await toque(fila.getByRole('button', { name: 'Aplicar cupón' }), 'aplicar cupón')
  await fila.getByLabel(`Descuento % de ${cable}`).fill('10')
  await expect(fila.getByTestId('linea-descuento')).toHaveText('− Gs 4.500')
  await toque(carrito.getByRole('button', { name: 'Borrar descuento' }), 'borrar descuento')

  // #429: un equipo sin IMEI frena el cobro del celular («Elegir unidad»): se quita la línea
  // y el formulario completo de pagos se abre desde «Otros medios y entrega».
  await filaIphone.getByRole('button', { name: `Eliminar ${SEED.products.iphone.name}` }).click()
  const quitar = page.getByRole('dialog', { name: '¿Eliminar la línea?' })
  if (await quitar.isVisible().catch(() => false)) await quitar.getByRole('button', { name: 'Eliminar línea' }).click()
  await page.getByTestId('carrito-cobrar').click()
  await page.getByTestId('medio-otros').click()

  // Cobros/split: agregar pago, cuenta, monto y la papelera de la fila.
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  // #283: el buscador de cuenta es el target para elegirla; al elegirla
  // desaparece y queda la cápsula (ya no hay combo para medir).
  await toque(pagos.getByLabel('Cuenta de cobro').first(), 'cuenta de cobro')
  await pagos.getByLabel('Cuenta de cobro').first().click()
  await page.getByRole('option', { name: /Caja E2E/ }).first().click()
  await expect(pagos.getByTestId('cuenta-capsula').first()).toBeVisible()
  // #391: cambiar de cuenta es en el lugar y «Paga al recibir» es un interruptor.
  await toque(pagos.getByTestId('cuenta-cambiar').first(), 'cambiar cuenta')
  await toque(page.getByTestId('pos-paga-al-recibir'), 'paga al recibir')
  await toque(pagos.getByLabel('Monto original').first(), 'monto original')
  await toque(pagos.getByRole('button', { name: 'Eliminar pago 1' }), 'eliminar pago')
  await toque(page.getByRole('button', { name: /^\+ Agregar (otro )?pago$/ }), 'agregar pago')
  await toque(page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ }), 'botón principal')

  // Entrega.
  await toque(page.locator('#entrega'), 'selector de entrega')
  // #391: el monto del envío solo aparece con Delivery o encomienda.
  await expect(page.getByLabel(/Monto del delivery|Costo (de la encomienda|del envío)/)).toHaveCount(0)
  await page.locator('#entrega').selectOption('Delivery')
  await toque(page.getByLabel(/Costo (de la encomienda|del envío)/), 'monto del delivery')
  await page.getByTestId('pos-cobro').getByText('Agregar nota', { exact: true }).click()
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

test('mobile 390: los modales de la venta son usables (targets de 44)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await armarCarrito(page, { abrirCarrito: false })

  // Suspender venta.
  await page.getByRole('button', { name: 'Suspender venta' }).click()
  const suspender = page.getByRole('dialog', { name: 'Suspender venta' })
  await toque(suspender.getByLabel('Etiqueta (opcional)'), 'suspender · etiqueta')
  await toque(suspender.getByRole('button', { name: 'Cancelar' }), 'suspender · cancelar')
  await toque(suspender.getByRole('button', { name: 'Suspender venta' }), 'suspender · confirmar')
  await suspender.getByRole('button', { name: 'Suspender venta' }).click()
  await expect(page.getByText(/Venta suspendida/)).toBeVisible({ timeout: 15_000 })

  // Ventas suspendidas (la lista del borrador recién creado).
  await page.getByTestId('pos-suspendidas').click()
  const suspendidas = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await expect(suspendidas.getByRole('button', { name: 'Recuperar' }).first()).toBeVisible()
  await toque(suspendidas.getByRole('button', { name: 'Enlace público' }), 'suspendidas · enlace')
  await toque(suspendidas.getByRole('button', { name: 'Recuperar' }), 'suspendidas · recuperar')
  await toque(suspendidas.getByRole('button', { name: 'Descartar' }), 'suspendidas · descartar')
  await toque(suspendidas.getByRole('button', { name: 'Cerrar' }).last(), 'suspendidas · cerrar')
  await page.keyboard.press('Escape')

  // Producto escaneado.
  await page.getByPlaceholder('Buscar producto…').fill(`MOBOS:PROD:${SEED.products.cable.sku}`)
  const escaner = page.getByRole('dialog', { name: 'Producto escaneado' })
  await expect(escaner).toBeVisible({ timeout: 10_000 })
  await toque(escaner.getByRole('button', { name: 'Agregar a la venta' }), 'escáner · agregar')
  await toque(escaner.getByRole('button', { name: 'Cancelar' }), 'escáner · cancelar')
})
