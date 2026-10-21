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

test('550: iniciar el agente después de un fallo permite imprimir inmediatamente', async ({ page }) => {
  let online = false
  const health = [], trabajos = []
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 401, json: { error: 'Sin sesión real' } }) : route.continue())
  await page.route('http://127.0.0.1:17890/**', route => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/health') health.push(request.url())
    if (!online) return route.abort('connectionrefused')
    if (request.method() === 'POST') trabajos.push(request.postDataJSON())
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { ok: true } })
  })
  await page.route('**/e2e/fixtures/plantillas507.jsx', route => route.fulfill({ contentType: 'text/javascript', body: 'export {}' }))
  await page.goto('/e2e/fixtures/plantillas507.html')
  const inicial = await page.evaluate(async () => {
    const agent = await import('/src/lib/printing/agent.js')
    agent.usarTenantImpresoras('fixture-550-reinicio')
    agent.guardarConfigImpresora({ token: 'token-fixture' })
    return agent.estadoAgente()
  })
  expect(inicial.disponible).toBe(false)
  expect(health).toHaveLength(1)
  online = true
  const resultado = await page.evaluate(async () => {
    const agent = await import('/src/lib/printing/agent.js')
    const { crearTicket } = await import('/src/lib/printing/escpos.js')
    const impresora = { destino: 'lan:192.0.2.99:9100', activa: true, modelo: 'ZKP8008', ancho: 80 }
    return agent.imprimirTicketRouter(crearTicket().texto('Fixture de reinicio'), {
      impresora, store: { impresoras: [impresora], agentUrl: 'http://127.0.0.1:17890' },
    })
  })
  expect(resultado.ok).toBe(true)
  expect(resultado.camino).toBe('local')
  expect(health).toHaveLength(2)
  expect(trabajos).toHaveLength(1)
})
