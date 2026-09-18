// Auth flows against the real API (fresh context, no storageState).
// The seeded company and sellers come from global-setup.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin, logout } from './helpers/login.js'

test.describe('login', () => {
  test('wrong company password shows an error and stays on /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo', { exact: true }).fill(SEED.company.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-equivocada')
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()

    await expect(page.getByText('Credenciales inválidas.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('seller logs in with company credentials + PIN and lands on /pos/cargar', async ({ page }) => {
    await loginCompany(page)
    await completeSellerPin(page, { sellerName: SEED.sellers[0].name, pin: SEED.sellers[0].pin })

    // Seller role redirects to the checkout view ("Nueva venta" form).
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar producto…')).toBeVisible()
  })

  test('logout returns to /login', async ({ page }) => {
    await loginCompany(page)
    await completeSellerPin(page, { sellerName: SEED.sellers[0].name, pin: SEED.sellers[0].pin })
    await logout(page)

    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible()
  })
})
