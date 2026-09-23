// #248: sin sesión, la raíz y las rutas protegidas van a /login (con vuelta
// post-login). La demo sigue disponible solo por entrada explícita (/demo) y
// los enlaces públicos no piden sesión.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin } from './helpers/login.js'

const SALIDA = 'test-results/248-redireccion'

test('sin sesión la raíz va a /login y no a /demo', async ({ page }) => {
  mkdirSync(SALIDA, { recursive: true })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Entrá a tu tienda' })).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/01-raiz-login.jpg`, type: 'jpeg', quality: 72 })
})

test('una ruta protegida pide login y al entrar vuelve al destino', async ({ page }) => {
  mkdirSync(SALIDA, { recursive: true })
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login\?volver=%2Fclientes$/)
  await page.screenshot({ path: `${SALIDA}/02-protegida-login.jpg`, type: 'jpeg', quality: 72 })

  // El login no re-navega: conserva el ?volver y al entrar vuelve ahí.
  await loginCompany(page, { navegar: false })
  await completeSellerPin(page, { destino: /\/clientes$/ })
  await expect(page.getByTestId('cliente-fila').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SALIDA}/03-vuelta-clientes.jpg`, type: 'jpeg', quality: 72 })
})

test('/demo sigue disponible solo por entrada explícita', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveURL(/\/demo/)
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('button', { name: /Entrar como Dueño/ })).toBeVisible()
})

test('los enlaces públicos siguen abiertos sin sesión', async ({ page }) => {
  await page.goto(`/u/${SEED.products.iphone.imei}`)
  await expect(page).toHaveURL(new RegExp(`/u/${SEED.products.iphone.imei}$`))
  await expect(page).not.toHaveURL(/\/login/)
})
