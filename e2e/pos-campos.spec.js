import { test, expect } from '@playwright/test'

// Regresión: escribir el correo o el teléfono del cliente en la carga de venta
// no debe romper la pantalla. El error de teléfono aparece recién al salir del
// campo (no mientras se escribe).
test('correo y teléfono del cliente en el POS no rompen la pantalla', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error?.message || error)))

  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()

  const correo = page.getByLabel('Correo del cliente')
  await correo.click()
  await correo.pressSequentially('juan.perez@gmail.com', { delay: 10 })
  await expect(correo).toHaveValue('juan.perez@gmail.com')

  const telefono = page.getByLabel('Teléfono del cliente')
  await telefono.click()
  await telefono.pressSequentially('981', { delay: 10 })
  await expect(page.getByText(/Teléfono inválido/)).toBeHidden()
  await page.getByLabel('CI o RUC del cliente', { exact: true }).click()
  await expect(page.getByText(/Teléfono inválido/)).toBeVisible()

  expect(errores, `Errores de página: ${errores.join(' | ')}`).toEqual([])
})
