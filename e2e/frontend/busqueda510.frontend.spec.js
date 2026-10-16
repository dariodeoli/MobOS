import { test, expect } from '@playwright/test'
async function prepare(page, role = 'VENDEDOR', vistas = 'validas') {
  const calls = []
  await page.route('**/*', route => {
    const u = new URL(route.request().url()),
      path = u.pathname
    if (!path.startsWith('/api/')) return route.continue()
    calls.push(path)
    let status = 200,
      body = []
    if (path === '/api/auth/me')
      body = {
        user: {
          id: 'u510',
          tenantId: 't510',
          role,
          branchId: 'b510',
          name: 'Persona QA',
          permissions: [],
          canManageCompanies: false,
        },
        tenant: { id: 't510', name: 'Tienda QA' },
      }
    else if (path === '/api/quotes')
      body = [{ id: 'q510', number: 'COT-QA510', customerName: 'Cliente QA', status: 'DRAFT' }]
    else if (path === '/api/tenant/logo' || path.includes('/avatar')) {
      status = 404
      body = { message: 'Sin imagen' }
    } else if (
      role === 'VENDEDOR' &&
      ['/api/warranties', '/api/purchases', '/api/suppliers'].includes(path)
    ) {
      status = 403
      body = { message: 'No autorizado' }
    }
    return route.fulfill({ status, json: body })
  })
  await page.goto(`/e2e/fixtures/busqueda510.html?role=${role}&vistas=${vistas}`)
  await expect(page.getByRole('combobox', { name: 'Buscar en toda la tienda' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  calls.length = 0 // Medir búsqueda, no hidratación inicial del proveedor de sesión.
  return calls
}
test('510 vendedor encuentra cotización sin pedir fuentes prohibidas', async ({ page }) => {
  const calls = await prepare(page)
  await page.getByRole('combobox', { name: 'Buscar en toda la tienda' }).fill('COT-QA510')
  await expect(page.getByRole('group', { name: 'Cotizaciones', exact: true })).toBeVisible()
  expect(
    calls.filter(p =>
      [
        '/api/warranties',
        '/api/purchases',
        '/api/suppliers',
        '/api/suppliers/badges',
        '/api/inventory-units',
      ].includes(p),
    ),
  ).toEqual([])
  await page.getByRole('option').filter({ hasText: 'COT-QA510' }).click()
  await expect(page.getByTestId('destino')).toContainText('cotizaciones')
  await expect(page.getByTestId('destino')).toContainText('COT-QA510')
})
test('510 administración conserva todas las fuentes autorizadas', async ({ page }) => {
  const calls = await prepare(page, 'ADMIN')
  await page.getByRole('combobox', { name: 'Buscar en toda la tienda' }).fill('COT-QA510')
  await expect(page.getByRole('group', { name: 'Cotizaciones', exact: true })).toBeVisible()
  for (const path of [
    '/api/warranties',
    '/api/purchases',
    '/api/suppliers',
    '/api/inventory-units',
  ])
    expect(calls).toContain(path)
  expect(calls).not.toContain('/api/suppliers/badges')
})

test('510 técnico no consulta módulos ocultos por navegación', async ({ page }) => {
  const calls = await prepare(page, 'TECNICO')
  await page.getByRole('combobox', { name: 'Buscar en toda la tienda' }).fill('COT-QA510')
  await expect(page.getByRole('group', { name: 'Cotizaciones', exact: true })).toHaveCount(0)
  // Espera al resultado de la paleta, no una pausa que pueda omitir requests tardíos.
  await expect(page.getByText('Sin resultados', { exact: true })).toBeVisible()
  expect(
    calls.filter(p =>
      [
        '/api/customers',
        '/api/products',
        '/api/orders',
        '/api/quotes',
        '/api/warranties',
        '/api/purchases',
        '/api/suppliers',
        '/api/suppliers/badges',
        '/api/inventory-units',
      ].includes(p),
    ),
  ).toEqual([])
})

for (const vistas of ['null', 'undefined'])
  test(`510 vistas ${vistas} no habilitan ninguna fuente`, async ({ page }) => {
    const calls = await prepare(page, 'ADMIN', vistas)
    await page.getByRole('combobox', { name: 'Buscar en toda la tienda' }).fill('COT-QA510')
    await expect(page.getByText('Sin resultados', { exact: true })).toBeVisible()
    expect(
      calls.filter(path =>
        [
          '/api/customers',
          '/api/products',
          '/api/orders',
          '/api/quotes',
          '/api/warranties',
          '/api/purchases',
          '/api/suppliers',
          '/api/suppliers/badges',
          '/api/inventory-units',
        ].includes(path),
      ),
    ).toEqual([])
  })
