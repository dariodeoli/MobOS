import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'

// #461 · datos y plata consistentes (demo frontend-only, sin backend):
//  · «Cobrar saldo» se ve siempre en el detalle del pedido y también cobra en la demo;
//  · Pagado/Saldo del detalle = suma de los pagos = ficha del cliente;
//  · el comprobante no imprime códigos internos y trae «Atendido por»;
//  · convertir una cotización toma un número de pedido nuevo y único.
async function entrar(page, rol = 'Dueño') {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, rol)
  await expect(page.getByTestId('shell')).toBeVisible()
  // La demo siembra sus ventas al entrar a una pantalla: se espera a que estén antes de leerlas.
  await openShellDestination(page, 'Inicio')
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().length)).toBeGreaterThan(15)
}

const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Un pedido demo con saldo: sus pagos, total y saldo salen de la misma fuente que ve la pantalla.
async function pedidoConSaldo(page) {
  return page.evaluate(async () => {
    const { listVentas } = await import('/src/lib/storage.js')
    const { totalesPedido } = await import('/src/utils/pedido.js')
    const venta = listVentas().find(v => v.id === 'demo-venta-hoy-partial')
    const totales = totalesPedido(venta)
    return { id: venta.id, numero: venta.orderNumber, clienteId: venta.clienteId, ...totales, pagos: (venta.pagos || []).map(p => Number(p.monto)) }
  })
}

async function abrirPedido(page, numero) {
  await openShellDestination(page, 'Pedidos')
  await page.getByText(numero, { exact: false }).first().click()
}

test('Cobrar saldo se ve en la demo y el detalle suma los pagos (antes: Pagado 0, sin botón)', async ({ page }) => {
  await entrar(page)
  const pedido = await pedidoConSaldo(page)
  expect(pedido.pendiente, 'el pedido demo tiene saldo').toBeGreaterThan(0)
  expect(pedido.pagado).toBe(pedido.pagos.reduce((suma, monto) => suma + monto, 0))
  await abrirPedido(page, pedido.numero)

  // Pagado y Saldo del encabezado = la suma de los pagos; el botón existe también en la demo.
  const detalle = page.locator('main')
  await expect(detalle).toContainText(`Gs ${miles(pedido.pagado)}`)
  await expect(detalle).toContainText(`Gs ${miles(pedido.pendiente)}`)
  const cobrar = page.getByTestId('pedido-cobrar')
  await expect(cobrar).toBeVisible()
  await expect(page.getByTestId('pedido-totales-f3')).toContainText(miles(pedido.pendiente))

  // Cobra el saldo completo: el detalle queda pagado, sin botón y sin saldo.
  await cobrar.click()
  const modal = page.getByRole('dialog').filter({ hasText: /^Pagos ·/ })
  await expect(modal).toBeVisible()
  await modal.getByLabel('Cuenta de destino').selectOption({ index: 1 })
  await modal.getByLabel('Monto del pago').fill(String(pedido.pendiente))
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByTestId('pago-aviso')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pedido-cobrar')).toHaveCount(0)

  // La ficha del cliente dice lo mismo que el detalle: sin deuda en ese pedido.
  const enFicha = await page.evaluate(async ({ clienteId, numero }) => {
    const { buscarClienteDemo } = await import('/src/lib/demoClientes.js')
    const fila = buscarClienteDemo(clienteId).demoProfile.orders.find(o => o.orderNumber === numero)
    return { cobrado: fila.collectedPyg, pendiente: fila.pendingPyg }
  }, { clienteId: pedido.clienteId, numero: pedido.numero })
  expect(enFicha.pendiente).toBe(0)
  expect(enFicha.cobrado).toBe(pedido.pagado + pedido.pendiente)
})

test('Inicio: «Cómo te pagaron» reparte por medio de pago, no 100% efectivo', async ({ page }) => {
  await entrar(page)
  await openShellDestination(page, 'Inicio')
  const tarjeta = page.getByTestId('inicio-medios-pago')
  await expect(tarjeta).toBeVisible()
  // Con ventas cobradas en efectivo, transferencia y tarjeta, más de un medio aparece en el gráfico.
  const texto = await tarjeta.textContent()
  const medios = ['Efectivo', 'Transferencia', 'Tarjeta / POS'].filter(medio => texto.includes(medio))
  expect(medios.length, `medios en el gráfico: ${texto}`).toBeGreaterThan(1)
})

test('Caja: Saldo esperado con su fórmula y la auditoría lo llama «Esperado del rango»', async ({ page }) => {
  await entrar(page)
  await page.goto('/finanzas/caja', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Saldo esperado').first()).toBeVisible()
  await expect(page.getByText('Apertura + efectivo en Gs ± movimientos del turno').first()).toBeVisible()
  await expect(page.getByText('Esperado del rango').first()).toBeVisible()
  await expect(page.getByText('Esperado en caja')).toHaveCount(0)
})

test('Convertir una cotización toma un número de pedido nuevo, sin «#» y sin repetir', async ({ page }) => {
  await entrar(page)
  const resultado = await page.evaluate(async () => {
    const { convertirDemoCotizacion } = await import('/src/lib/demoCotizacionConversion.js')
    const { listDemoQuotes } = await import('/src/lib/demo/cotizaciones.js')
    const { listVentas } = await import('/src/lib/storage.js')
    const antes = new Set(listVentas().map(v => v.orderNumber))
    const abiertas = listDemoQuotes().filter(q => ['ACCEPTED', 'SENT'].includes(q.status)).slice(0, 2)
    const numeros = []
    for (const q of abiertas) {
      const r = convertirDemoCotizacion(q.id, {})
      if (r) numeros.push(r.orderNumber)
    }
    return { numeros, repetidos: numeros.filter(n => antes.has(n)), filas: numeros.map(n => listVentas().filter(v => v.orderNumber === n).length) }
  })
  expect(resultado.numeros.length).toBeGreaterThan(0)
  expect(resultado.repetidos).toEqual([])
  expect(new Set(resultado.numeros).size).toBe(resultado.numeros.length)
  expect(resultado.filas.every(n => n === 1), 'un pedido = una fila').toBe(true)
  await openShellDestination(page, 'Pedidos')
  for (const numero of resultado.numeros) {
    await expect(page.getByText(numero, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(numero.replace('-', '-#'), { exact: true })).toHaveCount(0)
  }
})

test('Comprobante de un pedido retirado: «Retirado» y «Atendido por», sin códigos internos ni «#»', async ({ page }) => {
  await entrar(page)
  const html = await page.evaluate(async () => {
    const { listVentas } = await import('/src/lib/storage.js')
    const { buildOrderReceiptHtml } = await import('/src/components/shared/OrderReceipt.jsx')
    const venta = listVentas().find(v => v.fulfillmentStatus === 'PICKED_UP' && (v.pagos || []).length > 0)
    return buildOrderReceiptHtml(venta, { level: 'completo', format: 'a4' })
  })
  expect(html).toContain('Retirado')
  expect(html).not.toContain('PICKED_UP')
  expect(html).not.toMatch(/[A-Z]{2,3}-#\d{4}/)
  expect(html).toMatch(/Atendido por/)
  expect(html).not.toContain('Registrado por Sistema')
})
