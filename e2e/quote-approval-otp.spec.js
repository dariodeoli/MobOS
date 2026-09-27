// A3 (#279) · Presupuestos con aprobación autenticada: el cliente abre el
// enlace seguro, revisa la versión congelada, pide el código al correo (se lee
// de la outbox real del arnés), firma opcional y aprueba: recién ahí se genera
// el pedido. Capturas del flujo completo.
//
// Capturas: `docs/qa/279-a3-aprobacion/` (se versionan con el cierre).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { codigoOtpDeCotizacion } from './helpers/otp-outbox.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_279_CAPTURAS || join('docs', 'qa', '279-a3-aprobacion')

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await respuesta.json().catch(() => null)
  return { status: respuesta.status, body }
}, { api: API, ruta, opciones })

test('#279 · presupuesto aprobado con OTP, versión congelada y pedido generado', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const marca = Date.now().toString(36).toUpperCase()

  // Cliente con correo (el OTP sale por ahí) y cotización con descuento.
  const telefono = `0985${String(Date.now()).slice(-6)}`
  const cliente = await apiPagina(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ name: `Cliente A3 ${marca}`, phone: telefono, countryCode: '+595', email: `a3-${marca.toLowerCase()}@example.invalid` }),
  })
  expect([200, 201], JSON.stringify(cliente.body)).toContain(cliente.status)
  const cotizacion = await apiPagina(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({
      customerId: cliente.body.id,
      customerName: cliente.body.name,
      validUntil: new Date(Date.now() + 2 * 86400000).toISOString(),
      items: [{ description: `iPhone 15 · 128 GB ${marca}`, quantity: 1, unitPricePyg: 4850000 }],
      discountPyg: 100000,
    }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  const quote = cotizacion.body

  // 1) Revisión de la versión congelada.
  await page.goto(`/cotizacion/${encodeURIComponent(quote.publicToken)}`)
  await expect(page.getByRole('heading', { name: quote.number })).toBeVisible({ timeout: 20_000 })
  const version = page.getByTestId('aprobacion-version')
  await expect(version).toContainText('Versión 1')
  await expect(version).toContainText('congelada')
  await expect(page.getByTestId('aprobacion-otp')).toBeVisible()
  await expect(page.getByText('Documento no fiscal')).toBeVisible()
  await page.screenshot({ path: join(DIR, '01-revision-version.png'), fullPage: true })

  // 2) Canal del código: solo correo (sin relay SMS en el arnés).
  await page.getByTestId('aprobacion-abrir').click()
  await expect(page.getByTestId('aprobacion-canal-email')).toBeVisible()
  await expect(page.getByTestId('aprobacion-canal-phone')).toHaveCount(0)
  await page.screenshot({ path: join(DIR, '02-canal-otp.png'), fullPage: true })

  // 3) El código viaja por la outbox real: se descifra para probar el flujo.
  await page.getByTestId('aprobacion-enviar').click()
  const campoCodigo = page.getByTestId('aprobacion-codigo')
  await expect(campoCodigo).toBeVisible({ timeout: 20_000 })
  const codigo = await codigoOtpDeCotizacion(quote.id)
  await campoCodigo.fill(codigo)
  await page.getByPlaceholder('Nombre y apellido').fill('Titular de la aprobación')
  await page.getByPlaceholder('CI o RUC').fill('80012345-6')
  await page.screenshot({ path: join(DIR, '03-codigo-ingresado.png'), fullPage: true })

  // 4) Firma dibujada opcional (no autentica sola).
  await page.getByTestId('aprobacion-firma-toggle').click()
  const canvas = page.getByTestId('aprobacion-firma-canvas')
  const caja = await canvas.boundingBox()
  await page.mouse.move(caja.x + 30, caja.y + 90)
  await page.mouse.down()
  await page.mouse.move(caja.x + 90, caja.y + 40, { steps: 8 })
  await page.mouse.move(caja.x + 150, caja.y + 100, { steps: 8 })
  await page.mouse.move(caja.x + 220, caja.y + 50, { steps: 8 })
  await page.mouse.up()
  await page.screenshot({ path: join(DIR, '04-firma-opcional.png'), fullPage: true })

  // 5) Aprobar: se genera el pedido con la versión revisada y queda la evidencia.
  await page.getByTestId('aprobacion-confirmar').click()
  const evidencia = page.getByTestId('aprobacion-evidencia')
  await expect(evidencia).toBeVisible({ timeout: 20_000 })
  await expect(evidencia).toContainText('Presupuesto aprobado')
  await expect(evidencia).toContainText('Se generó el pedido')
  await expect(evidencia).toContainText('hash')
  await page.screenshot({ path: join(DIR, '05-aprobacion-evidencia.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(evidencia).toBeVisible()
  await page.screenshot({ path: join(DIR, '06-aprobacion-evidencia-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })

  // Verificación real: la cotización quedó convertida y el pedido es el aprobado.
  const resuelta = await apiPagina(page, `/api/quotes?q=${encodeURIComponent(quote.number)}`)
  const fila = Array.isArray(resuelta.body) ? resuelta.body.find((row) => row.id === quote.id) : null
  expect(fila?.status).toBe('CONVERTED')
  expect(fila?.orderId).toBeTruthy()
  const pedido = await apiPagina(page, `/api/orders/${encodeURIComponent(fila.orderId)}`)
  expect(pedido.status).toBe(200)
  expect(Number(pedido.body.totalPyg)).toBe(4750000)
  expect(pedido.body.status).toBe('PENDING')
  expect(pedido.body.items?.[0]?.description).toContain(marca)

  // El enlace ya resuelto muestra la evidencia con su hash.
  await page.reload()
  await expect(page.getByTestId('aprobacion-evidencia')).toContainText('Se generó el pedido')
})

test('#279 · sin correo ni teléfono el enlace pide completar la ficha', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')
  const marca = Date.now().toString(36).toUpperCase()
  const cotizacion = await apiPagina(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente sin contacto ${marca}`, items: [{ description: 'Ítem sin contacto', quantity: 1, unitPricePyg: 200000 }] }),
  })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  await page.goto(`/cotizacion/${encodeURIComponent(cotizacion.body.publicToken)}`)
  const aviso = page.getByTestId('aprobacion-sin-contacto')
  await expect(aviso).toBeVisible({ timeout: 20_000 })
  await expect(aviso).toContainText('Pedile al vendedor')
  await page.screenshot({ path: join(DIR, '07-sin-contacto.png'), fullPage: true })
})
