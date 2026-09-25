// Configuración → Seguridad: archivado con ventana recuperable y eliminación
// definitiva separada. La spec NO ejecuta ninguna de las dos acciones (archivar
// o eliminar la tienda sembrada rompería el resto de la suite): verifica que
// existan, que expliquen el alcance, que exijan la confirmación fuerte y que
// estén deshabilitadas hasta confirmar la identidad. También cubre la pantalla
// pública de recuperación de empresa.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginCompany } from './helpers/login.js'

test.describe('Seguridad de la cuenta', () => {
  test('archivar y eliminar exigen identidad, palabra y contraseña', async ({ page }) => {
    // #IA: archivar/eliminar viven en Organización (la reautenticación se pide
    // en el lugar y sigue disponible en Seguridad y auditoría). Sesión fresca:
    // así la ventana de 10 min está vencida y el pedido de contraseña es
    // determinista (la sesión del arnés se comparte entre specs).
    await page.context().clearCookies()
    await loginCompany(page)
    await page.locator('#seller-pin').pressSequentially(SEED.admin.pin)
    await expect(page).toHaveURL(/\/resumen$/)
    await page.goto('/configuracion/organizacion')

    const confirmar = page.getByText('Confirmar identidad')
    await expect(confirmar).toBeVisible()

    const archivar = page.getByRole('button', { name: 'Archivar empresa' })
    const eliminar = page.getByRole('button', { name: 'Eliminar empresa', exact: true })
    await expect(archivar).toBeVisible()
    await expect(eliminar).toBeVisible()
    await expect(page.getByText('Eliminar empresa definitivamente')).toBeVisible()
    await expect(page.getByText(/No se puede deshacer ni recuperar/)).toBeVisible()

    // La identidad se verifica de verdad: con una contraseña incorrecta no se
    // habilitan las acciones sensibles. Enter verifica (el bloque es un form).
    await page.getByLabel('Contraseña para reautenticar').fill('contraseña-incorrecta')
    await page.getByLabel('Contraseña para reautenticar').press('Enter')
    await expect(page.getByRole('alert')).toContainText('reautenticar')

    // Con la contraseña correcta queda habilitada la ventana de 10 minutos.
    await page.getByLabel('Contraseña para reautenticar').fill(SEED.company.password)
    await page.getByLabel('Contraseña para reautenticar').press('Enter')
    await expect(page.getByText(/Contraseña verificada durante 10 minutos/)).toBeVisible()
    await expect(eliminar).toBeEnabled()

    // Archivar: se explica que la historia se conserva y el plazo de 30 días.
    await page.getByLabel('Motivo de archivado').fill('Prueba e2e de la pantalla de seguridad')
    await expect(archivar).toBeEnabled()
    await archivar.click()
    const dialogoArchivar = page.getByRole('dialog', { name: '¿Archivar esta empresa?' })
    await expect(dialogoArchivar).toContainText('30 días')
    await expect(dialogoArchivar).toContainText('se conservan')
    await dialogoArchivar.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogoArchivar).toBeHidden()

    // Eliminar definitivamente: advertencia explícita y doble confirmación.
    await eliminar.click()
    const dialogoEliminar = page.getByRole('dialog', { name: '¿Eliminar la empresa para siempre?' })
    await expect(dialogoEliminar).toContainText('historial')
    await expect(dialogoEliminar).toContainText('irreversible')
    const confirmarEliminar = dialogoEliminar.getByRole('button', { name: 'Eliminar empresa' })
    await expect(confirmarEliminar).toBeDisabled()
    await dialogoEliminar.getByLabel('Contraseña de la empresa').fill(SEED.company.password)
    await dialogoEliminar.getByLabel('Escribí ELIMINAR para confirmar').fill('ELIMINAR')
    await expect(confirmarEliminar).toBeEnabled()
    await dialogoEliminar.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogoEliminar).toBeHidden()
  })

  test('la pantalla de recuperación de empresa pide correo, contraseña y RESTORE', async ({ page }) => {
    await page.goto('/recuperar-empresa')
    await expect(page.getByRole('heading', { name: 'Recuperá tu empresa' })).toBeVisible()
    const recuperar = page.getByRole('button', { name: 'Recuperar empresa' })
    await expect(recuperar).toBeDisabled()
    await page.getByLabel('Correo de la empresa').fill(SEED.company.email)
    await page.getByLabel('Contraseña de empresa').fill(SEED.company.password)
    await expect(recuperar).toBeDisabled()
    await page.getByLabel('Escribí RESTORE para confirmar').fill('RESTORE')
    await expect(recuperar).toBeEnabled()
  })

  // Sin estado de sesión: con la sesión del admin, /login redirige a la app.
  test.describe('acceso público', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('desde el acceso se llega a la recuperación de empresa', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByRole('link', { name: '¿Archivaste tu empresa? Recuperala' })).toBeVisible()
    })
  })
})
