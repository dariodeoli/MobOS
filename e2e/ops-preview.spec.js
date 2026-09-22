// #241 (F3): vista previa del tablero ops — mock sin activar, con los tokens v2
// del piloto (claro/oscuro/móvil), sin API y fuera del menú hasta la aprobación.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')

test('el tablero ops preview usa los tokens v2 y no llama al API', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })
  mkdirSync('docs/qa/241-ops-preview', { recursive: true })

  await page.goto('/ops-preview')
  const preview = page.getByTestId('ops-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveClass(/v2-piloto/)
  await expect(page.getByText(/no activada/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByText('Equipos en proceso')).toBeVisible()
  await expect(page.getByText('Up next')).toBeVisible()
  await page.screenshot({ path: 'test-results/qa-241-ops-preview/preview-claro.jpg', type: 'jpeg', quality: 72 })

  // Tema oscuro: el mismo scope con la variante consola.
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  await page.reload()
  await expect(page.getByTestId('ops-preview')).toHaveClass(/v2-piloto/)
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await page.screenshot({ path: 'test-results/qa-241-ops-preview/preview-oscuro.jpg', type: 'jpeg', quality: 72 })

  // Móvil.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('Equipos en proceso')).toBeVisible()
  await page.screenshot({ path: 'test-results/qa-241-ops-preview/preview-movil.jpg', type: 'jpeg', quality: 72 })

  expect(llamadas, `llamadas al API: ${llamadas.join(', ')}`).toEqual([])
})

test('la ruta real /ops queda inactiva sin el flag', async ({ page }) => {
  await page.goto('/ops')
  await expect(page.getByTestId('ops-preview')).toHaveCount(0)
})
