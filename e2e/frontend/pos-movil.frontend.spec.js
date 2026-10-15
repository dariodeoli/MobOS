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

// El cobro ignora toques en los 350 ms siguientes a un cambio de paso (doble toque).
const pausaPaso = page => page.waitForTimeout(420)

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
    await pausaPaso(page)
    await cobro.getByTestId('cuenta-marcar-pagado').click()

    // Segundo pago: saldo y efectivo con «Otro monto» → vuelto.
    await expect(cobro.getByRole('heading', { name: 'Segundo pago' })).toBeVisible()
    const saldo = prod.precio - primero
    await expect(cobro.getByTestId('cobro-total-grande')).toContainText(`Gs ${saldo.toLocaleString('es-PY')}`)
    await cobro.getByTestId('medio-demo-cash-pyg').click()
    await expect(cobro.getByTestId('cobro-recibido')).toBeVisible()
    await pausaPaso(page)
    await cobro.getByTestId('recibido-otro').click()
    const recibido = Math.ceil(saldo / 100000) * 100000 + 100000
    for (const d of String(recibido)) await cobro.getByRole('button', { name: `Agregar ${d}`, exact: true }).click()
    await pausaPaso(page)
    await cobro.getByTestId('teclado-aceptar').click()

    // Confirmación: banner verde de vuelto.
    const vuelto = recibido - saldo
    await expect(cobro.getByTestId('cobro-vuelto')).toContainText(`Vuelto: Gs ${vuelto.toLocaleString('es-PY')}`)
    await expect(cobro.getByTestId('confirmar-pagado')).toContainText(`Gs ${prod.precio.toLocaleString('es-PY')}`)
    await sinScrollHorizontal(page, width)
    await pausaPaso(page)
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
  await pausaPaso(page)
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
  await expect(hoja.getByTestId('sin-stock-volver')).toHaveText('Volver')
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

// Abre el cobro con un producto simple y devuelve el cobro y el precio.
async function abrirCobro(page, width = 390) {
  await enterPos(page, width)
  const prod = await productoSimple(page)
  expect(prod, 'el demo tiene un producto simple con stock').not.toBeNull()
  await agregar(page, prod.nombre)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const cobro = page.getByTestId('cobro-movil')
  await expect(cobro).toBeVisible()
  return { cobro, prod }
}

async function teclear(cobro, monto) {
  for (const d of String(monto)) await cobro.getByRole('button', { name: `Agregar ${d}`, exact: true }).click()
}

test('celular 390: efectivo con vuelto + transferencia por el resto conserva el vuelto hasta la hoja de éxito', async ({ page }) => {
  const { cobro, prod } = await abrirCobro(page)
  const efectivo = Math.floor(prod.precio * 0.6 / 1000) * 1000
  const recibido = Math.ceil(efectivo / 100000) * 100000 + 100000
  const vuelto = recibido - efectivo
  // Efectivo por un monto parcial, recibiendo más.
  await cobro.getByTestId('cobro-dividir').click()
  await teclear(cobro, efectivo)
  await cobro.getByTestId('teclado-aceptar').click()
  await cobro.getByTestId('medio-demo-cash-pyg').click()
  await pausaPaso(page)
  await cobro.getByTestId('recibido-otro').click()
  await teclear(cobro, recibido)
  await pausaPaso(page)
  await cobro.getByTestId('teclado-aceptar').click()
  // Resto por transferencia: el pago nuevo no pisa el vuelto del efectivo.
  await expect(cobro.getByRole('heading', { name: 'Segundo pago' })).toBeVisible()
  await cobro.getByTestId('medio-demo-transfer-itau').click()
  await pausaPaso(page)
  await cobro.getByTestId('cuenta-marcar-pagado').click()
  await expect(cobro.getByTestId('cobro-vuelto')).toContainText(`Gs ${vuelto.toLocaleString('es-PY')}`)
  // Total una sola vez y un solo importe en la confirmación.
  await expect(cobro.getByTestId('cobro-confirmar-venta')).not.toContainText('Gs')
  await pausaPaso(page)
  await cobro.getByTestId('cobro-confirmar-venta').click()
  const exito = page.getByTestId('hoja-exito')
  await expect(exito.getByTestId('exito-vuelto')).toContainText(`Gs ${vuelto.toLocaleString('es-PY')}`)
})

test('celular 390: doble toque en «Efectivo» y en la cuenta no registra un pago sin querer', async ({ page }) => {
  const { cobro, prod } = await abrirCobro(page)
  // Doble toque rápido en «Efectivo»: el segundo cae sobre «monto exacto» y se ignora.
  await pausaPaso(page)
  const efectivo = await cobro.getByTestId('medio-demo-cash-pyg').boundingBox()
  await page.mouse.click(efectivo.x + efectivo.width / 2, efectivo.y + efectivo.height / 2)
  await page.mouse.click(efectivo.x + efectivo.width / 2, efectivo.y + efectivo.height / 2)
  await expect(cobro.getByTestId('cobro-recibido')).toBeVisible()
  await expect(cobro.getByTestId('cobro-confirmar')).toHaveCount(0)
  await expect(cobro.getByTestId('cobro-cancelar-division')).toHaveCount(0)
  // Un toque deliberado, pasado el antirrebote, sí cobra.
  await pausaPaso(page)
  await cobro.getByTestId('recibido-exacto').click()
  await expect(cobro.getByTestId('cobro-confirmar')).toBeVisible()
  // «Cancelar división» y doble toque en la cuenta + «Marcar como pagado».
  await pausaPaso(page)
  await cobro.getByTestId('cobro-cancelar-division').click()
  await cobro.getByTestId('medio-demo-transfer-itau').click()
  await expect(cobro.getByTestId('cobro-cuenta')).toBeVisible()
  await pausaPaso(page)
  const marcar = await cobro.getByTestId('cuenta-marcar-pagado').boundingBox()
  await page.mouse.click(marcar.x + marcar.width / 2, marcar.y + marcar.height / 2)
  await page.mouse.click(marcar.x + marcar.width / 2, marcar.y + marcar.height / 2)
  await expect(cobro.getByTestId('cobro-confirmar')).toBeVisible()
  // El segundo toque cayó sobre «Confirmar venta» y no guardó la venta.
  await expect(page.getByTestId('hoja-exito')).toHaveCount(0)
  await expect(cobro.getByTestId('cobro-confirmar-venta')).toBeEnabled()
  expect(prod.precio).toBeGreaterThan(0)
})

test('celular 390: «Cancelar» en la cuenta conserva el monto parcial tipeado y «Efectivo» no repite el importe', async ({ page }) => {
  const { cobro, prod } = await abrirCobro(page)
  const parcial = Math.floor(prod.precio * 0.4 / 1000) * 1000
  await cobro.getByTestId('cobro-dividir').click()
  await teclear(cobro, parcial)
  await cobro.getByTestId('teclado-aceptar').click()
  await cobro.getByTestId('medio-demo-transfer-itau').click()
  await pausaPaso(page)
  await cobro.getByTestId('cuenta-cancelar').click()
  await expect(cobro.getByTestId('cobro-total-grande')).toContainText(`Gs ${parcial.toLocaleString('es-PY')}`)
  // Pantalla de efectivo: el importe aparece una vez en el título y una en el botón.
  await cobro.getByTestId('medio-demo-cash-pyg').click()
  await expect(cobro.getByTestId('cobro-recibido')).not.toContainText('Pago:')
})

test('celular 390: una fila vacía de «Otros medios» no esconde «Paga al recibir» ni cambia el título', async ({ page }) => {
  const { cobro } = await abrirCobro(page)
  await cobro.getByTestId('medio-otros').click()
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = cobro.getByTestId('pago-fila-0')
  await expect(fila).toBeVisible()
  await fila.getByRole('combobox', { name: 'Cuenta de cobro' }).click()
  await page.getByRole('option', { name: /Dólares/ }).click()
  await cobro.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(cobro.getByRole('heading', { name: 'Cobro', exact: true })).toBeVisible()
  await expect(cobro.getByTestId('medio-paga-al-recibir')).toBeVisible()
  await expect(cobro.getByTestId('cobro-cancelar-division')).toHaveCount(0)
})

test('celular 390: Enter en un campo de «Otros medios» no guarda la venta', async ({ page }) => {
  const { cobro } = await abrirCobro(page)
  await cobro.getByTestId('medio-otros').click()
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = cobro.getByTestId('pago-fila-0')
  await fila.getByRole('combobox', { name: 'Cuenta de cobro' }).click()
  await page.getByRole('option', { name: /Dólares/ }).click()
  const campo = fila.getByRole('textbox', { name: 'Monto original' })
  await campo.fill('10')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('hoja-exito')).toHaveCount(0)
  await expect(cobro).toBeVisible()
})

test('celular 390: el vuelto de una venta no reaparece en la siguiente venta sin efectivo', async ({ page }) => {
  const { cobro, prod } = await abrirCobro(page)
  await cobro.getByTestId('medio-demo-cash-pyg').click()
  await pausaPaso(page)
  await cobro.getByTestId('recibido-otro').click()
  await teclear(cobro, Math.ceil(prod.precio / 100000) * 100000 + 100000)
  await pausaPaso(page)
  await cobro.getByTestId('teclado-aceptar').click()
  await expect(cobro.getByTestId('cobro-vuelto')).toBeVisible()
  await pausaPaso(page)
  await cobro.getByTestId('cobro-confirmar-venta').click()
  const exito = page.getByTestId('hoja-exito')
  await expect(exito.getByTestId('exito-vuelto')).toBeVisible()
  await exito.getByTestId('exito-listo').click()
  // Segunda venta pagada solo por transferencia: sin banner de vuelto en ningún paso.
  await agregar(page, prod.nombre)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const cobro2 = page.getByTestId('cobro-movil')
  await cobro2.getByTestId('medio-demo-transfer-itau').click()
  await pausaPaso(page)
  await cobro2.getByTestId('cuenta-marcar-pagado').click()
  await expect(cobro2.getByTestId('cobro-confirmar')).toBeVisible()
  await expect(cobro2.getByTestId('cobro-vuelto')).toHaveCount(0)
  await pausaPaso(page)
  await cobro2.getByTestId('cobro-confirmar-venta').click()
  await expect(page.getByTestId('hoja-exito')).toBeVisible()
  await expect(page.getByTestId('exito-vuelto')).toHaveCount(0)
})

test('escritorio 1440 no cambia: columnas 50/50 y sin barra ni hojas del celular', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await expect(page.getByTestId('pos-movil')).toHaveCount(0)
  await expect(page.getByTestId('pos-barra-carrito')).toHaveCount(0)
  const izq = await page.getByTestId('pos-bloque-productos').boundingBox()
  const der = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(Math.abs(izq.width - der.width)).toBeLessThanOrEqual(24)
})
