// #267 · Menú interno de Configuración colapsable: toggle a solo iconos con
// tooltip en escritorio (el contenido gana el ancho), preferencia recordada por
// dispositivo, mobile siempre horizontal y deep links intactos.
// Capturas: MOBOS_CAPTURAS (default test-results/267-config-menu).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SALIDA = process.env.MOBOS_CAPTURAS || join('test-results', '267-config-menu')
const NAV = '[data-testid="config-grupos"]'
const TOGGLE = '[data-testid="config-grupos-toggle"]'

async function medidaContent(page) {
  return page.getByTestId('config-grupo-descripcion').boundingBox()
}

async function scrollHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test('el riel se colapsa, gana el contenido y recuerda la preferencia', async ({ page }) => {
  mkdirSync(SALIDA, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/configuracion/equipo')
  const nav = page.locator(NAV)
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Deep link intacto: Equipo queda activo y el toggle anuncia el estado.
  await expect(nav.getByRole('tab', { name: 'Equipo y acceso' })).toHaveAttribute('aria-selected', 'true')
  await expect(nav.getByRole('tab', { name: 'Equipo y acceso' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'true')
  const anchoExpandido = (await nav.boundingBox())?.width || 0
  const contentExpandido = (await medidaContent(page))?.width || 0
  await page.screenshot({ path: join(SALIDA, 'config-menu-expandido-desktop.png') })

  await page.locator(TOGGLE).click()
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false')
  // Colapsado: solo iconos (el rótulo queda oculto) y el riel se angosta.
  await expect(nav.getByText('Equipo y acceso', { exact: true })).toBeHidden()
  await expect(nav.getByRole('tab', { name: 'Equipo y acceso' })).toHaveAttribute('title', 'Equipo y acceso')
  const anchoColapsado = (await nav.boundingBox())?.width || 0
  const contentColapsado = (await medidaContent(page))?.width || 0
  expect(anchoColapsado).toBeLessThan(anchoExpandido - 100)
  expect(contentColapsado).toBeGreaterThan(contentExpandido + 100)
  expect(await scrollHorizontal(page)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: join(SALIDA, 'config-menu-colapsado-desktop.png') })

  // La preferencia se recuerda y el deep link sigue funcionando al recargar.
  await page.reload()
  await expect(page.locator(NAV)).toBeVisible()
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator(NAV).getByRole('tab', { name: 'Equipo y acceso' })).toHaveAttribute('aria-selected', 'true')
  expect(page.url()).toContain('/configuracion/equipo')

  // Y volver a expandir también se recuerda.
  await page.locator(TOGGLE).click()
  await expect(page.locator(NAV).getByText('Equipo y acceso', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'true')
})

test('en mobile el menú es horizontal y con rótulos', async ({ page }) => {
  mkdirSync(SALIDA, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configuracion')
  const nav = page.locator(NAV)
  await expect(nav).toBeVisible({ timeout: 20_000 })

  // Sin toggle y con los grupos en fila: los rótulos no se ocultan.
  await expect(page.locator(TOGGLE)).toBeHidden()
  await expect(nav.getByText('Mi cuenta', { exact: true })).toBeVisible()
  const primero = await nav.getByRole('tab').first().boundingBox()
  const segundo = await nav.getByRole('tab').nth(1).boundingBox()
  expect(Math.abs((segundo?.y || 0) - (primero?.y || 0))).toBeLessThanOrEqual(2)
  expect((segundo?.x || 0)).toBeGreaterThan((primero?.x || 0) + 40)
  expect(await scrollHorizontal(page)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: join(SALIDA, 'config-menu-mobile.png') })
})
