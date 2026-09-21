// #145: el Análisis es la vista extendida del negocio y no tenía cobertura
// e2e propia. Verifica la navegación por pestañas y que las vistas compartan
// el mismo lenguaje de métricas (rango, períodos y resultados).
import { test, expect } from '@playwright/test'

test.describe('análisis', () => {
  test('la vista extendida abre en Reportes y comparte el período con Ganancias', async ({ page }) => {
    await page.goto('/analisis')
    await expect(page).toHaveURL(/\/analisis\/reportes$/)
    await expect(page.getByRole('tab', { name: 'Reportes' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Total del período')).toBeVisible()

    await page.getByRole('tab', { name: 'Ganancias' }).click()
    await expect(page).toHaveURL(/\/analisis\/ganancias$/)
    await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mes', exact: true })).toBeVisible()
  })

  test('Ganadores y Asistente viven en el mismo Análisis', async ({ page }) => {
    await page.goto('/analisis/ganadores')
    await expect(page.getByRole('heading', { name: 'Productos ganadores' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Semana' })).toBeVisible()

    await page.getByRole('tab', { name: 'Asistente' }).click()
    await expect(page).toHaveURL(/\/analisis\/asistente$/)
    await expect(page.getByRole('heading', { name: 'Asistente de ganancias' })).toBeVisible()
  })
})
