// Configuración → Equipo: ficha del integrante con foto/iniciales, cambio de
// rol con confirmación y auditoría, historial abierto desde la fila y
// desactivación/reactivación explícitas que conservan el historial (issue #55).

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearIntegrante(page, nombre, pin) {
  return page.evaluate(
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
}

test.describe('ficha del integrante en Equipo', () => {
  test('cada integrante muestra iniciales, correo, rol e historial', async ({ page }) => {
    await page.goto('/configuracion/equipo')
    const fila = page.getByTestId('integrante-fila').filter({ hasText: SEED.sellers[0].name }).first()
    await expect(fila).toBeVisible()
    await expect(fila.getByText('VU')).toBeVisible() // iniciales de Vendedor E2E Uno
    await expect(fila.getByRole('combobox', { name: `Rol de ${SEED.sellers[0].name}` })).toHaveValue('VENDEDOR')
    await expect(fila.getByRole('button', { name: `Historial de ${SEED.sellers[0].name}` })).toBeVisible()
    await expect(fila.getByRole('button', { name: `Horario de ${SEED.sellers[0].name}` })).toBeVisible()
  })

  test('cambiar el rol se refleja, queda auditado y desactivar/reactivar conserva el historial', async ({ page }) => {
    const nombre = `Integrante E2E ${Date.now().toString(36)}`
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    await page.goto('/configuracion/equipo')
    const creado = await crearIntegrante(page, nombre, pin)
    expect(creado?.id).toBeTruthy()
    await page.reload()

    const fila = () => page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(fila()).toBeVisible()

    // Cambio de rol con confirmación desde la propia fila.
    await fila().getByRole('combobox', { name: `Rol de ${nombre}` }).selectOption('CAJERA')
    const cambiar = page.getByRole('dialog', { name: '¿Cambiar el rol del integrante?' })
    await expect(cambiar).toContainText('Vendedor')
    await expect(cambiar).toContainText('Cajera')
    await cambiar.getByRole('button', { name: 'Cambiar rol' }).click()
    await expect(page.getByText('Rol actualizado a Cajera.')).toBeVisible()
    await expect(fila().getByRole('combobox', { name: `Rol de ${nombre}` })).toHaveValue('CAJERA')

    // El historial existente (backend) se abre desde la ficha y trae el cambio auditado.
    await fila().getByRole('button', { name: `Historial de ${nombre}` }).click()
    const historial = page.getByRole('dialog', { name: `Historial de ${nombre}` })
    await expect(historial).toBeVisible()
    await expect(historial.getByText(/Rol: Vendedor → Cajera/)).toBeVisible()
    await historial.getByRole('button', { name: 'Cerrar' }).click()
    await expect(historial).toBeHidden()

    // Desactivar: explícito sobre el historial y con confirmación.
    await fila().getByRole('button', { name: `Desactivar a ${nombre} (conserva el historial)` }).click()
    const baja = page.getByRole('dialog', { name: '¿Desactivar integrante?' })
    await expect(baja).toContainText('historial')
    await expect(baja).toContainText('reactivarlo')
    await baja.getByRole('button', { name: 'Desactivar integrante' }).click()
    await expect(page.getByText('Integrante desactivado; su historial se conserva.')).toBeVisible()
    await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre })).toHaveCount(0)

    // Reactivar desde el filtro de inactivos.
    await page.getByRole('tab', { name: /^Inactivos/ }).click()
    const inactivo = page.getByTestId('integrante-fila').filter({ hasText: nombre }).first()
    await expect(inactivo.getByText('Inactivo')).toBeVisible()
    await inactivo.getByRole('button', { name: `Volver a activar a ${nombre}` }).click()
    await expect(page.getByText(new RegExp(`${nombre} vuelve a estar activo`))).toBeVisible()
    await expect(page.getByTestId('integrante-fila').filter({ hasText: nombre }).first().getByText('Activo')).toBeVisible()

    // Limpieza: el integrante de prueba queda inactivo.
    await page.evaluate(
      async ({ api, id }) => {
        await fetch(`${api}/api/users`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: 'INACTIVE' }) })
      },
      { api: API, id: creado.id },
    )
  })
})
