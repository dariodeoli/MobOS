// Responsive smoke: no horizontal overflow and the main POS surface stays
// reachable on phone, tablet and desktop viewports.

import { test, expect } from '@playwright/test'
import { expectNoHorizontalOverflow } from './helpers/assertions.js'

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('/ventas has no horizontal overflow and shows the product search', async ({ page }) => {
      await page.goto('/ventas')
      await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

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
