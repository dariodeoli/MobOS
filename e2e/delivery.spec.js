// Delivery propio de punta a punta: login aparte del repartidor, pedidos
// asignados con dirección y teléfono, pre-cobro en la calle y rendición que la
// tienda verifica. El seed (global-setup) crea el usuario REPARTIDOR y el
// pedido asignado, y lo reinicia en cada corrida.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany } from './helpers/login.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function entrarConPin(page, pin, destino) {
  await loginCompany(page)
  await page.locator('#seller-pin').pressSequentially(pin)
  await expect(page).toHaveURL(destino)
}

test.describe('delivery', () => {
  test('el repartidor ve sus pedidos, cobra en la calle y la tienda verifica la rendición', async ({ page, browser }) => {
    await entrarConPin(page, SEED.repartidor.pin, /\/delivery\/repartos$/)

    // Navegación propia: sin panel de venta.
    const nav = page.locator('aside nav')
    await expect(nav.getByRole('button', { name: 'Mis repartos', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Rendiciones', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Cargar venta', exact: true })).toHaveCount(0)

    // El panel de venta no es su lugar: la URL vuelve al reparto.
    await page.goto('/ventas')
    await expect(page).toHaveURL(/\/delivery\/repartos$/)

    // El pedido asignado trae cliente, dirección y teléfono; y solo ese.
    const tarjeta = page.locator(`[data-testid="reparto-pedido"][data-pedido="${SEED.deliveryOrderNumber}"]`)
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText(SEED.deliveryCustomer.name)
    await expect(tarjeta).toContainText('Av. Reparto E2E 123')
    await expect(tarjeta.locator('a[href*="595981555111"]')).toBeVisible()
    await expect(tarjeta).toContainText('Falta cobrar')
    await expect(tarjeta).toContainText('Gs 45.000')
    await expect(page.locator('[data-testid="reparto-pedido"]')).toHaveCount(1)

    // La API de gestión no está a su alcance.
    const auditoria = await page.request.get(`${API}/api/audit`, { headers: { origin: new URL(page.url()).origin } })
    expect(auditoria.status()).toBe(403)

    // Pre-cobro parcial en la calle.
    await tarjeta.getByTestId('reparto-cobrar').click()
    await page.locator('#delivery-monto').fill('1000')
    await page.getByTestId('reparto-cobro-confirmar').click()
    await expect(page.getByText('Cobro registrado')).toBeVisible()
    await expect(tarjeta).toContainText('Cobrado en la calle (sin rendir)')
    await expect(tarjeta).toContainText('Gs 44.000')

    // Rendición: queda pendiente de verificación en la tienda.
    await nav.getByRole('button', { name: 'Rendiciones', exact: true }).click()
    await expect(page.getByTestId('rendicion-total')).toContainText('Gs 1.000')
    await page.getByTestId('rendir-abrir').click()
    await page.getByTestId('rendir-confirmar').click()
    await expect(page.getByText('Rendición registrada')).toBeVisible()
    const rendicion = page.locator('[data-testid="rendicion"]').first()
    await expect(rendicion).toContainText('Pendiente')
    await expect(rendicion).toContainText('Gs 1.000')
    await expect(rendicion).toContainText(SEED.deliveryOrderNumber)

    // La tienda entra con su propio acceso y verifica la rendición.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const tienda = await contexto.newPage()
    await entrarConPin(tienda, SEED.admin.pin, /\/resumen$/)
    await tienda.goto('/delivery')
    await expect(tienda.getByRole('heading', { name: 'Delivery' })).toBeVisible()
    // Pestaña Repartos: el pedido figura asignado al repartidor con lo cobrado.
    await tienda.getByRole('button', { name: 'Asignados', exact: true }).click()
    const filaTienda = tienda.locator(`[data-testid="reparto-admin-pedido"][data-pedido="${SEED.deliveryOrderNumber}"]`)
    await expect(filaTienda).toContainText(SEED.repartidor.name)
    await expect(filaTienda).toContainText('Cobrado en la calle sin rendir')
    await tienda.getByRole('button', { name: 'Rendiciones', exact: true }).first().click()
    const pendiente = tienda.locator('[data-testid="rendicion-admin"]').filter({ hasText: SEED.deliveryOrderNumber }).first()
    await expect(pendiente).toContainText(SEED.repartidor.name)
    await expect(pendiente).toContainText('Gs 1.000')
    await pendiente.getByTestId('rendicion-verificar').click()
    await tienda.locator('[role="dialog"]').getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(tienda.getByText('Rendición verificada')).toBeVisible()

    // El repartidor ve el cobro confirmado y el pedido saldado.
    await page.reload()
    await expect(page.getByTestId('rendicion-total')).toContainText('Gs 0')
    const verificada = page.locator('[data-testid="rendicion"]').first()
    await expect(verificada).toContainText('Verificada')
    await nav.getByRole('button', { name: 'Mis repartos', exact: true }).click()
    await expect(tarjeta).toContainText('Confirmado en tienda')
    await expect(tarjeta).toContainText('Gs 1.000')

    await contexto.close()
  })
})
