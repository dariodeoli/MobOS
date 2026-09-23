// #241 (F4 · dominios): pedidos, clientes y finanzas con el lenguaje v2
// detrás del flag `preview v2`.
//
// Capturas claro/oscuro en 390/1280 con el flag prendido (y una muestra con el
// flag apagado, para dejar documentado que el default no cambia) y medición de
// contraste de cada pantalla: el shell se exige en AA, el contenido se informa.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'

const SHOTS = 'docs/rediseno'

// Nombre, ruta y señal de que el contenido real ya está pintado.
const PANTALLAS = [
  ['pedidos', '/pedidos', (page) => page.getByTestId('pedido-fila').first()],
  ['clientes', '/clientes', (page) => page.getByTestId('cliente-fila').first()],
  ['finanzas', '/finanzas/caja', (page) => page.getByText('Saldo esperado').first()],
]

const preparar = (page, { modo, v2 = true }) =>
  page.addInitScript(({ modo, v2 }) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin storage */ }
  }, { modo, v2 })

test.describe('dominios v2 · capturas y contraste', () => {
  for (const [dominio, ruta, listo] of PANTALLAS) {
    test(`${dominio}: claro/oscuro en 390 y 1280 detrás del flag`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
        for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
          await page.setViewportSize({ width: ancho, height: alto })
          await preparar(page, { modo, v2: true })
          await page.goto(ruta)
          await expect(page.locator('.tema-v2')).toHaveCount(1)
          await expect(listo(page)).toBeVisible({ timeout: 30_000 })
          const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
          informar(`${dominio}-on-${vista}-${tema}`, medicion)
          await page.screenshot({ path: `${SHOTS}/c241f4b-${dominio}-on-${tema}-${vista}.png` })
          expect(medicion.bajos, `AA del shell en ${dominio} (${vista} ${tema})`).toEqual([])
        }
      }
    })

    test(`${dominio}: con el flag apagado el default no cambia`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await page.setViewportSize({ width: 1280, height: 900 })
      await preparar(page, { modo: 'light', v2: false })
      await page.goto(ruta)
      await expect(page.locator('.tema-v2')).toHaveCount(0)
      await expect(listo(page)).toBeVisible({ timeout: 30_000 })
      await page.screenshot({ path: `${SHOTS}/c241f4b-${dominio}-off-claro-desktop.png` })
    })
  }
})
