// Pendientes del shell (#179): identidad de tienda desde el servidor, landing
// del técnico y CTA del POS sin rebotes. Los flujos de reparto viven en
// delivery.spec.js.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin } from './helpers/login.js'
import { crearIntegranteConPinLibre } from './helpers/integrantes.mjs'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Imagen mínima válida para simular la foto subida de una persona.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

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
  const tecnico = await crearIntegranteConPinLibre(page, { api: API, nombre: `Técnico Shell ${stamp}`, rol: 'TECNICO' })
  const tecnicoId = tecnico.id
  expect(tecnicoId).toBeTruthy()

  try {
    // Cambiar el operador al técnico (mismo mecanismo que el panel).
    const ingreso = await api(page, '/api/auth/pin', { method: 'POST', body: JSON.stringify({ sellerId: tecnicoId, pin: tecnico.pin }) })
    expect(ingreso.status).toBe(200)

    await page.goto('/')
    await expect(page).toHaveURL(/\/servicio$/)
    await expect(page.locator('h1')).toHaveText('Taller')
    // Su nav no ofrece vender y el CTA del POS no aparece.
    await expect(page.locator('aside nav').getByRole('button', { name: 'Taller y garantías', exact: true })).toBeVisible()
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
  // El encabezado muestra la marca (#223); la identidad de la empresa vive en
  // el menú.
  await expect(page.getByTestId('shell-tienda')).toHaveText('MobOS')

  // El slug viejo /ventas sigue redirigiendo al POS.
  await page.goto('/ventas')
  await expect(page).toHaveURL(/\/pos$/)

  // Contexto nuevo solo con cookies (sin el localStorage del login): la
  // identidad tiene que venir de /api/auth/me y no caer en "Mi tienda".
  const cookies = await page.context().cookies()
  const limpio = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await limpio.addCookies(cookies)
  const pagina = await limpio.newPage()
  try {
    await pagina.goto('/')
    await expect(pagina.getByTestId('shell-tienda')).toHaveText('MobOS')
    await expect(pagina.getByTestId('shell-miga-tienda')).toHaveText('MobOS')
    await pagina.getByRole('button', { name: 'Menú', exact: true }).click()
    await expect(pagina.getByRole('dialog').getByRole('heading', { name: SEED.company.name })).toBeVisible()
  } finally {
    await limpio.close()
  }
})

// La píldora de presencia resuelve la foto con el Avatar compartido para todas
// las personas (foto subida → Google → iniciales) y usa nombre corto cuando hay
// una sola persona en línea (#210/#211).
function personasEnLinea(page, personas) {
  const ahora = new Date().toISOString()
  return Promise.all([
    page.route('**/api/presence/heartbeat', (route) => route.fulfill({ json: { ok: true } })),
    page.route('**/api/users/presencia-ana/avatar', (route) => route.fulfill({ contentType: 'image/png', body: PNG })),
    page.route('**/api/presence', (route) => route.fulfill({
      json: { people: personas.map((persona) => ({ lastSeenAt: ahora, active: false, scope: null, ...persona })) },
    })),
  ])
}

test('la píldora de presencia muestra foto, iniciales y el total en línea (#211)', async ({ page }) => {
  await personasEnLinea(page, [
    { id: 'presencia-ana', name: 'Ana María Gómez', role: 'ADMIN', scope: 'resumen' },
    { id: 'presencia-bruno', name: 'Bruno Díaz', role: 'VENDEDOR', scope: 'pos' },
  ])
  await entrarComoDueno(page)

  const pildora = page.getByRole('group', { name: 'Personas en línea' })
  await expect(pildora).toBeVisible()
  await expect(page.locator('img[alt="Foto de Ana María Gómez"]')).toBeVisible()
  const bruno = page.getByTitle('Bruno Díaz · pos')
  await expect(bruno).toBeVisible()
  await expect(bruno).toHaveText('BD')
  await expect(pildora.getByText('2 en línea')).toBeVisible()
})

test('con una sola persona en línea, la píldora muestra el nombre corto (#211)', async ({ page }) => {
  await personasEnLinea(page, [{ id: 'presencia-ana', name: 'Ana María Gómez', role: 'ADMIN' }])
  await entrarComoDueno(page)

  const pildora = page.getByRole('group', { name: 'Personas en línea' })
  await expect(pildora).toBeVisible()
  await expect(pildora.getByText('Ana en línea')).toBeVisible()
  await expect(page.locator('img[alt="Foto de Ana María Gómez"]')).toBeVisible()
})
