// Servicio técnico (#122): alta con costos desglosados (repuesto + mano de obra
// + otros), catálogo con buscador, checklist configurable por tipo de equipo y
// avance por el pipeline. La orden de prueba se cancela al final.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

test('la orden se carga con costos desglosados y la utilidad se calcula sola', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const cliente = `Cliente Taller ${marca}`
  await page.goto('/servicio')
  await expect(page.getByRole('button', { name: '+ Nueva orden' })).toBeVisible()

  // El catálogo puede estar vacío: se carga el sugerido desde el propio panel.
  if (await page.getByRole('button', { name: 'Cargar catálogo sugerido' }).first().isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Cargar catálogo sugerido' }).first().click()
  }

  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await modal.getByLabel('Cliente', { exact: true }).fill(cliente)
  await modal.getByLabel('Dispositivo', { exact: true }).fill(`iPhone 14 Pro ${marca}`)
  // Buscador instantáneo del catálogo: solo quedan los servicios que coinciden.
  await modal.getByLabel('Buscar servicio', { exact: true }).fill('display')
  const selector = modal.getByLabel('Servicio del catálogo', { exact: true })
  const opcion = selector.locator('option', { hasText: /display/i }).first()
  await expect(opcion).toBeAttached()
  await selector.selectOption(await opcion.getAttribute('value'))
  await modal.getByLabel('Precio cobrado', { exact: true }).fill('300.000')
  await modal.getByLabel('Repuesto (Gs)', { exact: true }).fill('120.000')
  await modal.getByLabel('Mano de obra (Gs)', { exact: true }).fill('60.000')
  await modal.getByLabel('Otros (Gs)', { exact: true }).fill('20.000')
  // El panel calcula costo del trabajo y utilidad en vivo.
  await expect(modal.getByText('Gs 200.000')).toBeVisible()
  await expect(modal.getByText('Gs 100.000')).toBeVisible()
  await modal.getByRole('button', { name: 'Crear orden' }).click()
  await expect(page.getByText('Orden de servicio creada.')).toBeVisible({ timeout: 15_000 })

  // La fila muestra la utilidad real (300.000 − 200.000).
  const fila = page.getByTestId('servicio-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()
  await expect(fila.getByText('+Gs 100.000')).toBeVisible()

  // Avance del pipeline: Recibido → Diagnóstico.
  await fila.getByRole('button', { name: 'Diagnóstico', exact: true }).click()
  await expect(page.getByTestId('servicio-fila').filter({ hasText: marca }).first().getByText('Diagnóstico', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Limpieza: la orden de prueba queda cancelada.
  await page.evaluate(async ({ api, cliente }) => {
    const ordenes = await fetch(`${api}/api/service-orders`, { credentials: 'include' }).then(respuesta => respuesta.json())
    const orden = (Array.isArray(ordenes) ? ordenes : []).find(item => item.customerName === cliente)
    if (orden) await fetch(`${api}/api/service-orders`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orden.id, status: 'CANCELADO' }) })
  }, { api: API, cliente })
})

test('el checklist se configura por tipo de dispositivo', async ({ page }) => {
  const punto = 'Face ID E2E'
  await page.goto('/servicio')
  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await modal.getByRole('button', { name: 'Configurar' }).click()
  const config = page.getByRole('dialog', { name: /^Checklist de recepción ·/ })
  await config.getByLabel('Nuevo punto del checklist', { exact: true }).fill(punto)
  await config.getByRole('button', { name: 'Agregar' }).click()
  await expect(config.getByTestId('checklist-puntos').getByText(punto)).toBeVisible({ timeout: 15_000 })
  // Cerrar la configuración deja el formulario abierto con el punto nuevo.
  await config.getByRole('button', { name: 'Cerrar' }).click()
  await expect(config).toHaveCount(0)
  await expect(modal.getByText(punto)).toBeVisible({ timeout: 15_000 })
})
