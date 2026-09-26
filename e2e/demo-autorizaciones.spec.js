// #213 · demo: la experiencia muestra autorizaciones comerciales ficticias
// (pendientes y resueltas) y resolverlas queda simulado, sin llamar al API.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

test('la demo muestra autorizaciones ficticias y las resuelve simulado', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (/\/api\/authorizations/.test(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)

  await page.goto('/autorizaciones')
  const filas = page.getByTestId('autorizacion-fila')
  await expect(filas).toHaveCount(4, { timeout: 20_000 })
  await expect(page.getByText(/Datos ficticios: las solicitudes son de ejemplo/)).toBeVisible()
  await expect(page.getByText('2 pendientes')).toBeVisible()

  // Aprobar la primera pendiente (crédito): modal, resolución simulada.
  await filas.first().getByRole('button', { name: 'Aprobar' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText(/queda simulada/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('1 pendiente')).toBeVisible()
  expect(llamadas, `llamadas al API de autorizaciones: ${llamadas.join(', ')}`).toEqual([])
})
