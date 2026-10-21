import { test, expect } from '@playwright/test'

const request = '/api/mcp/authorize?response_type=code&client_id=fixture&redirect_uri=https%3A%2F%2Fconnector.example%2Fcallback&resource=https%3A%2F%2Fapi.moboss.online&scope=products%3Aread&code_challenge=challenge&state=tenant%2Fbranch'

async function open(page, state, { demo = false } = {}) {
  await page.addInitScript(({ state: nextState, demo: nextDemo }) => {
    window.mcpBridgeSession = { estado: nextState, esDemo: nextDemo }
  }, { state, demo })
  await page.route('**/src/lib/sesion*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export function useSesion() { return window.mcpBridgeSession }',
  }))
  await page.goto(`/e2e/fixtures/mcp-oauth-bridge.html?request=${encodeURIComponent(request)}`)
}

test('sesión fuera vuelve al login preservando la solicitud completa', async ({ page }) => {
  let loginUrl = ''
  await page.route('**/login?*', async route => {
    loginUrl = route.request().url()
    await route.fulfill({ contentType: 'text/html', body: '<title>login fixture</title>' })
  })
  await open(page, 'fuera')
  await expect.poll(() => loginUrl).toContain('/login?volver=')
  const volver = decodeURIComponent(new URL(loginUrl).searchParams.get('volver'))
  expect(volver).toContain('/e2e/fixtures/mcp-oauth-bridge.html?request=/api/mcp/authorize?response_type=code')
  expect(volver).toContain('redirect_uri=https%3A%2F%2Fconnector.example%2Fcallback')
})

test('sesión dentro usa el origen API fijo y conserva query', async ({ page }) => {
  let apiUrl = ''
  await page.route('**/api/mcp/authorize*', async route => {
    apiUrl = route.request().url()
    await route.fulfill({ contentType: 'text/html', body: '<title>authorize fixture</title>' })
  })
  await open(page, 'dentro')
  await expect.poll(() => apiUrl).toBe(`http://127.0.0.1:${process.env.MOBOS_QA_PORT || 5291}${request}`)
})

test('mientras carga no navega', async ({ page }) => {
  const initial = `http://127.0.0.1:${process.env.MOBOS_QA_PORT || 5291}/e2e/fixtures/mcp-oauth-bridge.html?request=${encodeURIComponent(request)}`
  await open(page, 'cargando')
  await expect(page.getByRole('status')).toBeVisible()
  await page.waitForTimeout(150)
  expect(page.url()).toBe(initial)
  await expect(page.getByText('Preparando autorización…')).toBeVisible()
})

for (const bad of [
  '/api/mcp/other?code=bad',
  'https://evil.example/steal?x=1',
]) {
  test(`rechaza solicitud inválida sin navegar: ${bad}`, async ({ page }) => {
    const apiRequests = []
    await page.route('**/*', route => {
      if (route.request().url().includes('api.moboss.online')) apiRequests.push(route.request().url())
      return route.continue()
    })
    await page.addInitScript(() => { window.mcpBridgeSession = { estado: 'dentro', esDemo: false } })
    await page.route('**/src/lib/sesion*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function useSesion() { return window.mcpBridgeSession }' }))
    await page.goto(`/e2e/fixtures/mcp-oauth-bridge.html?request=${encodeURIComponent(bad)}`)
    await expect(page.getByRole('alert')).toContainText('Solicitud de autorización inválida')
    expect(apiRequests).toHaveLength(0)
  })
}

test('demo queda cerrada y muestra explicación sin llamar API', async ({ page }) => {
  const apiRequests = []
  await page.route('**/api/mcp/**', route => { apiRequests.push(route.request().url()); return route.abort() })
  await open(page, 'dentro', { demo: true })
  await expect(page.getByRole('alert')).toContainText('no está disponible en la demo')
  expect(apiRequests).toHaveLength(0)
})
