// Listas de precios y precios por cantidad (#28): la gestión en Configuración
// crea una lista con ítem y un escalón, la ficha del cliente asigna la lista y
// el POS vende aplicando el escalón (prioridad: escalón por cantidad > lista >
// mayorista > minorista). Al final se limpia lo creado para no ensuciar el seed.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test('gestión de listas y venta con escalón aplica el precio por cantidad', async ({ page }) => {
  const marca = Date.now().toString(36)
  const sku = `E2E-PRECIO-${marca}`.toUpperCase()
  const nombreProducto = `Producto precios ${marca}`
  const nombreLista = `Lista E2E ${marca}`
  const nombreCliente = `Cliente lista ${marca}`

  // La gestión vive en Configuración → Negocio → Listas de precios.
  await page.goto('/configuracion/precios')
  await expect(page.getByRole('heading', { name: 'Listas de precios', level: 2 })).toBeVisible()

  // Producto de prueba con precio minorista y mayorista bien diferenciados.
  const alta = await page.evaluate(
    async ({ api, sku, nombreProducto }) => {
      const response = await fetch(`${api}/api/products`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, name: nombreProducto, category: 'Accesorios', pricePyg: 100000, wholesalePricePyg: 80000, stock: 20, branchId: 'e2e-branch-1' }),
      })
      return { status: response.status, body: await response.json().catch(() => null) }
    },
    { api: API, sku, nombreProducto },
  )
  expect(alta.status).toBe(201)
  const productoId = alta.body?.id
  // El catálogo del panel se hidrata al cargar la sesión: recargar trae el
  // producto recién creado al buscador de la gestión.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Listas de precios', level: 2 })).toBeVisible()

  // ── Lista de precios: 10% de descuento por producto ─────────────────────
  await page.getByRole('button', { name: '+ Nueva lista' }).click()
  const dialogoLista = page.getByRole('dialog', { name: 'Nueva lista de precios' })
  await dialogoLista.getByLabel('Nombre').fill(nombreLista)
  await dialogoLista.getByRole('button', { name: '+ Ítem' }).click()
  await dialogoLista.getByPlaceholder('Producto…').fill(nombreProducto)
  await dialogoLista.getByRole('option', { name: new RegExp(nombreProducto) }).click()
  await dialogoLista.getByLabel('Porcentaje').fill('10')
  await dialogoLista.getByRole('button', { name: 'Guardar lista' }).click()
  const filaLista = page.getByTestId('lista-precio-fila').filter({ hasText: nombreLista })
  await expect(filaLista).toBeVisible()
  await expect(filaLista).toContainText('1 ítem')

  // ── Precios por cantidad: desde 3 unidades, 70.000 ──────────────────────
  await page.getByPlaceholder('Elegí el producto…').fill(nombreProducto)
  await page.getByRole('option', { name: new RegExp(nombreProducto) }).first().click()
  await page.getByRole('button', { name: '+ Escalón' }).click()
  await page.getByLabel('Cantidad mínima').fill('3')
  await page.getByLabel('Precio unitario del escalón').fill('70000')
  await page.getByRole('button', { name: 'Guardar escalones' }).click()
  await expect(page.getByText('Precios por cantidad guardados.')).toBeVisible()

  // ── Asignación desde la ficha del cliente ───────────────────────────────
  const cliente = await page.evaluate(
    async ({ api, nombre }) => {
      const response = await fetch(`${api}/api/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      return response.ok ? response.json() : null
    },
    { api: API, nombre: nombreCliente },
  )
  expect(cliente?.id).toBeTruthy()
  // La lista de clientes en vista de tabla expone las filas con testid.
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  await page.goto('/clientes')
  await page.getByLabel('Buscar clientes').fill(nombreCliente)
  await page.getByTestId('cliente-fila').filter({ hasText: nombreCliente }).first().click()
  const listaSelect = page.getByLabel('Lista de precios')
  await expect(listaSelect).toBeVisible()
  await listaSelect.selectOption({ label: nombreLista })
  await expect(page.getByText('Lista de precios asignada.')).toBeVisible()
  await page.keyboard.press('Escape')

  // ── Venta con escalón: 3 unidades al precio del escalón ─────────────────
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(nombreCliente)
  await page.getByPlaceholder('Buscar producto…').fill(nombreProducto)
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).first().click()
  await page.getByLabel(`Cantidad de ${nombreProducto}`).fill('3')
  await expect(page.getByLabel(`Precio de venta de ${nombreProducto}`)).toHaveValue('70.000')

  const paymentsSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await paymentsSection.getByLabel('Cuenta de cobro').first().click()
  await page.getByRole('option', { name: /Caja E2E/ }).click()
  await paymentsSection.getByLabel('Monto original').fill('210000')
  await expect(paymentsSection.getByText('Pendiente').first().locator('strong')).toHaveText('Gs 0')
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page.getByText('Venta registrada correctamente. Ya podés cargar la siguiente.')).toBeVisible()

  // La línea quedó con el precio del escalón y su origen congelado (el escalón
  // gana sobre la lista del cliente, que también cubre el producto).
  const linea = await page.evaluate(
    async ({ api, cliente }) => {
      const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
      if (!response.ok) return null
      const rows = await response.json()
      const order = rows.find((row) => row.customer?.name === cliente)
      const item = order?.items?.find((row) => row.unitPricePyg === 70000)
      return item ? { unitPricePyg: item.unitPricePyg, listPricePyg: item.listPricePyg, priceSource: item.priceSource } : null
    },
    { api: API, cliente: nombreCliente },
  )
  expect(linea).toEqual({ unitPricePyg: 70000, listPricePyg: 70000, priceSource: 'TIER' })

  // Limpieza: escalones, lista y asignación fuera para no afectar otras corridas.
  await page.evaluate(
    async ({ api, productoId, clienteId, nombreLista }) => {
      const json = { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
      await fetch(`${api}/api/customers/${encodeURIComponent(clienteId)}`, { ...json, method: 'PATCH', body: JSON.stringify({ priceListId: null }) })
      const listas = await fetch(`${api}/api/price-lists?all=1`, { credentials: 'include' }).then((response) => response.json()).catch(() => [])
      const lista = (listas || []).find((row) => row.name === nombreLista)
      if (lista) await fetch(`${api}/api/price-lists?id=${encodeURIComponent(lista.id)}`, { ...json, method: 'DELETE' })
    },
    { api: API, productoId, clienteId: cliente.id, nombreLista },
  )
})
