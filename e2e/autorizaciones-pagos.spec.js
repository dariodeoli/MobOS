// Autorizaciones › Pagos: cobros PIX/transferencia que esperan verificación.
// - El pedido muestra el estado de cada pago, bloquea «Entregado» con el motivo
//   a la vista y deja subir el comprobante (cámara o archivo) si falta.
// - Aprobar y rechazar (motivo obligatorio) desde el panel; un cobro propio no
//   ofrece «Aprobar»; el vendedor ve el rechazo con su motivo.
// - 375 px sin scroll horizontal y con botones de 44 px.
// La política «verificar» se activa solo para una cuenta propia de la spec: ninguna
// otra spec cambia de comportamiento mientras corre.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { esperarAnimaciones } from './helpers/animaciones.js'
import {
  PNG_1X1, activarVerificacion, pagoDe, apiAdmin, vendedorApi, crearCuentaYProducto, pedidoDelVendedor, restaurarVerificacion, subirComprobante,
} from './helpers/pagos-verificar.js'

test.describe.configure({ mode: 'serial' })

const sufijo = Date.now().toString(36).toUpperCase()
let original
let vendedor
let pedidos = {}

const tarjeta = (page, referencia) => page.getByTestId('pago-verificar-tarjeta').filter({ hasText: referencia })

test.afterAll(async () => {
  restaurarVerificacion(original)
  await vendedor?.dispose()
})

test('prepara los cobros y el pedido bloquea la entrega con el motivo a la vista', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/resumen')
  const { cuenta, producto } = await crearCuentaYProducto(page, { kind: 'PIX', sufijo })
  original = activarVerificacion([cuenta.id])
  vendedor = await vendedorApi()
  const base = { producto, cuenta }
  const a = await pedidoDelVendedor(vendedor, { ...base, monto: 546000, referencia: `PIX-A-${sufijo}` })
  const b = await pedidoDelVendedor(vendedor, { ...base, monto: 781500, referencia: `PIX-B-${sufijo}` })
  const d = await pedidoDelVendedor(vendedor, { ...base, monto: 1251000, referencia: `PIX-D-${sufijo}` })
  await subirComprobante(vendedor, b.pago.id)
  await subirComprobante(vendedor, d.pago.id)
  // Cobro propio del administrador: otra persona tiene que aprobarlo.
  const api = apiAdmin(page)
  const propio = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ productId: producto.id, description: producto.name, quantity: 1, unitPricePyg: 300000 }], payments: [{ ...pagoDe(cuenta, 300000, `PIX-C-${sufijo}`), status: undefined }] }) })
  expect(propio.status, JSON.stringify(propio.datos)).toBe(201)
  pedidos = { a, b, d, c: propio.datos }
  expect(a.pago.status).toBe('PENDING')

  // Pedido A (sin comprobante): estado, bloqueo de entrega y subida desde el pedido.
  await page.goto(`/pedidos/${a.pedido.id}`)
  const estado = page.getByTestId('pago-estado').first()
  await expect(estado).toHaveText('Pendiente de verificación', { timeout: 20_000 })
  const aviso = page.getByTestId('entrega-bloqueada')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('Pago en verificación')
  const select = page.getByLabel('Estado de entrega')
  // Retiro en tienda: la opción que saca la mercadería es «Retirado»; en delivery, «Entregado».
  const quienEntrega = select.locator('option[value="PICKED_UP"], option[value="DELIVERED"]')
  await expect(quienEntrega.first()).toBeDisabled()
  await expect(select.locator('option[value="PROCESSING"]')).toBeEnabled()
  if (process.env.MOBOS_CAPTURAS) await page.screenshot({ path: `${process.env.MOBOS_CAPTURAS}/autorizaciones-pedido.png`, fullPage: true })
  // El servidor también lo frena aunque se intente por la API.
  const entrega = await vendedor.patch(`/api/orders/${a.pedido.id}`, { data: { fulfillmentStatus: 'DELIVERED' } })
  expect(entrega.status()).toBe(409)
  expect(await entrega.text()).toContain('Pago en verificación')

  const subir = page.getByTestId('pago-subir-comprobante')
  await expect(subir).toBeVisible()
  await expect(subir.getByRole('button', { name: 'Sacar foto' })).toBeVisible()
  await expect(subir.locator('input[type=file][capture="environment"]')).toHaveCount(1)
  await subir.locator('input[type=file]').last().setInputFiles({ name: 'comprobante.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await expect(page.getByTestId('comprobante-miniatura').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('pago-subir-comprobante')).toHaveCount(0)
})

test('el panel aprueba y rechaza con motivo; el cobro propio no ofrece Aprobar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/autorizaciones?tab=pagos')
  await expect(page.getByTestId('autorizaciones-tab-pagos')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('autorizaciones-tab-pagos')).toContainText(/\d/)
  const b = tarjeta(page, `PIX-B-${sufijo}`)
  await expect(b).toBeVisible({ timeout: 20_000 })
  await expect(b.getByTestId('pago-verificar-monto')).toContainText('781.500')
  await expect(b).toContainText('Vendedor:')

  // Miniatura del comprobante: Popup centrado con la X.
  await b.getByTestId('comprobante-miniatura').click()
  const visor = page.getByRole('dialog', { name: 'Comprobante de pago' })
  await expect(visor).toBeVisible()
  await visor.getByRole('button', { name: 'Cerrar' }).click()
  await expect(visor).toBeHidden()

  // Cobro propio del administrador: sin Aprobar ni Rechazar.
  const c = tarjeta(page, `PIX-C-${sufijo}`)
  await expect(c).toBeVisible()
  await expect(c.getByTestId('pago-verificar-propio')).toContainText('Es tu cobro')
  await expect(c.getByRole('button', { name: 'Aprobar' })).toHaveCount(0)
  if (process.env.MOBOS_CAPTURAS) await page.screenshot({ path: `${process.env.MOBOS_CAPTURAS}/autorizaciones-pagos.png` })

  // Rechazar: el motivo es obligatorio.
  await b.getByRole('button', { name: 'Rechazar' }).click()
  const rechazo = page.getByRole('dialog', { name: 'Rechazar el pago' })
  await rechazo.getByRole('button', { name: 'Rechazar pago' }).click()
  await expect(rechazo.getByText('Contale al vendedor por qué se rechaza el pago.')).toBeVisible()
  await rechazo.getByLabel('Motivo del rechazo').fill('El monto del comprobante no coincide con el banco.')
  await rechazo.getByRole('button', { name: 'Rechazar pago' }).click()
  await expect(b).toHaveCount(0, { timeout: 15_000 })

  // Aprobar el cobro del pedido A (ya tiene comprobante).
  const a = tarjeta(page, `PIX-A-${sufijo}`)
  await expect(a.getByTestId('comprobante-miniatura')).toBeVisible()
  await a.getByRole('button', { name: 'Aprobar' }).click()
  const confirmar = page.getByRole('alertdialog', { name: 'Aprobar el pago' })
  await expect(confirmar).toContainText('546.000')
  await confirmar.getByRole('button', { name: 'Aprobar pago' }).click()
  await expect(a).toHaveCount(0, { timeout: 15_000 })

  // Rechazados: queda con su motivo.
  await page.getByRole('button', { name: /^Rechazados/ }).click()
  const rechazado = tarjeta(page, `PIX-B-${sufijo}`)
  await expect(rechazado).toBeVisible()
  await expect(rechazado).toContainText('El monto del comprobante no coincide con el banco.')
})

test('el pedido refleja lo resuelto: rechazo con motivo y entrega habilitada tras aprobar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/pedidos/${pedidos.b.pedido.id}`)
  await expect(page.getByTestId('pago-estado').first()).toHaveText('Rechazado', { timeout: 20_000 })
  await expect(page.getByTestId('pago-motivo-rechazo')).toContainText('El monto del comprobante no coincide con el banco.')

  await page.goto(`/pedidos/${pedidos.a.pedido.id}`)
  await expect(page.getByTestId('pago-estado').first()).toHaveText('Aprobado', { timeout: 20_000 })
  await expect(page.getByTestId('entrega-bloqueada')).toHaveCount(0)
  await expect(page.getByLabel('Estado de entrega').locator('option[value="PICKED_UP"], option[value="DELIVERED"]').first()).toBeEnabled()
})

test('375 px: sin scroll horizontal y botones de 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/autorizaciones?tab=pagos')
  const d = tarjeta(page, `PIX-D-${sufijo}`)
  await expect(d).toBeVisible({ timeout: 20_000 })
  await esperarAnimaciones(page)
  const medida = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }))
  expect(medida.ancho, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(medida.visible + 1)
  for (const nombre of ['Aprobar', 'Rechazar']) {
    const caja = await d.getByRole('button', { name: nombre }).boundingBox()
    expect(caja.height, `${nombre} debe medir 44 px`).toBeGreaterThanOrEqual(43.5)
  }
  await expect(d.getByTestId('pago-verificar-monto')).toContainText('1.251.000')
})
