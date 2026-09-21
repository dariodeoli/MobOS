// Bloqueo de sesión del POS (#158): el menú de tres puntos bloquea la pantalla
// y el PIN personal la desbloquea solo (sin Enter); la inactividad bloquea con
// el tiempo configurado en Preferencias.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

// Imagen mínima válida para simular la foto del usuario y el logo de la tienda.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

// La pantalla bloqueada muestra la foto real del usuario (misma resolución que
// el Avatar), el logo de MobOS y el de la tienda con la variante del fondo
// (#210). Se mockean las imágenes para no depender del seed.
async function simularImagenes(page, variantes) {
  await page.route('**/api/tenant/logo*', async (route) => {
    variantes.push(new URL(route.request().url()).searchParams.get('variant'))
    await route.fulfill({ contentType: 'image/png', body: PNG })
  })
  await page.route('**/api/users/*/avatar', (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
}

async function bloquear(page) {
  await page.getByTestId('menu-acciones').click()
  await page.getByTestId('menu-acciones-lista').getByRole('menuitem', { name: 'Bloquear pantalla', exact: true }).click()
  const bloqueo = page.getByTestId('pantalla-bloqueada')
  await expect(bloqueo).toBeVisible()
  return bloqueo
}

test.describe('bloqueo de sesión', () => {
  test('el menú de tres puntos bloquea la pantalla y el PIN la desbloquea', async ({ page }) => {
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    await page.getByTestId('menu-acciones').click()
    const menu = page.getByTestId('menu-acciones-lista')
    for (const item of ['Configuración', 'Caja', 'Análisis', 'Clientes', 'Bloquear pantalla', 'Cambiar sucursal', 'Cerrar sesión', 'Eliminar cuenta']) {
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

  test('la pantalla bloqueada muestra la foto y los logos en tema claro (#210)', async ({ page }) => {
    const variantes = []
    await simularImagenes(page, variantes)
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    const bloqueo = await bloquear(page)
    await expect(bloqueo.locator('img[alt="MobOS"]')).toHaveAttribute('src', /\/logo\.svg$/)
    await expect(bloqueo.getByTestId('lock-logo-empresa')).toBeVisible()
    await expect(bloqueo.locator(`img[alt="Foto de ${SEED.sellers[0].name}"]`)).toBeVisible()
    expect(variantes).toContain('light')

    // El PIN se sigue auto-validando al completarlo.
    await page.locator('#lock-pin').pressSequentially(SEED.sellers[0].pin)
    await expect(bloqueo).toBeHidden()
  })

  test('la pantalla bloqueada usa el logo claro en tema oscuro y entra en móvil (#210)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
    const variantes = []
    await simularImagenes(page, variantes)
    await page.goto('/ventas')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    const bloqueo = await bloquear(page)
    await expect(bloqueo.locator('img[alt="MobOS"]')).toHaveAttribute('src', /\/logo-dark\.svg$/)
    await expect(bloqueo.getByTestId('lock-logo-empresa')).toBeVisible()
    await expect(bloqueo.locator(`img[alt="Foto de ${SEED.sellers[0].name}"]`)).toBeVisible()
    await expect(page.locator('#lock-pin')).toBeVisible()
    expect(variantes).toContain('dark')

    // La tarjeta entra completa en la pantalla del teléfono.
    const caja = await bloqueo.boundingBox()
    expect(caja.x).toBeGreaterThanOrEqual(0)
    expect(caja.y).toBeGreaterThanOrEqual(0)
    expect(caja.width).toBeLessThanOrEqual(390)
    expect(caja.x + caja.width).toBeLessThanOrEqual(391)
  })
})
