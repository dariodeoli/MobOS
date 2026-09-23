// #233: conciliación de una consulta IMEI en la demo pública (misma UX que la
// cuenta real, sin backend): la consulta simulada queda en el registro y
// administración la concilia desde el modal, con la aclaración obligatoria.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { serialDemo } from '../src/lib/demo/iphones.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

// Capturas del QA: viven en test-results para no ensuciar el árbol del release.
const SALIDA = 'test-results/imei-conciliacion'

test('la demo permite conciliar una consulta desde el registro', async ({ page }) => {
  const serial = serialDemo(1)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  // La guía "Cómo funciona la demo" se abre en la primera visita y tapa clics.
  await cerrarGuiaDemo(page)

  // La consulta simulada de la demo queda registrada (estado verificado).
  await page.goto('/inventario/unidades')
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15_000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByTestId('imei-precheck').click()
  await ficha.getByTestId('imei-confirmar').click()
  await expect(ficha.getByText(/Verificado|SIMULADO/).first()).toBeVisible({ timeout: 15_000 })

  // El registro se busca por el serial del demo (AUR…, 16 caracteres) y se concilia.
  await ficha.getByTestId('imei-consultas-abrir').click()
  const ventana = page.getByRole('dialog', { name: 'Consultas IMEI · Conciliar' })
  await ventana.getByLabel('IMEI a consultar').fill(serial)
  await ventana.getByTestId('imei-consultas-buscar').click()
  const registro = ventana.getByTestId('imei-consultas-lista').locator('article').first()
  await expect(registro).toBeVisible({ timeout: 15_000 })
  // La ventana ya no es de solo lectura: el registro ofrece Conciliar.
  await expect(registro.getByRole('button', { name: 'Conciliar' })).toBeVisible()

  await registro.getByRole('button', { name: 'Conciliar' }).click()
  const modal = page.getByRole('dialog', { name: 'Conciliar consulta IMEI' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('iCloud/US Block clean ≠ blacklist mundial', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('Nota de conciliación')).toHaveValue(/iCloud\/US Block clean ≠ blacklist mundial/)
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/03-demo-modal-conciliar.png`, fullPage: true })

  await modal.getByLabel('Costo real USD').fill('0.06')
  await modal.getByLabel('Orden del proveedor').fill('ORD-233-DEMO')
  await page.getByTestId('imei-conciliar-guardar').click()
  await expect(page.getByText('Consulta conciliada.')).toBeVisible({ timeout: 15_000 })
  await expect(registro.getByText(/Conciliada el/)).toBeVisible()
  await expect(registro.getByText(/ORD-233-DEMO/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-demo-consulta-conciliada.png`, fullPage: true })
})
