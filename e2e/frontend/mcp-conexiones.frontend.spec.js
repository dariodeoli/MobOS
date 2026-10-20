import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-mcp-608-ui'
const ACTIVE = {
  oauthConfigured: true,
  endpoint: 'https://mcp.example.test/authorize',
  capabilities: ['company:read', 'products:read', 'products:write', 'customers:read', 'reports:read'],
  connections: [{
    id: 'grant-1', clientId: 'chatgpt', scopes: ['company:read', 'products:read', 'products:write', 'customers:read'],
    lastUsedAt: '2026-10-20T12:00:00.000Z',
  }],
}

async function useAuthenticatedFixture(page) {
  await page.route('**/src/lib/sesion*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export function useSesion() { return { esDemo:false, empresa:{id:"fixture-tenant"}, usuario:{id:"fixture-user"} } }',
  }))
  await page.route(/https:\/\//, route => route.abort())
  await page.goto('/e2e/fixtures/mcp-conexiones.html', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('mcp-conexiones')).toBeVisible()
}

async function apiFixture(page, response, options = {}) {
  let deletePayload
  await page.route('**/api/mcp/connections', async route => {
    if (route.request().method() === 'DELETE') {
      deletePayload = route.request().postDataJSON()
      await route.fulfill(options.deleteResponse || { status: 204, body: '' })
      return
    }
    if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay))
    await route.fulfill(response)
  })
  return () => deletePayload
}

test.describe('MCP conexiones: estados autenticados y revocación (#608)', () => {
  test('loading: no muestra OAuth falso mientras verifica', async ({ page }) => {
    await page.route('**/api/mcp/connections', async route => {
      await new Promise(resolve => setTimeout(resolve, 500))
      await route.fulfill({ json: ACTIVE })
    })
    await useAuthenticatedFixture(page)
    await expect(page.getByTestId('mcp-oauth-pendiente')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Actualizar' })).toBeDisabled()
    await expect(page.getByText('Conexiones autorizadas')).toBeVisible()
  })

  test('error: informa que no pudo verificar y deja acciones deshabilitadas', async ({ page }) => {
    await apiFixture(page, { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture unavailable' }) })
    await useAuthenticatedFixture(page)
    await expect(page.getByTestId('mcp-oauth-no-verificado')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('La API respondió con 503.')
    await expect(page.getByText('Próximamente · requiere OAuth registrado').first()).toBeVisible()
  })

  test('active: muestra varias capacidades y conexión autorizada', async ({ page }) => {
    await apiFixture(page, { json: ACTIVE })
    await useAuthenticatedFixture(page)
    await expect(page.getByTestId('mcp-endpoint')).toContainText('mcp.example.test')
    await expect(page.getByTestId('mcp-capacidades')).toContainText('Editar productos')
    await expect(page.getByTestId('mcp-conexion-fila')).toContainText('ChatGPT')
    await expect(page.getByTestId('mcp-conexion-fila')).toContainText('Clientes')
    await expect(page.getByText('Conectar ChatGPT')).toBeVisible()
  })

  test('revoke success: envía el ID exacto y quita la conexión', async ({ page }) => {
    const getDeletePayload = await apiFixture(page, { json: ACTIVE })
    await useAuthenticatedFixture(page)
    await page.getByRole('button', { name: 'Revocar' }).click()
    await page.getByRole('dialog', { name: '¿Revocar esta conexión?' }).getByRole('button', { name: 'Revocar conexión' }).click()
    await expect(page.getByText('Todavía no hay conexiones autorizadas.')).toBeVisible()
    expect(getDeletePayload()).toEqual({ id: 'grant-1' })
  })

  test('revoke failure: conserva la conexión e informa el error', async ({ page }) => {
    await apiFixture(page, { json: ACTIVE }, { deleteResponse: { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'revoke fixture failed' }) } })
    await useAuthenticatedFixture(page)
    await page.getByRole('button', { name: 'Revocar' }).click()
    await page.getByRole('dialog', { name: '¿Revocar esta conexión?' }).getByRole('button', { name: 'Revocar conexión' }).click()
    await expect(page.getByRole('alert')).toContainText('La API respondió con 500.')
    await expect(page.getByTestId('mcp-conexion-fila')).toContainText('Activa')
  })

  for (const [width, height, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1440, 900, 'light'], [1440, 900, 'dark']]) {
    test(`captura ${width}x${height} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await apiFixture(page, { json: ACTIVE })
      await useAuthenticatedFixture(page)
      if (theme === 'dark') await page.locator('html').evaluate(element => element.classList.add('dark'))
      await page.waitForTimeout(250)
      await mkdir(`${out}/screenshots`, { recursive: true })
      await page.screenshot({ path: `${out}/screenshots/mcp-${width}-${theme}.png`, fullPage: true })
      await expect(page.getByTestId('mcp-conexiones')).toBeVisible()
    })
  }
})
