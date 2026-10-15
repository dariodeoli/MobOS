// #145: el Análisis es la vista extendida del negocio y no tenía cobertura
// e2e propia. Verifica la navegación por pestañas y que las vistas compartan
// el mismo lenguaje de métricas (rango, períodos y resultados).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { selectAnalysisSection } from './helpers/shell-navigation.js'

// Capturas: `QA_GANADORES_CAPTURAS` (default test-results/qa-ganadores) — se
// versionan en docs/qa/finanzas-ganadores/.
const DIR = process.env.QA_GANADORES_CAPTURAS || join('test-results', 'qa-ganadores')
mkdirSync(DIR, { recursive: true })
const capturar = (page, nombre) => page.screenshot({ path: join(DIR, `ganadores-${nombre}.png`) })

test.describe('análisis', () => {
  test('Ventas del día recupera el tablero del POS en Análisis, también en celular (#353)', async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/analisis/ventas-dia')
      const tablero = page.getByTestId('ventas-del-dia')
      await expect(tablero.getByText('Ventas de hoy', { exact: true })).toBeVisible()
      await expect(tablero.getByText('Items por pedido', { exact: true })).toBeVisible()
      await expect(tablero.getByRole('heading', { name: 'Top productos', exact: true })).toBeVisible()
      await expect(tablero.getByRole('heading', { name: 'Cobros netos por cuenta', exact: true })).toBeVisible()
      await expect(tablero.getByRole('heading', { name: 'Cobros netos por sucursal', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  })

  test('el shell muestra otras personas presentes y descarta presencias vencidas (#361)', async ({ page }) => {
    await page.route('**/api/presence', route => route.fulfill({ json: { people: [
      { id: 'otra-persona-online', name: 'Ana Presente', scope: 'pedidos/ejemplo', lastSeenAt: new Date().toISOString() },
      { id: 'persona-ausente', name: 'Persona ausente', lastSeenAt: new Date(Date.now() - 120_000).toISOString() },
    ] } }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/analisis/ventas-dia')
    const boton = page.getByTestId('shell-equipo-online-mobile')
    await expect(boton).toHaveAccessibleName('Equipo en línea: 1 persona')
    await boton.click()
    const dialogo = page.getByRole('dialog', { name: 'Equipo en línea' })
    await expect(dialogo.getByText('Ana Presente', { exact: true })).toBeVisible()
    await expect(dialogo.getByText('Persona ausente', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('la vista extendida abre en Reportes y comparte el período con Ganancias', async ({ page }) => {
    await page.goto('/analisis')
    await expect(page).toHaveURL(/\/analisis\/reportes$/)
    await expect(page.getByRole('navigation', { name: 'Secciones de Análisis', exact: true }).locator('[data-tab-id="reportes"]')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Total del período')).toBeVisible()

    await selectAnalysisSection(page, 'Ganancias')
    await expect(page).toHaveURL(/\/analisis\/ganancias$/)
    await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mes', exact: true })).toBeVisible()
  })

  test('Ganadores y Asistente viven en el mismo Análisis', async ({ page }) => {
    await page.goto('/analisis/ganadores')
    await expect(page.getByRole('heading', { name: 'Productos ganadores' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Semana' })).toBeVisible()

    await selectAnalysisSection(page, 'Asistente')
    await expect(page).toHaveURL(/\/analisis\/asistente$/)
    await expect(page.getByRole('heading', { name: 'Asistente de ganancias' })).toBeVisible()
  })

  // Márgenes (#148 §19 · #171): el ranking de ganadores usa la ganancia real
  // (costos congelados del mismo reporte). Si la tienda no cargó costos, se
  // ordena por venta y se avisa; nunca se inventa un margen.
  test('Ganadores ordena por ganancia real y muestra el margen', async ({ page }) => {
    const esperarReporte = () => page.waitForResponse(
      (respuesta) => respuesta.url().includes('/api/reports') && respuesta.url().includes('groupBy=product') && respuesta.status() === 200,
    )
    const [respuesta] = await Promise.all([esperarReporte(), page.goto('/analisis/ganadores?periodo=mes')])
    const datos = await respuesta.json()
    const hayCostos = Number(datos?.totals?.costPyg || 0) > 0
    await expect(page.getByRole('heading', { name: 'Productos ganadores' })).toBeVisible()

    if (hayCostos) {
      await expect(page.getByText('Ordenado por ganancia del período')).toBeVisible()
      // La primera fila es la de mayor ganancia del reporte (desempata por venta).
      const mejor = [...(datos.groups || [])].sort((a, b) => (
        Number(b.profitPyg || 0) - Number(a.profitPyg || 0) || Number(b.grossPyg || 0) - Number(a.grossPyg || 0)
      ))[0]
      const fila = page.getByTestId('ganadores-fila').first()
      await expect(fila).toContainText(mejor.label)
      await expect(fila.getByText('Ganancia')).toBeVisible()
      await expect(fila).toContainText('margen')
    } else {
      await expect(page.getByText('Sin costos cargados: ordenado por venta')).toBeVisible()
    }
    await capturar(page, 'mes')
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
