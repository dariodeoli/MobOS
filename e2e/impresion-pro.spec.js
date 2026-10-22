import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

// Impresión Pro en la demo: la galería de diseños se ve completa por documento,
// se elige el predeterminado y las miniaturas/editor conservan el encabezado y el
// pie estándar. Con el módulo apagado (cuentas reales) se imprime el premium
// normal: eso lo cubren los unitarios de disenoPro y DocumentoPlantilla.
test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

// Capturas opcionales para la documentación (MOBOS_CAPTURAS=1).
const capturar = (page, nombre) => (process.env.MOBOS_CAPTURAS ? page.getByTestId('galeria-pro').screenshot({ path: `docs/rediseno/${nombre}.png` }) : null)

async function abrirPlantillas(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await cerrarGuiaDemo(page)
  await page.goto('/configuracion/dispositivos?panel=plantillas')
  await expect(page.getByTestId('plantillas-empresa')).toBeVisible()
}

test('la galería muestra 3 o 4 diseños por documento y se elige el predeterminado', async ({ page }) => {
  await abrirPlantillas(page)
  const tipo = page.getByLabel('Tipo de documento', { exact: true })
  for (const [valor, minimo] of [['comprobante', 3], ['ticket', 3], ['cotizacion', 4], ['remito', 3], ['etiquetas-producto', 3], ['etiquetas-stock', 3]]) {
    await tipo.selectOption(valor)
    await expect(page.getByTestId('galeria-pro')).toBeVisible()
    expect(await page.getByTestId('diseno-pro').count()).toBeGreaterThanOrEqual(minimo)
    expect(await page.getByTestId('diseno-pro').count()).toBeLessThanOrEqual(4)
  }

  await tipo.selectOption('cotizacion')
  await expect(page.getByTestId('diseno-habitual')).toContainText('En uso')
  await capturar(page, 'plantillas-galeria-pro')
  await page.getByRole('button', { name: 'Usar Cotización Centrada', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'diseño predeterminado' })).toBeVisible()
  const centrada = page.getByTestId('diseno-pro').filter({ hasText: 'Cotización Centrada' })
  await expect(centrada).toContainText('En uso')
  await expect(page.getByTestId('diseno-habitual')).not.toContainText('En uso')

  // Volver al habitual deja el comprobante premium de siempre.
  await page.getByRole('button', { name: 'Usar el habitual', exact: true }).click()
  await expect(page.getByTestId('diseno-habitual')).toContainText('En uso')
  await expect(centrada).not.toContainText('En uso')
})

test('la galería entra en el celular sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirPlantillas(page)
  await page.getByLabel('Tipo de documento', { exact: true }).selectOption('ticket')
  await expect(page.getByTestId('galeria-pro')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  const chicos = await page.getByTestId('galeria-pro').locator('button').evaluateAll((botones) => botones.filter((b) => !b.disabled && b.getBoundingClientRect().height < 43).map((b) => b.textContent))
  expect(chicos).toEqual([])
  await capturar(page, 'plantillas-galeria-movil')
})

test('un diseño abre en el editor con vista previa, encabezado y pie estándar', async ({ page }) => {
  await abrirPlantillas(page)
  await page.getByLabel('Tipo de documento', { exact: true }).selectOption('remito')
  await page.getByRole('button', { name: 'Ver o personalizar Remito Compacto', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
  await expect(editor.getByLabel('Nombre de la plantilla', { exact: true })).toHaveValue('Remito Compacto')
  const marco = editor.locator('iframe')
  await expect(marco).toBeVisible({ timeout: 20_000 })
  const hoja = page.frameLocator('dialog iframe, [role="dialog"] iframe').first()
  await expect(hoja.locator('.brand')).toBeVisible()
  await expect(hoja.locator('footer')).toContainText('Generado por')
  await expect(editor.getByRole('alert')).toHaveCount(0)
})
