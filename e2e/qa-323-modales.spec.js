// Modal/drawer estándar (#323): el kit (`@/components/ui`) re-exporta el
// objeto de la biblioteca, así que todo modal hereda header fijo, cuerpo
// desplazable y pie fijo, y el cierre con cambios pide confirmación.
// Capturas reproducibles (claro/oscuro/desktop/mobile):
//   MOBOS_CAPTURAS=docs/QA-323-modales npx playwright test e2e/qa-323-modales.spec.js -g capturas
import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

async function abrirEtiquetas(page) {
  await page.goto('/inventario/unidades')
  // #305: etiquetas de góndola vive en «Más acciones» de la barra.
  await page.getByTestId('barra-inventario').getByRole('button', { name: 'Más', exact: true }).click()
  await page.getByRole('menu', { name: 'Más acciones de inventario' }).getByRole('menuitem', { name: 'Etiquetas de góndola' }).click()
  const modal = page.getByRole('dialog', { name: 'Etiquetas de góndola' })
  await expect(modal).toBeVisible()
  // La lista hidrata desde la API: esperar el producto sembrado.
  await expect(modal.getByText(SEED.products.cable.name)).toBeVisible({ timeout: 20_000 })
  return modal
}

test.describe('modal estándar (#323)', () => {
  test('el cuerpo es el que scrollea y el pie queda fijo, también en mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    const modal = await abrirEtiquetas(page)

    // El panel es una columna: header, cuerpo con scroll propio y pie.
    const cuerpo = modal.locator(':scope > div').nth(1)
    expect(await cuerpo.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')

    // La acción primaria del pie se ve sin scrollear (no se va con el cuerpo).
    const primaria = modal.getByRole('button', { name: 'Imprimir etiquetas' })
    await expect(primaria).toBeVisible()
    const caja = await primaria.boundingBox()
    expect(caja.y + caja.height).toBeLessThanOrEqual(700)

    // El header sigue a la vista con el modal abierto y el título legible.
    await expect(modal.getByRole('heading', { name: 'Etiquetas de góndola' })).toBeVisible()

    // Sin cambios, el cierre es directo.
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
  })

  test('el recorte confirma antes de descartar un encuadre cambiado', async ({ page }) => {
    // Foto vertical generada en el navegador (sin fixtures en disco).
    const dataUrl = await page.evaluate(() => {
      const lienzo = document.createElement('canvas')
      lienzo.width = 600
      lienzo.height = 1200
      const contexto = lienzo.getContext('2d')
      contexto.fillStyle = '#101826'
      contexto.fillRect(0, 0, 600, 1200)
      return lienzo.toDataURL('image/png')
    })
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')

    await page.goto('/configuracion/mi-cuenta')
    await page.getByText('Mi foto', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'vertical.png', mimeType: 'image/png', buffer })

    const modal = page.getByRole('dialog').filter({ hasText: 'Recortar foto' }).first()
    await expect(modal).toBeVisible({ timeout: 20_000 })
    // El encuadre arranca intacto: cerrar no pregunta.
    await expect(modal.locator('input[type="range"]')).toHaveValue('1')
    await modal.getByRole('button', { name: 'Cerrar' }).click()
    await expect(modal).toHaveCount(0)

    // Con zoom, el cierre pide confirmación y «Seguir editando» vuelve.
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'vertical.png', mimeType: 'image/png', buffer })
    await expect(modal).toBeVisible({ timeout: 20_000 })
    await modal.locator('input[type="range"]').evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, '2.5')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(modal.getByText(/Zoom · 2\.5×/)).toBeVisible()
    await modal.getByRole('button', { name: 'Cerrar' }).click()
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(confirmacion).toHaveCount(0)
    await expect(modal).toBeVisible()

    // «Descartar y cerrar» cierra el recortador sin subir nada.
    await modal.getByRole('button', { name: 'Cerrar' }).click()
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(modal).toHaveCount(0)
  })

  test('capturas del modal estándar', async ({ page }) => {
    test.setTimeout(120_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/qa-323-modales'
    mkdirSync(salida, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
        await page.setViewportSize({ width: ancho, height: alto })
        const modal = await abrirEtiquetas(page)
        await modal.getByRole('checkbox', { name: `Seleccionar ${SEED.products.cable.name}` }).check()
        // La acción primaria pasa de deshabilitada a habilitada: la captura
        // espera a que termine la transición (si no, sale a medio fundir).
        const primaria = modal.getByRole('button', { name: 'Imprimir etiquetas' })
        await expect(primaria).toBeEnabled()
        await expect(primaria).toHaveCSS('opacity', '1')
        await page.screenshot({ path: `${salida}/modal-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await expect(modal).toHaveCount(0)
      }
    }
  })
})
