// #148 §5/§11 · Cobro (UX): la cuenta elegida muestra una cápsula con sus datos
// (banco/medio, titular, número, moneda y saldo pendiente si aplica), el monto
// grande no se corta, el botón principal crece y ordena etiqueta/importe con el
// naranja en el pago parcial, y el resumen «Total de esta venta» queda sólido y
// debajo del botón en mobile. Hallazgos de otros dominios se reportan, no se
// corrigen acá.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const cliente = () => `Cliente cobro UX ${Date.now().toString(36).toUpperCase()}`

// #429: debajo de 768 px el POS es el de celular (cliente y carrito en hojas, cobro paso a paso).
const movil = (page) => page.viewportSize().width < 768

async function armarVenta(page, { productos = [SEED.products.cable.name], veces = 1, clienteNombre } = {}) {
  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()
  if (movil(page)) {
    await page.getByTestId('accion-cliente').click()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(clienteNombre)
    await page.getByTestId('hoja-cliente').getByRole('button', { name: 'Listo' }).click()
  } else await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(clienteNombre)
  const buscar = page.getByPlaceholder('Buscar producto…')
  for (const producto of productos) {
    await buscar.fill(producto)
    const tarjeta = page.getByRole('button', { name: new RegExp(producto) }).first()
    await expect(tarjeta).toBeVisible({ timeout: 15_000 })
    for (let i = 0; i < veces; i += 1) await tarjeta.click()
  }
  // En celular el carrito está en la hoja que abre la barra fija.
  if (movil(page)) await page.getByTestId('pos-barra-carrito-abrir').click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
}

async function agregarPago(page) {
  // Celular: el formulario completo de pagos vive en «Otros medios y entrega» del cobro.
  if (movil(page)) {
    await page.getByTestId('carrito-cobrar').click()
    await page.getByTestId('medio-otros').click()
  }
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

// #283: el pago arranca SIN cuenta (se elige a propósito), al elegirla el
// selector desaparece y queda solo la cápsula con sus datos ordenados, y la
// lista abierta empuja el bloque en vez de superponerse.
test('el pago arranca sin cuenta, al elegirla queda la cápsula y la lista no tapa el bloque (#283)', async ({ page }) => {
  await armarVenta(page, { clienteNombre: cliente() })
  const fila = await agregarPago(page)

  // Sin cuenta predeterminada: buscador vacío, monto deshabilitado y sin cápsula.
  const combo = fila.getByLabel('Cuenta de cobro')
  await expect(combo).toHaveValue('')
  await expect(fila.getByLabel('Monto original')).toBeDisabled()
  await expect(fila.getByTestId('cuenta-capsula')).toHaveCount(0)

  // La lista se abre en el flujo: el monto queda debajo, sin superposición.
  await combo.click()
  const lista = page.getByRole('listbox', { name: 'Cuentas de cobro' })
  await expect(lista).toBeVisible()
  const cajaLista = await lista.boundingBox()
  const cajaMonto = await fila.getByLabel('Monto original').boundingBox()
  expect(Math.round(cajaLista.y + cajaLista.height)).toBeLessThanOrEqual(Math.round(cajaMonto.y))

  // Al elegir: el selector desaparece, queda la cápsula y el monto propone el saldo.
  await page.getByRole('option', { name: /Transferencia E2E/ }).first().click()
  await expect(fila.getByLabel('Cuenta de cobro')).toHaveCount(0)
  const capsula = fila.getByTestId('cuenta-capsula')
  await expect(capsula.getByTestId('cuenta-capsula-nombre')).toHaveText('Transferencia E2E')
  await expect(fila.getByTestId('cuenta-cambiar')).toBeVisible() // #391: cambiar de cuenta en el lugar
  await expect(fila.getByLabel('Monto original')).toBeEnabled()
  await expect(fila.getByLabel('Monto original')).toHaveValue('45.000')

  // Datos ordenados y rotulados: número, titular y banco (#283, ajuste de Dario).
  await capsula.getByText('Ver datos para el cliente').click() // #391
  const datos = capsula.getByTestId('cuenta-capsula-datos')
  await expect(datos.locator('dt')).toHaveText(['Nro de cuenta', 'Titular', 'Banco'])
  await expect(datos).toContainText('E2E-0001')
  await expect(datos).toContainText('Tienda E2E')
  await expect(datos).toContainText('Banco E2E')

  // Otro pago: vuelve a arrancar sin cuenta (no se arrastra la anterior).
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await expect(page.getByTestId('pago-fila-1').getByLabel('Cuenta de cobro')).toHaveValue('')
})

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
  // Banco, titular y número, rotulados y en orden (#283): lo que hace falta
  // para operar sin salir del cobro.
  await capsula.getByText('Ver datos para el cliente').click() // #391
  const datos = capsula.getByTestId('cuenta-capsula-datos')
  await expect(datos.locator('dt')).toHaveText(['Nro de cuenta', 'Titular', 'Banco'])
  await expect(datos.locator('dd')).toHaveText(['E2E-0001', 'Tienda E2E', 'Banco E2E'])
  // El cable cuesta 45.000: al elegir la cuenta se propone el saldo, así que no
  // hay pendiente. Con un pago parcial aparece el saldo; al completarlo se va.
  await expect(capsula.getByTestId('cuenta-capsula-saldo')).toHaveCount(0)
  await fila.getByLabel('Monto original').fill('20000')
  await expect(capsula.getByTestId('cuenta-capsula-saldo')).toHaveCount(0) // #272: el saldo vive en los totales
  const saldo = page.getByTestId('cobro-pendiente')
  await expect(saldo).toBeVisible()
  await expect(saldo).toContainText('Gs')
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

test('el botón principal crece, ordena etiqueta/importe y mantiene un color neutro en todos los estados (#148 §5/§11 · #341)', async ({ page }) => {
  await armarVenta(page, { clienteNombre: cliente(), productos: [SEED.products.cable.name, SEED.products.funda.name] })
  const fila = await agregarPago(page)
  await elegirCuenta(page, fila, 'Caja E2E')
  await fila.getByLabel('Monto original').fill('20000')

  // Parcial: más alto que el botón estándar (44/48), con la etiqueta arriba y
  // productos/importe abajo. El color es el neutro de la acción primaria en
  // todos los estados (#341): el estado se lee en la etiqueta y el resumen.
  const colorBoton = (b) => b.evaluate((el) => getComputedStyle(el).backgroundColor)
  const boton = page.getByRole('button', { name: /^Crear pedido/ })
  await expect(boton).toBeVisible()
  const caja = await boton.boundingBox()
  expect(Math.round(caja.height)).toBeGreaterThanOrEqual(52)
  const neutro = await colorBoton(boton)
  for (const variable of ['--c-warn', '--c-ok', '--c-bad']) {
    expect(neutro, `el parcial no usa ${variable}`).not.toBe(`rgb(${await colorTema(page, variable)})`)
  }
  // Etiqueta arriba; debajo, el detalle en dos líneas (productos e importe).
  const etiquetaBoton = boton.locator('span.font-bold')
  const detalleBoton = boton.locator('span.tabular-nums').first()
  await expect(etiquetaBoton).toHaveText('Crear pedido')
  await expect(detalleBoton).toContainText('2 productos')
  await expect(detalleBoton).toContainText(/Gs 125\.000/)
  const yEtiqueta = (await etiquetaBoton.boundingBox()).y
  const yDetalle = (await detalleBoton.boundingBox()).y
  expect(yEtiqueta).toBeLessThan(yDetalle)

  // Completo: mismo color neutro, ahora con la etiqueta «Confirmar venta».
  await fila.getByLabel('Monto original').fill('125000')
  const confirmar = page.getByRole('button', { name: /^Confirmar venta/ })
  await expect(confirmar).toBeVisible()
  expect(await colorBoton(confirmar)).toBe(neutro)

  // Sin pago: sigue el mismo neutro (la etiqueta avisa que queda pendiente).
  await fila.getByRole('button', { name: 'Eliminar pago 1' }).click()
  const sinPago = page.getByRole('button', { name: /^Crear pedido sin pago/ })
  await expect(sinPago).toBeVisible()
  expect(await colorBoton(sinPago)).toBe(neutro)
})

test('mobile: el total de la venta queda fijo abajo y el carrito muestra el descuento (#148 §5/§11, #429)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await armarVenta(page, { clienteNombre: cliente(), productos: [SEED.products.cable.name, SEED.products.funda.name] })
  const carrito = page.locator('#pos-resumen-venta')
  await carrito.getByLabel(/^Descuento extra/).fill('5000')
  await expect(carrito).toContainText('Descuento')
  await expect(carrito).toContainText('Gs 5.000')
  await expect(carrito.getByTestId('carrito-total')).toHaveText('Gs 120.000')

  // #429: en el celular el Total y la acción «Cobrar» quedan fijos abajo: la barra
  // del carrito (detrás de la hoja) y el pie de la hoja.
  const barra = page.getByTestId('pos-barra-carrito')
  await expect(barra.getByTestId('barra-total')).toHaveText('Gs 120.000')
  expect(await barra.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  await expect(page.getByTestId('carrito-cobrar')).toBeVisible()
  await expect(page.getByTestId('carrito-cobrar')).toContainText('Gs 120.000')

  // El cobro paso a paso arranca con el total completo y medios a ancho completo.
  const fila = await agregarPago(page)
  await elegirCuenta(page, fila, 'Caja E2E')
  await fila.getByLabel('Monto original').fill('20000')
  await expect(page.getByTestId('cobro-pendiente')).toContainText('Gs 100.000')
})
