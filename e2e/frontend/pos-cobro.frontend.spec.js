import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Carrito y cobro del POS de escritorio: una sola pantalla sin scroll de página,
// pagos paso a paso, monto dentro de la tarjeta de la cuenta, USD y cotización
// editables, «Copiar datos» con alias. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-cobro-qa'

async function enterPos(page, width, height, { items = 0, pagos = [] } = {}) {
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
}

async function seedCart(page, cantidad, pagos) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async ({ cantidad, pagos }) => {
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const c = storage.contextoActual()
    const lista = storage.getProductos()
    const items = Array.from({ length: cantidad }, (_, i) => {
      const p = lista[i % lista.length]
      return { key: `qa-${i}`, productoId: p.id, nombre: p.nombre, quantity: 1, precio: 180000, sobrePedido: true }
    })
    cart.guardarCarrito(c.empresaId, c.sucursalId, c.userId, { items, customer: { name: 'Prueba frontend local' }, pagos })
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

// ¿Algún contenedor que contiene al POS (o la página) se desplaza en vertical?
const desbordes = (page) => page.evaluate(() => {
  const res = []
  for (let el = document.querySelector('[data-testid="pos-layout"]'); el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY
    const scroll = el === document.documentElement || ['auto', 'scroll'].includes(o)
    if (scroll && el.scrollHeight > el.clientHeight + 1) res.push(`${el.tagName}.${String(el.className).slice(0, 40)}[${el.getAttribute('data-testid') || ''}] ${el.scrollHeight}>${el.clientHeight}`)
  }
  return res
})

for (const [width, height] of [[1280, 720], [1440, 900]]) {
  test(`una sola pantalla a ${width}x${height}: sin scroll de página con 5 productos y 2 pagos`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, height, { items: 5, pagos: [pagoPyg('demo-transfer-itau', 300000), pagoPyg('demo-cash-pyg', 100000)] })
    await expect(page.getByTestId('pago-fila-1')).toBeVisible()
    await page.waitForTimeout(600) // la altura se mide al montar y 400 ms después
    const medidas = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight, vp: window.innerHeight,
      ancho: document.documentElement.scrollWidth, anchoVp: window.innerWidth,
    }))
    expect(medidas.alto, 'sin scroll vertical de página').toBeLessThanOrEqual(medidas.vp + 1)
    expect(await desbordes(page), 'ningún contenedor de la página se desplaza').toEqual([])
    expect(medidas.ancho).toBeLessThanOrEqual(medidas.anchoVp)
    // Total, pagado/pendiente y el botón de guardar quedan a la vista.
    for (const id of ['carrito-total', 'cobro-pagado', 'cobro-pendiente']) {
      const caja = await page.getByTestId(id).boundingBox()
      expect(caja.y + caja.height, id).toBeLessThanOrEqual(height)
    }
    const guardar = await page.getByTestId('pos-cobro').locator('button[type="submit"]').first().boundingBox()
    expect(guardar.y + guardar.height, 'guardar dentro de la pantalla').toBeLessThanOrEqual(height)
    await page.screenshot({ path: `${out}/after-${width}x${height}.png` })
    // Las listas se desplazan por dentro, no la página.
    await page.mouse.move(width * 0.75, height / 2)
    await page.mouse.wheel(0, 600)
    expect(await page.evaluate(() => window.scrollY + document.body.scrollTop)).toBe(0)
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
  await enterPos(page, 1440, 900, { items: 5 })
  const cobro = page.getByTestId('pos-cobro')
  await expect(page.locator('#observacion')).toHaveCount(0)
  await cobro.getByText('Agregar nota', { exact: true }).click()
  await expect(page.locator('#observacion')).toBeVisible()
  await cobro.getByText('Agregar nota', { exact: true }).click()
  await expect(page.locator('#observacion')).toHaveCount(0)
  // «Paga al recibir» comparte el bloque compacto de opciones.
  const entrega = await page.locator('#entrega').boundingBox()
  const paga = await cobro.getByTestId('pos-paga-al-recibir').boundingBox()
  expect(Math.abs((paga.y + paga.height / 2) - (entrega.y + entrega.height / 2)), 'paga al recibir en el mismo bloque compacto que la entrega').toBeLessThan(60)
  // Listo, ir a cobrar: la lista de productos se resume y el cobro gana altura.
  const altoCobroAntes = (await cobro.boundingBox()).height
  await page.getByTestId('carrito-listo').click()
  await expect(page.getByTestId('carrito-editar')).toBeVisible()
  await expect(page.getByTestId('pos-carrito-cuerpo')).toBeHidden()
  await expect(page.getByTestId('carrito-total')).toContainText('Gs 900.000')
  expect((await cobro.boundingBox()).height).toBeGreaterThanOrEqual(altoCobroAntes)
  await page.screenshot({ path: `${out}/listo-cobrar-1440.png` })
  await page.getByTestId('carrito-editar').click()
  await expect(page.getByTestId('pos-carrito-cuerpo')).toBeVisible()
})

test('divisor arrastrable: cambia el reparto catálogo/venta y se recuerda', async ({ page }) => {
  await enterPos(page, 1440, 900, { items: 2 })
  const antes = (await page.getByTestId('pos-bloque-productos').boundingBox()).width
  const d = await page.getByTestId('pos-divisor').boundingBox()
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
  await page.mouse.down()
  await page.mouse.move(d.x + 200, d.y + d.height / 2, { steps: 6 })
  await page.mouse.up()
  const despues = (await page.getByTestId('pos-bloque-productos').boundingBox()).width
  expect(despues).toBeGreaterThan(antes + 100)
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
