// QA #321 — Ayuda por tareas, atajos y notificaciones demo.
//
// La ayuda arranca por la tarea (con pasos y enlace a la pantalla), el diálogo
// de atajos separa teclas reales de controles y la demo muestra ejemplos
// ficticios de notificaciones para evaluar la bandeja. Capturas en
// docs/qa/321-ayuda-atajos/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || join('docs', 'qa', '321-ayuda-atajos')
mkdirSync(SHOTS, { recursive: true })

const PREGUNTAS = [
  '¿Cómo hago una venta?',
  '¿Cómo recibo una unidad?',
  '¿Cómo cierro la caja?',
  '¿Cómo traslado stock?',
  '¿Cómo consulto un IMEI?',
]

test('la ayuda arranca por tareas y cada pregunta lleva a su pantalla', async ({ page }) => {
  await page.goto('/ayuda/ayuda')
  const tareas = page.getByTestId('ayuda-tareas')
  await expect(tareas).toBeVisible({ timeout: 20_000 })
  for (const pregunta of PREGUNTAS) {
    await expect(tareas.getByRole('heading', { name: pregunta }), pregunta).toBeVisible()
  }
  await page.screenshot({ path: join(SHOTS, 'ayuda-tareas-desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(tareas).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'ayuda-tareas-mobile.png') })

  // El enlace directo de la primera tarea abre el POS.
  await tareas.getByRole('button', { name: /Ir al POS/ }).click()
  await expect(page).toHaveURL(/\/pos$/)
})

test('los atajos separan teclas de controles, sin repeticiones', async ({ page }) => {
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Atajos de teclado' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Atajos de teclado' })
  await expect(dialogo).toBeVisible({ timeout: 20_000 })

  // Las teclas reales van en kbd; los controles de la barra no.
  await expect(dialogo.getByRole('region', { name: 'Controles de la barra' })).toBeVisible()
  await expect(dialogo.getByText('Bloquear pantalla')).toBeVisible()
  await expect(dialogo.getByText('Mi perfil')).toBeVisible()
  await expect(dialogo.locator('kbd', { hasText: 'Candado' })).toHaveCount(0)
  await expect(dialogo.locator('kbd', { hasText: 'Chip' })).toHaveCount(0)
  // Las teclas siguen existiendo (F1 = nueva venta).
  await expect(dialogo.locator('kbd', { hasText: 'F1' })).toBeVisible()
  // La nota de los campos aparece una sola vez en el diálogo.
  await expect(dialogo.getByText(/no funcionan mientras escribís/)).toHaveCount(1)
  await page.screenshot({ path: join(SHOTS, 'atajos-desktop.png') })
})

test.describe('demo: notificaciones de ejemplo', () => {
  test.use({ storageState: undefined })

  test('la bandeja de la demo muestra ejemplos y los distingue', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/demo')
    await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
    await cerrarGuiaDemo(page)

    await page.getByTestId('notificaciones-aviso').click()
    const panel = page.getByTestId('notificaciones-panel')
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByText(/Ejemplos ficticios/)).toBeVisible()
    await expect(panel.getByText('Pedido nuevo sin cobrar')).toBeVisible()
    await expect(panel.getByText('Ejemplo').first()).toBeVisible()
    await page.screenshot({ path: join(SHOTS, 'notificaciones-demo-desktop.png') })

    // Oscuro con el control real del tema (se cierra el panel primero) y móvil
    // con el panel abierto.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click()
    await page.getByTestId('notificaciones-aviso').click()
    await expect(panel).toBeVisible()
    await page.screenshot({ path: join(SHOTS, 'notificaciones-demo-oscuro.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(panel).toBeVisible()
    await page.screenshot({ path: join(SHOTS, 'notificaciones-demo-mobile-oscuro.png') })

    // Un ejemplo abre la pantalla que resuelve la novedad (en la demo).
    await panel.getByRole('button', { name: /Pedido nuevo sin cobrar/ }).click()
    await expect(page).toHaveURL(/\/pedidos$/)
  })
})
