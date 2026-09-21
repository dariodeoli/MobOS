import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// La búsqueda global (Ctrl+K) cubre cotizaciones: el resultado aparece
// agrupado por tipo y Enter abre el listado con el filtro aplicado.
test('búsqueda global: encuentra una cotización por su número y la abre filtrada', async ({ page }) => {
  await page.goto('/ventas')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  const cotizacion = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/quotes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'Cliente Búsqueda Global E2E',
        items: [{ description: 'Equipo búsqueda global', quantity: 1, unitPricePyg: 150000 }],
      }),
    })
    return response.ok ? await response.json() : null
  }, API)
  expect(cotizacion?.number, 'La cotización sembrada necesita número.').toBeTruthy()

  await page.keyboard.press('Control+k')
  const buscador = page.getByRole('combobox', { name: 'Buscar en toda la tienda' })
  await expect(buscador).toBeVisible()
  await expect(buscador).toBeFocused()
  await buscador.fill(cotizacion.number)

  await expect(page.getByRole('group', { name: 'Cotizaciones' })).toBeVisible()
  // El buscador global tiene su propia lista: se acota para no chocar con los
  // <option> nativos de la página (la venta ahora es todo en uno).
  const listaGlobal = page.getByRole('dialog').getByRole('listbox')
  await expect(listaGlobal.getByRole('option').filter({ hasText: cotizacion.number })).toBeVisible()
  await expect(listaGlobal.getByRole('option').first()).toContainText(cotizacion.number)

  // Esc cierra el diálogo sin navegar.
  await buscador.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Flecha abajo resalta la primera opción y Enter abre Cotizaciones con ?q=.
  await page.keyboard.press('Control+k')
  await expect(buscador).toBeVisible()
  await buscador.fill(cotizacion.number)
  await expect(page.getByRole('group', { name: 'Cotizaciones' })).toBeVisible()
  await buscador.press('ArrowDown')
  await buscador.press('Enter')

  await expect(page).toHaveURL(/\/cotizaciones\?q=/)
  await expect(page.getByText(cotizacion.number).first()).toBeVisible()
})
