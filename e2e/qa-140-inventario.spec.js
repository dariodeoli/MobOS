// QA post-.140 (#217/#226 y afines): recorrido de Inventario con capturas.
// Opt-in: MOBOS_QA_140=<carpeta> npx playwright test e2e/qa-140-inventario.spec.js
import { test, expect } from '@playwright/test'

const salida = process.env.MOBOS_QA_140 || ''
test.skip(!salida, 'opt-in: definir MOBOS_QA_140 con la carpeta de capturas')

test('inventario post-.140: alertas, vendidos, transito/traslados y acciones masivas', async ({ page }) => {
  const capturar = nombre => page.screenshot({ path: `${salida}/${nombre}.png` })

  await page.goto('/inventario/alertas')
  await expect(page.getByRole('button', { name: /^Alertas \(/ })).toBeVisible()
  await capturar('01-alertas')

  await page.goto('/inventario/vendidos')
  const periodo = page.getByLabel('Período de vendidos')
  await expect(periodo).toBeVisible()
  await periodo.selectOption('todos')
  await expect(page.getByText(/vendidos$/).first()).toBeVisible()
  await capturar('02-vendidos')

  await page.goto('/inventario/transito')
  await expect(page.getByRole('button', { name: /^En tránsito \(/ })).toBeVisible()
  await capturar('03-transito')

  await page.goto('/inventario/traslados')
  await expect(page.getByText('Llegada', { exact: true })).toBeVisible()
  await expect(page.getByText('Cant.', { exact: true })).toBeVisible()
  await capturar('04-traslados')

  await page.goto('/inventario/unidades')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ timeout: 15_000 })
  await fila.locator('input[type=checkbox]').check()
  await expect(page.getByText(/seleccionada\(s\)/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verificar todos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reservar todos' })).toBeVisible()
  await capturar('05-acciones-masivas')

  // #239: una sola fila por unidad (nombre + IMEI juntos), estado centrado.
  await page.goto('/inventario/unidades')
  await page.getByTestId('inventario-fila').first().waitFor({ timeout: 15_000 })
  await capturar('06-fila-unidad')

  // #240 PhoneCheck: checklist de inspección en la ficha.
  await page.getByTestId('inventario-fila').first().click()
  await expect(page.getByTestId('unidad-phonecheck')).toBeVisible({ timeout: 15_000 })
  await capturar('07-phonecheck')

  // #240: historial del serial (verificaciones, consultas IMEI, reparaciones y movimientos).
  await expect(page.getByTestId('unidad-cronologia')).toBeVisible({ timeout: 15_000 })
  await capturar('11-historial-serial')


  // #240: página pública del informe (/u/<serial>) con QR.
  await page.goto('/u/356789102345678')
  await expect(page.getByText('Certificado PhoneCheck').first()).toBeVisible({ timeout: 15_000 })
  await capturar('10-informe-publico')
})
