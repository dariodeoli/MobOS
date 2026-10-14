// El resumen de compra del POS tiene que quedar a la vista mientras
// se desliza la pantalla: columna lateral fija en desktop/notebook y barra
// compacta fija bajo el encabezado en pantallas angostas.
//
// El umbral es 1024px (lg). Antes era 1200px: en notebooks de 1152px el
// resumen caía debajo del formulario y se iba con el scroll.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

// Desde lg el shell no tiene barra superior (la navegación es lateral): la
// columna pegada solo tiene que quedar dentro de la pantalla.
const ALTO_ENCABEZADO = 0
const MARGEN_SUPERIOR_MAX = 180

// La columna carrito + cobro solo tiene recorrido para pegarse cuando el catálogo
// (columna izquierda) es más alto que ella: el seed del arnés tiene 6 productos,
// así que se le da al catálogo el alto de uno real.
const ALTO_CATALOGO_REAL = 2400

async function agregarProducto(page) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
  await page.addStyleTag({ content: `@media (min-width: 1024px) { .pos-layout > :first-child { min-height: ${ALTO_CATALOGO_REAL}px } }` })
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  const producto = page.getByRole('button', { name: new RegExp(SEED.products.cable.name) })
  await expect(producto).toBeVisible()
  await producto.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
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
      // La columna carrito + cobro es la que queda fija; el resumen del día vive en
      // un desplegable ("Detalles de la venta y del día").
      carrito: datos('pos-bloque-carrito'),
      columna_venta: datos('pos-columna-venta'),
      // #309: la barra superior del celular se reemplazó por la barra fija del
      // bloque de cobro (Total + acción principal).
      accion: datos('pos-barra-accion'),
    }
  })
}

async function desplazar(page, top) {
  await page.evaluate(y => window.scrollTo(0, y), top)
  // La página se clampa al final del documento: alcanza con que haya bajado.
  await expect
    .poll(async () => (await medicion(page)).scrollY, { timeout: 5000 })
    .toBeGreaterThan(0)
  return medicion(page)
}

async function esperarSticky(page, clave) {
  await expect
    .poll(async () => (await medicion(page))[clave]?.position, { timeout: 5000 })
    .toBe('sticky')
}

async function esperarArriba(page, clave) {
  await expect
    .poll(
      async () => {
        const el = (await medicion(page))[clave]
        if (!el || el.display === 'none') return `${clave} no visible`
        if (el.y < ALTO_ENCABEZADO) return `${clave} queda debajo del encabezado (y=${el.y})`
        if (el.y > MARGEN_SUPERIOR_MAX) return `${clave} se fue de vista (y=${el.y})`
        return 'arriba'
      },
      { timeout: 5000 },
    )
    .toBe('arriba')
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('la columna lateral se mantiene fija al deslizar', async ({ page }) => {
    await agregarProducto(page)

    const primera = await desplazar(page, 300)
    await esperarSticky(page, 'columna_venta')
    await esperarArriba(page, 'columna_venta')
    expect(primera.accion?.display, 'la barra de acción está oculta en pantallas anchas').toBe('none')

    const segunda = await desplazar(page, 700)
    await esperarArriba(page, 'columna_venta')
    // Ya pegada al borde superior, seguir deslizando no lo mueve.
    const tercera = await desplazar(page, 1000)
    expect(tercera.columna_venta.y).toBe(segunda.columna_venta.y)
  })
})

test.describe('notebook 1152', () => {
  test.use({ viewport: { width: 1152, height: 800 } })

  test('debajo de 1200px el resumen sigue fijo en su columna', async ({ page }) => {
    await agregarProducto(page)

    const primera = await desplazar(page, 300)
    await esperarSticky(page, 'columna_venta')
    await esperarArriba(page, 'columna_venta')
    expect(primera.accion?.display, 'la barra de acción está oculta en pantallas anchas').toBe('none')

    const segunda = await desplazar(page, 700)
    await esperarArriba(page, 'columna_venta')
    // Ya pegada al borde superior, seguir deslizando no lo mueve.
    const tercera = await desplazar(page, 1000)
    expect(tercera.columna_venta.y).toBe(segunda.columna_venta.y)
  })
})

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('el total y la acción principal quedan fijos abajo al deslizar (#309)', async ({ page }) => {
    await agregarProducto(page)

    const primera = await desplazar(page, 300)
    expect(primera.accion, 'la barra de acción existe en el celular').not.toBeNull()
    expect(primera.accion.position).toBe('fixed')
    expect(primera.accion.texto).toContain('Total')
    expect(primera.accion.texto).toContain('Gs 45.000')
    await expect(
      page.getByTestId('pos-barra-accion').getByRole('button', { name: /Guardar pedido|Crear pedido|Confirmar venta/ }),
    ).toBeVisible()

    const segunda = await desplazar(page, 900)
    expect(segunda.accion.y).toBe(primera.accion.y)
    expect(segunda.accion.position).toBe('fixed')
  })
})
