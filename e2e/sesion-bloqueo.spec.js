// Bloqueo de sesión del POS (#158): el menú de tres puntos bloquea la pantalla
// y el PIN personal la desbloquea solo (sin Enter); la inactividad bloquea con
// el tiempo configurado en Preferencias.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test.describe('bloqueo de sesión', () => {
  test('el menú de tres puntos bloquea la pantalla y el PIN la desbloquea', async ({ page }) => {
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    await page.getByTestId('menu-acciones').click()
    const menu = page.getByTestId('menu-acciones-lista')
    for (const item of ['Configuración', 'Staff', 'Caja', 'Analytics', 'Customers', 'Bloquear pantalla', 'Cambiar sucursal', 'Cerrar sesión', 'Eliminar cuenta']) {
      await expect(menu.getByRole('menuitem', { name: item, exact: true })).toBeVisible()
    }
    await menu.getByRole('menuitem', { name: 'Bloquear pantalla', exact: true }).click()

    const bloqueo = page.getByTestId('pantalla-bloqueada')
    await expect(bloqueo).toBeVisible()
    await expect(bloqueo.getByText('Pantalla bloqueada')).toBeVisible()
    await expect(bloqueo.getByText(`Ingresá tu PIN de ${SEED.sellers[0].pin.length} dígitos`)).toBeVisible()

    // El PIN valida solo al completarlo: no hay Enter ni botón.
    await page.locator('#lock-pin').pressSequentially(SEED.sellers[0].pin)
    await expect(bloqueo).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  })

  test('la inactividad bloquea sola con el tiempo configurado', async ({ page }) => {
    await page.clock.install()
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    // Preferencia de 1 minuto (el default son 10) para no esperar.
    await page.getByTestId('menu-acciones').click()
    await page.getByRole('menuitem', { name: 'Preferencias', exact: true }).click()
    await page.locator('#pref-bloqueo').selectOption('1')
    await page.getByRole('dialog').getByRole('button', { name: 'Listo' }).click()

    await page.clock.fastForward(61_000)
    await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()
  })

  test('el bloqueo sobrevive a la recarga de la pestaña', async ({ page }) => {
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    await page.getByTestId('menu-acciones').click()
    await page.getByTestId('menu-acciones-lista').getByRole('menuitem', { name: 'Bloquear pantalla', exact: true }).click()
    await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()

    // F5 no puede saltar el bloqueo: sigue pidiendo el PIN.
    await page.reload()
    await expect(page.getByTestId('pantalla-bloqueada')).toBeVisible()

    await page.locator('#lock-pin').pressSequentially(SEED.sellers[0].pin)
    await expect(page.getByTestId('pantalla-bloqueada')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    // Desbloqueado, otra recarga ya no bloquea.
    await page.reload()
    await expect(page.getByTestId('pantalla-bloqueada')).toHaveCount(0)
  })
})
