import { test, expect } from '@playwright/test'

function session(tenant, user = `user-${tenant}`, branch = `branch-${tenant}`) {
  return { esDemo: false, empresa: { id: tenant }, usuario: { id: user }, sucursal: { id: branch }, sucursales: [{ id: branch, nombre: `Sucursal ${tenant}` }] }
}
function payload(kind, tenant, owner, branchId) {
  const trip = { id: `trip-${tenant}`, route: `Ruta ${tenant}`, branchId, driverId: `driver-${tenant}`, driver: { id: `driver-${tenant}`, name: `Repartidor ${tenant}` }, branch: { name: `Sucursal ${tenant}` }, orderId: `order-${tenant}`, order: { id: `order-${tenant}`, orderNumber: `PED-${tenant}` }, performedOn: '2026-10-01', distanceMeters: 5000, tripsCount: 1, totalFeePyg: 10000, status: 'COMPLETED' }
  if (kind === 'trips') return { owner, rows: [trip] }
  if (kind === 'tariffs') return { owner, rows: [{ id: `rate-${tenant}`, name: `Tarifa ${tenant}`, isActive: true, validFrom: '2020-01-01', validUntil: '2100-12-31', tiers: [{ upToKm: 28, feePyg: 10000 }] }] }
  if (kind === 'team') return [{ id: `driver-${tenant}`, name: `Repartidor ${tenant}`, branchId }]
  return [{ id: `order-${tenant}`, orderNumber: `PED-${tenant}`, branchId, status: 'PENDING', customer: { name: `Cliente ${tenant}` } }]
}
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
async function fixture(page, { ownerB = false, mutationFailureA = false } = {}) {
  const state = { tenant: 'A', branchId: 'branch-A', delayLoads: false, heldLoads: 0, mutation: null, postRequests: 0, getRequests: 0 }
  const delayedLoad = gate(), mutationA = gate(), mutationB = gate()
  await page.addInitScript(value => { window.deliveryFixtureSession = value }, session('A'))
  await page.route('**/src/lib/sesion*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function useSesion() { return window.deliveryFixtureSession }' }))
  await page.route('**/api/delivery/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const tenant = state.tenant, branchId = state.branchId
    if (request.method() === 'POST') {
      state.postRequests++
      await (tenant === 'A' ? mutationA : mutationB).promise
      return route.fulfill({ status: tenant === 'A' && mutationFailureA ? 500 : 201, json: tenant === 'A' && mutationFailureA ? { message: 'Solo error antiguo A' } : {} })
    }
    state.getRequests++
    const kind = path.split('/').pop()
    if (state.delayLoads && tenant === 'A') { state.heldLoads++; await delayedLoad.promise }
    return route.fulfill({ json: payload(kind, tenant, tenant === 'A' || ownerB, branchId) })
  })
  await page.goto('/e2e/fixtures/delivery-scope.html')
  await expect(page.getByTestId('delivery-trip')).toContainText('Ruta A')
  const change = async next => {
    state.tenant = 'B'; state.branchId = next.sucursal.id
    await page.evaluate(value => window.setDeliveryFixtureSession(value), next)
    await expect(page.getByTestId('delivery-trip')).toContainText('Ruta B')
  }
  return { state, change, delayedLoad, mutationA, mutationB }
}

for (const [label, next] of [['empresa', session('B', 'user-A', 'branch-A')], ['usuario', session('A', 'user-B', 'branch-A')], ['sucursal', session('A', 'user-A', 'branch-B')]]) {
  test(`refresh manual de A demorado no repuebla ${label} nueva ni sus permisos`, async ({ page }) => {
    const control = await fixture(page)
    control.state.delayLoads = true
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await expect.poll(() => control.state.heldLoads).toBe(4)
    await control.change(next)
    control.delayedLoad.release()
    await page.unrouteAll({ behavior: 'wait' })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByTestId('delivery-trip')).toContainText('Ruta B')
    await expect(page.locator('body')).not.toContainText('Ruta A')
    await expect(page.getByRole('button', { name: 'Tarifas', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Registrar viajes', exact: true }).click()
    await expect(page.locator('#trip-driver')).toContainText('Repartidor B')
    await expect(page.locator('#trip-driver')).not.toContainText('Repartidor A')
    await expect(page.locator('#trip-order')).toContainText('Cliente B')
    await expect(page.locator('#trip-order')).not.toContainText('Cliente A')
    await page.locator('#trip-distance').fill('5')
    await expect(page.getByRole('dialog')).toContainText('Tarifa B')
    await expect(page.getByRole('dialog')).not.toContainText('Tarifa A')
  })
}

for (const mutationFailureA of [false, true]) test(`finalización de mutación A (${mutationFailureA ? 'error' : 'éxito'}) no muestra avisos, no recarga ni desbloquea una mutación B`, async ({ page }) => {
  const control = await fixture(page, { ownerB: true, mutationFailureA })
  async function saveRate(name) {
    await page.getByRole('button', { name: 'Tarifas', exact: true }).click()
    await page.getByRole('button', { name: 'Nueva tarifa', exact: true }).click()
    await page.locator('#tariff-name').fill(name)
    await page.locator('#tariff-until').fill('2099-12-31')
    await page.locator('#tier-fee-0').fill('10000')
    await page.getByRole('button', { name: 'Guardar tarifa', exact: true }).click()
  }
  await saveRate('Tarifa pendiente A')
  await expect.poll(() => control.state.postRequests).toBe(1)
  await control.change(session('B'))
  await saveRate('Tarifa pendiente B')
  await expect.poll(() => control.state.postRequests).toBe(2)
  const before = control.state.getRequests
  const oldResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/delivery/tariffs'))
  control.mutationA.release()
  await (await oldResponse).finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  // La finalización vieja no cierra el modal ni habilita guardar B.
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar tarifa', exact: true })).toBeDisabled()
  await expect(page.getByText('Tarifa guardada', { exact: true })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Solo error antiguo A')
  expect(control.state.getRequests).toBe(before)
  control.mutationB.release()
  await expect(page.getByText('Tarifa guardada', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled()
})
