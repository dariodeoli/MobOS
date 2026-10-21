// Rediseño del POS (docs/pos-rediseno): en desktop/notebook la página no se
// desplaza; la lista de líneas del ticket sí, por dentro, y el total y Cobrar
// quedan siempre a la vista. Móvil conserva su barra fija.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { ensureCobro } from './helpers/ensure-cobro.js'

async function agregarProducto(page) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  const producto = page.getByRole('button', { name: new RegExp(SEED.products.cable.name) })
  await expect(producto).toBeVisible()
  await producto.click()
  // <768 px (#429) el carrito vive en una hoja: se espera su barra fija.
  if ((page.viewportSize()?.width ?? 1440) < 768) await expect(page.getByTestId('pos-barra-carrito')).toBeVisible()
  else await expect(page.getByText('Productos de esta venta')).toBeVisible()
}

function medicion(page) {
  return page.evaluate(() => {
    const datos = testid => {
      const el = document.querySelector(`[data-testid="${testid}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        y: Math.round(r.y),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        position: getComputedStyle(el).position,
        display: getComputedStyle(el).display,
        texto: el.textContent,
      }
    }
    return {
      scrollY: Math.round(window.scrollY),
      caja: datos('resumen-compra'),
      columna: datos('resumen-columna'),
      // La columna carrito + cobro crece con el documento; el resumen del día vive en
      // un desplegable ("Detalles de la venta y del día").
      carrito: datos('pos-bloque-carrito'),
      columna_venta: datos('pos-columna-venta'),
      // #309: la barra superior del celular se reemplazó por la barra fija del
      // bloque de cobro (Total + acción principal).
      accion: datos('pos-barra-accion'),
      // #429: en celular (<768 px) la barra fija es la del carrito.
      barra_carrito: datos('pos-barra-carrito'),
    }
  })
}

for (const [vista, width, height] of [['desktop', 1440, 900], ['notebook 1152', 1152, 800]]) {
  test.describe(vista, () => {
    test.use({ viewport: { width, height } })
    test('la página no se desplaza y el ticket mantiene total y cobro alcanzables', async ({ page }) => {
      await agregarProducto(page)
      const antes = await medicion(page)
      await page.evaluate(() => window.scrollTo(0, 700))
      const despues = await medicion(page)
      expect(despues.scrollY, 'la página no se desplaza').toBe(0)
      expect(despues.columna_venta.y, 'el ticket queda en su lugar').toBe(antes.columna_venta.y)
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height + 2)
      await page.getByTestId('carrito-total').scrollIntoViewIfNeeded()
      await expect(page.getByTestId('carrito-total')).toBeInViewport()
      await expect(page.getByTestId('carrito-total')).toContainText('Gs 45.000')
      await ensureCobro(page)
      const confirmar = page.getByTestId('pos-cobro').locator('button[type="submit"]').first()
      await expect(async () => {
        await confirmar.scrollIntoViewIfNeeded()
        await expect(confirmar).toBeInViewport()
        await expect(confirmar).toBeEnabled()
      }).toPass({ timeout: 5000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await expect(page.getByTestId('pos-barra-accion')).toBeHidden()
    })
  })
}

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('el total y el carrito quedan fijos abajo al deslizar (#309, #429)', async ({ page }) => {
    await agregarProducto(page)

    // El inicio de celular puede ser más corto que la pantalla: no se exige recorrido.
    const primera = await medicion(page)
    expect(primera.barra_carrito, 'la barra del carrito existe en el celular').not.toBeNull()
    expect(primera.barra_carrito.position).toBe('fixed')
    expect(primera.barra_carrito.texto).toContain('Ver venta')
    expect(primera.barra_carrito.texto).toContain('Gs 45.000')
    await expect(page.getByTestId('pos-barra-carrito-abrir')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 900))
    const segunda = await medicion(page)
    expect(segunda.barra_carrito.y).toBe(primera.barra_carrito.y)
    expect(segunda.barra_carrito.position).toBe('fixed')
  })
})
