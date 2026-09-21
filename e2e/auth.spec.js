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

  test('seller logs in with company credentials + PIN and lands on /pos', async ({ page }) => {
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

// #129: el portal de clientes llama al API desde su propio origen. Preflight y
// llamada real contra el middleware, y los orígenes existentes siguen igual.
test('el portal de clientes puede llamar al API por CORS', async ({ request }) => {
  const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
  const portal = 'https://clientes.moboss.online'

  const preflight = await request.fetch(`${API}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: portal, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'content-type' },
  })
  expect(preflight.status()).toBe(204)
  expect(preflight.headers()['access-control-allow-origin']).toBe(portal)
  expect(preflight.headers()['access-control-allow-credentials']).toBe('true')

  const real = await request.get(`${API}/api/health`, { headers: { Origin: portal } })
  expect(real.ok()).toBeTruthy()
  expect(real.headers()['access-control-allow-origin']).toBe(portal)

  for (const origin of ['https://app.moboss.online', 'https://moboss.online', 'http://localhost:5175']) {
    const res = await request.get(`${API}/api/health`, { headers: { Origin: origin } })
    expect(res.headers()['access-control-allow-origin'], `${origin} debe seguir permitido`).toBe(origin)
  }

  // Sin comodines: un origen ajeno no se refleja.
  const ajeno = await request.get(`${API}/api/health`, { headers: { Origin: 'https://otro.example' } })
  expect(ajeno.headers()['access-control-allow-origin']).toBeUndefined()
})

// Demo (#187/#189): el clic en la fila abre la ficha con los datos del
// navegador y ?cliente= resuelve contra la demo, sin pegarle al API real.
test('demo: la ficha del cliente abre sin sesión y no consulta el API', async ({ page }) => {
  const apiClientes = []
  page.on('request', (request) => { if (/\/api\/customers\/|\/api\/message-templates/.test(request.url())) apiClientes.push(request.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await page.locator('aside nav, nav').first().getByRole('button', { name: 'Clientes', exact: true }).click()
  await expect(page.getByRole('button', { name: '+ Crear cliente' })).toBeVisible()

  const marca = `DEMOQA${Date.now().toString(36).toUpperCase()}`
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  await page.getByLabel('Primer nombre', { exact: true }).fill('Ficha')
  await page.getByLabel(/Segundo nombre/).fill(marca)
  const modalAlta = page.locator('form').filter({ hasText: 'Límite de crédito (Gs)' })
  await modalAlta.getByPlaceholder('981 123 456').fill('0981222333')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()
  await page.getByLabel('Buscar clientes').fill(marca)

  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()
  await fila.click()
  const ficha = page.getByRole('dialog')
  await expect(ficha.getByRole('heading', { name: new RegExp(`Cliente: Ficha ${marca}`) })).toBeVisible()
  await expect(ficha.getByText(/Modo demo/)).toBeVisible()
  // Las acciones de la ficha quedan deshabilitadas en demo.
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await expect(ficha.getByRole('button', { name: 'Guardar notas' })).toBeDisabled()
  await expect(ficha.getByRole('switch', { name: 'Seguro del cliente activo' })).toBeDisabled()
  // El menú de WhatsApp usa las plantillas demo (sin ir al API).
  await ficha.getByRole('button', { name: new RegExp(`Elegir plantilla de WhatsApp para`) }).click()
  await expect(page.getByRole('dialog', { name: 'Plantillas de WhatsApp' }).getByText('Pedido listo para retirar')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // ?cliente=<id demo> abre la misma ficha (resuelto contra el navegador).
  const idDemo = await page.evaluate(() => {
    const filas = JSON.parse(localStorage.getItem('mobos:demo-customers:v1') || '[]')
    return (filas.find((row) => String(row.name || '').includes('DEMOQA')) || {}).id || ''
  })
  expect(idDemo).toBeTruthy()
  await page.goto(`/clientes?cliente=${encodeURIComponent(idDemo)}`)
  await expect(page.getByRole('dialog').getByText(/Modo demo/)).toBeVisible()

  expect(apiClientes, `la demo no debe consultar el API real: ${apiClientes.join(', ')}`).toEqual([])
})
