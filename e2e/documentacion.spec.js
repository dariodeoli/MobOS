// Documentación interna (#159): buscador con resultados, ubicación exacta y
// enlace directo a la pantalla donde se configura.

import { test, expect } from '@playwright/test'

test('la documentación busca por tema y lleva a la pantalla', async ({ page }) => {
  await page.goto('/configuracion/documentacion')
  await expect(page.getByTestId('documentacion')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Documentación interna' })).toBeVisible()

  await page.getByLabel('Buscar en la documentación').fill('PIN')
  await expect(page.getByRole('heading', { name: 'Staff, roles y PIN' })).toBeVisible()

  await page.getByRole('button', { name: 'Ir a Staff, roles y PIN' }).click()
  await expect(page).toHaveURL(/\/configuracion\/equipo$/)
  await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
})

test('la documentación filtra por módulo y avisa cuando no hay resultados', async ({ page }) => {
  await page.goto('/configuracion/documentacion')
  const pantalla = page.getByTestId('documentacion')
  await pantalla.getByRole('button', { name: 'Finanzas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Caja del día' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cargar una venta' })).toHaveCount(0)

  await page.getByLabel('Buscar en la documentación').fill('xyz-no-existe')
  await expect(page.getByText('Sin resultados.')).toBeVisible()
})
