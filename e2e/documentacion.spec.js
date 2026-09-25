// Documentación interna (#159): buscador con resultados, ubicación exacta y
// enlace directo a la pantalla donde se configura.

import { test, expect } from '@playwright/test'

test('la documentación busca por tema y lleva a la pantalla', async ({ page }) => {
  // Documentación salió de Configuración: ahora es «Ayuda» en el shell.
  await page.goto('/ayuda')
  await expect(page.getByTestId('documentacion')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Documentación interna' })).toBeVisible()

  await page.getByLabel('Buscar en la documentación').fill('PIN')
  await expect(page.getByRole('heading', { name: 'Staff, roles y PIN' })).toBeVisible()

  await page.getByRole('button', { name: 'Ir a Staff, roles y PIN' }).click()
  await expect(page).toHaveURL(/\/configuracion\/equipo$/)
  await expect(page.getByRole('heading', { name: 'Integrantes' })).toBeVisible()
})

test('la documentación filtra por módulo y avisa cuando no hay resultados', async ({ page }) => {
  await page.goto('/configuracion/documentacion')
  const pantalla = page.getByTestId('documentacion')
  await pantalla.getByRole('button', { name: 'Finanzas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Caja del día' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cargar una venta' })).toHaveCount(0)

  await page.getByLabel('Buscar en la documentación').fill('xyz-no-existe')
  await expect(page.getByText('Sin resultados.')).toBeVisible()
})

// Secciones del CRM (#182): Clientes, Garantías y Taller con
// ubicación exacta y enlace directo que funciona.
test('la documentación cubre clientes, garantías y servicio técnico', async ({ page }) => {
  await page.goto('/configuracion/documentacion')

  // Seguro del cliente: ubicación exacta y enlace a la lista de clientes.
  await page.getByLabel('Buscar en la documentación').fill('seguro del cliente')
  await expect(page.getByRole('heading', { name: 'Seguro del cliente (interruptor y %)' })).toBeVisible()
  await expect(page.getByText('Clientes → ficha → Datos → Seguro del cliente')).toBeVisible()
  await page.getByRole('button', { name: 'Ir a Seguro del cliente (interruptor y %)' }).click()
  await expect(page).toHaveURL(/\/clientes$/)

  // Taller: el módulo filtra sus entradas y el enlace abre Garantías.
  await page.goto('/configuracion/documentacion')
  const pantalla = page.getByTestId('documentacion')
  await pantalla.getByRole('button', { name: 'Taller', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enlace público y QR del caso' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Estados y avance de la garantía' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir a Enlace público y QR del caso' }).click()
  await expect(page).toHaveURL(/\/garantias$/)

  // Taller: WhatsApp por estado y enlace al taller.
  // El módulo elegido queda como «último usado» (#209): se elige explícito
  // para no depender de lo recordado por el paso anterior.
  await page.goto('/configuracion/documentacion')
  await pantalla.getByRole('button', { name: 'Taller', exact: true }).click()
  await page.getByLabel('Buscar en la documentación').fill('whatsapp por estado')
  await expect(page.getByRole('heading', { name: 'WhatsApp por estado de la orden' })).toBeVisible()
  await page.getByRole('button', { name: 'Ir a WhatsApp por estado de la orden' }).click()
  await expect(page).toHaveURL(/\/servicio$/)
})
