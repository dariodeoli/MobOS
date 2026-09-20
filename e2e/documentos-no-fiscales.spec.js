// Documentos no fiscales (nota de entrega, remisión, recibo interno y
// proforma): el disparo desde la UI arma el ticket ESC/POS y lo manda por el
// camino real de impresión (agente local). Sin impresora: el agente se simula,
// igual que en los e2e de impresión, y se inspeccionan los bytes enviados.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function apiPagina(page, ruta, opciones = {}) {
  return page.evaluate(
    async ({ api, ruta, opciones }) => {
      const respuesta = await fetch(`${api}${ruta}`, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...opciones,
      })
      const datos = await respuesta.json().catch(() => null)
      return { status: respuesta.status, datos }
    },
    { api: API, ruta, opciones },
  )
}

// Agente local simulado: /health dice presente y /print guarda el cuerpo que
// mandó la app (mismo camino que usan los e2e de impresión, sin impresora).
async function agenteFalso(page, capturados) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-mobos-print-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  await page.route('http://127.0.0.1:17890/**', (ruta) => {
    const peticion = ruta.request()
    if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cors })
    if (peticion.url().includes('/health')) {
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.6.3', equipo: 'e2e' }) })
    }
    if (peticion.method() === 'POST' && peticion.url().endsWith('/print')) {
      capturados.push(JSON.parse(peticion.postData() || '{}'))
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    }
    return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
  })
}

// El payload viaja en base64; se decodifica como lo haría el puente falso.
const textoDelTicket = (capturado) => Buffer.from(String(capturado?.data || ''), 'base64').toString('latin1')

test('la nota de entrega de un pedido sale por el agente con leyenda no fiscal', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/pos/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  const id = page.url().split('/').pop()
  const orden = await page.evaluate(async ({ api, id }) => {
    const filas = await (await fetch(`${api}/api/orders`, { credentials: 'include' })).json()
    return filas.find((fila) => fila.id === id)
  }, { api: API, id })

  await page.getByRole('button', { name: 'Nota de entrega' }).click()
  await expect(page.getByText('Nota de entrega enviada a la impresora')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('nota-entrega')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('Nota de entrega')
  expect(texto).toContain('Documento no fiscal')
  expect(texto).toContain(orden.orderNumber)
})

test('la remisión interna de un traslado sale por el agente con firmas', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/pos/resumen')
  const marca = Date.now()
  const destino = await apiPagina(page, '/api/branches', { method: 'POST', body: JSON.stringify({ name: `Sucursal remision ${marca}` }) })
  expect(destino.status).toBe(201)
  const serial = `E2E-REM-${marca}`
  const producto = await apiPagina(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `E2E-REM-SKU-${marca}`, name: `Equipo remision ${marca}`, pricePyg: 100000, stock: 1, branchId: 'e2e-branch-1', imei: serial }) })
  expect(producto.status).toBe(201)
  const traslado = await apiPagina(page, '/api/transfers', { method: 'POST', body: JSON.stringify({ sourceBranchId: 'e2e-branch-1', destinationBranchId: destino.datos.id, lines: [{ productId: producto.datos.id, quantity: 1, serials: [serial] }] }) })
  expect(traslado.status).toBe(201)

  await page.goto('/inventario/traslados')
  const fila = page.getByTestId('traslado-fila').filter({ hasText: `Equipo remision ${marca}` }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Remisión' }).click()
  await expect(page.getByText('Remisión enviada a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('remision')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toMatch(/Remisi.n interna/)
  expect(texto).toContain('Documento no fiscal')
  // El backend normaliza el serial sin guiones; el nombre largo se envuelve.
  expect(texto).toContain(serial.replace(/-/g, ''))
  expect(texto).toContain('Sucursal remision')
  expect(texto).toContain(String(marca))
})

test('el recibo interno de un cobro sale por el agente con el monto', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/pos/resumen')
  const marca = Date.now()
  const cliente = `Cliente recibo ${marca}`
  const pedido = await apiPagina(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer: { name: cliente },
      items: [{ description: `Equipo recibo ${marca}`, quantity: 1, unitPricePyg: 250000 }],
      payment: { method: 'CASH', amountPyg: 250000 },
    }),
  })
  expect(pedido.status).toBe(201)

  await page.goto('/pos/resumen')
  const fila = page.getByRole('row').filter({ hasText: cliente }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByLabel('Pagos').click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Recibo interno' }).first().click()
  await expect(page.getByText('Recibo interno enviado a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('recibo-interno')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('Recibo interno')
  expect(texto).toContain('Documento no fiscal')
  expect(texto).toContain(cliente)
  expect(texto).toContain('Gs 250.000')
})

test('la proforma de una cotización sale por el agente sin validez fiscal', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/pos/resumen')
  const marca = Date.now()
  const cotizacion = await apiPagina(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerName: `Cliente proforma ${marca}`, items: [{ description: `Equipo proforma ${marca}`, quantity: 1, unitPricePyg: 300000 }] }),
  })
  expect(cotizacion.status).toBe(201)

  await page.goto('/pos/cotizaciones')
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: cotizacion.datos.number }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Enlace/QR' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByAltText('QR de la cotización')).toBeVisible({ timeout: 20_000 })
  await dialogo.getByRole('button', { name: 'Proforma' }).click()
  await expect(page.getByText('Proforma enviada a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('proforma')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('Factura proforma')
  expect(texto).toContain('Documento no fiscal')
  expect(texto).toContain(cotizacion.datos.number)
})
