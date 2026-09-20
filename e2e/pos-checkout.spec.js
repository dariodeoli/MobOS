// Full POS checkout through the real API as the seeded seller (PIN 2468):
// search product → add to cart → review → split payment across two payment
// accounts → save → success banner → sale appears in /pos/pedidos.
//
// The checkout uses the account-based payment rows (Cuenta de cobro +
// Monto original); the legacy method-only fallback only renders when the
// tenant has no payment accounts and is not exercised here.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { codigoPedido } from '../src/utils/pedido.js'

const customerName = `${SEED.checkoutCustomer} ${Date.now().toString(36)}`
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function orderItems(page, name) {
  return page.evaluate(
    async ({ api, customer }) => {
      const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
      if (!response.ok) return { status: response.status }
      const rows = await response.json()
      const order = rows.find(row => row.customer?.name === customer)
      return order
        ? order.items.map(item => ({
            listPricePyg: item.listPricePyg,
            unitPricePyg: item.unitPricePyg,
          }))
        : null
    },
    { api: API, customer: name },
  )
}

test('POS checkout with split payment registers the sale and lists it in pedidos', async ({
  page,
}) => {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // Step 1: customer + product.
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(customerName)
  const search = page.getByPlaceholder('Buscar producto…')
  await search.fill('Cable')
  const productCard = page.getByRole('button', { name: new RegExp(SEED.products.cable.name) })
  await expect(productCard).toBeVisible()
  // Un clic agrega el producto a la lista de la venta.
  await productCard.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  // Todo en una página: carrito y cobro conviven, sin pasos.
  await expect(page.getByText(SEED.products.cable.name).last()).toBeVisible()

  // Payments. The seeded tenant has two PYG accounts (CASH and
  // TRANSFER), so the account-based rows are used.
  const addPayment = page.getByRole('button', { name: '+ Agregar pago' })
  await expect(addPayment).toBeEnabled()
  const paymentsSection = page
    .locator('div.space-y-3')
    .filter({ has: page.getByText('Pagos de esta venta') })
  const accountSelects = paymentsSection.getByLabel('Cuenta de cobro')
  const amountInputs = paymentsSection.getByLabel('Monto original')

  // Partial payment on the first account (cash).
  await addPayment.click()
  await expect(accountSelects).toHaveCount(1)
  await accountSelects.nth(0).selectOption({ label: 'Caja E2E · PYG · CASH' })
  await amountInputs.nth(0).fill('25000')
  await expect(paymentsSection.getByText('Equivalente: Gs 25.000')).toBeVisible()

  // Second payment account covers the remainder.
  await addPayment.click()
  await expect(accountSelects).toHaveCount(2)
  await accountSelects.nth(1).selectOption({ label: 'Transferencia E2E · PYG · TRANSFER' })
  await amountInputs.nth(1).fill('20000')
  await expect(paymentsSection.getByText('Equivalente: Gs 20.000')).toBeVisible()

  // Totals must balance before saving.
  const pendiente = paymentsSection.getByText('Pendiente').first()
  await expect(pendiente.locator('strong')).toHaveText('Gs 0')

  // Delivery notes are optional: the backend accepts an omitted empty note
  // (fixed in the Phase-3 merge), so no observation is required here.
  await page.getByRole('button', { name: /^Guardar venta/ }).click()

  // Success banner with print actions.
  const banner = page
    .getByRole('status')
    .filter({ hasText: 'Venta registrada correctamente. Ya podés cargar la siguiente.' })
  await expect(banner).toBeVisible()
  // Vista previa del comprobante con nivel y formato elegibles.
  await banner.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await expect(page.getByLabel('Tipo de comprobante')).toBeVisible()
  await expect(page.getByLabel('Formato de impresión')).toBeVisible()
  await page.keyboard.press('Escape')

  // El código comercial es corto y secuencial (MOB-#0001); el id interno sigue
  // siendo un UUID y es lo que resuelve la navegación.
  const creada = await page.evaluate(
    async ({ api, customer }) => {
      const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
      if (!response.ok) return null
      const rows = await response.json()
      const order = rows.find(row => row.customer?.name === customer)
      return order ? { orderNumber: order.orderNumber, id: order.id } : null
    },
    { api: API, customer: customerName },
  )
  expect(creada?.orderNumber).toMatch(/^MOB-#\d{4,}$/)
  // El id interno no es el código comercial: la navegación no depende de él.
  expect(creada?.id).toBeTruthy()
  expect(creada?.id).not.toBe(creada?.orderNumber)

  // La venta aparece en el listado del vendedor. La columna Cliente muestra
  // nombre + primer apellido, así que el nombre completo no se ve en la tabla.
  await page.goto('/pos/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  const sale = page
    .getByTestId('pedido-fila')
    .filter({ hasText: codigoPedido(creada.orderNumber) })
    .first()
  await expect(sale).toBeVisible()
  await expect(sale).toContainText('×1')
  await expect(sale).toContainText('Cliente E2E')
  await expect(sale.getByText('Pagado', { exact: true })).toBeVisible()

  // Clic en la fila: abre la página del pedido por su id interno.
  await sale.click()
  await expect(page).toHaveURL(new RegExp(`/pos/pedidos/${creada.id}$`))
  await expect(page.getByText(codigoPedido(creada.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
})

// Listado de pedidos: buscador global, encabezados ordenables y filtros de cobro.
test('pedidos: buscador global, orden por columna y filtros', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const filas = page.getByTestId('pedido-fila')
  await expect(filas.first()).toBeVisible()

  // Pedido más reciente del vendedor, según la propia API.
  const ordenes = await page.evaluate(async api => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const primera = ordenes[0]
  expect(primera?.orderNumber).toBeTruthy()
  // El listado muestra el código interno como "MOB #0001".
  const codigoVisible = codigoPedido(primera.orderNumber)

  const buscador = page.getByLabel('Buscar pedidos')
  await buscador.fill(String(primera.totalPyg))
  await expect(filas.filter({ hasText: codigoVisible }).first()).toBeVisible()
  await buscador.fill('no-existe-xyz')
  await expect(filas).toHaveCount(0)
  await buscador.fill('')

  const total = page.getByRole('button', { name: 'Total' })
  await total.click()
  await expect(total).toContainText('↓')
  await total.click()
  await expect(total).toContainText('↑')

  // Filtros de cobro: "No pagados" oculta un pedido ya pagado.
  await page.getByRole('button', { name: 'No pagados', exact: true }).click()
  await expect(filas.filter({ hasText: codigoVisible })).toHaveCount(0)
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await expect(filas.filter({ hasText: codigoVisible }).first()).toBeVisible()
})

// Clic en una fila: abre el pedido individual sin error. La URL usa el id
// interno (UUID), no el código comercial, así que renombrar el código no
// rompe enlaces ni relaciones.
test('pedidos: clic en la fila abre el pedido por su id interno', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const filas = page.getByTestId('pedido-fila')
  await expect(filas.first()).toBeVisible()

  const ordenes = await page.evaluate(async api => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const primera = ordenes[0]
  expect(primera?.id).toBeTruthy()

  const errores = []
  page.on('pageerror', error => errores.push(error.message))

  await filas
    .filter({ hasText: codigoPedido(primera.orderNumber) })
    .first()
    .click()
  await expect(page).toHaveURL(new RegExp(`/pos/pedidos/${primera.id}$`))

  await expect(page.getByText(codigoPedido(primera.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()

  // Recargar sobre la URL del pedido lo vuelve a resolver por id.
  await page.reload()
  await expect(page.getByText(codigoPedido(primera.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()

  await page.getByRole('button', { name: 'Volver a pedidos' }).click()
  await expect(page).toHaveURL(/\/pos\/pedidos$/)
  expect(errores, 'la vista del pedido no debe romper con errores de runtime').toEqual([])
})

// El país de la dirección se puede vaciar (no vuelve solo) y el resumen
// lateral muestra el total de la venta y abre el carrito.
test('POS clears the address country and the summary opens the cart', async ({ page }) => {
  await page.goto('/pos/cargar')
  await page
    .getByLabel('Nombre, teléfono, CI o RUC del cliente')
    .fill(`${SEED.checkoutCustomer} pais ${Date.now().toString(36)}`)

  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByRole('button', { name: '+ Dirección' }).click()
  const pais = page.getByLabel('País', { exact: true })
  await expect(pais).toHaveValue('Paraguay')
  await pais.fill('')
  await expect(pais).toHaveValue('')

  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await expect(page.getByText('Total de esta venta')).toBeVisible()

  await expect(page.getByText('Productos de esta venta')).toBeVisible()
})

// Sin límite de productos: cada clic suma una fila a la venta y el total
// se recalcula con los tres productos juntos.
test('POS keeps every clicked product in the sale list', async ({ page }) => {
  await page.goto('/pos/cargar')
  await page
    .getByLabel('Nombre, teléfono, CI o RUC del cliente')
    .fill(`${SEED.checkoutCustomer} tres ${Date.now().toString(36)}`)

  const search = page.getByPlaceholder('Buscar producto…')
  const elegidos = [SEED.products.cable, SEED.products.funda, SEED.products.auris]
  for (const producto of elegidos) {
    await search.fill(producto.name)
    await page.getByRole('button', { name: new RegExp(producto.name) }).click()
    await expect(page.getByLabel(`Cantidad de ${producto.name}`)).toBeVisible()
  }

  const total = elegidos.reduce((sum, producto) => sum + producto.pricePyg, 0)
  await expect(page.getByText(`Gs ${total.toLocaleString('es-PY')}`).first()).toBeVisible()
})

// Cliente: búsqueda por razón social de facturación, selección con marca
// visible, precarga de la factura y "Quitar cliente" sin recargar la página.
test('POS finds a customer by billing name, shows the selection and clears it', async ({
  page,
}) => {
  const stamp = Date.now().toString(36)
  const name = `${SEED.checkoutCustomer} factura ${stamp}`
  const razon = `Empresa E2E ${stamp}`
  await page.goto('/pos/cargar')
  const creado = await page.evaluate(
    async ({ api, name, razon }) => {
      const response = await fetch(`${api}/api/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, billingName: razon, billingDocument: '80012345-6' }),
      })
      return response.ok ? await response.json() : { status: response.status }
    },
    { api: API, name, razon },
  )
  expect(creado?.id).toBeTruthy()

  const buscador = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')

  // La búsqueda llega por la razón social que salió en la factura.
  await buscador.fill(razon)
  await page.getByRole('button', { name: new RegExp(name) }).click()

  const seleccion = page.getByText('Cliente seleccionado')
  await expect(seleccion).toBeVisible()

  // La factura guardada en la ficha se propone de nuevo en esta venta.
  await page.getByText('Factura a otro titular (opcional)').click()
  await expect(page.getByLabel('Nombre del titular de factura')).toHaveValue(razon)
  await expect(page.getByLabel('RUC del titular de factura')).toHaveValue('80012345-6')

  await page.getByRole('button', { name: '× Quitar cliente' }).click()
  await expect(seleccion).toHaveCount(0)
  await expect(buscador).toHaveValue('')
})

// Precio manual por debajo de lista: la venta guarda el precio de lista y el
// comprobante muestra el descuento; por encima de lista se muestra normal.
// Solo gerencia/dueño vende bajo lista sin autorización: el vendedor ve el
// bloque de solicitud, que se cubre en su propio test.
test('POS manual price below list stores the list price for the receipt', async ({ browser }) => {
  const name = `${SEED.checkoutCustomer} manual ${Date.now().toString(36)}`
  // Contexto propio con la sesión del dueño: no se cierra la sesión sembrada
  // del vendedor (la comparten los demás tests del proyecto).
  const context = await browser.newContext({
    storageState: new URL('./.auth/admin.json', import.meta.url).pathname,
  })
  const page = await context.newPage()
  try {
    await page.goto('/pos/cargar')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(name)

    await page.getByPlaceholder('Buscar producto…').fill('Cable')
    await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()

    // Precio manual 40.000 sobre lista 45.000: la fila marca el descuento.
    await page.getByLabel(`Precio de venta de ${SEED.products.cable.name}`).fill('40000')
    await expect(page.getByText('descuento − Gs 5.000')).toBeVisible()


    const paymentsSection = page
      .locator('div.space-y-3')
      .filter({ has: page.getByText('Pagos de esta venta') })
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    await paymentsSection
      .getByLabel('Cuenta de cobro')
      .selectOption({ label: 'Caja E2E · PYG · CASH' })
    await paymentsSection.getByLabel('Monto original').fill('40000')
    await expect(paymentsSection.getByText('Equivalente: Gs 40.000')).toBeVisible()

    await page.getByRole('button', { name: /^Guardar venta/ }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' }),
    ).toBeVisible()

    await expect
      .poll(async () => orderItems(page, name))
      .toEqual([{ listPricePyg: SEED.products.cable.pricePyg, unitPricePyg: 40000 }])
  } finally {
    await context.close()
  }
})

// Vendedor sin permiso: bajar el precio de lista ofrece el bloque de solicitud
// a gerencia. Con una pendiente previa del mismo producto, el bloque la
// muestra; sin ella, el botón queda disponible para pedirla.
test('POS shows the price authorization block for a below-list price', async ({ page }) => {
  await page.goto('/pos/cargar')
  await page
    .getByLabel('Nombre, teléfono, CI o RUC del cliente')
    .fill(`${SEED.checkoutCustomer} autorización ${Date.now().toString(36)}`)
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await page.getByLabel(`Precio de venta de ${SEED.products.cable.name}`).fill('40000')
  await expect(page.getByText('Precio por debajo de lista')).toBeVisible()
  const solicitar = page.getByRole('button', { name: 'Solicitar autorización' })
  if ((await solicitar.count()) && (await solicitar.first().isEnabled())) {
    // El envío deshabilita el botón: force evita la carrera de actionability
    // (el elemento se deshabilita mientras Playwright espera estabilidad).
    await solicitar.first().click({ force: true })
  }
  await expect(page.getByText('Pendiente').first()).toBeVisible()
})

// Con stock disponible, el servidor exige el IMEI exacto: el modal bloquea
// "vender sin IMEI" y la venta se completa reservando la unidad física.
test('POS vende un equipo serializado con su IMEI y bloquea el sobre pedido con stock', async ({ page }) => {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente serial ${Date.now().toString(36)}`)
  await page.getByPlaceholder('Buscar producto…').fill(SEED.products.iphone.name)
  await page.getByRole('button', { name: new RegExp(SEED.products.iphone.name) }).first().click()

  await page.getByRole('button', { name: 'Elegir IMEI' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText('Equipo físico / IMEI')).toBeVisible()
  // Hay una unidad disponible: "sin IMEI" queda bloqueado y se explica.
  await expect(dialogo.getByRole('checkbox')).toBeDisabled()
  await expect(dialogo.getByText(/Con stock no se vende sin IMEI/)).toBeVisible()
  await dialogo.getByRole('button', { name: 'Reservar este' }).first().click()
  await dialogo.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('button', { name: 'Cambiar IMEI' })).toBeVisible()

  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const paymentsSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await paymentsSection.getByLabel('Cuenta de cobro').nth(0).selectOption({ label: 'Caja E2E · PYG · CASH' })
  await paymentsSection.getByLabel('Monto original').nth(0).fill(String(SEED.products.iphone.pricePyg))
  await page.getByRole('button', { name: /^Guardar venta/ }).click()
  await expect(page.getByText('Venta registrada correctamente. Ya podés cargar la siguiente.')).toBeVisible({ timeout: 15_000 })
})
