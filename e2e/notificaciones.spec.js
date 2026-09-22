// Panel de notificaciones del POS (#158): el aviso de la barra abre las
// novedades del rol (pedidos, entregas, aprobaciones, comentarios y menciones).

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const respuesta = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
  }, { api: API, path, options })
}

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

// #148 §14: las tareas del taller también son novedades (jefaturas ven las
// órdenes abiertas sin técnico para asignar).
test('las tareas de taller sin asignar aparecen en el panel (#148 §14)', async ({ page }) => {
  // Primero se navega: el API helper necesita un origen real para el fetch.
  await page.goto('/resumen')
  const marca = Date.now().toString(36)
  const creada = await api(page, '/api/service-orders', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente tarea ${marca}`, device: `Equipo tarea ${marca}`, serviceName: 'Diagnóstico' }),
  })
  expect([200, 201]).toContain(creada.status)
  const ordenId = creada.body?.id
  try {
    await page.goto('/servicio')
    await expect(page.getByTestId('servicio-fila').filter({ hasText: marca }).first()).toBeVisible()
    await page.getByTestId('notificaciones-aviso').click()
    const panel = page.getByTestId('notificaciones-panel')
    await expect(panel.getByRole('button', { name: /Orden de taller sin asignar/ }).first()).toBeVisible()
  } finally {
    if (ordenId) await api(page, '/api/service-orders', { method: 'PATCH', body: JSON.stringify({ id: ordenId, status: 'CANCELADO' }) })
  }
})
