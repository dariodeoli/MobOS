// UI login helpers for the seeded E2E tenant (real API, no demo mode).

import { expect } from '@playwright/test'
import { SEED } from './seed-data.js'

// Company email/password step of /login.
export async function loginCompany(page, { email = SEED.company.email, password = SEED.company.password } = {}) {
  await page.goto('/login')
  await page.getByLabel('Correo', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  // The form moves to the seller PIN step; the PIN input appears (the seller
  // select stays collapsed inside the "¿No sabés tu PIN?" details).
  await expect(page.locator('#seller-pin')).toBeVisible()
}

// Complete the seller PIN step and wait for the role-based landing page.
// The PIN alone identifies the seller (PINs are unique per company).
export async function completeSellerPin(page, { pin = SEED.sellers[0].pin } = {}) {
  // pressSequentially: el PinInput controlado transforma y auto-envía en el
  // 4.º dígito; fill() pelea contra esos re-renders y queda colgado.
  await page.locator('#seller-pin').pressSequentially(pin)
  // The form auto-submits on the 4th digit; the seller lands on /pos/cargar.
  await expect(page).toHaveURL(/\/pos\/cargar$/)
}

// Full login as a seller through the UI.
export async function loginAsSeller(page, { sellerName, pin } = {}) {
  await loginCompany(page)
  await completeSellerPin(page, { sellerName, pin })
}

// Logout via the sidebar button (aria-label "Cerrar sesión") and the
// confirmation dialog; lands back on /login.
export async function logout(page) {
  await page.getByLabel('Cerrar sesión').click()
  await page.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
}
