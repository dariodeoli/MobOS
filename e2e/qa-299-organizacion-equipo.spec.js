// #299 · Organización y Equipo: dividir por tareas y normalizar roles.
//
// - Organización en secciones por tarea: Datos generales · Identidad visual ·
//   Sucursales y depósitos · Datos fiscales · Numeración · Zona de peligro.
//   Cada sección muestra solo su contenido (nada de una columna con todo).
// - Equipo en pestañas: Miembros · Invitaciones · Permisos · Rendimiento.
// - Los roles se leen igual en todas las pantallas (Dueño, no dueno/DUENO/ADMIN).
//
// Capturas: MOBOS_299_CAPTURAS=docs/qa/299-organizacion-equipo \
//   npx playwright test e2e/qa-299-organizacion-equipo.spec.js
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.env.MOBOS_299_CAPTURAS || ''

async function capturar(page, nombre) {
  if (!SALIDA) return
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: true })
}

const ORG = [
  ['Datos generales', 'Datos de la tienda'],
  ['Identidad visual', 'Logo de la empresa'],
  ['Sucursales y depósitos', 'Tiendas'],
  ['Datos fiscales', 'Empresas/personas jurídicas (privado)'],
  ['Numeración', 'Identificador de pedidos'],
  ['Zona de peligro', 'Archivar empresa'],
]

test('#299 · Organización se abre por tareas, sin mezclar todo en una columna', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/organizacion')
  const secciones = page.getByTestId('organizacion-secciones')
  await expect(secciones.getByRole('tab')).toHaveCount(ORG.length)

  // Por defecto, Datos generales: solo la tarjeta de la tienda.
  await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Logo de la empresa', exact: true })).toHaveCount(0)
  await expect(page.getByText('Archivar empresa')).toHaveCount(0)
  let numero = 1
  await capturar(page, '01-organizacion-datos-generales')

  for (const [tab, contenido] of ORG.slice(1)) {
    await secciones.getByRole('tab', { name: tab, exact: true }).click()
    if (contenido === 'Tiendas') {
      await expect(page.getByTestId('tiendas-sucursales')).toBeVisible({ timeout: 20_000 })
    } else {
      await expect(page.getByRole('heading', { name: contenido, exact: true }).first()).toBeVisible({ timeout: 20_000 })
    }
    // Solo la sección activa: las otras tareas no quedan apiladas abajo.
    if (contenido !== 'Datos de la tienda') {
      await expect(page.getByRole('heading', { name: 'Datos de la tienda', exact: true })).toHaveCount(0)
    }
    numero += 1
    await capturar(page, `${String(numero).padStart(2, '0')}-organizacion-${tab.toLowerCase().replace(/\s+/g, '-')}`)
  }
})

test('#299 · Equipo se abre en Miembros · Invitaciones · Permisos · Rendimiento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/equipo')
  const secciones = page.getByTestId('equipo-pantalla')

  // Miembros: integrantes y el alta, sin metas ni invitaciones de por medio.
  await expect(page.getByTestId('integrante-fila').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#equipo-form')).toBeVisible()
  await expect(page.getByTestId('equipo-metas-comisiones')).toHaveCount(0)
  await capturar(page, '07-equipo-miembros')

  await secciones.getByRole('tab', { name: 'Invitaciones', exact: true }).click()
  await expect(page.getByTestId('invitacion-fila').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('integrante-fila')).toHaveCount(0)
  await capturar(page, '08-equipo-invitaciones')

  await secciones.getByRole('tab', { name: 'Permisos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Matriz de capacidades' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('integrante-fila')).toHaveCount(0)
  await capturar(page, '09-equipo-permisos')

  await secciones.getByRole('tab', { name: 'Rendimiento', exact: true }).click()
  await expect(page.getByTestId('equipo-metas-comisiones')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('integrante-fila')).toHaveCount(0)
  await capturar(page, '10-equipo-rendimiento')
})

test('#299 · los roles se leen igual en todas las pantallas', async ({ page }) => {
  // Mi cuenta: el badge del rol del dueño.
  await page.goto('/configuracion/mi-cuenta')
  await expect(page.getByText('Dueño', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('dueno', { exact: true })).toHaveCount(0)

  // Seguridad: el badge de la sesión activa.
  await page.goto('/configuracion/seguridad')
  await expect(page.getByText('Dueño', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('dueno', { exact: true })).toHaveCount(0)

  // Equipo → Permisos: los tiles de rol hablan el mismo idioma.
  await page.goto('/configuracion/equipo')
  await page.getByTestId('equipo-pantalla').getByRole('tab', { name: 'Permisos', exact: true }).click()
  await expect(page.getByText('Dueño', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('dueno', { exact: true })).toHaveCount(0)

  // Equipo → Miembros: el selector de rol ofrece la misma etiqueta.
  await page.getByTestId('equipo-pantalla').getByRole('tab', { name: 'Miembros', exact: true }).click()
  const selector = page.getByLabel(/^Rol de /).first()
  await expect(selector.locator('option', { hasText: 'Dueño' }).first()).toBeAttached()
})
