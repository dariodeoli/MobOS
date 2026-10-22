import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

// Plantillas de mensajes listas (WhatsApp + correo) en la demo pública: el
// editor muestra las nuevas plantillas con su versión correo, el correo lleva
// asunto y «Avisar por correo» arma el mensaje del evento sin enviar nada.
test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

// Capturas opcionales para la documentación (MOBOS_CAPTURAS=1).
const capturar = (page, nombre) => (process.env.MOBOS_CAPTURAS ? page.screenshot({ path: `docs/rediseno/${nombre}.png` }) : null)

async function entrarComoDueno(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuiaDemo(page)
}

test('la demo trae las plantillas nuevas en WhatsApp y su versión correo', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/plantillas')
  await expect(page.getByRole('heading', { name: 'Plantillas de WhatsApp' })).toBeVisible()
  const filas = page.getByTestId('plantilla-fila')
  for (const nombre of ['Pedido confirmado', 'Llegó tu pedido sobre encargo', 'Garantía registrada', 'Cotización enviada']) {
    await expect(filas.filter({ hasText: nombre }).first()).toBeVisible()
  }
  // Pedido de reseña vive en Clientes.
  await page.getByRole('button', { name: /^Clientes \(\d+\)$/ }).click()
  await expect(filas.filter({ hasText: 'Pedido de reseña' }).first()).toBeVisible()

  // Canal Correo: las mismas plantillas con asunto.
  await page.getByTestId('plantillas-canal').getByRole('button', { name: /^Correo/ }).click()
  await page.getByRole('button', { name: /^Pedidos \(\d+\)$/ }).click()
  for (const nombre of ['Correo · Pedido confirmado', 'Correo · Llegó tu pedido sobre encargo', 'Correo · Garantía registrada', 'Correo · Cotización enviada']) {
    await expect(filas.filter({ hasText: nombre }).first()).toBeVisible()
  }
  await expect(filas.filter({ hasText: 'Confirmamos tu pedido' }).first()).toBeVisible()
  await capturar(page, 'plantillas-correo')
})

test('el editor de correo pide asunto, muestra la vista previa y guarda en el canal correo', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/plantillas')
  await page.getByTestId('plantillas-canal').getByRole('button', { name: /^Correo/ }).click()
  await page.getByRole('button', { name: /Nueva plantilla/ }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva plantilla' })
  await expect(modal.getByLabel('Canal')).toHaveValue('email')
  await modal.getByLabel('Nombre', { exact: true }).fill('Correo QA reseña')
  await modal.getByLabel('Mensaje de la plantilla').fill('Hola {{cliente}},\n\nGracias por tu compra de {{producto}}.')
  // Sin asunto no se guarda.
  await modal.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(modal.getByText('El asunto del correo es obligatorio.')).toBeVisible()
  await modal.getByLabel('Asunto').fill('Tu compra en {{empresa}}')
  await expect(modal.getByTestId('plantilla-vista')).toContainText('María González')
  await expect(modal).toContainText('Asunto: Tu compra en MobOS')
  await modal.getByRole('button', { name: 'Crear plantilla' }).click()
  await expect(page.getByText('Plantilla creada.')).toBeVisible()
  await expect(page.getByTestId('plantilla-fila').filter({ hasText: 'Correo QA reseña' })).toBeVisible()
  // No aparece entre las de WhatsApp.
  await page.getByTestId('plantillas-canal').getByRole('button', { name: /^WhatsApp/ }).click()
  await expect(page.getByTestId('plantilla-fila').filter({ hasText: 'Correo QA reseña' })).toHaveCount(0)
})

test('Avisar por correo arma el correo del evento con la plantilla elegida y no envía nada', async ({ page }) => {
  await entrarComoDueno(page)
  await page.goto('/finanzas/cuotas')
  const aviso = page.getByTestId('avisar-correo').first()
  await expect(aviso).toBeVisible({ timeout: 15_000 })
  await aviso.click()
  const vista = page.getByTestId('correo-vista')
  await expect(vista).toBeVisible()
  await expect(vista).toContainText('Asunto:')
  await expect(vista).toContainText('Demo: no se envía nada')
  await expect(vista).not.toContainText('{{')
})
