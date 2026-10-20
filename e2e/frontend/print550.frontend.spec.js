import { test, expect } from '@playwright/test'

test('550: reporte cerrado no sondea; abierto sin agente mantiene vista previa y respaldo', async ({ page }) => {
  const health = []
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } }) : route.continue())
  await page.route('http://127.0.0.1:17890/**', route => { health.push(route.request().url()); return route.abort('connectionrefused') })
  // Reuse the Vite HTML shell without mounting its unrelated demo application.
  await page.route('**/e2e/fixtures/plantillas507.jsx', route => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.goto('/e2e/fixtures/plantillas507.html')
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js')
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { default: ReportePreview } = await import('/src/components/shared/ReportePreview.jsx')
    const { ToastProvider } = await import('/src/components/ui/index.jsx')
    const { guardarConfigImpresora } = await import('/src/lib/printing/agent.js')
    guardarConfigImpresora({ token: 'token-fixture' })
    const root = ReactDOM.createRoot(document.body.appendChild(document.createElement('div')))
    window.renderReporte550 = open => root.render(React.createElement(ToastProvider, null, React.createElement(ReportePreview, {
      open, titulo: 'Reporte de prueba', onClose() {}, construir: () => '<html><body>Reporte de prueba</body></html>',
    })))
    window.renderReporte550(false)
  })
  await page.waitForTimeout(300)
  expect(health).toEqual([])
  await page.evaluate(() => window.renderReporte550(true))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => health.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Imprimir', exact: true })).toBeVisible()
  await page.evaluate(() => window.renderReporte550(false))
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.evaluate(() => window.renderReporte550(true))
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(health).toHaveLength(1)
})
