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

  // #181: Reportes reutiliza el calendario y el desglose de Ganancias; los
  // números tienen que coincidir para el mismo período.
  test('Reportes reutiliza el resultado por día de Ganancias sin cambiar los números', async ({ page }) => {
    const esperarReporteDiario = () => page.waitForResponse(
      (respuesta) => respuesta.url().includes('/api/reports') && respuesta.url().includes('groupBy=day') && respuesta.status() === 200,
    )

    const [respuestaGanancias] = await Promise.all([esperarReporteDiario(), page.goto('/analisis/ganancias')])
    await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible()
    const totalesGanancias = (await respuestaGanancias.json())?.totals
    // La vista muestra primero el cálculo local y después el del backend (#171):
    // se espera a que el héroe declare la fuente del reporte (y a la cifra de
    // ventas). El conteo local puede coincidir con el del reporte, así que sin
    // esta espera la lectura podía caer en el cálculo sin costos congelados.
    await expect(page.getByTestId('ganancia-resultado')).toHaveAttribute('data-fuente', 'api', { timeout: 15_000 })
    await expect(page.getByText(`${totalesGanancias.orders} ventas en el período`)).toBeVisible({ timeout: 15_000 })
    // El héroe ya declara la fuente API, pero el texto puede cambiar un render
    // después: se espera a que se estabilice antes de capturarlo.
    await expect(async () => {
      const primera = (await page.getByTestId('ganancia-resultado').textContent())?.trim()
      await page.waitForTimeout(400)
      const segunda = (await page.getByTestId('ganancia-resultado').textContent())?.trim()
      expect(segunda).toBe(primera)
    }).toPass({ timeout: 15_000 })
    const resultadoGanancias = (await page.getByTestId('ganancia-resultado').textContent())?.trim()

    await Promise.all([esperarReporteDiario(), page.goto('/analisis/reportes?rango=hoy')])
    await expect(page.getByRole('heading', { name: 'Resultado por día' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cómo se calcula el resultado' })).toBeVisible()
    await expect(page.getByText('Mismos números que Análisis → Ganancias')).toBeVisible()
    await expect(page.getByText('Sin ventas', { exact: true })).toBeVisible()

    const resultadoReportes = (await page.getByTestId('reporte-resultado').textContent())?.trim()
    expect(resultadoReportes).toBe(resultadoGanancias)
  })
})
