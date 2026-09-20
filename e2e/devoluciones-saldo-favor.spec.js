// Devolución con reposición por unidad y saldo a favor (issue #101): el
// mostrador devuelve equipos serializados, decide por IMEI si vuelven a la
// venta o quedan en revisión, deja el reintegro como saldo a favor del cliente
// y ese saldo se usa como medio de pago en una venta nueva desde el POS.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { formatGsInput } from '../src/utils/moneda.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const marca = Date.now().toString(36).toUpperCase()
const clienteNombre = `Cliente Devolución ${marca}`

test('devolución: repone por unidad, deja saldo a favor y se usa en otra venta', async ({ page }) => {
  // Página real primero: el fixture por API necesita origen y cookies de sesión.
  await page.goto('/pos/resumen')
  await expect(page.getByRole('heading', { name: /Resumen/ })).toBeVisible()

  // Fixture por API: venta de dos equipos serializados, pagada al contado.
  const fixture = await page.evaluate(
    async ({ api, nombre }) => {
      const pedir = async (url, options) => {
        const response = await fetch(`${api}${url}`, { credentials: 'include', ...options })
        const body = await response.json().catch(() => null)
        return { status: response.status, body }
      }
      const productos = await pedir('/api/products')
      const producto = (productos.body || []).find(row => row.sku === 'E2E-IPHONE15')
      const unidades = await pedir(`/api/inventory-units?q=${encodeURIComponent('E2E-IPHONE15')}`)
      const seriales = (unidades.body || [])
        .filter(unit => unit.status === 'AVAILABLE' && unit.productId === producto.id)
        .slice(0, 2)
        .map(unit => unit.serial)
      const cliente = await pedir('/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      const venta = await pedir('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: cliente.body.id,
          items: [{ productId: producto.id, description: producto.name, quantity: seriales.length, unitPricePyg: producto.pricePyg, inventoryUnitSerials: seriales }],
          payment: { method: 'CASH', amountPyg: producto.pricePyg * seriales.length },
        }),
      })
      return { cliente: cliente.body, producto: { id: producto.id, name: producto.name, pricePyg: producto.pricePyg }, seriales, stockAntes: Number(producto.stock || 0), venta: venta.body }
    },
    { api: API, nombre: clienteNombre },
  )
  expect(fixture.venta?.id).toBeTruthy()
  expect(fixture.seriales.length).toBe(2)

  // El mostrador abre los pagos del pedido desde el detalle de ventas y
  // registra la devolución. La lista se recarga para incluir la venta nueva.
  await page.reload()
  const fila = page.locator('tr', { hasText: clienteNombre }).first()
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: /Pagos/ }).click()

  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('heading', { name: /Pagos/ })).toBeVisible()
  await dialogo.getByRole('button', { name: 'Registrar cambio o devolución…' }).click()
  await dialogo.getByRole('button', { name: 'Dejar saldo a favor' }).click()

  // Devolución parcial: se deja la mitad del total cobrado como saldo a favor.
  const reembolso = fixture.producto.pricePyg
  await dialogo.getByLabel('Monto de reembolso').fill(String(reembolso))
  // Reposición por unidad: el primer IMEI vuelve a la venta, el segundo queda
  // en revisión. La decisión general queda sin reponer por defecto.
  await dialogo.getByLabel(`Reposición de ${fixture.seriales[0]}`).selectOption('AVAILABLE')
  await dialogo.getByLabel(`Reposición de ${fixture.seriales[1]}`).selectOption('REVIEW')
  await dialogo.getByLabel('Motivo de la postventa').fill('Un equipo con falla y otro sin uso')
  await dialogo.getByRole('button', { name: 'Confirmar postventa' }).click()

  await expect(dialogo.getByRole('status')).toContainText('Devolución registrada como saldo a favor del cliente')
  await expect(dialogo.getByText(new RegExp(`Saldo a favor disponible: Gs ${reembolso.toLocaleString('es-PY')}`))).toBeVisible()

  // Backend: los IMEI quedaron en su estado, el stock repuesto es uno solo y el
  // saldo a favor del cliente es exactamente el reembolso.
  const estado = await page.evaluate(
    async ({ api, ids }) => {
      const unidades = await (await fetch(`${api}/api/inventory-units?q=${encodeURIComponent('E2E-IPHONE15')}`, { credentials: 'include' })).json()
      const saldo = await (await fetch(`${api}/api/store-credits?customerId=${encodeURIComponent(ids.clienteId)}`, { credentials: 'include' })).json()
      const stock = await (await fetch(`${api}/api/stock`, { credentials: 'include' })).json()
      const producto = stock.find(row => row.id === ids.productoId)
      return {
        seriales: Object.fromEntries((unidades || []).filter(unit => ids.seriales.includes(unit.serial)).map(unit => [unit.serial, unit.status])),
        disponiblePyg: saldo.availablePyg,
        stock: Number(producto?.stock || 0),
      }
    },
    { api: API, ids: { clienteId: fixture.cliente.id, productoId: fixture.producto.id, seriales: fixture.seriales } },
  )
  expect(estado.seriales[fixture.seriales[0]]).toBe('AVAILABLE')
  expect(estado.seriales[fixture.seriales[1]]).toBe('DEFECTIVE')
  expect(estado.disponiblePyg).toBe(reembolso)
  // La venta descontó dos unidades y la devolución repuso una sola (la apta).
  expect(estado.stock).toBe(fixture.stockAntes - 1)

  await dialogo.getByRole('button', { name: 'Cerrar' }).click()

  // El saldo a favor se aplica en una venta nueva desde el POS.
  await page.goto('/pos/cargar')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(clienteNombre)
  await expect(page.getByText('Cliente seleccionado')).toBeVisible()
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await page.getByRole('button', { name: 'Revisar carrito', exact: true }).first().click()
  await page.getByRole('button', { name: 'Ir a cobrar' }).click()

  await expect(page.getByTestId('saldo-favor-pos')).toContainText(`Gs ${reembolso.toLocaleString('es-PY')}`)
  await page.getByRole('button', { name: 'Usar saldo a favor' }).click()
  const pagoSaldo = page.getByTestId('pago-saldo-favor')
  await expect(pagoSaldo).toBeVisible()
  await expect(pagoSaldo.getByLabel('Monto con saldo a favor')).toHaveValue(formatGsInput(SEED.products.cable.pricePyg))
  // El saldo cubre el total: el pendiente queda en cero y se puede guardar.
  const pendiente = page.getByText('Pendiente').first()
  await expect(pendiente.locator('strong')).toHaveText('Gs 0')
  await page.getByRole('button', { name: /^Guardar venta/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente' })).toBeVisible()

  // Backend: la venta nueva cobró con saldo a favor y el saldo bajó.
  const posterior = await page.evaluate(
    async ({ api, ids, precio }) => {
      const ordenes = await (await fetch(`${api}/api/orders`, { credentials: 'include' })).json()
      const nueva = (ordenes || []).find(row => row.customerId === ids.clienteId && row.payments?.some(payment => payment.method === 'STORE_CREDIT'))
      const saldo = await (await fetch(`${api}/api/store-credits?customerId=${encodeURIComponent(ids.clienteId)}`, { credentials: 'include' })).json()
      return { metodo: nueva?.payments?.find(payment => payment.method === 'STORE_CREDIT')?.method || null, disponiblePyg: saldo.availablePyg, precio }
    },
    { api: API, ids: { clienteId: fixture.cliente.id }, precio: SEED.products.cable.pricePyg },
  )
  expect(posterior.metodo).toBe('STORE_CREDIT')
  expect(posterior.disponiblePyg).toBe(reembolso - SEED.products.cable.pricePyg)
})
