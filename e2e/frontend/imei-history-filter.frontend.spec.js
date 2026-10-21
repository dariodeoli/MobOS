import { test, expect } from '@playwright/test'

for (const width of [1440, 390]) test(`invalid IMEI history shows validation without querying history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 })
  const filteredRequests = []
  await page.route('**/src/lib/sesion*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function useSesion(){return {esDemo:false,sesion:{rol:"ADMIN",esPropietario:true},usuario:{id:"fixture-user"}}}' }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/imei' && url.searchParams.has('imei')) {
      filteredRequests.push(url.searchParams.get('imei'))
      return route.fulfill({ json: { consultas: [] } })
    }
    return route.fulfill({ json: { modo: 'simulado', creditos: { saldo: 5 }, events: [], consultas: [] } })
  })
  await page.route(/https:\/\//, route => route.abort())
  await page.goto('/e2e/fixtures/imei-history.html')
  await page.getByTestId('imei-consultas-abrir').click()
  const input = page.getByRole('textbox', { name: 'IMEI a consultar' })
  const buscar = page.getByTestId('imei-consultas-buscar')
  await input.fill('111111111111111')
  await buscar.click()
  await expect(page.getByText(/dígito de control válido/)).toBeVisible()
  expect(filteredRequests).toEqual([])
  await input.fill('123')
  await buscar.click()
  await expect(page.getByText('El IMEI debe tener 15 dígitos.')).toBeVisible()
  expect(filteredRequests).toEqual([])
  await input.fill('111111111111119')
  await buscar.click()
  await expect(page.getByText('No hay consultas registradas para ese IMEI.')).toBeVisible()
  expect(filteredRequests).toEqual(['111111111111119'])
})
