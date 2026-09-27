// Cotización pública (aceptar/rechazar) y remito público de transferencia con
// recepción desde el QR. El panel genera el enlace y el cliente/destino lo
// resuelve sin sesión, una sola vez por documento.

import { test, expect } from '@playwright/test'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la cotización pública se acepta una sola vez y el enlace se regenera', async ({ page }) => {
  await page.goto('/resumen')
  const marca = Date.now()
  const creada = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente QR ${marca}`, items: [{ description: 'Equipo QR', quantity: 1, unitPricePyg: 300000 }] }),
  })
  expect(creada.status).toBe(201)
  const token = creada.body.publicToken
  expect(token).toBeTruthy()

  await page.goto(`/cotizacion/${token}`)
  await expect(page.getByRole('heading', { name: creada.body.number })).toBeVisible()
  await expect(page.getByText('Equipo QR')).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar cotización' }).click()
  await expect(page.getByText('Aceptada', { exact: true })).toBeVisible()

  const doble = await api(page, `/api/quotes/public/${token}`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) })
  expect(doble.status).toBe(409)

  // El modal interno muestra el QR y regenerar invalida el enlace anterior.
  await page.goto('/cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: creada.body.number }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  await expect(page.getByAltText('QR de la cotización')).toBeVisible()
  await page.getByRole('button', { name: 'Regenerar' }).click()
  await expect(page.getByText('Enlace regenerado: el anterior dejó de funcionar.')).toBeVisible()

  const viejo = await api(page, `/api/quotes/public/${token}`)
  expect(viejo.status).toBe(404)
})

// PDF profesional para compartir (con POS): desde el mismo modal (Enlace/QR) el
// vendedor baja o comparte la cotización como PDF real (A4, identidad de marca y
// el QR de aceptación). Sin Web Share de archivos en el arnés, cae a descarga.
test('la cotización se descarga como PDF para compartir', async ({ page }) => {
  const marca = Date.now()
  await page.goto('/resumen')
  const creada = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente PDF ${marca}`, items: [{ description: 'Equipo PDF', quantity: 1, unitPricePyg: 450000 }] }),
  })
  expect(creada.status).toBe(201)
  expect(creada.body.publicToken).toBeTruthy()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })
  await page.goto('/cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: creada.body.number }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  const modal = page.getByRole('dialog', { name: `Enlace de ${creada.body.number}` })
  await expect(modal.getByTestId('compartir-pdf')).toBeVisible()

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByTestId('compartir-pdf').click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^cotizacion-.*\.pdf$/)
  const pdf = readFileSync(await descarga.path())
  expect(pdf.length).toBeGreaterThan(5_000)
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(pdf.toString('latin1')).toContain('/Type /Page')
  await expect(page.getByText('PDF descargado')).toBeVisible({ timeout: 15_000 })

  const [directo] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByTestId('descargar-pdf').click(),
  ])
  expect(directo.suggestedFilename()).toMatch(/^cotizacion-.*\.pdf$/)
  if (process.env.QA_OUT) {
    mkdirSync(process.env.QA_OUT, { recursive: true })
    copyFileSync(await directo.path(), join(process.env.QA_OUT, 'cotizacion.pdf'))
  }
})

// #261: envío por WhatsApp (mensaje profesional + PDF adjunto, con wa.me como
// respaldo cuando el navegador no comparte archivos) y la cotización queda
// marcada como enviada (SENT).
test('la cotización se envía por WhatsApp con el PDF y queda enviada', async ({ page }) => {
  const marca = Date.now()
  await page.goto('/resumen')
  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'WA', secondName: `QA ${marca}`, phone: `0981${String(marca).slice(-6)}`, countryCode: '+595' }),
  })
  expect([200, 201], JSON.stringify(cliente.body)).toContain(cliente.status)
  const creada = await api(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerId: cliente.body.id, customerName: cliente.body.name || `WA QA ${marca}`, items: [{ description: 'Equipo WhatsApp', quantity: 1, unitPricePyg: 250000 }] }),
  })
  expect(creada.status).toBe(201)

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true })
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    window.__wa = []
    window.open = (url) => { window.__wa.push(String(url)); return null }
  })

  await page.goto('/cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: creada.body.number }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  const modal = page.getByRole('dialog', { name: `Enlace de ${creada.body.number}` })

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByTestId('cotizacion-whatsapp').click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^cotizacion-.*\.pdf$/)
  const pdf = readFileSync(await descarga.path())
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  // Sin Web Share cae al respaldo: PDF descargado + wa.me con el mensaje.
  const abierto = await page.evaluate(() => window.__wa || [])
  expect(abierto.length).toBe(1)
  expect(abierto[0]).toContain('https://wa.me/595981')
  const mensaje = decodeURIComponent(abierto[0])
  expect(mensaje).toContain('te comparto la cotización')
  expect(mensaje).toContain('/cotizacion/')

  // El estado quedó en SENT (enviada).
  const lista = await api(page, '/api/quotes')
  const filas = Array.isArray(lista.body) ? lista.body : lista.body?.quotes || lista.body?.rows || []
  const cotizacion = filas.find((fila) => fila.number === creada.body.number)
  expect(cotizacion?.status).toBe('SENT')
})

test('el remito público confirma la recepción y suma el stock de destino', async ({ page }) => {
  await page.goto('/resumen')
  const marca = Date.now()
  const destino = await api(page, '/api/branches', { method: 'POST', body: JSON.stringify({ name: `Sucursal remito ${marca}` }) })
  expect(destino.status).toBe(201)
  const serial = `E2E-REM-${marca}`
  const sku = `E2E-REM-SKU-${marca}`
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku, name: `Equipo remito ${marca}`, pricePyg: 100000, stock: 1, branchId: 'e2e-branch-1', imei: serial }) })
  expect(producto.status).toBe(201)
  const traslado = await api(page, '/api/transfers', { method: 'POST', body: JSON.stringify({ sourceBranchId: 'e2e-branch-1', destinationBranchId: destino.body.id, lines: [{ productId: producto.body.id, quantity: 1, serials: [serial] }] }) })
  expect(traslado.status).toBe(201)
  const token = traslado.body.publicToken
  expect(token).toBeTruthy()

  await page.goto(`/remito/${token}`)
  await expect(page.getByText(`Equipo remito ${marca}`)).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByText(/Recepción confirmada/)).toBeVisible()

  const doble = await api(page, `/api/transfers/public/${token}`, { method: 'POST', body: JSON.stringify({ action: 'receive' }) })
  expect(doble.status).toBe(409)

  // El catálogo viene paginado (200) y ordenado por nombre: con cientos de
  // productos de corridas previas la fila podía quedar fuera de la página y el
  // test era inestable. Se busca por SKU (único) y se espera el stock.
  await expect.poll(async () => {
    const productos = await api(page, `/api/products?q=${encodeURIComponent(sku)}`)
    const enDestino = (productos.body || []).find((row) => row.sku === sku && row.branchId === destino.body.id)
    return enDestino?.stock
  }, { message: 'la sucursal destino tiene que sumar el stock del remito', timeout: 15_000 }).toBe(1)

  // El panel ofrece el QR del remito para imprimirlo o compartirlo.
  await page.goto('/inventario/traslados')
  const fila = page.getByTestId('traslado-fila').filter({ hasText: `Equipo remito ${marca}` }).first()
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  await expect(page.getByAltText('QR del remito')).toBeVisible()
})
