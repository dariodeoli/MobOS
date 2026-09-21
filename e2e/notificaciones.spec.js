// Panel de notificaciones del POS (#158): el aviso de la barra abre las
// novedades del rol (pedidos, entregas, aprobaciones, comentarios y menciones).

import { test, expect } from '@playwright/test'

test('el aviso abre el panel con las novedades del rol', async ({ page }) => {
  await page.goto('/resumen')
  const aviso = page.getByTestId('notificaciones-aviso')
  await expect(aviso).toBeVisible()
  await aviso.click()

  const panel = page.getByTestId('notificaciones-panel')
  await expect(panel).toBeVisible()
  // El seed deja un pedido de delivery pendiente: el dueño ve al menos esa novedad.
  await expect(
    panel.getByRole('button', { name: /Entrega pendiente|Pedido sin cobrar|Pedido nuevo|Aprobación pendiente/ }).first(),
  ).toBeVisible()
})
