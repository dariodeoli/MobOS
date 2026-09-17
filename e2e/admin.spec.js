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
    await expect(page.getByText(new RegExp(`IMEI ${SEED.products.iphone.imei}`))).toBeVisible()
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

    const telefono = alta.getByPlaceholder('0981 123 456')
    await telefono.fill('0981123456')
    await expect(telefono).toHaveValue('0981123456')

    const limite = alta.locator('label', { hasText: 'Límite de crédito (Gs)' }).locator('input')
    await limite.fill('3000000')
    await expect(limite).toHaveValue('3.000.000')
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
