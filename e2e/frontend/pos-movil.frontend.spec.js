import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// POS en celular (#429): flujo estilo Shopify POS en pantallas <768 px.
// Demo frontend-only (sin backend). Escritorio queda como estaba (50/50).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-movil'

async function enterPos(page, width, height = 800, dark = false) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const nav = width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

// Un producto con stock y una sola variante (sin selector) para el flujo feliz.
async function productoSimple(page) {
  return page.evaluate(async () => {
    const { getProductos } = await import('/src/lib/storage.js')
    const { agruparProductos } = await import('/src/utils/colores.js')
    const familia = agruparProductos(getProductos().filter(p => p.activo))
      .find(f => f.items.length === 1 && Number(f.items[0].stock) >= 2 && Number(f.items[0].precioVenta) >= 100000 && /Funda|Cargador/.test(f.base))
    return familia ? { nombre: familia.base, precio: Number(familia.items[0].precioVenta) } : null
  })
}

async function agregar(page, nombre) {
  await page.getByPlaceholder('Buscar producto…').fill(nombre)
  await page.locator('.pos-product-card', { hasText: nombre }).first().click()
}

// Las hojas entran deslizándose: se espera el final de la animación antes de capturar.
const captura = async (page, path) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path })
}

const sinScrollHorizontal = async (page, ancho) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho)

for (const width of [360, 390]) {
  test(`celular ${width}: inicio con acciones en 2 columnas y sin scroll horizontal`, async ({ page }) => {
    await enterPos(page, width)
    const tiles = page.getByTestId('pos-acciones-movil').locator('button')
    expect(await tiles.count()).toBeGreaterThanOrEqual(8)
    const a = await tiles.nth(0).boundingBox()
    const b = await tiles.nth(1).boundingBox()
    const c = await tiles.nth(2).boundingBox()
    expect(Math.abs(a.y - b.y)).toBeLessThan(2) // misma fila
    expect(c.y).toBeGreaterThan(a.y) // la tercera baja
    for (const box of [a, b, c]) expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId('pos-barra-carrito')).toHaveCount(0)
    // El layout de escritorio no se dibuja en celular.
    await expect(page.getByTestId('pos-columna-venta')).toBeHidden()
    await expect(page.getByTestId('pos-cobro')).toBeHidden()
    await sinScrollHorizontal(page, width)
  })

  test(`celular ${width}: agregar, carrito, cobro dividido con teclado, vuelto y Listo reinicia el carrito`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width)
    const prod = await productoSimple(page)
    expect(prod, 'el demo tiene un producto simple con stock').not.toBeNull()
    await agregar(page, prod.nombre)

    // Barra azul del carrito: cantidad y total completo.
    const barra = page.getByTestId('pos-barra-carrito')
    await expect(barra).toBeVisible()
    await expect(barra.getByTestId('barra-cantidad')).toHaveText('1 artículo')
    await expect(barra.getByTestId('barra-total')).toContainText(`Gs ${prod.precio.toLocaleString('es-PY')}`)
    expect((await barra.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await sinScrollHorizontal(page, width)
    if (width === 390) await captura(page, `${out}/${width}-inicio.png`)

    // Hoja del carrito.
    await barra.getByTestId('pos-barra-carrito-abrir').click()
    const hojaCarrito = page.getByTestId('hoja-carrito')
    await expect(hojaCarrito).toBeVisible()
    await expect(hojaCarrito.getByTestId('carrito-total')).toContainText(`Gs ${prod.precio.toLocaleString('es-PY')}`)
    await sinScrollHorizontal(page, width)
    if (width === 390) await captura(page, `${out}/${width}-carrito.png`)

    // Cobro: total grande + medios a ancho completo.
    await hojaCarrito.getByTestId('carrito-cobrar').click()
    const cobro = page.getByTestId('cobro-movil')
    await expect(cobro).toBeVisible()
    await expect(cobro.getByTestId('cobro-total-grande')).toContainText(`Gs ${prod.precio.toLocaleString('es-PY')}`)
    const medios = cobro.getByTestId('cobro-medios').locator('button')
    expect(await medios.count()).toBeGreaterThanOrEqual(3)
    const m0 = await medios.first().boundingBox()
    expect(m0.height).toBeGreaterThanOrEqual(44)
    expect(m0.width).toBeGreaterThan(width * 0.8)
    if (width === 390) await captura(page, `${out}/${width}-cobro.png`)

    // Pago dividido: primero 40 % por transferencia con el teclado propio.
    const primero = Math.floor(prod.precio * 0.4 / 1000) * 1000
    await cobro.getByTestId('cobro-dividir').click()
    await expect(cobro.getByTestId('cobro-teclado')).toBeVisible()
    for (const d of String(primero)) await cobro.getByRole('button', { name: `Agregar ${d}`, exact: true }).click()
    await expect(cobro.getByTestId('teclado-monto')).toContainText(`Gs ${primero.toLocaleString('es-PY')}`)
    if (width === 390) await captura(page, `${out}/${width}-teclado.png`)
    await cobro.getByTestId('teclado-aceptar').click()
    await cobro.getByTestId('medio-demo-transfer-itau').click()
    await expect(cobro.getByTestId('cobro-cuenta')).toContainText('Marcar como pagado')
    await cobro.getByTestId('cuenta-marcar-pagado').click()

    // Segundo pago: saldo y efectivo con «Otro monto» → vuelto.
    await expect(cobro.getByRole('heading', { name: 'Segundo pago' })).toBeVisible()
    const saldo = prod.precio - primero
    await expect(cobro.getByTestId('cobro-total-grande')).toContainText(`Gs ${saldo.toLocaleString('es-PY')}`)
    await cobro.getByTestId('medio-demo-cash-pyg').click()
    await expect(cobro.getByTestId('cobro-recibido')).toBeVisible()
    await cobro.getByTestId('recibido-otro').click()
    const recibido = Math.ceil(saldo / 100000) * 100000 + 100000
    for (const d of String(recibido)) await cobro.getByRole('button', { name: `Agregar ${d}`, exact: true }).click()
    await cobro.getByTestId('teclado-aceptar').click()

    // Confirmación: banner verde de vuelto.
    const vuelto = recibido - saldo
    await expect(cobro.getByTestId('cobro-vuelto')).toContainText(`Vuelto: Gs ${vuelto.toLocaleString('es-PY')}`)
    await expect(cobro.getByTestId('confirmar-pagado')).toContainText(`Gs ${prod.precio.toLocaleString('es-PY')}`)
    await sinScrollHorizontal(page, width)
    await cobro.getByTestId('cobro-confirmar-venta').click()

    // Confirmación posterior: vuelto, recibo y «Listo».
    const exito = page.getByTestId('hoja-exito')
    await expect(exito).toBeVisible()
    await expect(exito.getByTestId('exito-vuelto')).toContainText(`Gs ${vuelto.toLocaleString('es-PY')}`)
    await expect(exito.getByTestId('exito-imprimir')).toBeVisible()
    if (width === 390) await captura(page, `${out}/${width}-exito.png`)
    await exito.getByTestId('exito-listo').click()
    await expect(exito).toHaveCount(0)

    // El carrito quedó vacío y se sigue en el POS (sin saltar al detalle).
    await expect(page.getByTestId('pos-barra-carrito')).toHaveCount(0)
    await expect(page.getByTestId('pos-acciones-movil')).toBeVisible()
    await sinScrollHorizontal(page, width)
  })
}

test('celular 390: Esc cierra la hoja y el cobro en efectivo exacto no genera vuelto', async ({ page }) => {
  await enterPos(page, 390)
  const prod = await productoSimple(page)
  await agregar(page, prod.nombre)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await expect(page.getByTestId('hoja-carrito')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('hoja-carrito')).toHaveCount(0)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const cobro = page.getByTestId('cobro-movil')
  await cobro.getByTestId('medio-demo-cash-pyg').click()
  await cobro.getByTestId('recibido-exacto').click()
  await expect(cobro.getByTestId('cobro-confirmar')).toBeVisible()
  await expect(cobro.getByTestId('cobro-vuelto')).toHaveCount(0)
  await expect(cobro.getByTestId('cobro-confirmar-venta')).toContainText('Confirmar venta')
})

test('celular 390: arrastrar el asa hacia abajo cierra la hoja', async ({ page }) => {
  await enterPos(page, 390)
  const prod = await productoSimple(page)
  await agregar(page, prod.nombre)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  const hoja = page.getByTestId('hoja-carrito')
  await expect(hoja).toBeVisible()
  await page.waitForTimeout(400)
  const asa = await page.getByTestId('bottom-sheet-asa').boundingBox()
  await page.mouse.move(asa.x + 60, asa.y + 8)
  await page.mouse.down()
  await page.mouse.move(asa.x + 60, asa.y + 80, { steps: 4 })
  await page.mouse.move(asa.x + 60, asa.y + 220, { steps: 6 })
  await page.mouse.up()
  await expect(hoja).toHaveCount(0)
  await expect(page.getByTestId('pos-barra-carrito')).toBeVisible()
})

test('celular 390: oscuro sin scroll horizontal y con X de 44 px en la hoja', async ({ page }) => {
  await enterPos(page, 390, 800, true)
  const prod = await productoSimple(page)
  await agregar(page, prod.nombre)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  const cerrar = page.getByTestId('hoja-carrito').getByRole('button', { name: 'Cerrar' })
  const caja = await cerrar.boundingBox()
  expect(caja.width).toBeGreaterThanOrEqual(44)
  expect(caja.height).toBeGreaterThanOrEqual(44)
  await sinScrollHorizontal(page, 390)
})

test('celular 390: acciones del inicio abren sus hojas (envío y nota)', async ({ page }) => {
  await enterPos(page, 390)
  await page.getByTestId('accion-envio').click()
  await expect(page.getByTestId('hoja-envio')).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByTestId('accion-nota').click()
  await page.getByLabel('Observación').fill('entregar mañana')
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByTestId('accion-nota')).toContainText('Con nota')
})

test('celular 390: producto sin stock → hoja «El artículo no tiene stock» y «Vender igual» con permiso', async ({ page }) => {
  await enterPos(page, 390)
  await agregar(page, 'Protector de vidrio 17 Pro')
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const hoja = page.getByTestId('hoja-sin-stock')
  await expect(hoja).toBeVisible()
  await expect(hoja.getByRole('heading', { name: 'El artículo no tiene stock' })).toBeVisible()
  await expect(hoja.getByTestId('sin-stock-volver')).toBeVisible()
  await hoja.getByTestId('sin-stock-vender-igual').click()
  await expect(page.getByTestId('cobro-movil')).toBeVisible()
})

test('celular 390: un equipo con IMEI nunca ofrece «Vender igual»', async ({ page }) => {
  await enterPos(page, 390)
  await agregar(page, 'iPhone 14 Pro 256GB')
  const fila = page.locator('[data-testid="hoja-carrito"], body').first()
  await expect(fila).toBeVisible()
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const hoja = page.getByTestId('hoja-sin-stock')
  await expect(hoja).toBeVisible()
  await expect(hoja.getByTestId('sin-stock-vender-igual')).toHaveCount(0)
  await expect(hoja.getByText(/IMEI/).first()).toBeVisible()
  await hoja.getByTestId('sin-stock-volver').click()
  await expect(page.getByTestId('hoja-carrito')).toBeVisible()
})

test('celular 390: «Agregar cliente» abre la ficha en una hoja y el mosaico muestra el nombre', async ({ page }) => {
  await enterPos(page, 390)
  await page.getByTestId('accion-cliente').click()
  const hoja = page.getByTestId('hoja-cliente')
  await expect(hoja).toBeVisible()
  await hoja.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill('Luc')
  await hoja.locator('button.block').first().click()
  await expect(hoja.getByTestId('cliente-elegido')).toBeVisible()
  await hoja.getByRole('button', { name: 'Listo' }).click()
  await expect(hoja).toHaveCount(0)
  await expect(page.getByTestId('accion-cliente')).toContainText('Cliente')
})

test('escritorio 1440 no cambia: columnas 50/50 y sin barra ni hojas del celular', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await expect(page.getByTestId('pos-movil')).toHaveCount(0)
  await expect(page.getByTestId('pos-barra-carrito')).toHaveCount(0)
  const izq = await page.getByTestId('pos-bloque-productos').boundingBox()
  const der = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(Math.abs(izq.width - der.width)).toBeLessThanOrEqual(24)
})
