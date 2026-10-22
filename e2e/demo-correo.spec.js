// Demo · correo real (pedido de Dario): al crear un pedido con correo de cliente y al
// avisar un cambio de estado, la demo pide UN correo al endpoint público
// `/api/public/demo-email`. En CI el envío está SIMULADO: la ruta se intercepta en el
// navegador (nunca sale un correo real) y se verifica el cuerpo estructurado, el aviso
// «Te enviamos el correo a X», el motivo cuando la cuota se agota y la vista previa
// cuando el envío real está apagado.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'
import { ensureCobro } from './helpers/ensure-cobro.js'
import { openShellDestination } from './helpers/shell-navigation.js'

const CORREO = 'comprador.demo@gmail.com'
const RUTA = '**/api/public/demo-email'

const cors = (request) => ({
  'access-control-allow-origin': request.headers().origin || '*',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'POST, OPTIONS',
})

/** Intercepta el endpoint: `respuesta()` decide el resultado y se guardan los cuerpos recibidos. */
async function simularEnvio(page, respuesta) {
  const pedidos = []
  await page.route(RUTA, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(request) })
    pedidos.push(JSON.parse(request.postData() || '{}'))
    const { status, body, headers = {} } = respuesta()
    return route.fulfill({ status, contentType: 'application/json', headers: { ...cors(request), ...headers }, body: JSON.stringify(body) })
  })
  return pedidos
}

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

async function ventaConCorreo(page) {
  await openShellDestination(page, 'POS')
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: /Funda/i }).first().click()
  await ensureCobro(page)
  await page.locator('input[placeholder="Buscar cliente o escribir un nombre nuevo"]').fill('Cliente Correo Demo')
  await page.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await page.getByLabel('Correo del cliente').fill(CORREO)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeHidden()
  await page.getByRole('button', { name: /Confirmar venta|Crear pedido/ }).last().click()
  await expect(page).toHaveURL(/\/pedidos\//, { timeout: 15_000 })
}

test('demo: la venta con correo envía el comprobante y avisa «Te enviamos el correo»', async ({ page }) => {
  const pedidos = await simularEnvio(page, () => ({ status: 200, body: { sent: true, kind: 'receipt' } }))
  await entrarDemo(page)
  await ventaConCorreo(page)

  await expect(page.getByText(`Te enviamos el correo a ${CORREO}`)).toBeVisible({ timeout: 15_000 })
  expect(pedidos.length).toBeGreaterThanOrEqual(1)
  const comprobante = pedidos[0]
  expect(comprobante.kind).toBe('receipt')
  expect(comprobante.email).toBe(CORREO)
  expect(comprobante.customerName).toBe('Cliente Correo Demo')
  expect(comprobante.number).toMatch(/^[A-Za-z]{2,5}-?#?\d+$/)
  expect(comprobante.items.length).toBeGreaterThan(0)
  expect(comprobante.totalPyg).toBeGreaterThan(0)
  // Solo datos estructurados: ningún texto libre ni adjuntos.
  expect(Object.keys(comprobante).sort()).toEqual(expect.arrayContaining(['customerName', 'email', 'items', 'kind', 'number', 'totalPyg']))
  expect(Object.keys(comprobante).every((clave) => ['customerName', 'discountPyg', 'email', 'items', 'kind', 'number', 'totalPyg', 'validUntil'].includes(clave))).toBe(true)
})

test('demo: cuota agotada muestra el motivo y el apagado deja la vista previa', async ({ page }) => {
  let modo = 'cuota'
  await simularEnvio(page, () => modo === 'cuota'
    ? { status: 429, headers: { 'retry-after': '7200' }, body: { message: 'Ya te enviamos varios correos de la demo a esa dirección hoy. Probá con otro correo o volvé mañana.', details: { code: 'demo_rate_limited_recipient' } } }
    : { status: 503, body: { message: 'El envío de correos de la demo está desactivado.', details: { code: 'demo_email_disabled' } } })
  await entrarDemo(page)
  await ventaConCorreo(page)

  // Aviso por estado desde el detalle del pedido: la cuota agotada se explica.
  await page.getByTestId('avisar-correo').click()
  const estado = page.getByTestId('correo-demo-estado')
  await expect(estado).toContainText('No se envió el correo')
  await expect(estado).toContainText('volvé mañana')
  await page.getByRole('button', { name: 'Cerrar' }).last().click()

  // Envío real apagado: la demo muestra el correo en el popup como hoy, sin error.
  modo = 'apagado'
  await page.getByTestId('avisar-correo').click()
  await expect(page.getByTestId('correo-vista')).toContainText('Demo: no se envía nada')
  await expect(page.getByTestId('correo-vista')).toContainText(CORREO)
  await expect(page.getByTestId('correo-demo-estado')).toHaveCount(0)
})
