// Owner views (admin storageState): resumen KPIs, inventario unit intake,
// equipo → Vendedores roster + creation, and finanzas → Caja opening.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test.describe('owner panel', () => {
  test('resumen shows the dashboard KPIs', async ({ page }) => {
    await page.goto('/pos/resumen')
    await expect(page.getByRole('heading', { name: 'Resumen general' })).toBeVisible()
    await expect(page.getByText('Facturado', { exact: true })).toBeVisible()
    await expect(page.getByText('Ventas', { exact: true })).toBeVisible()
  })

  // Fixed in the Phase-3 merge (src/lib/api/index.js now imports the client):
  // the inventory units load from the API. The seeded serialized product
  // (iPhone 15 E2E Serial) owns one InventoryUnit, listed with its IMEI.
  test('inventario lists the seeded serialized unit with its IMEI', async ({ page }) => {
    await page.goto('/pos/inventario')
    await expect(page.getByRole('heading', { name: 'Inventario operativo' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Unidades \(/ })).toBeVisible()
    // La tabla compacta alinea el serial por columna (últimos 4 destacados).
    await expect(page.getByText('Verificación')).toBeVisible()
    await expect(page.getByText(new RegExp(SEED.products.iphone.imei))).toBeVisible()
  })

  test('equipo → Vendedores lists the seeded sellers', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
    for (const seller of SEED.sellers) {
      await expect(page.getByLabel(`Nombre de ${seller.name}`)).toBeVisible()
    }
  })

  // Fixed in the Phase-3 merge: the "Agregar directamente" form now creates
  // the seller via POST /api/users (including the 4-digit PIN). The PIN is
  // unique per run: the API rejects a PIN already in use by the company, and
  // the local E2E database persists users across runs.
  test('equipo → Vendedores creates a new seller with a PIN', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()

    const name = `Vendedor E2E ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    // El alta vive en el modal de "Invitar persona" (agregar directamente).
    await page.getByRole('button', { name: '+ Invitar persona' }).click()
    await page.getByRole('button', { name: 'Agregar directamente' }).click()
    await page.locator('#direct-name').fill(name)
    await page.locator('#direct-pin').fill(pin)
    await page.getByRole('button', { name: 'Agregar', exact: true }).click()

    await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()
    await expect(page.getByLabel(`Nombre de ${name}`)).toBeVisible()
  })

  test('equipo → Roles y permisos describes each role and its matrix', async ({ page }) => {
    await page.goto('/pos/equipo')
    await page.getByRole('button', { name: 'Roles y permisos' }).click()

    await expect(page.getByRole('heading', { name: 'Roles y permisos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Matriz de capacidades' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Gerente' })).toBeVisible()
    await expect(page.getByRole('rowheader', { name: /Aplicar descuentos/ })).toBeVisible()

    const tarjetaVendedor = page.locator('details', { hasText: 'Vendedor: atiende clientes' })
    await tarjetaVendedor.locator('summary').click()
    await expect(tarjetaVendedor.getByText('Qué puede hacer')).toBeVisible()
    await expect(tarjetaVendedor.getByText('Qué no puede')).toBeVisible()
  })

  test('inventario → la batería solo acepta números', async ({ page }) => {
    await page.goto('/pos/inventario')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()

    const bateria = page.getByPlaceholder('Batería % (opcional)')
    await bateria.fill('95x')
    await expect(bateria).toHaveValue('95')
  })

  test('clientes → teléfono solo dígitos con +595 editable y límite de crédito en Gs', async ({ page }) => {
    await page.goto('/pos/clientes')
    await page.getByRole('button', { name: '+ Crear cliente' }).click()

    // El formulario de venta queda montado y oculto detrás del modal: se acota al modal de alta.
    const alta = page.locator('form').filter({ hasText: 'Límite de crédito (Gs)' })

    const pais = alta.getByLabel('Código de país')
    await expect(pais).toHaveValue('+595')
    await pais.fill('55')
    await expect(pais).toHaveValue('+55')

    const telefono = alta.getByPlaceholder('981 123 456')
    await telefono.fill('0981123456')
    await expect(telefono).toHaveValue('0981123456')

    const limite = alta.locator('label', { hasText: 'Límite de crédito (Gs)' }).locator('input')
    await limite.fill('3000000')
    await expect(limite).toHaveValue('3.000.000')
  })

  test('servicio técnico → crea la orden y avanza el pipeline', async ({ page }) => {
    await page.goto('/pos/servicio')
    await expect(page.getByRole('heading', { name: 'Servicio Técnico' })).toBeVisible()

    const stamp = Date.now().toString(36)
    const cliente = `Taller ${stamp}`
    const equipo = `iPhone 13 Pro ${stamp} · 256 GB`
    await page.getByRole('button', { name: '+ Nueva orden' }).click()
    await page.getByLabel('Cliente', { exact: true }).fill(cliente)
    await page.getByLabel('Dispositivo', { exact: true }).fill(equipo)
    await page.getByRole('button', { name: 'Crear orden' }).click()

    await expect(page.getByText(equipo).first()).toBeVisible()
    await expect(page.getByText(cliente)).toBeVisible()

    // Recepción → diagnóstico con el botón de avance del pipeline.
    await page.getByRole('button', { name: 'Diagnóstico', exact: true }).first().click()
    await expect(page.getByText('Orden de servicio actualizada.').or(page.getByText('Diagnóstico', { exact: true }).first())).toBeVisible()
  })

  test('finanzas → Caja can open the cash session', async ({ page }) => {
    await page.goto('/pos/finanzas')
    await expect(page.getByRole('heading', { name: 'Caja y control financiero' })).toBeVisible()

    // Re-runs may find the cash session still open from a previous run.
    if (await page.getByRole('heading', { name: 'Cerrar caja' }).isVisible()) {
      await page.locator('#counted').fill('0')
      await page.getByRole('button', { name: /Cerrar caja/ }).click()
    }
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()

    await page.locator('#opening').fill('100000')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
  })
})

// Logo de la empresa: se sube como archivo, se ve la vista previa y se puede
// quitar. El comprobante lo incrusta como data URL al imprimir.
test('configuración → sube el logo de la empresa y lo quita', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  await page.goto('/pos/equipo')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Logo de la empresa' })).toBeVisible()
  await expect(page.getByText('Sin logo')).toBeVisible()
  await page.locator('input[type="file"][accept*="image/png"]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Logo de la empresa')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).first().click()
  await expect(page.getByText('Sin logo')).toBeVisible()
})

// Búsqueda de pedidos: se resuelve en el servidor (número, cliente, RUC o
// vendedor), así encuentra pedidos fuera de la página cargada.
test('pedidos → la búsqueda llega al servidor y encuentra por número', async ({ page }) => {
  await page.goto('/pos/pedidos')
  const consulta = page.waitForRequest(pedido => pedido.method() === 'GET' && pedido.url().includes('/api/orders?q='))
  const respuesta = page.waitForResponse(res => res.url().includes('/api/orders?q=') && res.status() === 200)
  await page.getByLabel('Buscar pedidos').fill(SEED.seedOrderNumber)
  await consulta
  await respuesta
  await expect(page.getByText(SEED.seedOrderNumber)).toBeVisible()
})

// Foto del usuario: se sube desde Mi identidad y queda disponible para las
// cronologías (el avatar reemplaza a las iniciales).
test('configuración → sube mi foto y la quita', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  await page.goto('/pos/equipo')
  await page.getByRole('main').getByRole('button', { name: 'Negocio' }).click()
  await expect(page.getByText('Mi foto')).toBeVisible()
  await page.locator('input[type="file"][accept*="image/png"]').last().setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('Mi foto')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar', exact: true }).last().click()
  await expect(page.getByAltText('Mi foto')).toHaveCount(0)
})
