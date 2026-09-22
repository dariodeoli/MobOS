// #241 (F3): vista previa del tablero ops — mock sin activar, sin API y fuera
// del menú hasta la aprobación del piloto.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')

test('la vista previa del tablero ops es un mock sin API', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/ops-preview')
  await expect(page.getByTestId('ops-preview')).toBeVisible()
  await expect(page.getByText(/no activada/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByText('Equipos en proceso')).toBeVisible()
  await expect(page.getByText('Up next')).toBeVisible()

  mkdirSync('docs/qa/241-ops-preview', { recursive: true })
  await page.screenshot({ path: 'docs/qa/241-ops-preview/preview.jpg', type: 'jpeg', quality: 72 })
  expect(llamadas, `llamadas al API: ${llamadas.join(', ')}`).toEqual([])
})
