import { test, expect } from '@playwright/test'

// #491: navegación real con sesiones sintéticas. Sin backend/base ni OAuth.
async function sesion(page, { loginTardio = false } = {}) {
  let llamadas = 0
  const externas = []
  page.on('request', request => {
    if (request.isNavigationRequest() && new URL(request.url()).hostname === 'example.invalid') externas.push(request.url())
  })
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/me') {
      llamadas++
      if (loginTardio && llamadas === 1) return route.fulfill({ status: 401, json: { message: 'Sin sesión inicial' } })
      return route.fulfill({ json: { user: { id: 'qa491', name: 'Vendedor QA', role: 'VENDEDOR', tenantId: 'qa491-tenant', branchId: 'qa491-branch', branchName: 'Sucursal QA' }, tenant: { id: 'qa491-tenant', name: 'Empresa QA' } } })
    }
    return route.fulfill({ json: [] })
  })
  return { externas, llamadas: () => llamadas }
}

for (const valor of ['/\\example.invalid', '/\t/example.invalid']) {
  test(`volver rechaza ${JSON.stringify(valor)} sin abandonar el origen`, async ({ page, baseURL }) => {
    const control = await sesion(page)
    await page.goto(`/login?volver=${encodeURIComponent(valor)}`)
    await expect(page).toHaveURL(`${baseURL}/pos`)
    expect(control.externas).toEqual([])
  })
}

test('volver conserva ruta interna, query y hash', async ({ page, baseURL }) => {
  await sesion(page)
  await page.goto(`/login?volver=${encodeURIComponent('/pedidos?filtro=pendientes#lista')}`)
  await expect(page).toHaveURL(`${baseURL}/pedidos?filtro=pendientes#lista`)
})

for (const [valor, destino] of [['/\\example.invalid', '/pos'], ['/clientes?x=1#lista', '/clientes?x=1#lista']]) {
  test(`next seguro al recuperar sesión tardía: ${JSON.stringify(valor)}`, async ({ page, baseURL }) => {
    const control = await sesion(page, { loginTardio: true })
    await page.goto(`/login?next=${encodeURIComponent(valor)}`)
    await expect.poll(control.llamadas).toBeGreaterThan(1)
    await expect(page).toHaveURL(`${baseURL}${destino}`)
    expect(control.externas).toEqual([])
  })
}
