// El resumen de compra de "Cargar venta" tiene que quedar a la vista mientras
// se desliza la pantalla: columna lateral fija en desktop/notebook y barra
// compacta fija bajo el encabezado en pantallas angostas.
//
// El umbral es 1024px (lg). Antes era 1200px: en notebooks de 1152px el
// resumen caía debajo del formulario y se iba con el scroll.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

// Alto del encabezado fijo del shell (h-20). Nada del resumen puede quedar por
// debajo suyo.
const ALTO_ENCABEZADO = 80
const MARGEN_SUPERIOR_MAX = 140

async function agregarProducto(page) {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
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
      barra: datos('carrito-barra'),
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
    await esperarSticky(page, 'columna')
    await esperarArriba(page, 'caja')
    expect(primera.barra, 'la barra compacta solo existe en pantallas angostas').toBeNull()

    const segunda = await desplazar(page, 700)
    await esperarArriba(page, 'caja')
    expect(segunda.caja.y).toBe(primera.caja.y)
  })
})

test.describe('notebook 1152', () => {
  test.use({ viewport: { width: 1152, height: 800 } })

  test('debajo de 1200px el resumen sigue fijo en su columna', async ({ page }) => {
    await agregarProducto(page)

    const primera = await desplazar(page, 300)
    await esperarSticky(page, 'columna')
    await esperarArriba(page, 'caja')
    expect(primera.barra, 'la barra compacta solo existe en pantallas angostas').toBeNull()

    const segunda = await desplazar(page, 700)
    await esperarArriba(page, 'caja')
    expect(segunda.caja.y).toBe(primera.caja.y)
  })
})

test.describe('phone 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('la barra compacta con el total se mantiene fija al deslizar', async ({ page }) => {
    await agregarProducto(page)

    const primera = await desplazar(page, 300)
    await esperarSticky(page, 'barra')
    await esperarArriba(page, 'barra')
    expect(primera.barra.texto).toContain('Gs 45.000')

    const segunda = await desplazar(page, 900)
    await esperarArriba(page, 'barra')
    expect(segunda.barra.y).toBe(primera.barra.y)
    expect(segunda.caja.position).toBe('static')
  })
})
