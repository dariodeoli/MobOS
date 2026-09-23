// #241 (F3): el tablero real detrás del flag VITE_OPS_V2 (encendido en el
// harness e2e). Lee el rack del taller (#240) y los pedidos reales de la
// empresa sembrada, y deja las capturas claro/oscuro/móvil. La vista previa
// con datos ficticios sigue cubierta en `ops-preview.spec.js`.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const SALIDA = 'test-results/qa-241-ops-tablero'

test('el tablero F3 lee inventario y pedidos reales detrás del flag', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(`localhost:${API_PORT}`) && url.includes('/api/')) llamadas.push(url)
  })
  mkdirSync(SALIDA, { recursive: true })

  await page.goto('/ops')
  const tablero = page.getByTestId('ops-tablero')
  await expect(tablero).toBeVisible()
  await expect(tablero).toHaveClass(/v2-piloto/)
  await expect(page.getByTestId('ops-preview')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByTestId('ops-actualizado')).toContainText('Datos reales')

  // Los cuatro KPIs, ya no con los números del mock.
  for (const clave of ['cobrado', 'pedidos', 'taller', 'listos']) {
    await expect(page.getByTestId(`ops-kpi-${clave}`)).toBeVisible()
  }
  await expect(page.getByTestId('ops-kpi-cobrado')).toContainText(/Gs\s?[\d.]/)
  await expect(page.getByTestId('ops-kpi-pedidos')).toContainText(/pagados · \d+ pendientes/)

  // Datos reales: consultó inventario y pedidos del backend.
  await expect.poll(() => llamadas.some((url) => url.includes('/api/inventory-units'))).toBe(true)
  await expect.poll(() => llamadas.some((url) => url.includes('/api/orders'))).toBe(true)

  // Las tres colas del taller con equipos reales del rack sembrado.
  for (const estado of ['por-verificar', 'verificado', 'listo']) {
    await expect(page.getByTestId(`ops-cola-${estado}`)).toBeVisible()
  }
  await expect(page.getByTestId('ops-cola-item').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/tablero-claro.jpg`, type: 'jpeg', quality: 72 })

  // Tema oscuro.
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  await page.reload()
  await expect(page.getByTestId('ops-tablero')).toHaveClass(/v2-piloto/)
  // Espera a que la recarga termine de leer los datos (marca con hora).
  await expect(page.getByTestId('ops-actualizado')).toContainText(/\d{1,2}[:.]\d{2}/)
  await expect(page.getByTestId('ops-kpi-cobrado')).toContainText(/Gs\s?[\d.]/)
  await page.screenshot({ path: `${SALIDA}/tablero-oscuro.jpg`, type: 'jpeg', quality: 72 })

  // Móvil.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Equipos en proceso' })).toBeVisible()
  await expect(page.getByTestId('ops-cola-item').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/tablero-movil.jpg`, type: 'jpeg', quality: 72 })
})
