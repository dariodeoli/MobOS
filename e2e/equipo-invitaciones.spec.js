// Configuración → Equipo: invitaciones visibles con estado, reenvío y
// revocación, y salida cuando el alta devuelve 409 (issue #54). Las
// invitaciones del seed las recrea global-setup en cada corrida.

import { test, expect } from '@playwright/test'

const pendiente = 'invitado.pendiente@test.local'
const vencida = 'invitado.vencida@test.local'
const conflicto = 'invitado.conflicto@test.local'

const fila = (page, email) => page.getByTestId('invitacion-fila').filter({ hasText: email })

test.describe('invitaciones en Configuración → Equipo', () => {
  test('el listado muestra pendientes y vencidas con autor y fechas', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    await expect(page.getByRole('heading', { name: 'Invitaciones' })).toBeVisible()

    const pend = fila(page, pendiente)
    await expect(pend).toBeVisible()
    await expect(pend.getByText('Pendiente', { exact: true })).toBeVisible()
    await expect(pend.getByText('Vendedor', { exact: true })).toBeVisible()
    await expect(pend.getByText(/Invitó .+/).first()).toBeVisible()
    await expect(pend.getByText(/Creada/).first()).toBeVisible()
    await expect(pend.getByText(/Expira/).first()).toBeVisible()
    await expect(pend.getByRole('button', { name: 'Reenviar' })).toBeEnabled()

    const venc = fila(page, vencida)
    await expect(venc).toBeVisible()
    await expect(venc.getByText('Vencida', { exact: true })).toBeVisible()
    await expect(venc.getByText(/Venció/).first()).toBeVisible()
    await expect(venc.getByRole('button', { name: 'Invitar de nuevo' })).toBeVisible()
  })

  test('una invitación vencida se puede volver a invitar desde el listado', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    await fila(page, vencida).getByRole('button', { name: 'Invitar de nuevo' }).click()
    const modal = page.getByRole('dialog', { name: 'Invitar persona' })
    await expect(modal).toBeVisible()
    await expect(modal.locator('#invite-email')).toHaveValue(vencida)
    await modal.getByRole('button', { name: 'Cerrar' }).click()
    await expect(modal).toBeHidden()
  })

  test('invitar un correo con invitación activa ofrece reenviar o revocar', async ({ page }) => {
    // El arnés e2e no tiene relay de correo: se simula el 409 con la invitación
    // existente, que es exactamente lo que devuelve el backend.
    await page.route('**/api/user-invitations', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON()
      if (body?.email !== conflicto) return route.continue()
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Ya existe una invitación activa para ese correo.',
          details: {
            invitation: {
              id: 'e2e-invite-conflicto',
              email: conflicto,
              name: 'Invitado E2E Conflicto',
              role: 'VENDEDOR',
              status: 'PENDING',
              inviterName: 'Administrador',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
              resendAvailableAt: new Date(Date.now() - 60000).toISOString(),
            },
          },
        }),
      })
    })
    await page.route('**/api/user-invitations/*/resend', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deliveryState: 'sent' }),
    }))

    await page.goto('/configuracion/equipo')
    await page.getByRole('button', { name: '+ Invitar persona' }).click()
    const modal = page.getByRole('dialog', { name: 'Invitar persona' })
    await modal.locator('#invite-name').fill('Invitado E2E Conflicto')
    await modal.locator('#invite-email').fill(conflicto)
    await modal.getByRole('button', { name: 'Enviar invitación' }).click()

    // El error ya no es un callejón: muestra la invitación y sus salidas.
    await expect(modal.getByText(`Ya existe una invitación activa para ${conflicto}.`)).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Reenviar invitación' })).toBeEnabled()
    await modal.getByRole('button', { name: 'Reenviar invitación' }).click()
    await expect(page.getByText('Invitación reenviada.')).toBeVisible()

    // Revocación real sobre la invitación de conflicto (exclusiva de esta spec).
    await modal.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(modal.getByText(`Ya existe una invitación activa para ${conflicto}.`)).toBeVisible()
    await modal.getByRole('button', { name: 'Revocar invitación' }).click()
    await page.getByRole('dialog', { name: '¿Revocar invitación?' }).getByRole('button', { name: 'Revocar invitación' }).click()
    await expect(page.getByText('Invitación revocada.')).toBeVisible()
    await expect(fila(page, conflicto).getByText('Revocada', { exact: true })).toBeVisible()
  })
})
