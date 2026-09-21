// Demo pública anónima (#192): /demo entra por perfiles sin login, el panel
// funciona con datos ficticios sin tocar el API y sin sesión demo la navegación
// directa vuelve a /demo (no a /login).

import { test, expect } from '@playwright/test'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')

test('la demo entra sin login, navega con datos ficticios y no toca el API', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: /Entrá al sistema/ })).toBeVisible()
  await page.getByRole('button', { name: /Entrar como Vendedor/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  // Banner visible de datos ficticios.
  await expect(page.getByText(/los datos son ficticios/)).toBeVisible()

  // Módulos del vendedor con datos locales.
  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  await page.goto('/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

  // La recarga conserva la sesión demo (sessionStorage) y sigue todo local.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('dueño: un guardado en demo avisa que quedó simulado', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await expect(page).toHaveURL(/\/resumen$/)
  await expect(page.getByText(/los datos son ficticios/)).toBeVisible()

  await page.goto('/configuracion/equipo')
  const panel = page.locator('#equipo-form')
  await expect(panel).toBeVisible()
  await panel.locator('#direct-name').fill(`Demo E2E ${Date.now().toString(36)}`)
  await panel.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Integrante agregado correctamente.')).toBeVisible()
  // El aviso de guardado simulado viaja en el toast (título + nota de demo).
  await expect(page.getByText('Cambio simulado en la demo')).toBeVisible()
  await expect(page.getByText(/no se guardó en la tienda/).first()).toBeVisible()

  expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
})

test('sin sesión demo, la navegación directa vuelve a /demo', async ({ page }) => {
  await page.goto('/resumen')
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('button', { name: /Entrar como Dueño/ })).toBeVisible()

  // La raíz también entra por la demo para anónimos.
  await page.goto('/')
  await expect(page).toHaveURL(/\/demo$/)

  // Y el acceso real sigue disponible desde la demo.
  await page.getByRole('link', { name: 'Ingresar con mi cuenta' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
