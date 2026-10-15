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
      // La columna carrito + cobro es la que queda fija; el resumen del día vive en
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

// Intenta deslizar la ventana: la columna debe quedar en el mismo lugar (fija).
async function esperarFija(page, top = 700) {
  const antes = (await medicion(page)).columna_venta
  await page.evaluate(y => window.scrollTo(0, y), top)
  const despues = await medicion(page)
  expect(['sticky', 'static', 'relative']).toContain(despues.columna_venta.position)
  expect(despues.scrollY, 'POS de una pantalla: la página no se desplaza, las listas sí').toBe(0)
  expect(despues.columna_venta.y, 'la columna no se mueve al deslizar').toBe(antes.y)
  return despues
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

    const primera = await medicion(page)
    // POS de una sola pantalla: la grilla mide el alto de la ventana y se
    // desplazan las listas por dentro, así que la columna queda fija sea por
    // `sticky` o porque la página no se mueve.
    await esperarFija(page)
    await esperarArriba(page, 'columna_venta')
    expect(primera.accion?.display, 'la barra de acción está oculta en pantallas anchas').toBe('none')

    const segunda = await esperarFija(page)
    await esperarArriba(page, 'columna_venta')
    // Ya pegada al borde superior, seguir deslizando no lo mueve.
    const tercera = await esperarFija(page, 1000)
    expect(tercera.columna_venta.y).toBe(segunda.columna_venta.y)
  })
})

test.describe('notebook 1152', () => {
  test.use({ viewport: { width: 1152, height: 800 } })

  test('debajo de 1200px el resumen sigue fijo en su columna', async ({ page }) => {
    await agregarProducto(page)

    const primera = await medicion(page)
    // POS de una sola pantalla: la grilla mide el alto de la ventana y se
    // desplazan las listas por dentro, así que la columna queda fija sea por
    // `sticky` o porque la página no se mueve.
    await esperarFija(page)
    await esperarArriba(page, 'columna_venta')
    expect(primera.accion?.display, 'la barra de acción está oculta en pantallas anchas').toBe('none')

    const segunda = await esperarFija(page)
    await esperarArriba(page, 'columna_venta')
    // Ya pegada al borde superior, seguir deslizando no lo mueve.
    const tercera = await esperarFija(page, 1000)
    expect(tercera.columna_venta.y).toBe(segunda.columna_venta.y)
  })
})

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('el total y el carrito quedan fijos abajo al deslizar (#309, #429)', async ({ page }) => {
    await agregarProducto(page)

    // El inicio de celular puede ser más corto que la pantalla: no se exige recorrido.
    const primera = await medicion(page)
    expect(primera.barra_carrito, 'la barra del carrito existe en el celular').not.toBeNull()
    expect(primera.barra_carrito.position).toBe('fixed')
    expect(primera.barra_carrito.texto).toContain('Carrito')
    expect(primera.barra_carrito.texto).toContain('Gs 45.000')
    await expect(page.getByTestId('pos-barra-carrito-abrir')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 900))
    const segunda = await medicion(page)
    expect(segunda.barra_carrito.y).toBe(primera.barra_carrito.y)
    expect(segunda.barra_carrito.position).toBe('fixed')
  })
})
