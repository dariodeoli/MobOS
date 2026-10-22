// Responsive smoke: no horizontal overflow and the main POS surface stays
// reachable on phone, tablet and desktop viewports.

import { test, expect } from './helpers/seller-test.js'
import { expectNoHorizontalOverflow } from './helpers/assertions.js'

const viewports = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('/pos has no horizontal overflow and shows the product search', async ({ page }) => {
      await page.goto('/pos')
      await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()

      const search = page.getByPlaceholder('Buscar producto…')
      await expect(search).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })

    test('/pedidos has no horizontal overflow', async ({ page }) => {
      await page.goto('/pedidos')
      await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

      await expectNoHorizontalOverflow(page)

      // En desktop la grilla de pedidos entra completa: nada de scroll lateral
      // dentro de la tabla.
      if (viewport.width >= 1280) {
        const { scrollWidth, clientWidth } = await page.getByTestId('pedidos-tabla').evaluate((node) => {
          return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }
        })
        expect(scrollWidth, 'la tabla de pedidos debe entrar sin scroll horizontal').toBeLessThanOrEqual(clientWidth + 1)
      }
    })
  })
}

for (const viewport of [
  { name: 'mobile-alignment', width: 390, height: 844 },
  { name: 'tablet-alignment', width: 768, height: 1024 },
  { name: 'desktop-alignment', width: 1440, height: 900 },
]) {
  test.describe(`shared shell alignment ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('aligns page headers, actions and branch selectors', async ({ page }) => {
      for (const route of ['/pedidos', '/delivery/repartos']) {
        await page.goto(route)
        const row = page.getByTestId('shell-page-header-row')
        // En celular/tablet, con pestañas y sin acciones, la fila del título se
        // colapsa a propósito (#356): el H1 queda sr-only y no ocupa alto.
        if (viewport.width >= 1024) await expect(row).toBeVisible()
        else await expect(row).toBeAttached()
        const actionGroup = page.getByTestId('shell-page-header-actions')
        if (await row.isVisible() && await actionGroup.count() && await actionGroup.isVisible()) {
          const [rowBox, actionBox] = await Promise.all([row.boundingBox(), actionGroup.boundingBox()])
          expect(actionBox.height, `${route}: acciones con altura de control común`).toBeGreaterThanOrEqual(44)
          expect(Math.abs((rowBox.y + rowBox.height / 2) - (actionBox.y + actionBox.height / 2)), `${route}: acciones centradas en la fila del encabezado`).toBeLessThanOrEqual(8)
        }

        const selector = page.locator(viewport.width < 1024
          ? '[data-testid="shell-sucursal-mobile"] [data-testid="sucursal-selector"], [data-testid="shell-sucursal-mobile"] [data-testid="sucursal-info"]'
          : '[data-testid="shell-sucursal-desktop"] [data-testid="sucursal-selector"], [data-testid="shell-sucursal-desktop"] [data-testid="sucursal-info"]')
        await expect(selector).toBeVisible()
        const selectorBox = await selector.boundingBox()
        expect(selectorBox.height, `${route}: selector de sucursal con altura común`).toBeGreaterThanOrEqual(44)
        if (viewport.width >= 1024) {
          const rowBox = await row.boundingBox()
          expect(Math.abs((rowBox.y + rowBox.height / 2) - (selectorBox.y + selectorBox.height / 2)), `${route}: selector centrado en el encabezado`).toBeLessThanOrEqual(8)
        }
      }
    })
  })
}
