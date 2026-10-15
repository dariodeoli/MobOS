import { test, expect } from '@playwright/test'
for (const owner of [true, false]) test(`Política empresa: ${owner ? 'dueño guarda roles y foto' : 'otro perfil solo consulta'}`, async ({ page }) => {
  let saved
  await page.route('**/src/lib/sesion*', route => route.fulfill({ contentType: 'application/javascript', body: 'export function useSesion() { return { esDemo:false, empresa:{id:"t"}, usuario:{id:"u"} } }' }))
  await page.route('**/api/tenant/stock-verification', async route => {
    const policy = { roles: ['ADMIN', 'VENDEDOR'], records: [] }
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
    await route.fulfill({ json: { policy: saved || policy, canConfigure: owner, canVerify: true } })
  })
  await page.goto('/e2e/fixtures/stock-policy.html')
  await expect(page.getByText('Cada verificación guarda siempre', { exact: false })).toBeVisible()
  const ventas = page.getByRole('checkbox', { name: 'Ventas', exact: true })
  if (owner) {
    await ventas.uncheck()
    await page.getByRole('checkbox', { name: 'Batería y ciclos de carga' }).check()
    await page.getByRole('button', { name: 'Guardar verificación de empresa' }).click()
    await expect.poll(() => saved).toEqual({ roles: ['ADMIN'], records: ['battery'] })
    await expect(ventas).not.toBeChecked()
  } else {
    await expect(ventas).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Guardar verificación de empresa' })).toHaveCount(0)
  }
})
