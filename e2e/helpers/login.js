// UI login helpers for the seeded E2E tenant (real API, no demo mode).

import { expect } from '@playwright/test'
import { SEED } from './seed-data.js'

// Company email/password step of /login.
export async function loginCompany(page, { email = SEED.company.email, password = SEED.company.password } = {}) {
  await page.goto('/login')
  await page.getByLabel('Correo', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  // The form moves to the seller/PIN step; the seller <select> appears.
  await expect(page.locator('#seller')).toBeVisible()
}

// Complete the seller PIN step and wait for the role-based landing page.
export async function completeSellerPin(page, { sellerName = SEED.sellers[0].name, pin = SEED.sellers[0].pin } = {}) {
  await page.locator('#seller').selectOption({ label: sellerName })
  await page.getByLabel('PIN del vendedor', { exact: true }).fill(pin)
  // The form auto-submits on the 4th digit; the seller lands on /pos/cargar.
  await expect(page).toHaveURL(/\/pos\/cargar$/)
}

// Full login as a seller through the UI.
export async function loginAsSeller(page, { sellerName, pin } = {}) {
  await loginCompany(page)
  await completeSellerPin(page, { sellerName, pin })
}

// Logout via the sidebar button; lands back on /login.
export async function logout(page) {
  await page.getByLabel('Salir').click()
  await expect(page).toHaveURL(/\/login$/)
}
