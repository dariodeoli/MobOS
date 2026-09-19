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

// Los enlaces del correo traen el token en el path (/restablecer-contrasena/<token>
// y /verificar-correo/<token>): la ruta tiene que aceptarlo, no solo la raíz.
test('los enlaces del correo con token abren su pantalla', async ({ page }) => {
  const token = 'a'.repeat(64)
  await page.goto(`/restablecer-contrasena/${token}`)
    await expect(page.getByRole('heading', { name: 'Elegí una nueva contraseña' })).toBeVisible({ timeout: 60000 })
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible()
  await expect(page).toHaveURL(/\/restablecer-contrasena\/?$/)

  await page.goto(`/verificar-correo/${token}`)
  await expect(page.getByRole('heading', { name: 'Verificación de correo' })).toBeVisible()
  // Con token la pantalla verifica sola; no tiene que pedir pegar el enlace.
  await expect(page.getByLabel('Pegá tu enlace completo')).toHaveCount(0)
})

// Del acceso a recuperación: el correo ya escrito viaja y queda precargado.
test('recuperar contraseña lleva el correo que escribí en el acceso', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Correo').fill('dueno@tienda.test')
  await page.getByRole('link', { name: /Recuperar/ }).click()
  await expect(page).toHaveURL(/email=dueno%40tienda\.test/)
  await expect(page.getByLabel('Correo de la empresa')).toHaveValue('dueno@tienda.test')
})
