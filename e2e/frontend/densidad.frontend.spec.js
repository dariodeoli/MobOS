import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { shellPrimary } from '../helpers/shell-navigation.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'
import { entrarDemoComo } from '../helpers/demo.js'

// Densidad (#448 / #461): listas de 40–48 px por fila, tarjetas de «Por comprar»
// de hasta 96 px, colores por condición y depósito (con contraste ≥ 4.5), orden
// por defecto del stock, entrada a una sección en su primera pestaña y arriba de
// la página, y la lista de precios por modelo con la marca de la tienda.
// Demo frontend-only (sin backend), a 1440 px.
const salida = process.env.MOBOS_QA_OUT_DENSIDAD || '/tmp/mobos-densidad'

async function enterDemo(page, role = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, role)
  await expect(page.getByTestId('shell')).toBeVisible()
}

const altos = (locator, max = 8) =>
  locator.evaluateAll((nodos, tope) => nodos.slice(0, tope).map(nodo => Math.round(nodo.getBoundingClientRect().height)), max)

// Contraste WCAG entre el texto y el fondo reales de un elemento (acepta rgb() y color(srgb …)).
const contrasteDe = (locator) => locator.evaluate((nodo) => {
  const canal = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  const rgb = (css) => {
    const numeros = (css.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    return /srgb/.test(css) ? numeros.map(v => v * 255) : numeros
  }
  const estilo = getComputedStyle(nodo)
  const [a, b] = [lum(rgb(estilo.color)), lum(rgb(estilo.backgroundColor))].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
})

test.describe('listas finas a 1440 px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await enterDemo(page)
    await mkdir(salida, { recursive: true })
  })

  for (const [nombre, ruta, testId] of [
    ['Ventas (pedidos)', '/pedidos', 'pedido-fila'],
    ['Clientes', '/clientes', 'cliente-fila'],
    ['Stock › Unidades', '/stock/unidades', 'inventario-fila'],
    ['Stock › Productos', '/productos', 'producto-fila'],
    ['Compras del Centro', '/compras-centro', 'compra-centro-fila'],
    ['Taller', '/servicio', 'servicio-fila'],
  ]) {
    test(`${nombre}: cada fila mide entre 36 y 48 px`, async ({ page }) => {
      await page.goto(ruta)
      const filas = page.getByTestId(testId)
      await expect(filas.first()).toBeVisible()
      const medidas = await altos(filas)
      expect(medidas.length).toBeGreaterThan(0)
      for (const alto of medidas) {
        expect(alto, `alto de ${nombre}`).toBeGreaterThanOrEqual(36)
        expect(alto, `alto de ${nombre}`).toBeLessThanOrEqual(48)
      }
      await page.screenshot({ path: `${salida}/${testId}-1440.png` })
    })
  }

  test('Stock › Unidades en planilla: las filas también son finas', async ({ page }) => {
    await page.goto('/stock/unidades')
    await page.getByTestId('vista-unidades-planilla').click()
    const filas = page.getByTestId('planilla-fila')
    await expect(filas.first()).toBeVisible()
    for (const alto of await altos(filas)) expect(alto).toBeLessThanOrEqual(48)
  })

  test('Por comprar: cada necesidad usa el ancho y mide hasta 96 px', async ({ page }) => {
    await page.goto('/abastecimiento')
    const tarjetas = page.getByTestId('por-comprar-fila')
    await expect(tarjetas.first()).toBeVisible()
    for (const alto of await altos(tarjetas, 10)) expect(alto, 'alto de la tarjeta de Por comprar').toBeLessThanOrEqual(96)
    // Faltan, motivos y acciones conviven en la misma tarjeta, sin scroll horizontal.
    const primera = tarjetas.first()
    await expect(primera.getByTestId('por-comprar-faltan')).toContainText(/Faltan\s*\d+/)
    await expect(primera.getByTestId('por-comprar-motivos')).toBeVisible()
    await expect(primera.getByRole('button', { name: 'Asignar comprador' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: `${salida}/por-comprar-1440.png` })
  })
})

test.describe('colores por condición y orden por defecto', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await enterDemo(page)
  })

  test('nuevos en verde y semi nuevos en amarillo, con texto legible (≥ 4.5:1)', async ({ page }) => {
    await page.goto('/stock/unidades')
    const filas = page.getByTestId('inventario-fila')
    await expect(filas.first()).toBeVisible()
    const nuevo = page.locator('[data-testid="inventario-fila"][data-condicion="new"]').first()
    const usado = page.locator('[data-testid="inventario-fila"][data-condicion="used"]').first()
    await expect(nuevo).toBeVisible()
    await expect(usado).toBeVisible()
    const fondos = await Promise.all([nuevo, usado].map(fila => fila.evaluate(nodo => getComputedStyle(nodo).backgroundColor)))
    expect(fondos[0]).not.toBe(fondos[1])
    for (const fila of [nuevo, usado]) expect(await contrasteDe(fila)).toBeGreaterThanOrEqual(4.5)
  })

  test('un color propio por condición se aplica a las filas y mantiene el contraste', async ({ page }) => {
    // Un gris medio es el peor caso: el texto se ajusta solo para llegar a 4.5:1.
    await page.addInitScript(() => localStorage.setItem('mobos:demo-stock-display', JSON.stringify({ tipoPrimero: '', condicionPrimero: '', colores: { '*': { nuevo: '#777777', semi: '#ff00ff' } } })))
    await page.goto('/stock/unidades')
    const nuevo = page.locator('[data-testid="inventario-fila"][data-condicion="new"]').first()
    await expect(nuevo).toBeVisible()
    await expect(nuevo).toHaveCSS('background-color', 'rgb(119, 119, 119)')
    expect(await contrasteDe(nuevo)).toBeGreaterThanOrEqual(4.5)
    const usado = page.locator('[data-testid="inventario-fila"][data-condicion="used"]').first()
    await expect(usado).toHaveCSS('background-color', 'rgb(255, 0, 255)')
    expect(await contrasteDe(usado)).toBeGreaterThanOrEqual(4.5)
  })

  test('la preferencia de orden de la tienda manda en «Recientes» y la del usuario la pisa', async ({ page }) => {
    const primeraCondicion = () => page.getByTestId('inventario-fila').first().getAttribute('data-condicion')
    // Semi nuevos arriba.
    await page.addInitScript(() => {
      if (!localStorage.getItem('mobos:demo-stock-display')) localStorage.setItem('mobos:demo-stock-display', JSON.stringify({ tipoPrimero: '', condicionPrimero: 'semi', colores: {} }))
    })
    await page.goto('/stock/unidades')
    await expect(page.getByTestId('inventario-fila').first()).toBeVisible()
    expect(await primeraCondicion()).toBe('used')
    // El usuario prefiere los nuevos arriba: su preferencia pisa la de la tienda.
    await page.evaluate(() => {
      const claves = Object.keys(localStorage).filter(clave => clave.startsWith('mobos:inventario:pref-display:'))
      for (const clave of claves) localStorage.removeItem(clave)
      localStorage.setItem('mobos:inventario:pref-display:demo-user', JSON.stringify({ tipoPrimero: '', condicionPrimero: 'nuevo', colores: {} }))
    })
    await page.reload()
    await expect(page.getByTestId('inventario-fila').first()).toBeVisible()
    expect(await primeraCondicion()).toBe('new')
  })

  test('Stock › Control › Ubicaciones permite configurar orden y colores', async ({ page }) => {
    await page.goto('/stock/ubicaciones')
    const panel = page.getByTestId('presentacion-stock')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('presentacion-color-fila').first()).toBeVisible()
    await panel.getByLabel('Condición que se muestra primero (tienda)').selectOption('nuevo')
    await panel.getByLabel('Color Nuevo · Todos los depósitos').fill('#aabbcc')
    await panel.getByTestId('presentacion-guardar').click()
    await expect(page.getByText('Presentación del stock guardada.')).toBeVisible()
    const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('mobos:demo-stock-display') || '{}'))
    expect(guardado.condicionPrimero).toBe('nuevo')
    expect(guardado.colores['*'].nuevo).toBe('#aabbcc')
  })
})

test.describe('entrada a una sección', () => {
  test('arranca en la primera pestaña y arriba de la página', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 460 })
    await enterDemo(page)
    // Stock › Control › Ubicaciones, bien abajo.
    await page.goto('/stock/ubicaciones')
    await expect(page.getByTestId('presentacion-stock')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    const primary = await shellPrimary(page)
    // Compras es un grupo de Stock: se llega por su pestaña y se vuelve a la primera.
    await page.getByTestId('shell-contexto').locator('[data-tab-id="compras"]').click()
    await expect(page).toHaveURL(/\/compras$/)
    await primary.getByRole('button', { name: 'Stock', exact: true }).click()
    await expect(page).toHaveURL(/\/stock\/unidades/)
    await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="unidades"]')).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})

test.describe('lista de precios por modelo', () => {
  test('lleva la marca de la tienda, la vigencia, la garantía, el QR y MobOS solo como pie', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await enterDemo(page)
    await mkdir(salida, { recursive: true })
    await page.goto('/celulares')
    const vista = page.getByTestId('lista-precios-vista')
    await expect(vista).toBeVisible()
    const marco = vista.frameLocator('iframe')
    await expect(marco.locator('.brand')).toContainText('Aurora Móviles')
    await expect(marco.locator('.lp-titulo').first()).toBeVisible()
    await expect(marco.locator('.lp-modelo').first()).toBeVisible()
    await expect(marco.locator('.pie-doc')).toContainText('Garantía')
    await expect(marco.locator('.pie-doc')).toContainText('sujetos a stock')
    await expect(marco.locator('.pie-doc img.qr')).toHaveCount(1)
    await expect(marco.locator('.hecho')).toHaveText('Hecho con MobOS')
    // La marca de MobOS no aparece arriba: el encabezado es el de la tienda.
    await expect(marco.locator('.brand')).not.toContainText('MobOS')
    // Dos columnas de modelos.
    expect(await marco.locator('.lp-cols').first().evaluate(nodo => getComputedStyle(nodo).columnCount)).toBe('2')
    // Opciones: dólares y avisos de stock.
    await page.getByTestId('lista-opcion-usd').check()
    await page.getByLabel('Cotización del dólar para la lista').fill('7500')
    await expect(marco.locator('.lp-fila .p small').first()).toContainText('US$')
    await expect(page.getByRole('button', { name: /Compartir imagen/ })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Compartir PDF' })).toBeEnabled()
    await page.screenshot({ path: `${salida}/lista-precios-1440.png` })
  })
})

test('toda ventana cierra con la X roja grande (Modal compartido)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await page.getByRole('button', { name: 'Cómo funciona' }).first().click()
  const cerrar = page.getByRole('dialog', { name: 'Cómo funciona la demo' }).getByRole('button', { name: 'Cerrar' })
  await expect(cerrar).toBeVisible()
  await esperarAnimaciones(page)
  const caja = await cerrar.boundingBox()
  expect(caja.width).toBeGreaterThanOrEqual(44)
  expect(caja.height).toBeGreaterThanOrEqual(44)
  const fondo = await cerrar.evaluate(nodo => getComputedStyle(nodo).backgroundColor)
  const [r, g, b] = fondo.match(/\d+/g).map(Number)
  expect(r, 'la X es roja').toBeGreaterThan(g + 60)
  expect(r).toBeGreaterThan(b + 60)
})

test('la guía de la demo es un aviso que se cierra, no una ventana que tapa la pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('mobos:aviso-metricas', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const aviso = page.getByTestId('demo-guia-aviso')
  await expect(aviso).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // La primera pantalla se puede usar con el aviso abierto.
  await page.getByRole('button', { name: 'Cerrar aviso de la demo' }).click()
  await expect(aviso).toHaveCount(0)
})
