import { test, expect } from '@playwright/test'

const message = 'La sesión de la empresa venció o ya no está disponible. Usá «Cerrar sesión» y volvé a ingresar a la empresa.'

for (const code of ['INVALID_PIN', 'COMPANY_SESSION_REQUIRED']) test(`PIN638: ${code} muestra recuperación y permite reintento sin descartar la pantalla`, async ({ page }) => {
  const tenant = { id: 'qa638-tenant', name: 'Tienda sintética' }
  const user = { id: 'qa638-user', name: 'Usuario sintético', tenantId: tenant.id, role: 'ADMIN', pinLength: 4, permissions: ['*'], branchId: 'qa638-branch', branchName: 'Sucursal sintética' }
  let attempts = 0
  await page.addInitScript(({ tenant, user }) => {
    localStorage.setItem('owncoding_hub_company_context', JSON.stringify({ tenant, sellers: [user], cookieSession: true }))
    localStorage.setItem(`mobos:pos-cart:v1:${tenant.id}:${user.branchId}:${user.id}`, JSON.stringify({
      items: [{ productoId: 'qa638-product', nombre: 'Producto borrador 638', precio: 12000, precioManual: true, quantity: 2 }],
      observacion: 'Nota de la venta pendiente 638',
    }))
  }, { tenant, user })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/me') return route.fulfill({ json: { tenant, user } })
    if (path === '/api/auth/pin') {
      attempts++
      return attempts === 1
        ? route.fulfill({ status: 401, json: { code, message: code === 'INVALID_PIN' ? 'PIN inválido.' : message } })
        : route.fulfill({ json: { user } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Vender', exact: true })).toBeVisible()
  await expect(page.getByText('Producto borrador 638', { exact: true }).first()).toBeVisible()
  const pos = page.getByRole('heading', { name: 'Vender', exact: true })
  // Conservar la misma instancia del POS demuestra que el rechazo no navegó,
  // recargó ni desmontó el formulario que guarda el carrito en memoria.
  await pos.evaluate(node => { node.dataset.pin638 = 'same-pos-instance' })
  await page.getByTestId('shell-perfil').click()
  await page.getByTestId('shell-bloquear').click()
  const lock = page.getByTestId('pantalla-bloqueada')
  await page.locator('#lock-pin').pressSequentially('1234')
  await expect(lock.getByRole('alert')).toHaveText(code === 'INVALID_PIN' ? 'PIN inválido.' : message)
  await expect(page.locator('#lock-pin')).toHaveValue('')
  await expect(lock.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible()
  expect(attempts).toBe(1)
  await expect(pos).toHaveAttribute('data-pin638', 'same-pos-instance')
  await page.locator('#lock-pin').pressSequentially('1234')
  await expect(lock).toHaveCount(0)
  await expect(pos).toHaveAttribute('data-pin638', 'same-pos-instance')
  expect(attempts).toBe(2)
  await expect(page.getByText('Producto borrador 638', { exact: true }).first()).toBeVisible()
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('mobos:pos-cart:v1:qa638-tenant:qa638-branch:qa638-user')))
  expect(draft.items[0]).toMatchObject({ productoId: 'qa638-product', quantity: 2, precio: 12000 })
  expect(draft.observacion).toBe('Nota de la venta pendiente 638')
  if (code === 'COMPANY_SESSION_REQUIRED') {
    await page.getByTestId('shell-perfil').click()
    await page.getByTestId('shell-bloquear').click()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: '¿Cerrar sesión?' })
    await expect(confirm).toContainText('Las ventas sin confirmar no se pierden')
    await confirm.getByRole('button', { name: 'Salir', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mobos:pos-cart:v1:qa638-tenant:qa638-branch:qa638-user')))
    expect(stored.items[0].quantity).toBe(2)
    expect(stored.observacion).toBe('Nota de la venta pendiente 638')
  }
})
