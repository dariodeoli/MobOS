import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { ensureCobro } from '../helpers/ensure-cobro.js'

// Carrito y cobro del POS de escritorio: una sola pantalla sin scroll de página,
// pagos paso a paso, monto dentro de la tarjeta de la cuenta, USD y cotización
// editables, «Copiar datos» con alias. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-cobro-qa'

async function enterPos(page, width, height, { items = 0, pagos = [], abrir = true } = {}) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  if (items) await seedCart(page, items, pagos)
  const nav = width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  if (items && abrir && width >= 1024) await ensureCobro(page)
}

async function seedCart(page, cantidad, pagos) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async ({ cantidad, pagos }) => {
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const c = storage.contextoActual()
    const lista = storage.getProductos()
    const items = Array.isArray(cantidad) ? cantidad : Array.from({ length: cantidad }, (_, i) => {
      const p = lista[i % lista.length]
      return { key: `qa-${i}`, productoId: p.id, nombre: p.nombre, quantity: 1, precio: 180000, sobrePedido: true }
    })
    let customer = { name: 'Prueba frontend local' }
    if (Array.isArray(cantidad)) {
      const { listarClientesDemo } = await import('/src/lib/demoClientes.js')
      const { listDemoUnits, reserveDemoUnits } = await import('/src/lib/demoInventory.js')
      customer = listarClientesDemo().find(cliente => cliente.name === 'Carlos Benítez')
      for (const item of items.filter(item => item.requiereSerie)) {
        const unidad = listDemoUnits().find(unidad => unidad.productId === item.productoId && unidad.status === 'AVAILABLE')
        if (!unidad) throw new Error('Falta unidad demo disponible para el escenario multítem.')
        item.serials = [unidad.serial]
        reserveDemoUnits({ serials: item.serials, customerId: customer.id, customerName: customer.name })
      }
    }
    cart.guardarCarrito(c.empresaId, c.sucursalId, c.userId, { items, customer, pagos })
  }, { cantidad, pagos })
}

const pagoPyg = (accountId, monto) => ({ medioPago: 'x', cuenta: 'x', accountId, originalAmount: String(monto), exchangeRatePyg: '', monto: String(monto) })

async function agregarPagoUsd(page, nombre = 'Caja · Dólares') {
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByRole('button', { name: /^\+ Agregar (otro )?pago$/ }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option', { name: new RegExp(nombre) }).first().click()
  await expect(fila.getByTestId('cuenta-capsula')).toBeVisible()
  return fila
}

for (const [width, height] of [[1280, 720], [1440, 900]]) {
  test(`ticket completo a ${width}x${height}: página desplazable sin mini scroll con 5 productos y 2 pagos`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, height, { items: 5, pagos: [pagoPyg('demo-transfer-itau', 300000), pagoPyg('demo-cash-pyg', 100000)] })
    await expect(page.getByTestId('pago-fila-1')).toBeVisible()
    await page.waitForTimeout(600) // la altura se mide al montar y 400 ms después
    const medidas = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight, vp: window.innerHeight,
      ancho: document.documentElement.scrollWidth, anchoVp: window.innerWidth,
    }))
    expect(medidas.ancho).toBeLessThanOrEqual(medidas.anchoVp)
    // Rediseño: la página no se desplaza y la lista de líneas del ticket
    // sí lo hace por dentro; cada fila se alcanza igual.
    await page.getByTestId('carrito-editar').click()
    const cuerpo = page.getByTestId('pos-carrito-cuerpo')
    await expect(cuerpo).toBeVisible()
    const filas = cuerpo.locator('[data-estado]')
    await expect(filas).toHaveCount(5)
    for (const fila of await filas.all()) {
      await fila.scrollIntoViewIfNeeded()
      await expect(fila).toBeInViewport()
      expect(await fila.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    }
    await ensureCobro(page)
    for (const id of ['carrito-total', 'cobro-pagado', 'cobro-pendiente']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded()
      await expect(page.getByTestId(id)).toBeInViewport()
    }
    const guardar = page.getByTestId('pos-cobro').locator('button[type="submit"]').first()
    await guardar.scrollIntoViewIfNeeded()
    await expect(guardar).toBeInViewport()
    await page.screenshot({ path: `${out}/after-${width}x${height}.png` })
  })
}

test('1440: monto dentro de la tarjeta, «Dividir pago» junto al monto y pagos paso a paso', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 5 })
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro.getByRole('button', { name: '+ Agregar pago' })).toBeEnabled()
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  // Fila sin cuenta ni monto: no se puede encadenar otro pago.
  await expect(cobro.getByRole('button', { name: '+ Agregar otro pago' })).toBeDisabled()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option').first().click()
  const tarjeta = fila.getByTestId('cuenta-capsula')
  const monto = tarjeta.getByLabel('Monto original')
  await expect(monto, 'el monto vive dentro de la tarjeta de la cuenta').toBeVisible()
  // Propone el saldo completo: nada que dividir.
  await expect(monto).toHaveValue('900.000')
  await expect(fila.getByTestId('pago-dividir')).toHaveCount(0)
  await expect(cobro.getByRole('button', { name: '+ Agregar otro pago' })).toBeEnabled()
  await monto.fill('300000')
  const dividir = fila.getByTestId('pago-dividir')
  await expect(dividir).toBeVisible()
  const cm = await monto.boundingBox()
  const cd = await dividir.boundingBox()
  expect(Math.abs((cm.y + cm.height / 2) - (cd.y + cd.height / 2)), 'Dividir pago al lado del monto').toBeLessThan(10)
  expect(cd.x).toBeGreaterThan(cm.x + cm.width - 1)
  expect(cm.width, 'el monto mide por su contenido, no todo el ancho').toBeLessThan(220)
  await expect(cobro.getByText('Dividir saldo')).toHaveCount(0)
  await dividir.click()
  await expect(page.getByTestId('pago-fila-1')).toBeVisible()
  // «Dividir pago» deja la fila nueva ya con el saldo que falta.
  await expect(page.getByTestId('pago-fila-1').getByLabel('Monto original')).toHaveValue('600.000')
  // La fila nueva espera cuenta y monto antes de abrir otro pago.
  await expect(cobro.getByRole('button', { name: '+ Agregar otro pago' })).toBeDisabled()
  await page.getByTestId('pago-fila-1').getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option').first().click()
  await expect(page.getByTestId('pago-fila-1').getByLabel('Monto original')).toHaveValue('600.000')
})

test('USD: acepta 100, 300 y centavos; la cotización es en guaraníes con miles y se edita', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 5 })
  const fila = await agregarPagoUsd(page)
  const monto = fila.getByLabel('Monto original')
  await monto.fill('')
  await monto.pressSequentially('300')
  await expect(monto).toHaveValue('300')
  await monto.fill('')
  await monto.pressSequentially('100')
  await expect(monto).toHaveValue('100')
  await monto.fill('')
  await monto.pressSequentially('1250,5')
  await expect(monto).toHaveValue('1.250,5')
  await monto.blur()
  await expect(monto).toHaveValue('1.250,50')
  expect((await monto.boundingBox()).width, 'el campo USD es ancho para montos normales').toBeGreaterThanOrEqual(120)
  // Cotización: guaraníes con separador de miles, precargada y editable.
  const cot = fila.getByLabel(/^Cotización manual USD/)
  await expect(cot).toHaveValue('7.300')
  await cot.fill('7350')
  await expect(cot).toHaveValue('7.350')
  await expect(fila.getByTestId('cotizacion-origen')).toContainText(/manual/i)
  await monto.fill('300')
  await expect(fila).toContainText('Gs 2.205.000')
})

test('USD: escribe 0,50 y 0,99; el saldo se propone hacia abajo y el resto sub-centavo se cierra en Gs', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 5 })
  const fila = await agregarPagoUsd(page)
  const monto = fila.getByLabel('Monto original')
  await monto.fill('')
  await monto.pressSequentially('0,50')
  await expect(monto).toHaveValue('0,50')
  await monto.fill('')
  await monto.pressSequentially('0,99')
  await expect(monto).toHaveValue('0,99')
  // Gs 900.000 a 7.300 = US$ 123,287…: se propone 123,28 (nunca 123,29 = pasarse).
  await monto.fill('')
  await monto.fill('123,28')
  const cobro = page.getByTestId('pos-cobro')
  const completar = cobro.getByTestId('cobro-completar-gs')
  await expect(completar).toContainText('Completar en Gs')
  await expect(cobro.getByTestId('cobro-pendiente')).toContainText('56')
  await completar.click()
  await expect(cobro.getByTestId('cobro-pendiente')).toContainText('Gs 0')
  await expect(page.getByTestId('pago-fila-1')).toBeVisible()
})

test('tarjeta de transferencia: alias visible y «Copiar datos» deja un bloque limpio', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 5 })
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option', { name: /Itaú/ }).first().click()
  const tarjeta = fila.getByTestId('cuenta-capsula')
  await expect(tarjeta.getByTestId('cuenta-alias')).toContainText('80012345-0')
  await tarjeta.getByText('Ver datos para el cliente').click()
  await expect(tarjeta.getByTestId('cuenta-capsula-datos')).toContainText('Alias (RUC)')
  await tarjeta.getByTestId('cuenta-copiar-datos').click()
  const texto = await page.evaluate(() => navigator.clipboard.readText())
  const lineas = texto.split('\n')
  expect(lineas.slice(0, 5)).toEqual(['Titular: Aurora Móviles', 'Banco: Itaú', 'Nro de cuenta: 001-2456789', 'CI/RUC: 80012345-0', 'Alias (RUC): 80012345-0'])
  expect(texto).not.toMatch(/undefined|null|\[object/)
})

test('«Agregar nota» es un casillero, «Vender a crédito» comparte renglón con la entrega y «Listo, ir a cobrar» resume el carrito', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, { items: 5, abrir: false })
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro).toBeHidden()
  await expect(page.getByTestId('pos-carrito-cuerpo')).toBeVisible()
  await page.getByTestId('carrito-listo').click()
  await expect(cobro).toBeVisible()
  await expect(page.locator('#observacion')).toHaveCount(0)
  await cobro.getByText('Agregar nota', { exact: true }).click()
  await expect(page.locator('#observacion')).toBeVisible()
  await cobro.getByText('Agregar nota', { exact: true }).click()
  await expect(page.locator('#observacion')).toHaveCount(0)
  // «Paga al recibir» comparte el bloque compacto de opciones.
  const entrega = await page.locator('#entrega').boundingBox()
  const paga = await cobro.getByTestId('pos-paga-al-recibir').boundingBox()
  expect(Math.abs((paga.y + paga.height / 2) - (entrega.y + entrega.height / 2)), 'paga al recibir en el mismo bloque compacto que la entrega').toBeLessThan(60)
  // Listo, ir a cobrar: las líneas pasan a solo lectura (sin campos editables) y «Editar productos» vuelve.
  await expect(page.getByTestId('carrito-editar')).toBeVisible()
  await expect(page.getByTestId('cobro-lineas')).toBeVisible()
  await expect(page.getByTestId('pos-carrito-cuerpo').locator('input, select')).toHaveCount(0)
  await expect(page.getByTestId('carrito-total')).toContainText('Gs 900.000')
  await page.screenshot({ path: `${out}/listo-cobrar-1440.png` })
  await page.getByTestId('carrito-editar').click()
  await expect(page.getByTestId('pos-carrito-cuerpo')).toBeVisible()
})

test('divisor arrastrable: cambia el reparto catálogo/venta y se recuerda', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 2, abrir: false })
  const antes = (await page.getByTestId('pos-bloque-productos').boundingBox()).width
  const d = await page.getByTestId('pos-divisor').boundingBox()
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
  await page.mouse.down()
  // El ticket de 410 px es el reparto por defecto: se arrastra hacia la izquierda para ensancharlo.
  await page.mouse.move(d.x - 120, d.y + d.height / 2, { steps: 6 })
  await page.mouse.up()
  const despues = (await page.getByTestId('pos-bloque-productos').boundingBox()).width
  expect(despues).toBeLessThan(antes - 60)
  await page.reload()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  const recordado = (await page.getByTestId('pos-bloque-productos').boundingBox()).width
  expect(Math.abs(recordado - despues)).toBeLessThan(8)
})

test('celular 390: el POS móvil sigue con su barra del carrito y sin controles de escritorio', async ({ page }) => {
  await enterPos(page, 390, 800, { items: 2 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByTestId('pos-barra-carrito')).toBeVisible()
  await expect(page.getByTestId('pos-divisor')).toBeHidden()
  await page.getByTestId('pos-barra-carrito').getByTestId('pos-barra-carrito-abrir').click()
  await expect(page.getByTestId('carrito-cobrar')).toBeVisible()
  await expect(page.getByTestId('carrito-listo')).toBeHidden()
})


test('#487 POS demo conserva pedido multítem y saldo parcial al reabrir y cobrar', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: [
    { key: 'funda-qa', productoId: 'demo-funda-magsafe-transparente', nombre: 'Funda MagSafe Transparente', quantity: 1, precio: 180000 },
    { key: 'iphone-qa', productoId: 'demo-iphone-15-128-azul', nombre: 'iPhone 15 128GB Azul', quantity: 1, precio: 4850000, requiereSerie: true },
  ], pagos: [pagoPyg('demo-cash-pyg', 1000000)] })
  const stockAntes = await page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().find(p => p.id === 'demo-funda-magsafe-transparente').stock)
  await expect(page.getByTestId('carrito-total')).toContainText('5.030.000')
  await page.getByTestId('pos-cobro').locator('button[type="submit"]').first().click()
  // El POS puede pedir confirmar el saldo pendiente antes de crear el pedido.
  const parcial = page.getByRole('button', { name: 'Marcar pago parcial', exact: true })
  if (await parcial.isVisible()) await parcial.click()
  await expect(page.getByRole('button', { name: 'Ver pedido', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver pedido', exact: true }).click()
  const articulos = page.getByTestId('pedido-articulos')
  await expect(articulos).toContainText('Funda MagSafe Transparente')
  await expect(articulos).toContainText('iPhone 15 128GB Azul')
  const totales = page.getByTestId('pedido-totales-f3')
  await expect(totales).toContainText('5.030.000')
  await expect(totales).toContainText('1.000.000')
  await expect(totales).toContainText('4.030.000')
  const persistido = await page.evaluate(async () => {
    const { listVentas } = await import('/src/lib/storage.js')
    const { totalesPedido } = await import('/src/utils/pedido.js')
    const ultima = listVentas().find(v => v.items?.some(i => i.description === 'Funda MagSafe Transparente') && v.items?.some(i => i.description === 'iPhone 15 128GB Azul'))
    return { pagos: ultima.pagos.map(p => ({ id: p.id, monto: p.monto })), numero: ultima.orderNumber, filas: listVentas().filter(v => v.orderNumber === ultima.orderNumber).length, ...totalesPedido(ultima) }
  })
  expect(persistido.pagos).toHaveLength(1)
  expect(persistido.pagos[0].monto).toBe(1000000)
  expect(persistido).toMatchObject({ filas: 1, total: 5030000, pagado: 1000000, pendiente: 4030000, estado: 'Parcial' })
  await page.getByRole('button', { name: /^Cobrar saldo/ }).click()
  const modal = page.getByRole('dialog').filter({ hasText: /^Pagos ·/ })
  await modal.getByLabel('Cuenta de destino').selectOption({ index: 1 })
  await modal.getByLabel('Monto del pago').fill('4030000')
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByTestId('pago-aviso')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Cobrar saldo/ })).toHaveCount(0)
  await expect(totales).toContainText('5.030.000')
  await expect(articulos).toContainText('iPhone 15 128GB Azul')
  const final = await page.evaluate(async numero => {
    const { listVentas, getProductos } = await import('/src/lib/storage.js')
    const { totalesPedido } = await import('/src/utils/pedido.js')
    const { listDemoUnits } = await import('/src/lib/demoInventory.js')
    const { buildOrderReceiptHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    const venta = listVentas().find(v => v.orderNumber === numero)
    return { ...totalesPedido(venta), pagos: venta.pagos.map(p => ({ id: p.id, monto: p.monto })), stock: getProductos().find(p => p.id === 'demo-funda-magsafe-transparente').stock,
      serialVendido: listDemoUnits().find(u => u.serial === venta.items[1].serials[0]).status,
      recibo: await buildOrderReceiptHtml(venta) }
  }, persistido.numero)
  expect(final).toMatchObject({ total: 5030000, pagado: 5030000, pendiente: 0, estado: 'Pagado', stock: stockAntes - 1, serialVendido: 'SOLD' })
  expect(final.pagos).toHaveLength(2)
  expect(new Set(final.pagos.map(p => p.id)).size).toBe(2)
  expect(final.pagos.reduce((suma, p) => suma + p.monto, 0)).toBe(5030000)
  expect(final.recibo).toContain('Funda MagSafe Transparente')
  expect(final.recibo).toContain('iPhone 15 128GB Azul')
  expect(final.recibo).toContain('5.030.000')
})

// Scroll de página (22-10-2026): ningún contenedor del cobro recorta su contenido ni encierra
// el contenido en una ventana con scroll propio. Mide cada elemento del cobro contra sus
// ancestros con overflow (hidden/clip/auto/scroll) hasta la raíz.
async function recortesDelCobro(page, raiz, soloClip = false) {
  return page.evaluate(([selector, soloClip]) => {
    const base = document.querySelector(selector)
    const fallas = []
    for (const el of base.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.position === 'fixed') break
        const corta = ['hidden', 'clip'].includes(cs.overflowY)
        const scroll = ['auto', 'scroll'].includes(cs.overflowY) && a.scrollHeight > a.clientHeight + 1
        if (!corta && !scroll) continue
        if (soloClip && ['auto', 'scroll'].includes(cs.overflowY)) break
        const ar = a.getBoundingClientRect()
        if (corta && r.bottom > ar.bottom + 1) fallas.push(`${el.dataset.testid || el.tagName + '.' + el.className.toString().slice(0, 50) + ' «' + (el.textContent || '').slice(0, 30) + '»'} (${Math.round(r.bottom)}) corta por ${a.dataset.testid || a.className.toString().slice(0, 40)} (${Math.round(ar.bottom)})`)
        if (scroll && !soloClip && !a.matches('[data-testid="popup-cuerpo"], [role="listbox"]')) fallas.push(`${a.dataset.testid || a.className.toString().slice(0, 40)} tiene scroll interno`)
        if (fallas.length > 8) return fallas
      }
    }
    return [...new Set(fallas)]
  }, [raiz, soloClip])
}

const TRES_PAGOS = [pagoPyg('demo-transfer-itau', 300000), pagoPyg('demo-cash-pyg', 100000), pagoPyg('demo-transfer-ueno-ahorro', 50000)]

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  test(`cobro a ${width}x${height} con 3 pagos y la cuenta de cobro desplegada: nada recortado ni con scroll interno`, async ({ page }) => {
    await enterPos(page, width, height, { items: 5, pagos: TRES_PAGOS })
    const filasPago = page.locator('[data-testid^="pago-fila-"]')
    await expect(filasPago).toHaveCount(3)
    await page.getByTestId('pos-cobro').getByRole('button', { name: /^\+ Agregar (otro )?pago$/ }).click()
    await expect(filasPago).toHaveCount(4)
    await filasPago.last().getByLabel('Cuenta de cobro').click()
    await expect(page.getByRole('listbox', { name: 'Cuentas de cobro' })).toBeVisible()
    await page.waitForTimeout(400)
    expect(await recortesDelCobro(page, '[data-testid="pos-layout"]')).toEqual([])
    await page.keyboard.press('Escape')
    // Con el cobro lleno la página se desplaza y el último control se alcanza.
    const guardar = page.getByTestId('pos-cobro').locator('button[type="submit"]').first()
    await guardar.scrollIntoViewIfNeeded()
    await expect(guardar).toBeInViewport()
  })
}

test('cobro a 390 con 3 pagos: la hoja de cobro no recorta su contenido', async ({ page }) => {
  await enterPos(page, 390, 844, { items: 5, pagos: TRES_PAGOS })
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const hoja = page.getByTestId('cobro-movil')
  await expect(hoja).toBeVisible()
  await page.waitForTimeout(500)
  expect(await recortesDelCobro(page, '[data-testid="cobro-movil"]', true)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('Paso 2: el resumen muestra las líneas (nombre, cantidad × precio, subtotal) en solo lectura, en escritorio y celular', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 3 })
  const lineas = page.getByTestId('cobro-lineas').locator('li')
  await expect(lineas).toHaveCount(3)
  for (const li of await lineas.all()) {
    await expect(li).toContainText('1 × Gs 180.000')
    await expect(li.locator('b')).not.toBeEmpty()
    expect(await li.locator('input, select, textarea').count(), 'solo lectura').toBe(0)
  }
  await expect(page.getByTestId('carrito-editar')).toBeVisible()
  await expect(page.getByTestId('carrito-total')).toContainText('Gs 540.000')
})

test('Paso 2 en celular: la hoja de cobro lista las líneas y ofrece Volver y Nueva venta', async ({ page }) => {
  await enterPos(page, 390, 844, { items: 3 })
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  await expect(page.getByTestId('cobro-movil-lineas').locator('li')).toHaveCount(3)
  await expect(page.getByTestId('cobro-volver')).toBeVisible()
  await expect(page.getByTestId('cobro-nueva-venta')).toBeVisible()
})
