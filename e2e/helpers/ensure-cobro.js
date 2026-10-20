import { expect } from '@playwright/test'

/** Opens the explicit desktop Cobrar step introduced by the compact POS flow. */
export async function ensureCobro(page) {
  const cobro = page.getByTestId('pos-cobro')
  if (!(await cobro.isVisible().catch(() => false))) {
    const listo = page.getByTestId('carrito-listo')
    if (await listo.isVisible().catch(() => false)) await listo.click()
    else await page.getByRole('button', { name: /^Cobrar(?:\s|$)/ }).first().click()
    await expect(cobro).toBeVisible()
  }
}
