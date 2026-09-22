// #236 — Clientes estilo Pedidos: filas con datos clave (contacto, tipo, total
// gastado, pedidos, última compra, deuda) y DOS accesos por cliente: el ojito
// abre el resumen rápido (popup) y el ícono de detalle el perfil completo
// (CustomerProfile). Cuenta real del harness (no demo), sin tocar otras fichas.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-236-clientes'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('clientes: fila estilo Pedidos con resumen rápido y detalle completo', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const nombre = `Cliente Vista ${marca}`

  // Cliente con contacto, tipo, tags y dirección + un pedido con saldo (deuda).
  const alta = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Cliente', secondName: `Vista ${marca}`,
      phone: `0981${String(Date.now()).slice(-6)}`, countryCode: '+595',
      email: `vista.${marca.toLowerCase()}@correo.com.py`, document: `CI-${marca}`,
      tags: ['prioridad'],
      addresses: [{ label: 'Casa', address: 'Av. Siempre Viva 742', city: 'Asunción', department: 'Capital', country: 'Paraguay', isDefault: true }],
    }),
  })
  expect([200, 201], JSON.stringify(alta.body)).toContain(alta.status)
  const clienteId = alta.body.id
  const productos = await api(page, '/api/products')
  const lista = Array.isArray(productos.body) ? productos.body : productos.body?.rows || []
  const producto = lista.find((row) => row.stock > 0) || lista[0]
  const pedido = await api(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber: `QA236-${marca}`,
      customerId: clienteId,
      items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: 300000 }],
      payment: { method: 'CASH', amountPyg: 100000 },
    }),
  })
  expect([200, 201], JSON.stringify(pedido.body)).toContain(pedido.status)

  // Fila: datos clave a la vista.
  await page.getByLabel('Buscar clientes').fill(marca)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await expect(fila).toBeVisible()
  await expect(fila).toContainText('Cliente final')
  await expect(fila).toContainText('+595 981')
  await expect(fila).toContainText('1')            // pedidos
  await expect(fila).toContainText('Gs 300.000')   // total gastado
  await expect(fila).toContainText('Gs 200.000')   // deuda (pendiente)
  await expect(fila).toContainText(/\d{1,2} [a-z]{3}/i) // última compra compacta
  // Los tres accesos, con aria/tooltip.
  await expect(fila.getByRole('button', { name: `Resumen rápido de ${nombre}` })).toBeVisible()
  await expect(fila.getByRole('button', { name: `Ver detalle completo de ${nombre}` })).toBeVisible()
  await expect(fila.getByRole('button', { name: `Enviar WhatsApp a ${nombre}` })).toBeVisible()
  // La selección por lote sigue disponible.
  await fila.getByRole('checkbox', { name: `Seleccionar a ${nombre}` }).check()
  await expect(page.getByRole('button', { name: 'Copiar teléfonos' })).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-despues-lista.png` })
  await fila.getByRole('checkbox', { name: `Seleccionar a ${nombre}` }).uncheck()

  // (1) El ojito abre el resumen rápido (popup rediseñado).
  await fila.getByRole('button', { name: `Resumen rápido de ${nombre}` }).click()
  const popup = page.getByRole('dialog', { name: `Cliente: ${nombre}` })
  await expect(popup).toBeVisible()
  await expect(popup.getByText('Total gastado')).toBeVisible()
  await expect(popup.getByText('Gs 300.000').first()).toBeVisible()
  await expect(popup.getByText('Deuda')).toBeVisible()
  await expect(popup.getByText('Gs 200.000').first()).toBeVisible()
  await expect(popup.getByText('Últimas compras')).toBeVisible()
  await expect(popup.getByText(new RegExp(`QA236-${marca}`)).first()).toBeVisible()
  await expect(popup.getByText('Nota interna')).toHaveCount(0)
  await expect(popup.getByRole('button', { name: 'Editar' })).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-despues-popup.png` })

  // «Ver detalle completo» → perfil completo (CustomerProfile) en Resumen.
  await popup.getByRole('button', { name: 'Ver detalle completo' }).click()
  await expect(page.getByRole('tab', { name: /^Resumen/ })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('tab', { name: /^Estadísticas/ })).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-despues-detalle-completo.png` })
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Resumen/ })).toHaveCount(0)

  // El ícono de detalle abre el perfil directo.
  await fila.getByRole('button', { name: `Ver detalle completo de ${nombre}` }).click()
  await expect(page.getByRole('tab', { name: /^Resumen/ })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  // «Editar» del popup entra al perfil por la pestaña Datos.
  await fila.getByRole('button', { name: `Resumen rápido de ${nombre}` }).click()
  await popup.getByRole('button', { name: 'Editar' }).click()
  const tabDatos = page.getByRole('tab', { name: /^Datos/ })
  await expect(tabDatos).toBeVisible({ timeout: 15000 })
  await expect(tabDatos).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: `${SALIDA}/05-despues-editar-datos.png` })
})
