// #300 · Mi cuenta, sesiones y Seguridad.
//
// - Las sesiones se leen como «Chrome en Mac · macOS» con última actividad,
//   sesión actual e inicio; los identificadores crudos viven en «Detalles
//   técnicos» (plegado).
// - Un único control de foto (junto al avatar), sin la fila duplicada.
// - «Cerrar mi cuenta» vive en una zona destructiva propia, lejos de las
//   acciones normales, con confirmación reforzada (contraseña + palabra).
// - Preferencias ya no expone «Volver al diseño anterior».
//
// Capturas: MOBOS_300_CAPTURAS=docs/qa/300-sesiones-mi-cuenta \
//   npx playwright test e2e/qa-300-sesiones-mi-cuenta.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.env.MOBOS_300_CAPTURAS || ''
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

test('#300 · las sesiones se reconocen por dispositivo, sin identificadores crudos', async ({ page }) => {
  await page.goto('/configuracion/mi-cuenta')
  const sesiones = page.getByTestId('mi-cuenta-sesiones')
  await expect(sesiones).toBeVisible({ timeout: 20_000 })
  const fila = sesiones.getByTestId('sesion-fila').first()
  await expect(fila).toBeVisible()

  // El dispositivo se lee en palabras (navegador + SO) y la actual queda marcada.
  // El arnés crea la sesión con su cliente HTTP, por eso el navegador puede ser
  // «Navegador»; lo que importa es el formato humano y el SO reconocido.
  await expect(fila).toContainText(/^(Chrome|Safari|Firefox|Edge|Opera|Samsung Internet|Navegador) en (Mac|PC|equipo Linux|iPhone|iPad|celular Android) · (macOS|Windows|Linux|iOS|iPadOS|Android)/)
  await expect(fila.getByText('Sesión actual')).toBeVisible()
  await expect(fila.getByTestId('sesion-actividad')).toContainText(/Última actividad/)

  // El deviceId existe, pero solo dentro de «Detalles técnicos»: plegado no se
  // ve; abierto, aparece.
  const detalle = await page.evaluate(async (api) => {
    const datos = await fetch(`${api}/api/mi-cuenta`, { credentials: 'include' }).then((r) => r.json())
    return datos?.sessions?.[0]?.deviceId || ''
  }, API)
  expect(detalle, 'la sesión expone su deviceId al API').toBeTruthy()
  await expect(fila.getByText(detalle, { exact: false })).toBeHidden()
  await fila.getByText('Detalles técnicos').click()
  await expect(fila.getByText(detalle, { exact: false })).toBeVisible()
  await capturar(page, '01-mi-cuenta-sesiones')
})

test('#300 · un único control de foto junto al avatar', async ({ page }) => {
  await page.goto('/configuracion/mi-cuenta')
  const perfil = page.getByTestId('mi-cuenta-perfil')
  await expect(perfil).toBeVisible({ timeout: 20_000 })
  // Un solo rótulo y un solo selector de archivo en la tarjeta del perfil.
  await expect(perfil.getByText('Mi foto', { exact: true })).toHaveCount(1)
  await expect(perfil.locator('input[type="file"]')).toHaveCount(1)
  await expect(perfil.getByRole('button', { name: /Subir foto|Reemplazar foto/ })).toBeVisible()
  await capturar(page, '02-perfil-una-foto')
})

test('#300 · cerrar la cuenta vive en una zona destructiva separada', async ({ page }) => {
  await page.goto('/configuracion/seguridad')

  // Las sesiones del equipo también se leen por dispositivo.
  await expect(page.getByRole('heading', { name: 'Sesiones activas' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('sesion-fila').first()).toBeVisible()
  await capturar(page, '03-seguridad-sesiones')

  // La acción destructiva está en su propia tarjeta, no entre las normales.
  const zona = page.getByTestId('zona-destructiva')
  await expect(zona).toBeVisible()
  await expect(zona.getByRole('heading', { name: 'Zona destructiva' })).toBeVisible()
  const cerrar = zona.getByRole('button', { name: 'Cerrar mi cuenta' })
  await expect(cerrar).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar mi cuenta' })).toHaveCount(1)
  // La tarjeta de sesiones no la contiene.
  await expect(page.getByRole('heading', { name: 'Sesiones activas' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').getByRole('button', { name: 'Cerrar mi cuenta' })).toHaveCount(0)
  await capturar(page, '04-zona-destructiva')

  // Confirmación reforzada: contraseña + la palabra CERRAR.
  await cerrar.click()
  const dialogo = page.getByRole('dialog', { name: '¿Cerrar tu cuenta?' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText('Escribí CERRAR para confirmar')).toBeVisible()
  await expect(dialogo.getByLabel('Contraseña de la empresa')).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo).toHaveCount(0)
})

test('#300 · Preferencias ya no expone «Volver al diseño anterior»', async ({ page }) => {
  await page.goto('/configuracion/preferencias')
  await expect(page.getByLabel('Bloqueo por inactividad')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Volver al diseño anterior')).toHaveCount(0)
  await expect(page.getByTestId('shell')).toHaveAttribute('data-tema-v2', '1')
})
