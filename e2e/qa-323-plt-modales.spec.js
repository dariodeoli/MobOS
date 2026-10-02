// #323 · Adopción del modal/drawer estándar en PLT (docs/MODALES.md §3):
// Horario de acceso (Vendedores), Sucursales (TiendasSucursales) y el diálogo
// destructivo (DialogoDestructivo).
//
// - El error de validación vive adentro del diálogo, junto al campo.
// - Cerrar con cambios pide confirmación («¿Descartar los cambios?»).
// - El pie usa las acciones estándar (un primario).
//
// Capturas: MOBOS_323_CAPTURAS=docs/qa/323-plt-modales \
//   npx playwright test e2e/qa-323-plt-modales.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const SALIDA = process.env.MOBOS_323_CAPTURAS || ''

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

async function descartarCambios(page) {
  const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(confirmacion).toBeVisible()
  await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
}

test('#323 · horario de acceso: labels visibles, error adentro y cierre con cambios', async ({ page }) => {
  await page.goto('/configuracion/equipo')
  const boton = page.getByLabel(/^Horario de /).first()
  await expect(boton).toBeVisible({ timeout: 20_000 })
  await boton.click()
  const dialogo = page.getByRole('dialog', { name: /Horario de acceso/ })
  await expect(dialogo).toBeVisible()
  // El integrante puede no tener rangos: se agrega uno para ver las etiquetas.
  if (!(await dialogo.getByLabel('Desde', { exact: true }).count())) {
    await dialogo.getByRole('button', { name: '+ Rango' }).click()
  }

  // Etiquetas visibles en los rangos (antes eran solo aria-label).
  await expect(dialogo.getByText('Días').first()).toBeVisible()
  await expect(dialogo.getByLabel('Desde', { exact: true }).first()).toBeVisible()
  await expect(dialogo.getByLabel('Hasta', { exact: true }).first()).toBeVisible()

  // Rango inválido (desde = hasta): el error aparece adentro del diálogo.
  await dialogo.getByLabel('Desde', { exact: true }).first().fill('08:00')
  await dialogo.getByLabel('Hasta', { exact: true }).first().fill('08:00')
  await dialogo.getByRole('button', { name: 'Guardar horario' }).click()
  await expect(dialogo.getByText(/Cada rango necesita al menos un día/)).toBeVisible()
  await capturar(page, '01-horario-error-adentro')

  // Con cambios sin guardar, cerrar pide confirmación.
  await dialogo.getByRole('button', { name: 'Cerrar' }).click()
  await descartarCambios(page)
  await expect(dialogo).toHaveCount(0)
})

test('#323 · sucursales: error por campo y confirmación al descartar', async ({ page }) => {
  await page.goto('/configuracion/organizacion')
  await page.getByTestId('organizacion-secciones').getByRole('tab', { name: 'Sucursales y depósitos', exact: true }).click()
  const fila = page.locator('article').filter({ hasText: SEED.branchName }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Editar' }).click()
  const panel = page.locator('#sucursal-form')
  const nombre = panel.locator('#sucursal-nombre')
  await expect(nombre).not.toHaveValue('', { timeout: 20_000 })
  const original = await nombre.inputValue()

  // Cambio sin guardar: cancelar la edición pide confirmación.
  await nombre.fill(`${original} QA`)
  await panel.getByRole('button', { name: 'Cancelar edición' }).click()
  const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios de la sucursal?' })
  await expect(confirmacion).toBeVisible()
  await capturar(page, '02-sucursal-descartar')
  await confirmacion.getByRole('button', { name: 'Descartar cambios' }).click()

  // Formulario nuevo: el nombre vacío muestra su error junto al campo y el
  // guardado queda deshabilitado con el motivo.
  await expect(nombre).toHaveValue('')
  await nombre.click()
  await nombre.blur()
  await expect(panel.getByText('Completá el nombre de la sucursal.')).toBeVisible()
  const guardar = panel.getByRole('button', { name: /Crear sucursal|Guardar cambios/ })
  await expect(guardar).toBeDisabled()
  await expect(guardar).toHaveAttribute('title', /Falta: el nombre/)
  await capturar(page, '03-sucursal-error-campo')
})

test('#323 · diálogo destructivo: error junto a la palabra y cierre con cambios', async ({ page }) => {
  await page.goto('/configuracion/seguridad')
  const zona = page.getByTestId('zona-destructiva')
  await expect(zona).toBeVisible({ timeout: 20_000 })
  await zona.getByRole('button', { name: 'Cerrar mi cuenta' }).click()

  const dialogo = page.getByRole('dialog', { name: '¿Cerrar tu cuenta?' })
  await expect(dialogo).toBeVisible()
  const palabra = dialogo.locator('#dialogo-palabra')
  await palabra.fill('CERR')
  await palabra.blur()
  await expect(dialogo.getByText('Escribí exactamente CERRAR.')).toBeVisible()
  await capturar(page, '04-destructivo-error-palabra')

  // Con algo escrito, cerrar confirma el descarte (no se cierra la cuenta).
  await dialogo.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await descartarCambios(page)
  await expect(dialogo).toHaveCount(0)
})
