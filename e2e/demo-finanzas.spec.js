// #194 (y #188): la demo de Finanzas funciona sin API real, con datos
// ficticios visibles y sin "Falta sesión".
import { test, expect } from '@playwright/test'

async function cerrarGuia(page) {
  // La guía de la demo se abre sola la primera vez por pestaña (#201).
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await page.getByRole('button', { name: 'Cerrar' }).last().click()
}

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuia(page)
  await expect(page.getByText('Modo demo', { exact: false }).first()).toBeVisible()
}

test.describe('demo de Finanzas', () => {
  test('cuentas y medios se dan de alta con nombre automático', async ({ page }) => {
    await entrarDemo(page)
    await page.goto('/finanzas/bancos')
    await expect(page.getByRole('heading', { name: 'Bancos y cuentas' })).toBeVisible()

    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.selectOption('#pa-kind', 'TRANSFER')
    await page.fill('#pa-bank', 'Itaú')
    await page.getByRole('option', { name: /Itaú/ }).first().click()
    await page.fill('#pa-holder', 'Titular Demo')
    await page.fill('#pa-number', '4321')
    await expect(page.locator('#pa-name')).toHaveValue(/Banco Itaú.*Titular Demo.*Cuenta 4321/)
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await expect(page.getByText('Cuenta guardada.')).toBeVisible()
    await expect(page.locator('[data-testid="cuenta-fila"]').filter({ hasText: 'Titular Demo' })).toHaveCount(1)
  })

  test('el seguro se simula en la demo y se refleja en el margen', async ({ page }) => {
    await entrarDemo(page)

    await page.goto('/analisis/ganancias')
    await expect(page.getByRole('heading', { name: 'Cómo se calcula' })).toBeVisible()
    const sinSeguro = (await page.getByTestId('ganancia-resultado').textContent())?.trim()

    await page.goto('/configuracion/negocio')
    await expect(page.getByText('Demo: los cambios se guardan solo en este navegador')).toBeVisible()
    await page.locator('#seguro-toggle').check({ force: true })
    await expect(page.locator('#seguro-pct')).toHaveValue('25')
    await page.getByRole('button', { name: 'Guardar seguro' }).click()
    await expect(page.getByText('Seguro guardado en este navegador (demo).')).toBeVisible()
    await expect(page.getByText('Falta sesión')).toHaveCount(0)

    // El demo vive en memoria de la pestaña (#204): se navega dentro de la app,
    // sin recargar, para ver el efecto del seguro en el margen.
    await page.getByRole('button', { name: 'Análisis', exact: true }).first().click()
    await page.getByRole('tab', { name: 'Ganancias' }).click()
    await expect(page.getByText('Incluye seguro 25% (demo)')).toBeVisible()
    const conSeguro = (await page.getByTestId('ganancia-resultado').textContent())?.trim()
    expect(conSeguro).not.toBe(sinSeguro)
  })

  test('la conciliación funciona en la demo con datos ficticios', async ({ page }) => {
    await entrarDemo(page)
    await page.goto('/finanzas/conciliacion')

    await expect(page.getByRole('heading', { name: 'Conciliación y trazabilidad' })).toBeVisible()
    await expect(page.getByText('Demo: cobros y cuentas ficticios')).toBeVisible()
    const filas = page.getByTestId('conciliacion-fila')
    await expect(filas.first()).toBeVisible()

    // Un lote cubre una sola cuenta: se eligen dos cobros de efectivo (sin cuenta).
    await filas.nth(0).getByRole('checkbox').check()
    await filas.nth(1).getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    await expect(page.getByText(/Lote conciliado \(demo\)/)).toBeVisible()
    await expect(page.getByTestId('conciliacion-lote').first()).toBeVisible()
    await expect(page.getByText('Falta sesión')).toHaveCount(0)
  })

  test('la caja demo muestra medios y auditoría de efectivo con datos ficticios', async ({ page }) => {
    await entrarDemo(page)
    await page.goto('/finanzas/caja')

    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin apertura')).toHaveCount(0)
    await expect(page.getByText('Entradas por medio de pago')).toBeVisible()
    await expect(page.getByText('Auditoría de efectivo')).toBeVisible()
    await expect(page.getByText('Demo: cobros ficticios del rango')).toBeVisible()

    const fila = page.getByTestId('auditoria-fila').first()
    await fila.getByRole('combobox').selectOption('VERIFIED')
    await fila.getByRole('button', { name: 'Guardar' }).click()
    // El primer match es la insignia; el otro es la opción del selector.
    await expect(fila.getByText('Verificado', { exact: true }).first()).toBeVisible()
    await expect(fila.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})
