// #240 §3 (con INV) — El certificado embebible también alimenta el seguimiento
// del informe compartido: la primera apertura con `?embed=1` queda registrada
// con ese origen, la ficha muestra el visto/no visto y la cronología el detalle.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'docs/QA-240-informe-embebible'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('la apertura del certificado embebible deja el visto con su origen', async ({ page, context }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const serial = `356790${String(Date.now()).slice(-9)}`

  const alta = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Embed', secondName: `QA ${marca}`, phone: `0985${String(Date.now()).slice(-6)}`, countryCode: '+595' }),
  })
  expect([200, 201], JSON.stringify(alta.body)).toContain(alta.status)
  const productos = await api(page, '/api/products')
  const lista = Array.isArray(productos.body) ? productos.body : productos.body?.rows || []
  const producto = lista.find((row) => row.stock > 0) || lista[0]
  const sucursales = await api(page, '/api/branches')
  const listaSucursales = Array.isArray(sucursales.body) ? sucursales.body : sucursales.body?.rows || []
  const sucursal = listaSucursales[0]?.id
  const unidad = await api(page, '/api/inventory-units', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.id, serial, condition: 'USED', batteryHealth: 91, notes: 'Ingreso QA embebible', ...(sucursal ? { branchId: sucursal } : {}) }),
  })
  expect([200, 201], JSON.stringify(unidad.body)).toContain(unidad.status)
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA240E-${marca}`,
      customerId: alta.body.id,
      items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: 500000, inventoryUnitSerials: [serial] }],
      payment: { method: 'CASH', amountPyg: 500000 },
    }),
  })
  expect([200, 201], JSON.stringify(pedido.body)).toContain(pedido.status)
  const envio = await api(page, `/api/customers/${encodeURIComponent(alta.body.id)}/device-report`, {
    method: 'POST',
    body: JSON.stringify({ serial, model: producto.name || producto.nombre, canal: 'WHATSAPP' }),
  })
  expect(envio.status, JSON.stringify(envio.body)).toBe(200)

  // El sitio externo abre el certificado embebible: primera apertura con embed=1.
  const embebido = await context.newPage()
  await embebido.goto(`/u/${encodeURIComponent(serial)}?embed=1`)
  await expect(embebido.getByText('Informe de dispositivo')).toBeVisible({ timeout: 20000 })
  await expect(embebido.getByText(new RegExp(`${serial.slice(0, 4)}…${serial.slice(-3)}`)).first()).toBeVisible()
  await embebido.screenshot({ path: `${SALIDA}/01-certificado-embebible.png`, fullPage: true })
  await embebido.close()

  // El visto queda con el origen del certificado embebido.
  const perfil = await api(page, `/api/customers/${encodeURIComponent(alta.body.id)}`)
  const fila = (perfil.body?.deviceReportShares || []).find((row) => row.serial === serial.toUpperCase())
  expect(fila?.firstViewedAt, JSON.stringify(perfil.body?.deviceReportShares)).toBeTruthy()
  const linea = await api(page, `/api/customers/${encodeURIComponent(alta.body.id)}/timeline?limit=20`)
  expect(JSON.stringify(linea.body)).toContain('Informe del equipo visto por el cliente')
  expect(JSON.stringify(linea.body)).toContain('abierto desde el certificado embebido')

  await page.goto(`/clientes?cliente=${encodeURIComponent(alta.body.id)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  const filaVisto = ficha.getByTestId('perfil-dispositivo-fila').filter({ hasText: serial.slice(-6) }).first()
  await expect(filaVisto.getByTestId('informe-seguimiento')).toHaveText('Visto', { timeout: 15000 })
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  const evento = ficha.getByText('Informe del equipo visto por el cliente').first()
  await expect(evento).toBeVisible({ timeout: 15000 })
  await expect(ficha.getByText(/abierto desde el certificado embebido/).first()).toBeVisible()
  await evento.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SALIDA}/02-cronologia-certificado-embebido.png` })
})
