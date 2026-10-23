import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'

// Detalle del pedido estilo Shopify (demo frontend-only, sin backend):
//  · cabecera: «‹ Pedidos», #número con chips de pago y entrega, subtítulo en una línea,
//    «Imprimir» + «Más acciones» y sin «Riesgo del pedido» ni «Resumen de conversión»;
//  · imprimir en la demo: nota de entrega, comprobante A4 y ticket 80 mm con banda «Demo»;
//  · el último formato queda guardado por usuario;
//  · pago con «Cobrar» y «Enviar aviso de pago»; cronología con comentario interno (demo local).
async function entrar(page, rol = 'Dueño') {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/**', route => (!new URL(route.request().url()).pathname.startsWith('/api/')
    ? route.continue()
    : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' })))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => { sessionStorage.setItem('mobos:demo-guia-vista', '1'); localStorage.setItem('mobos:aviso-metricas', '1') })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, rol)
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Inicio')
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().length)).toBeGreaterThan(15)
}

async function abrirPedidoConSaldo(page) {
  const numero = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().find(v => v.id === 'demo-venta-hoy-partial').orderNumber)
  await openShellDestination(page, 'Pedidos')
  await page.getByText(numero, { exact: false }).first().click()
  await expect(page.getByTestId('pedido-detalle-f3')).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  return numero
}

// La impresión del navegador escribe el documento en un iframe oculto: se lee de ahí.
async function ultimoDocumentoImpreso(page) {
  return page.evaluate(() => {
    const marcos = [...document.querySelectorAll('iframe[aria-hidden="true"]')]
    const doc = marcos.at(-1)?.contentDocument
    return doc ? { html: doc.documentElement.outerHTML, titulo: doc.title, cantidad: marcos.length } : null
  })
}

async function imprimirDesdeMenu(page, nombre) {
  await page.getByRole('button', { name: 'Elegir formato de impresión' }).click()
  await page.getByRole('menuitem', { name: nombre }).click()
}

test('cabecera Shopify: Pedidos, #número con chips, subtítulo, Imprimir y Más acciones', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  const cabecera = page.getByTestId('record-header')
  await expect(cabecera.getByRole('button', { name: /Volver a pedidos/i })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^#[A-Z]{2,}-\d+/)
  await expect(page.getByTestId('pedido-chip-pago')).toHaveText(/Pago parcial|Pago pendiente|Pagado/)
  await expect(page.getByTestId('pedido-chips').locator('.mobos-chip-cambia, [class*="badge"]').first()).toBeVisible()
  const subtitulo = page.getByTestId('pedido-subtitulo')
  await expect(subtitulo).toContainText('·')
  expect((await subtitulo.boundingBox()).height, 'el subtítulo es una sola línea').toBeLessThan(30)
  await expect(cabecera.getByRole('button', { name: /^Imprimir/ }).first()).toBeVisible()
  await expect(cabecera.getByRole('button', { name: /^Más acciones/ })).toBeVisible()
  await expect(page.getByText(/Riesgo del pedido|Resumen de conversión/)).toHaveCount(0)
  await esperarAnimaciones(page)
  await page.screenshot({ path: 'docs/rediseno/pedido-shopify-despues.png' })
  await cabecera.getByRole('button', { name: /^Más acciones/ }).click()
  for (const nombre of [/Ver página de estado/, /Imprimir comprobante A4/, /Imprimir ticket 80 mm/, /Imprimir nota de entrega/, /Imprimir página del pedido/]) {
    await expect(page.getByRole('menuitem', { name: nombre })).toBeVisible()
  }
})

test('demo: imprime nota de entrega, comprobante A4 y ticket 80 mm sin error y con banda Demo', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  await imprimirDesdeMenu(page, 'Nota de entrega')
  await expect.poll(async () => (await ultimoDocumentoImpreso(page))?.titulo || '').toContain('Nota de entrega')
  let documento = await ultimoDocumentoImpreso(page)
  expect(documento.html).toContain('banda-demo')

  await imprimirDesdeMenu(page, 'Comprobante A4')
  await expect.poll(async () => (await ultimoDocumentoImpreso(page))?.cantidad).toBe(2)
  documento = await ultimoDocumentoImpreso(page)
  expect(documento.html).toContain('banda-demo')
  expect(documento.html).toMatch(/size:\s*A4/)

  await imprimirDesdeMenu(page, 'Ticket 80 mm')
  await expect.poll(async () => (await ultimoDocumentoImpreso(page))?.cantidad).toBe(3)
  documento = await ultimoDocumentoImpreso(page)
  expect(documento.html).toContain('banda-demo')
  expect(documento.html).toMatch(/size:\s*80mm/)
  await expect(page.getByText(/No se pudo/)).toHaveCount(0)
})

test('Imprimir usa el último formato de cada usuario', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  const principal = page.getByTestId('pedido-imprimir-principal')
  // Sin historial: el predeterminado de la empresa.
  await expect(principal).toHaveAttribute('title', /Imprimir: (Ticket 80 mm|Comprobante A4)/)
  await imprimirDesdeMenu(page, 'Nota de entrega')
  await expect(principal).toHaveAttribute('title', 'Imprimir: Nota de entrega')
  await principal.click()
  await expect.poll(async () => (await ultimoDocumentoImpreso(page))?.cantidad).toBe(2)
  expect((await ultimoDocumentoImpreso(page)).titulo).toContain('Nota de entrega')
  const dueno = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([clave]) => clave.startsWith('mobos:pedido:impresion:'))))
  expect(Object.values(dueno)).toEqual(['nota-entrega'])

  // Otro usuario en la misma computadora: su memoria es propia.
  await openShellDestination(page, 'Inicio')
  await page.getByTestId('demo-perspectivas-toggle').click()
  await page.getByTestId('demo-ver-como-menu').getByRole('menuitemradio', { name: /Vendedor/ }).click()
  await page.waitForFunction(() => sessionStorage.getItem('mobos:demo-session:role') === 'VENDEDOR')
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByTestId('pedido-detalle-f3')).toBeVisible()
  await expect(page.getByTestId('pedido-imprimir-principal')).not.toHaveAttribute('title', 'Imprimir: Nota de entrega')
  await imprimirDesdeMenu(page, 'Comprobante A4')
  await expect(page.getByTestId('pedido-imprimir-principal')).toHaveAttribute('title', 'Imprimir: Comprobante A4')
  const ambos = await page.evaluate(() => Object.entries(localStorage).filter(([clave]) => clave.startsWith('mobos:pedido:impresion:')).map(([, valor]) => valor).sort())
  expect(ambos).toEqual(['a4', 'nota-entrega'])
})

test('pago: encabezado de estado, Cobrar, Enviar aviso de pago y tabla compacta', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  const pago = page.getByTestId('pedido-pago')
  await expect(pago.getByTestId('pedido-pago-estado')).toHaveText(/Pago parcial|Pago pendiente|En verificación/)
  await expect(pago.getByRole('button', { name: 'Cobrar', exact: true })).toBeVisible()
  await expect(pago.getByTestId('pedido-aviso-pago')).toBeVisible()
  await expect(pago.getByRole('button', { name: 'Más acciones del pago' })).toBeVisible()
  const totales = pago.getByTestId('pedido-totales-f3')
  for (const rotulo of ['Subtotal', 'Total', 'Pagado', 'Saldo']) await expect(totales).toContainText(rotulo)
  expect((await totales.boundingBox()).width, 'tabla acotada').toBeLessThanOrEqual(540)
  await expect(pago.getByTestId('pedido-transaccion').first()).toBeVisible()
  await pago.getByRole('button', { name: 'Cobrar', exact: true }).click()
  await expect(page.getByRole('dialog').filter({ hasText: /^Pagos ·/ })).toBeVisible()
})

test('artículos: miniatura, cantidad y producto que abre su ficha', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  const articulo = page.getByTestId('pedido-articulo').first()
  await expect(articulo.getByTestId('foto-producto')).toBeVisible()
  await expect(articulo).toContainText('×')
  await expect(articulo.getByLabel(/^Cantidad \d+/)).toBeVisible()
  const ficha = articulo.getByTestId('pedido-articulo-ficha')
  if (await ficha.count()) {
    await ficha.click()
    await expect(page).toHaveURL(/\/productos\?producto=/)
  }
})

test('cronología: comentario interno con avatar, Publicar y eventos por día', async ({ page }) => {
  await entrar(page)
  await abrirPedidoConSaldo(page)
  const cronologia = page.getByTestId('pedido-cronologia')
  const publicar = cronologia.getByRole('button', { name: 'Publicar' })
  await expect(publicar).toBeDisabled()
  await expect(cronologia.getByText('Solo vos y el equipo ven los comentarios.')).toBeVisible()
  await cronologia.getByLabel('Comentario del pedido').fill('El cliente retira el viernes por la tarde')
  await expect(publicar).toBeEnabled()
  await publicar.click()
  await expect(cronologia.getByTestId('pedido-evento').filter({ hasText: 'El cliente retira el viernes por la tarde' })).toBeVisible()
  await expect(publicar).toBeDisabled()
  await expect(cronologia.getByTestId('pedido-cronologia-dia').first().getByRole('heading', { name: /Hoy|Ayer|\d{4}/ })).toBeVisible()
  // Detalle expandible de un movimiento.
  const detalle = cronologia.getByTestId('pedido-evento-detalle').first()
  await detalle.click()
  await expect(detalle).toHaveAttribute('aria-expanded', 'true')
})
