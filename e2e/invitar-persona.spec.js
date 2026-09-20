// Popup «Invitar persona» (Configuración → Equipo, issue #53): Nombre y
// Correo deben leerse completos en los dos modos del formulario.

import { test, expect } from '@playwright/test'

const ANCHO_MINIMO = 200

async function abrirPopup(page) {
  await page.goto('/configuracion/equipo')
  await page.getByRole('button', { name: '+ Invitar persona' }).click()
  const modal = page.getByRole('dialog', { name: 'Invitar persona' })
  await expect(modal).toBeVisible()
  return modal
}

async function ancho(campo) {
  const caja = await campo.boundingBox()
  return caja?.width || 0
}

test.describe('invitar persona', () => {
  test('modo correo: Nombre y Correo tienen ancho de lectura', async ({ page }) => {
    const modal = await abrirPopup(page)
    const nombre = modal.locator('#invite-name')
    const correo = modal.locator('#invite-email')
    await expect(nombre).toBeVisible()
    await expect(correo).toBeVisible()

    await nombre.fill('Nombre Apellido Largo E2E')
    await correo.fill('correo.largo.del.invitado@test.local')
    await expect(nombre).toHaveValue('Nombre Apellido Largo E2E')
    await expect(correo).toHaveValue('correo.largo.del.invitado@test.local')

    expect(await ancho(nombre), 'Nombre debe ocupar media fila').toBeGreaterThan(ANCHO_MINIMO)
    expect(await ancho(correo), 'Correo debe ocupar media fila').toBeGreaterThan(ANCHO_MINIMO)
  })

  test('modo directo: Nombre y Correo respiran y el alta sigue operable', async ({ page }) => {
    const modal = await abrirPopup(page)
    await modal.getByRole('button', { name: 'Agregar directamente' }).click()
    const nombre = modal.locator('#direct-name')
    const correo = modal.locator('#direct-email')
    await expect(nombre).toBeVisible()
    await expect(correo).toBeVisible()

    await nombre.fill('Apellido Nombre E2E')
    await correo.fill('otro.correo.largo.e2e@test.local')
    await expect(nombre).toHaveValue('Apellido Nombre E2E')
    await expect(correo).toHaveValue('otro.correo.largo.e2e@test.local')

    expect(await ancho(nombre), 'Nombre debe ocupar media fila').toBeGreaterThan(ANCHO_MINIMO)
    expect(await ancho(correo), 'Correo debe ocupar media fila').toBeGreaterThan(ANCHO_MINIMO)

    // Rol, PIN y botón siguen en su fila y operables.
    await expect(modal.locator('#direct-role')).toBeVisible()
    await expect(modal.locator('#direct-pin')).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Agregar', exact: true })).toBeEnabled()
  })
})
