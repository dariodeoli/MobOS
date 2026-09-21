// Pendientes del shell (#179): identidad de tienda desde el servidor, landing
// del técnico y CTA del POS sin rebotes. Los flujos de reparto viven en
// delivery.spec.js.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin } from './helpers/login.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: API, path, options })
}

// El dueño entra a /resumen (no al POS): se loguea sin la aserción del helper.
async function entrarComoDueno(page) {
  await loginCompany(page)
  await page.locator('#seller-pin').pressSequentially(SEED.admin.pin)
  await expect(page).toHaveURL(/\/resumen$/)
}

test('el técnico entra a su taller, sin CTA de POS y sin rebotes', async ({ page }) => {
  await entrarComoDueno(page)
  const yo = await api(page, '/api/auth/me')
  const adminId = yo.body?.user?.id
  expect(adminId).toBeTruthy()

  const stamp = Date.now().toString(36)
  const tecnico = await api(page, '/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: `Técnico Shell ${stamp}`, pin: '4826', role: 'TECNICO' }),
  })
  expect(tecnico.status).toBe(201)
  const tecnicoId = tecnico.body?.id
  expect(tecnicoId).toBeTruthy()

  try {
    // Cambiar el operador al técnico (mismo mecanismo que el panel).
    const ingreso = await api(page, '/api/auth/pin', { method: 'POST', body: JSON.stringify({ sellerId: tecnicoId, pin: '4826' }) })
    expect(ingreso.status).toBe(200)

    await page.goto('/')
    await expect(page).toHaveURL(/\/servicio$/)
    await expect(page.locator('h1')).toHaveText('Servicio Técnico')
    // Su nav no ofrece vender y el CTA del POS no aparece.
    await expect(page.locator('aside nav').getByRole('button', { name: 'Servicio Técnico', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'POS', exact: true })).toHaveCount(0)

    // La URL del POS no es su lugar: vuelve al taller, sin quedar en /pos.
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/servicio$/)
  } finally {
    // Volver a administración y desactivar el técnico de prueba.
    await api(page, '/api/auth/pin', { method: 'POST', body: JSON.stringify({ sellerId: adminId, pin: SEED.admin.pin }) })
    await api(page, '/api/users', { method: 'PATCH', body: JSON.stringify({ id: tecnicoId, status: 'INACTIVE' }) })
  }
})

test('sin contexto local, la identidad de tienda sale del servidor', async ({ page, browser }) => {
  await loginCompany(page)
  await completeSellerPin(page, { pin: SEED.sellers[0].pin })
  await expect(page.getByTestId('shell-tienda')).toHaveText(SEED.company.name)

  // El slug viejo /ventas sigue redirigiendo al POS.
  await page.goto('/ventas')
  await expect(page).toHaveURL(/\/pos$/)

  // Contexto nuevo solo con cookies (sin el localStorage del login): la
  // identidad tiene que venir de /api/auth/me y no caer en "Mi tienda".
  const cookies = await page.context().cookies()
  const limpio = await browser.newContext()
  await limpio.addCookies(cookies)
  const pagina = await limpio.newPage()
  try {
    await pagina.goto('/')
    await expect(pagina.getByTestId('shell-tienda')).toHaveText(SEED.company.name)
  } finally {
    await limpio.close()
  }
})
