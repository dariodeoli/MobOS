// Alta de integrante en Configuración → Equipo (issue #53, Lote 5 #165):
// Nombre y Correo deben leerse completos en los dos modos del formulario, que
// en escritorio vive en el panel derecho.

import { test, expect } from '@playwright/test'

const ANCHO_MINIMO = 200

async function abrirFormulario(page) {
  await page.goto('/configuracion/equipo')
  const panel = page.locator('#equipo-form')
  await expect(panel).toBeVisible()
  return panel
}

async function ancho(campo) {
  const caja = await campo.boundingBox()
  return caja?.width || 0
}

test.describe('invitar persona', () => {
  test('modo correo: Nombre y Correo tienen ancho de lectura', async ({ page }) => {
    const panel = await abrirFormulario(page)
    const nombre = panel.locator('#invite-name')
    const correo = panel.locator('#invite-email')
    await expect(nombre).toBeVisible()
    await expect(correo).toBeVisible()

    await nombre.fill('Nombre Apellido Largo E2E')
    await correo.fill('correo.largo.del.invitado@test.local')
    await expect(nombre).toHaveValue('Nombre Apellido Largo E2E')
    await expect(correo).toHaveValue('correo.largo.del.invitado@test.local')

    expect(await ancho(nombre), 'Nombre debe ocupar el ancho del panel').toBeGreaterThan(ANCHO_MINIMO)
    expect(await ancho(correo), 'Correo debe ocupar el ancho del panel').toBeGreaterThan(ANCHO_MINIMO)
  })

  test('modo directo: Nombre y Correo respiran y el alta sigue operable', async ({ page }) => {
    const panel = await abrirFormulario(page)
    await panel.getByRole('button', { name: 'Agregar directamente' }).click()
    const nombre = panel.locator('#direct-name')
    const correo = panel.locator('#direct-email')
    await expect(nombre).toBeVisible()
    await expect(correo).toBeVisible()

    await nombre.fill('Apellido Nombre E2E')
    await correo.fill('otro.correo.largo.e2e@test.local')
    await expect(nombre).toHaveValue('Apellido Nombre E2E')
    await expect(correo).toHaveValue('otro.correo.largo.e2e@test.local')

    expect(await ancho(nombre), 'Nombre debe ocupar el ancho del panel').toBeGreaterThan(ANCHO_MINIMO)
    expect(await ancho(correo), 'Correo debe ocupar el ancho del panel').toBeGreaterThan(ANCHO_MINIMO)

    // Rol, PIN y botón siguen operables.
    await expect(panel.locator('#direct-role')).toBeVisible()
    await expect(panel.locator('#direct-pin')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Agregar', exact: true })).toBeEnabled()
  })
})
