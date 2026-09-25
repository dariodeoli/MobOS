// #148 §5/§11 · Cobro (UX): la cuenta elegida muestra una cápsula con sus datos
// (banco/medio, titular, número, moneda y saldo pendiente si aplica), el monto
// grande no se corta, el botón principal crece y ordena etiqueta/importe con el
// naranja en el pago parcial, y el resumen «Total de esta venta» queda sólido y
// debajo del botón en mobile. Hallazgos de otros dominios se reportan, no se
// corrigen acá.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const cliente = () => `Cliente cobro UX ${Date.now().toString(36).toUpperCase()}`

async function armarVenta(page, { productos = [SEED.products.cable.name], veces = 1, clienteNombre } = {}) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(clienteNombre)
  const buscar = page.getByPlaceholder('Buscar producto…')
  for (const producto of productos) {
    await buscar.fill(producto)
    const tarjeta = page.getByRole('button', { name: new RegExp(producto) }).first()
    await expect(tarjeta).toBeVisible({ timeout: 15_000 })
    for (let i = 0; i < veces; i += 1) await tarjeta.click()
  }
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
}

async function agregarPago(page) {
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await expect(fila).toBeVisible()
  return fila
}

async function elegirCuenta(page, fila, nombre) {
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('option', { name: new RegExp(nombre) }).first().click()
}

const colorTema = (page, variable) =>
  page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim().split(/\s+/).join(', '), variable)

test('la cuenta elegida muestra cápsula con banco, titular, número, moneda y saldo (#148 §5/§11)', async ({ page }) => {
  await armarVenta(page, { clienteNombre: cliente() })
  const fila = await agregarPago(page)
  await elegirCuenta(page, fila, 'Transferencia E2E')

  const capsula = page.getByTestId('cuenta-capsula')
  await expect(capsula).toBeVisible()
  await expect(capsula.getByTestId('cuenta-capsula-nombre')).toHaveText('Transferencia E2E')
  // Moneda y medio, con logo del banco.
  await expect(capsula).toContainText('Gs')
  await expect(capsula).toContainText('Transferencia')
  // Banco, titular y número: lo que hace falta para operar sin salir del cobro.
  const datos = capsula.getByTestId('cuenta-capsula-datos')
  await expect(datos).toContainText('Banco E2E')
  await expect(datos).toContainText('Titular Tienda E2E')
  await expect(datos).toContainText('E2E-0001')
  // El cable cuesta 45.000: al elegir la cuenta se propone el saldo, así que no
  // hay pendiente. Con un pago parcial aparece el saldo; al completarlo se va.
  await expect(capsula.getByTestId('cuenta-capsula-saldo')).toHaveCount(0)
  await fila.getByLabel('Monto original').fill('20000')
  const saldo = capsula.getByTestId('cuenta-capsula-saldo')
  await expect(saldo).toBeVisible()
  await expect(saldo).toContainText('Saldo pendiente de esta venta')
  await expect(saldo).toContainText('Gs 25.000')
  await fila.getByLabel('Monto original').fill('45000')
  await expect(capsula.getByTestId('cuenta-capsula-saldo')).toHaveCount(0)
})

for (const [vista, ancho, alto] of [['mobile', 390, 844], ['desktop', 1280, 900]]) {
  test(`${vista}: un monto grande entra completo en la fila de pago (#148 §5/§11)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await armarVenta(page, { clienteNombre: cliente() })
    const fila = await agregarPago(page)
    await elegirCuenta(page, fila, 'Caja E2E')
    const monto = fila.getByLabel('Monto original')
    await monto.fill('99000000000')
    await expect(monto).toHaveValue('99.000.000.000')
    const medida = await monto.evaluate((input) => {
      const cs = getComputedStyle(input)
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      return {
        texto: ctx.measureText(input.value).width,
        disponible: input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      }
    })
    // El prefijo no se come el ancho: el número más grande documentado entra.
    expect(medida.texto, `texto ${Math.round(medida.texto)}px en ${Math.round(medida.disponible)}px`).toBeLessThanOrEqual(medida.disponible + 0.5)
  })
}

test('el botón principal crece, ordena etiqueta/importe y avisa por color (#148 §5/§11)', async ({ page }) => {
  await armarVenta(page, { clienteNombre: cliente(), productos: [SEED.products.cable.name, SEED.products.funda.name] })
  const fila = await agregarPago(page)
  await elegirCuenta(page, fila, 'Caja E2E')
  await fila.getByLabel('Monto original').fill('20000')

  // Parcial: naranja de atención (--c-warn del tema) y más alto que el botón
  // estándar (44/48), con la etiqueta arriba y productos/importe abajo.
  const boton = page.getByRole('button', { name: /^Crear pedido/ })
  await expect(boton).toBeVisible()
  const caja = await boton.boundingBox()
  expect(Math.round(caja.height)).toBeGreaterThanOrEqual(52)
  const naranja = await colorTema(page, '--c-warn')
  await expect.poll(() => boton.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(`rgb(${naranja})`)
  const renglones = await boton.evaluate((el) => Array.from(el.querySelectorAll('span > span')).map((span) => ({ texto: span.textContent, y: Math.round(span.getBoundingClientRect().y) })))
  expect(renglones.length).toBe(2)
  expect(renglones[0].texto).toBe('Crear pedido')
  expect(renglones[1].texto).toMatch(/2 productos · Gs 125\.000/)
  expect(renglones[0].y).toBeLessThan(renglones[1].y)

  // Completo: verde de venta confirmada.
  await fila.getByLabel('Monto original').fill('125000')
  const confirmar = page.getByRole('button', { name: /^Confirmar venta/ })
  await expect(confirmar).toBeVisible()
  const verde = await colorTema(page, '--c-ok')
  await expect.poll(() => confirmar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(`rgb(${verde})`)

  // Sin pago: rojo de pendiente.
  await fila.getByRole('button', { name: 'Eliminar pago 1' }).click()
  const sinPago = page.getByRole('button', { name: /^Crear pedido sin pago/ })
  await expect(sinPago).toBeVisible()
  const rojo = await colorTema(page, '--c-bad')
  await expect.poll(() => sinPago.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(`rgb(${rojo})`)
})

test('mobile: el resumen «Total de esta venta» es sólido y queda debajo del botón (#148 §5/§11)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await armarVenta(page, { clienteNombre: cliente(), productos: [SEED.products.cable.name, SEED.products.funda.name] })
  await page.locator('#pos-resumen-venta').getByLabel(/^Descuento extra/).fill('5000')
  const fila = await agregarPago(page)
  await elegirCuenta(page, fila, 'Caja E2E')
  await fila.getByLabel('Monto original').fill('20000')

  const resumen = page.getByTestId('resumen-compra')
  await expect(resumen).toContainText('Total de esta venta')
  await expect(resumen).toContainText('2 productos')
  await expect(resumen).toContainText('2 unidades')
  await expect(resumen).toContainText('Descuento − Gs 5.000')

  // Fondo sólido: sin degradado y con alfa 1 (no se ve la página detrás).
  const estilo = await resumen.evaluate((el) => ({ fondo: getComputedStyle(el).backgroundColor, imagen: getComputedStyle(el).backgroundImage }))
  expect(estilo.imagen).toBe('none')
  const alfa = estilo.fondo.startsWith('rgba') ? Number(estilo.fondo.match(/,\s*([\d.]+)\)/)?.[1] ?? 1) : 1
  expect(alfa).toBe(1)

  // Orden pedido: «Crear pedido…» arriba, productos/importes abajo. Se mide al
  // pie de la página para que el botón pegajoso esté en su lugar natural.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  const boton = page.getByRole('button', { name: /^(Crear pedido|Confirmar venta)/ })
  const cajaBoton = await boton.boundingBox()
  const cajaResumen = await resumen.boundingBox()
  expect(cajaBoton.y).toBeLessThan(cajaResumen.y)
})
