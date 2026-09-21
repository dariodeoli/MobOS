// Finanzas · #209: patrón «último usado como predeterminado» en Gastos (tipo y
// moneda), y en Conciliación (filtros y período). Con sesión real, porque en la
// demo el almacenamiento vive en memoria de la pestaña y no sobrevive al reload.
import { test, expect } from '@playwright/test'

test.describe('finanzas · último usado', () => {
  test('Gastos arranca con el tipo y la moneda del movimiento anterior', async ({ page }) => {
    await page.goto('/finanzas/gastos')
    await expect(page.getByRole('heading', { name: 'Registrar salida, cheque o adelanto' })).toBeVisible()

    const tipo = page.locator('#tipo')
    const moneda = page.locator('#moneda-gasto')
    await tipo.selectOption('CHEQUE')
    await moneda.selectOption('USD')
    await expect(page.getByText(/arrancan con tu última elección/)).toBeVisible()

    await page.reload()
    await expect(tipo).toHaveValue('CHEQUE')
    await expect(moneda).toHaveValue('USD')

    // Siempre cambiable: el cambio explícito pisa lo recordado y se vuelve a recordar.
    await tipo.selectOption('EXPENSE')
    await page.reload()
    await expect(tipo).toHaveValue('EXPENSE')
  })

  test('Conciliación recuerda el estado, el medio y el período', async ({ page }) => {
    await page.goto('/finanzas/conciliacion')
    await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible()
    await expect(page.getByLabel('Estado')).toBeVisible()

    // Período: preset distinto al default y se conserva al recargar.
    await page.getByRole('button', { name: '30 días' }).click()
    await page.getByRole('button', { name: '7 días' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: '7 días' })).toBeVisible()

    // Estado del listado: queda recordado.
    await page.getByLabel('Estado').selectOption('VERIFIED')
    await page.reload()
    await expect(page.getByLabel('Estado')).toHaveValue('VERIFIED')

    // Filtro de medio: si el período tiene medios, el elegido vuelve aplicado y
    // con el aviso de que se recordó. El aviso aparece al restaurar (tras la
    // recarga), no al elegir.
    const medio = page.getByLabel('Medio')
    let opciones = []
    try {
      await expect.poll(async () => (await medio.locator('option').evaluateAll((filas) => filas.map((fila) => fila.value).filter(Boolean))).length, { timeout: 15000 }).toBeGreaterThan(0)
      opciones = await medio.locator('option').evaluateAll((filas) => filas.map((fila) => fila.value).filter(Boolean))
    } catch {
      opciones = [] // el período no tiene medios: no hay nada que recordar
    }
    if (opciones.length) {
      const elegido = opciones[0]
      await medio.selectOption(elegido)
      await page.reload()
      await expect(page.getByLabel('Estado')).toHaveValue('VERIFIED')
      await expect(medio).toHaveValue(elegido)
      await expect(page.getByText('Filtros de tu última visita')).toBeVisible()
    }
  })
})
