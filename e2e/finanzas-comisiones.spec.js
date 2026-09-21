// Comisiones: las reglas viven en Finanzas → Comisiones y ya no en
// Configuración → Equipo; se pueden crear, editar y eliminar desde ahí (#56).

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('reglas de comisión en Finanzas', () => {
  test('Configuración ya no las muestra y Finanzas → Comisiones permite editarlas', async ({ page }) => {
    const nombre = `Integrante Comisiones ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    await page.goto('/configuracion/equipo')
    const creado = await page.evaluate(
      async ({ api, nombre, pin }) => {
        const response = await fetch(`${api}/api/users`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: nombre, pin, role: 'VENDEDOR' }),
        })
        return response.json()
      },
      { api: API, nombre, pin },
    )
    expect(creado?.id).toBeTruthy()

    // Configuración → Equipo solo avisa dónde viven ahora.
    await expect(page.getByRole('heading', { name: 'Comisiones' })).toBeVisible()
    await expect(page.getByText(/Finanzas → Comisiones/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Ir a Finanzas → Comisiones' }).click()
    await expect(page).toHaveURL(/\/finanzas\/comisiones$/)
    await expect(page.getByRole('heading', { name: 'Comisiones', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar regla' })).toBeVisible()

    // Crear una regla para el integrante dedicado (sin colisiones con seeds).
    const vendedorBusqueda = page.getByRole('combobox', { name: 'Vendedor de la regla' })
    await vendedorBusqueda.fill(nombre)
    await page.getByRole('option', { name: new RegExp(nombre) }).click()
    await page.getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('0,5')
    await page.getByRole('button', { name: 'Agregar regla' }).click()
    await expect(page.getByText('Regla de comisión creada.')).toBeVisible()
    const regla = () => page.getByTestId('regla-comision').filter({ hasText: nombre }).first()
    await expect(regla().getByText('0,5%')).toBeVisible()

    // Editar el porcentaje.
    await regla().getByTitle('Editar porcentaje').click()
    await regla().getByRole('textbox', { name: 'Porcentaje de comisión' }).fill('1,5')
    await regla().getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Regla de comisión actualizada.')).toBeVisible()
    await expect(regla().getByText('1,5%')).toBeVisible()

    // Eliminar con confirmación.
    await regla().getByTitle('Eliminar regla').click()
    await page.getByRole('dialog', { name: '¿Eliminar regla?' }).getByRole('button', { name: 'Eliminar regla' }).click()
    await expect(page.getByText('Regla de comisión eliminada.')).toBeVisible()
    await expect(page.getByTestId('regla-comision').filter({ hasText: nombre })).toHaveCount(0)

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
  })
})
