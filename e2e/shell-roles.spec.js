import { shellPrimary, openShellProfile } from './helpers/shell-navigation.js'
// Pendientes del shell (#179): identidad de tienda desde el servidor, landing
// del técnico y CTA del POS sin rebotes. Los flujos de reparto viven en
// delivery.spec.js.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany, completeSellerPin } from './helpers/login.js'
import { crearIntegranteConPinLibre } from './helpers/integrantes.mjs'

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
    await expect((await shellPrimary(page)).getByRole('button', { name: 'Taller', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Vender', exact: true })).toHaveCount(0)

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
    await expect(pagina.getByTestId('shell-mobile-header').getByRole('img', { name: 'MobOS' })).toBeVisible()
    const profile = await openShellProfile(pagina)
    await expect(profile.getByTestId('shell-empresa')).toHaveText(SEED.company.name)
  } finally {
    await limpio.close()
  }
})

// Presencia (#210/#211): la píldora de personas en línea se retiró del header; el
// estado en línea es un punto sobre el avatar del perfil (foto subida → Google →
// iniciales, resuelto por el Avatar compartido) y su etiqueta accesible lo dice.
test('el avatar del perfil muestra iniciales y el estado en línea (#211)', async ({ page }) => {
  await entrarComoDueno(page)

  const perfil = page.getByTestId('shell-perfil')
  await expect(perfil).toBeVisible()
  await expect(perfil).toHaveAttribute('aria-label', /Abrir perfil de .*, en línea/)
  const chip = perfil.getByTestId('persona-chip')
  await expect(chip).toHaveAttribute('title', /en línea/)
  await expect(chip).toBeVisible()
  // La píldora de personas en línea ya no existe en el header.
  await expect(page.getByRole('group', { name: 'Personas en línea' })).toHaveCount(0)
})

test('sin conexión el avatar del perfil cambia de estado y lo anuncia (#211)', async ({ page }) => {
  await entrarComoDueno(page)

  const perfil = page.getByTestId('shell-perfil')
  await expect(perfil).toHaveAttribute('aria-label', /en línea/)
  await page.context().setOffline(true)
  try {
    await expect(perfil).toHaveAttribute('aria-label', /sin conexión/)
    await expect(perfil.getByTestId('persona-chip')).toHaveAttribute('title', /sin conexión/)
  } finally {
    await page.context().setOffline(false)
  }
  await expect(perfil).toHaveAttribute('aria-label', /en línea/)
})
