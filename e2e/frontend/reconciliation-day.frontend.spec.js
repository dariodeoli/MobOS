import { test, expect } from '@playwright/test'
const session = company => ({ esDemo: false, empresa: { id: company }, usuario: { id: `u-${company}`, role: 'ADMIN' }, sucursal: { id: `b-${company}` }, sucursales: [{ id: `b-${company}`, nombre: `Sucursal ${company}` }] })
const initial = branchId => ({ day: '2026-10-15', branchId, state: 'PENDING', version: 0, groups: [{ key: '["CASH","","PYG"]', method: 'CASH', accountId: null, currency: 'PYG', label: 'Caja real', expectedPyg: 100000, receivedPyg: null, differencePyg: null, count: 1 }], expectedPyg: 100000, receivedPyg: 0, differencePyg: 0, missing: 1, differences: 0, history: [], declarations: null, note: '' })
async function fixture(page) {
  await page.addInitScript(value => { window.daySession = value }, session('A'))
  await page.route('**/src/lib/sesion*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function useSesion() { return window.daySession }' }))
  await page.route('**/src/lib/paymentAccounts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export async function getPaymentAccounts() { return [] }' }))
  await page.route('**/src/lib/storage*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function listVentas() { return [] }' }))
}
for (const width of [375, 390]) test(`Día ${width}: declaración independiente, motivo y estados reales`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await fixture(page)
  let submitted
  await page.route('**/api/finance/reconciliation?*', async route => {
    const state = initial(new URL(route.request().url()).searchParams.get('branchId'))
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      state.groups[0].receivedPyg = submitted.declarations[0].receivedPyg
      state.groups[0].differencePyg = state.groups[0].receivedPyg - 100000
      state.state = state.groups[0].differencePyg ? 'DIFFERENCE' : 'VERIFIED'; state.version = 1; state.note = submitted.note; state.missing = 0
    }
    await route.fulfill({ json: state })
  })
  await page.goto('/e2e/fixtures/reconciliation-day.html')
  if (width === 390) await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.getByRole('button', { name: 'Verificar día por sucursal', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Conciliar día por sucursal' })
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Pendiente')
  const received = dialog.getByRole('textbox', { name: 'Recibido en Gs: Caja real (PYG)', exact: true })
  await expect(received).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Verificar día', exact: true })).toBeDisabled()
  await received.fill('90000')
  await expect(dialog.getByRole('button', { name: 'Verificar día', exact: true })).toBeDisabled()
  await dialog.getByLabel('Motivo / nota del día', { exact: true }).fill('Falta un comprobante')
  await dialog.getByRole('button', { name: 'Verificar día', exact: true }).click()
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Con diferencia')
  expect(submitted.declarations[0].receivedPyg).toBe(90000)
  expect(submitted.branchId).toBe('b-A'); expect(submitted.requestId).toMatch(/^[a-f0-9-]{36}$/)
  await received.fill('100000')
  await dialog.getByRole('button', { name: 'Verificar día', exact: true }).click()
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Verificado')
  await page.screenshot({ path: `${process.env.MOBOS_QA_OUT || '/tmp'}/day-${width}.png`, animations: 'disabled' })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  expect(await received.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
})
test('refresh A demorado no repuebla el día de empresa B', async ({ page }) => {
  await fixture(page)
  let hold = false, release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/finance/reconciliation?*', async route => {
    const branchId = new URL(route.request().url()).searchParams.get('branchId')
    if (hold && branchId === 'b-A') await gate
    const data = initial(branchId); data.groups[0].label = branchId
    await route.fulfill({ json: data })
  })
  await page.goto('/e2e/fixtures/reconciliation-day.html')
  await page.getByRole('button', { name: 'Verificar día por sucursal', exact: true }).click()
  await expect(page.getByText('b-A · PYG', { exact: true })).toBeVisible()
  hold = true
  await page.getByRole('button', { name: 'Actualizar día' }).click()
  await page.evaluate(value => window.setDaySession(value), session('B'))
  await expect(page.getByText('b-B · PYG', { exact: true })).toBeVisible()
  release()
  await expect(page.getByText('b-A · PYG', { exact: true })).toHaveCount(0)
})
