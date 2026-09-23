// #241 (F4 · accesibilidad): el shell v2 cumple AA en claro y oscuro.
//
// Mide contraste REAL en el navegador (no de tokens): recorre los textos
// visibles del shell —sidebar, topbar, cajón del menú, barra inferior, banners
// y pie—, compone las alfas sobre el fondo real (los tokens usan /75, /15, /14)
// y falla si alguno queda por debajo de AA (4.5:1; 3:1 en texto grande).
// Captura las evidencias en docs/rediseno/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'

const SHOTS = 'test-results/rediseno'
// Textos fuera del shell que se informan (avisos, diálogos y pie): si bajan de
// AA no rompen este spec, pero quedan a la vista en el log del QA.
const CONTEXTO = ['[role="dialog"]', '[role="status"]', 'footer']

const preparar = (page, modo) =>
  page.addInitScript((modo) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', '1')
    } catch { /* sin storage */ }
  }, modo)

test.describe('shell v2 · contraste AA', () => {
  for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      test(`${vista} ${tema}: el shell cumple AA`, async ({ page }) => {
        mkdirSync(SHOTS, { recursive: true })
        await page.setViewportSize({ width: ancho, height: alto })
        await preparar(page, modo)
        await page.goto('/resumen')
        await expect(page.locator('.tema-v2')).toHaveCount(1)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
        // Que el contenido esté cargado: la captura es evidencia del shell, no
        // de los esqueletos de carga.
        await expect(page.getByText('Facturado').first()).toBeVisible({ timeout: 30_000 })

        const shell = await auditarContraste(page, SHELL, CONTEXTO)
        informar(`shell-${vista}-${tema}`, shell)
        await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-${tema}-${vista}.png` })
        expect(shell.bajos, `AA en el shell (${vista} ${tema})`).toEqual([])

        if (vista === 'mobile') {
          await page.getByRole('button', { name: 'Menú', exact: true }).click()
          const menu = page.locator('[role="dialog"][aria-modal="true"]')
          await expect(menu).toBeVisible()
          const dentro = await auditarContraste(page, [...SHELL, '[role="dialog"][aria-modal="true"]'], CONTEXTO)
          informar(`shell-${vista}-${tema}-menu`, dentro)
          await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-${tema}-menu.png` })
          expect(dentro.bajos, `AA en el menú (${vista} ${tema})`).toEqual([])
        }
      })
    }
  }
})

test('banner sin conexión: el shell sigue cumpliendo AA en ambos temas', async ({ page }) => {
  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await preparar(page, modo)
    await page.goto('/resumen')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
    // Solo el evento: la emulación de red del navegador corta el WebSocket de
    // Vite y la app se recarga sin shell en el harness; acá se mide el aviso.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const banner = page.locator('[role="status"].bg-bad')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    const medicion = await auditarContraste(page, ['[role="status"].bg-bad'])
    informar(`shell-conexion-${tema}`, medicion)
    expect(medicion.bajos, `AA del aviso sin conexión (${tema})`).toEqual([])
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
  }
})

// El shell v2 vive sobre las pantallas: en oscuro se comprueba también el
// contenido del piloto (chips y avisos con los tonos nuevos). El contenido se
// informa; lo que se exige AA es el shell.
test('oscuro completo: el shell v2 sobre una pantalla del pilotaje', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await preparar(page, 'dark')
  await page.goto('/inventario/unidades')
  // La pantalla del piloto también lleva el scope v2: se exige el del shell.
  await expect(page.locator('.tema-v2').filter({ has: page.getByTestId('shell-lateral') })).toHaveCount(1)
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 30_000 })
  const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
  informar('shell-inventario-oscuro', medicion)
  await page.screenshot({ path: `${SHOTS}/c241f4-shell-aa-inventario-oscuro.png` })
  expect(medicion.bajos, 'AA del shell v2 en la pantalla de inventario').toEqual([])
})
