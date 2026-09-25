// #253 · Estructura visual de los 7 grupos de Configuración (DSN): navegación
// interna (riel en escritorio, tira con iconos en mobile), layout y capturas
// antes/después. El contenido de cada grupo es de su slot; acá se mide y
// captura la estructura, se exige AA en la navegación y se cuidan los enlaces
// directos.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { auditarContraste, informar } from './helpers/contraste.js'

const GRUPOS = [
  ['mi-cuenta', 'Mi cuenta'],
  ['organizacion', 'Organización'],
  ['equipo', 'Equipo y acceso'],
  ['comercial', 'Comercial'],
  ['seguridad', 'Seguridad y auditoría'],
  ['dispositivos', 'Dispositivos'],
  ['sistema', 'Sistema'],
]

const NAV = '[data-testid="config-grupos"]'
const DESCRIPCION = '[data-testid="config-grupo-descripcion"]'

test.describe('Configuración · estructura de los 7 grupos', () => {
  test('la navegación interna muestra los 7 grupos con icono y respeta el enlace directo', async ({ page }) => {
    await page.goto('/configuracion/mi-cuenta')
    const nav = page.locator(NAV)
    await expect(nav).toBeVisible({ timeout: 20_000 })
    await expect(nav.getByRole('tab')).toHaveCount(GRUPOS.length)
    for (const [slug, label] of GRUPOS) {
      await page.goto(`/configuracion/${slug}`)
      await expect(page.locator('h1')).toHaveText(label)
      await expect(nav.getByRole('tab')).toHaveCount(GRUPOS.length)
      const activo = nav.getByRole('tab', { name: label, exact: true })
      await expect(activo).toHaveAttribute('aria-selected', 'true')
      await expect(activo.locator('svg')).toHaveCount(1)
    }
  })

  test('sin scroll horizontal con la navegación nueva (390 y 1280)', async ({ page }) => {
    test.setTimeout(120_000)
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const [slug] of GRUPOS) {
        await page.goto(`/configuracion/${slug}`)
        await expect(page.locator('h1')).toBeVisible({ timeout: 20_000 })
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `/configuracion/${slug} desborda a ${ancho}px`).toBe(false)
      }
    }
  })

  test('la navegación y la descripción del grupo cumplen AA (claro y oscuro)', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
      for (const [slug] of GRUPOS) {
        await page.goto(`/configuracion/${slug}`)
        await expect(page.locator(NAV)).toBeVisible({ timeout: 20_000 })
        const medicion = await auditarContraste(page, [NAV, DESCRIPCION])
        informar(`config-grupos-${slug}-${tema}`, medicion)
        expect(medicion.bajos, `AA en la navegación de ${slug} (${tema})`).toEqual([])
      }
    }
  })

  // Capturas del antes/después (#253), reproducibles:
  //   MOBOS_CAPTURAS=docs/qa/253-config-grupos/antes npx playwright test e2e/qa-253-config-grupos.spec.js -g capturas
  // Sin variable escribe en test-results y CI no ensucia el repo.
  test('capturas por grupo', async ({ page }) => {
    test.setTimeout(240_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/253-config-grupos'
    mkdirSync(salida, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width: ancho, height: alto })
        for (const [slug, label] of GRUPOS) {
          await page.goto(`/configuracion/${slug}`)
          await expect(page.getByRole('tab', { name: label, exact: true }).first()).toBeVisible({ timeout: 20_000 })
          await page.screenshot({ path: `${salida}/${slug}-${tema}-${vista}.png` })
        }
      }
    }
  })
})
