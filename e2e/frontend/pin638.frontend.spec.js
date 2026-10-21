import { test, expect } from '@playwright/test'

const message = 'Tu acceso venció o ya no está disponible. Cerrá sesión y volvé a ingresar con tu acceso, o pedí una nueva invitación a tu tienda.'
const tenant = { id: 'qa638-tenant', name: 'Tienda sintética' }
const baseUser = { id: 'qa638-user', name: 'Usuario sintético', tenantId: tenant.id, role: 'ADMIN', pinLength: 4, permissions: ['*'], branchId: 'qa638-branch', branchName: 'Sucursal sintética' }
const draftKey = 'mobos:pos-cart:v1:qa638-tenant:qa638-branch:qa638-user'
const generation = page => page.evaluate(async () => (await import('/src/lib/offline/snapshot.js')).generacionSnapshots())

async function prepare(page, user, onUnlock) {
  await page.addInitScript(({ tenant, user, draftKey }) => {
    localStorage.setItem('owncoding_hub_company_context', JSON.stringify({ tenant, sellers: [user], cookieSession: true }))
    localStorage.setItem(draftKey, JSON.stringify({ items: [{ productoId: 'qa638-product', nombre: 'Producto borrador 638', precio: 12000, precioManual: true, quantity: 2 }], observacion: 'Nota de la venta pendiente 638' }))
  }, { tenant, user, draftKey })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/me') return route.fulfill({ json: { tenant, user } })
    if (path === '/api/auth/unlock') {
      expect(route.request().postDataJSON()).toEqual({ pin: '1234' })
      return onUnlock(route)
    }
    if (path === '/api/auth/pin') throw new Error('A locked screen must not sign in or switch operator')
    return route.fulfill({ json: [] })
  })
  await page.goto('/pos')
  const pos = page.getByRole('heading', { name: 'Vender', exact: true })
  await expect(pos).toBeVisible()
  await expect(page.getByText('Producto borrador 638', { exact: true }).first()).toBeVisible()
  await pos.evaluate(node => { node.dataset.pin638 = 'same-pos-instance' })
  await page.getByTestId('shell-perfil').click()
  await page.getByTestId('shell-bloquear').click()
  return { pos, lock: page.getByTestId('pantalla-bloqueada') }
}

async function preservedDraft(page) {
  const draft = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)
  expect(draft.items[0]).toMatchObject({ productoId: 'qa638-product', quantity: 2, precio: 12000, precioManual: true })
  expect(draft.observacion).toBe('Nota de la venta pendiente 638')
}

for (const code of ['INVALID_PIN', 'SELLER_SESSION_REQUIRED']) test(`PIN639: ${code} preserves the draft and follows the correct recovery`, async ({ page }) => {
  let attempts = 0
  const { pos, lock } = await prepare(page, baseUser, route => {
    attempts++
    return attempts === 1 || code === 'SELLER_SESSION_REQUIRED'
      ? route.fulfill({ status: code === 'INVALID_PIN' ? 422 : 401, json: { code, message: code === 'INVALID_PIN' ? 'PIN inválido.' : message } })
      : route.fulfill({ json: { user: baseUser } })
  })
  const before = await generation(page)
  await page.locator('#lock-pin').pressSequentially('1234')
  await expect(lock.getByRole('alert')).toHaveText(code === 'INVALID_PIN' ? 'PIN inválido.' : message)
  await expect(page.locator('#lock-pin')).toHaveValue('')
  expect((await generation(page)) === before).toBe(code === 'INVALID_PIN')
  await expect(pos).toHaveAttribute('data-pin638', 'same-pos-instance')
  await preservedDraft(page)
  await page.locator('#lock-pin').pressSequentially('1234')
  expect(attempts).toBe(2)
  if (code === 'INVALID_PIN') {
    await expect(lock).toHaveCount(0)
    await expect(pos).toHaveAttribute('data-pin638', 'same-pos-instance')
    await preservedDraft(page)
  } else {
    await expect(lock.getByRole('alert')).toHaveText(message)
    await expect(lock).toBeVisible()
    await lock.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: '¿Cerrar sesión?' })
    await expect(confirm).toContainText('Las ventas sin confirmar no se pierden')
    await confirm.getByRole('button', { name: 'Salir', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await preservedDraft(page)
  }
})

for (const [label, initial, fresh] of [
  ['role downgrade', baseUser, { ...baseUser, role: 'VENDEDOR', permissions: ['pos:use'] }],
  ['effective permission removal', { ...baseUser, role: 'VENDEDOR', permissions: ['pos:use', 'orders:own'] }, { ...baseUser, role: 'VENDEDOR', permissions: ['pos:use'] }],
  ['another user', baseUser, { ...baseUser, id: 'another-user' }],
  ['another tenant', baseUser, { ...baseUser, tenantId: 'another-tenant' }],
  ['another branch', baseUser, { ...baseUser, branchId: 'another-branch' }],
  ['incomplete response', baseUser, { ...baseUser, permissions: undefined }],
]) test(`PIN639: ${label} never reopens a stale private context`, async ({ page }) => {
  const { lock } = await prepare(page, initial, route => route.fulfill({ json: { user: fresh } }))
  const before = await generation(page)
  await page.locator('#lock-pin').pressSequentially('1234')
  await expect(lock.getByRole('alert')).toContainText('La sesión o sus permisos cambiaron')
  await expect(lock).toBeVisible()
  expect(await generation(page)).toBeGreaterThan(before)
  expect(await page.evaluate(() => localStorage.getItem('owncoding_hub_company_context'))).toBeNull()
  await preservedDraft(page)
})
