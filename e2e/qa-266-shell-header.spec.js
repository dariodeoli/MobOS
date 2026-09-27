// #266 · Header del shell: el candado bloquea directo, el chip de usuario
// (foto + nombre completo) va a Mi perfil y ya no están el menú de tres puntos,
// el ícono de persona ni el de recarga.
// Capturas: MOBOS_266_CAPTURAS (default docs/qa/266-shell-header).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.MOBOS_266_CAPTURAS || join('docs', 'qa', '266-shell-header')

test('el header bloquea con el candado y el chip lleva a Mi perfil', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/resumen')
  await expect(page.getByTestId('shell-perfil')).toBeVisible({ timeout: 20_000 })

  // Chips retirados (#266): menú de tres puntos, ícono de persona y recarga.
  await expect(page.getByTestId('menu-acciones')).toHaveCount(0)
  await expect(page.getByTestId('menu-acciones-lista')).toHaveCount(0)
  await expect(page.getByTestId('shell-mi-cuenta')).toHaveCount(0)

  // El chip muestra el nombre completo de la sesión y la foto.
  const sesion = await page.evaluate(async (api) => {
    const respuesta = await fetch(`${api}/api/auth/me`, { credentials: 'include' })
    return (await respuesta.json())?.user || {}
  }, API)
  const nombre = String(sesion?.user_metadata?.nombre || sesion?.name || SEED.admin.name)
  const chip = page.getByTestId('shell-perfil')
  await expect(chip).toContainText(nombre)
  await expect(chip).toHaveAttribute('aria-label', new RegExp(`Mi perfil de ${nombre}`))
  await expect(chip.locator('[data-testid="persona-chip"] img, [data-testid="persona-chip"] span').first()).toBeVisible()

  // Los accesos que estaban en el menú retirado siguen en el menú principal.
  const navPrincipal = page.locator('aside nav')
  for (const item of ['Configuración', 'Clientes', 'Análisis', 'Finanzas']) {
    await expect(navPrincipal.getByRole('button', { name: item, exact: true }).first()).toBeAttached()
  }
  await page.screenshot({ path: join(DIR, 'header-desktop.png') })

  // El chip va directo al perfil editable.
  await chip.click()
  await expect(page).toHaveURL(/\/mi-cuenta$/, { timeout: 20_000 })
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: join(DIR, 'mi-perfil-desktop.png') })

  // El candado del header bloquea la pantalla y el PIN la desbloquea.
  await page.getByTestId('shell-bloquear').click()
  const bloqueo = page.getByTestId('pantalla-bloqueada')
  await expect(bloqueo).toBeVisible()
  await expect(bloqueo.getByText('Pantalla bloqueada')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'bloqueo-desktop.png') })
  await page.locator('#lock-pin').pressSequentially(SEED.admin.pin)
  await expect(bloqueo).toBeHidden()
  await expect(page.getByTestId('shell-perfil')).toBeVisible()
})

test('en mobile el chip y el candado siguen a mano', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/resumen')
  await expect(page.getByTestId('shell-bloquear')).toBeVisible({ timeout: 20_000 })

  // En mobile el chip vive en el drawer: se abre con el menú y lleva al perfil.
  await page.getByRole('button', { name: 'Menú' }).first().click()
  // El aside de escritorio sigue en el DOM (oculto): se toma el chip visible.
  const chip = page.getByTestId('shell-perfil').filter({ visible: true })
  await expect(chip).toHaveCount(1)
  await expect(chip).toBeVisible()
  await page.screenshot({ path: join(DIR, 'header-mobile.png') })
  await chip.click()
  await expect(page).toHaveURL(/\/mi-cuenta$/, { timeout: 20_000 })
  await expect(page.getByTestId('mi-cuenta-perfil')).toBeVisible({ timeout: 20_000 })

  // El candado del header sigue visible y bloquea en mobile.
  await page.getByTestId('shell-bloquear').click()
  await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()
  await page.locator('#lock-pin').pressSequentially(SEED.admin.pin)
  await expect(page.getByTestId('pantalla-bloqueada')).toBeHidden()
})
