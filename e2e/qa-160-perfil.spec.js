// #160 §19 — Perfil de clientes en CUENTA REAL (no demo): listado ordenado por
// actividad reciente y perfil completo (antigüedad, total gastado, órdenes,
// últimas órdenes, direcciones, notas, RUC, tags, minorista/mayorista, paga
// impuestos) + seguro del cliente. Read-only sobre la cuenta del harness: el
// cliente de prueba se crea vía API (como en el resto de las specs) y no se
// toca ninguna ficha existente. Capturas: docs/QA-160-perfil-produccion/.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/QA-160-perfil-produccion'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('§19: listado por actividad y perfil completo en cuenta real', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const nombre = `Perfil QA ${marca}`
  // La app tiene que estar cargada para que el fetch sea del mismo origen.
  await page.goto('/clientes')

  // Alta con todos los datos de §19 (direcciones + adicionales, tags, tipo,
  // impuestos, crédito y seguro) y dos pedidos: uno con saldo y uno pagado.
  const alta = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({
      firstName: 'Perfil', secondName: `QA ${marca}`,
      // Documento y teléfono únicos por corrida: el API deduplica por identidad.
      email: `perfil.${marca.toLowerCase()}@correo.com.py`, phone: `0981${String(Date.now()).slice(-6)}`, countryCode: '+595',
      document: `CI-${marca}`, tags: ['mayorista', 'prioridad'], pricingTier: 'WHOLESALE', taxExempt: false,
      creditLimitPyg: 8000000, creditDays: 30, insuranceEnabled: true, insuranceRatePct: 10,
      addresses: [
        { label: 'Casa', address: 'Av. Mariscal López 2222', city: 'Asunción', department: 'Capital', country: 'Paraguay', isDefault: true },
        { label: 'Depósito', address: 'Ruta 2 Km 18', city: 'Capiatá', department: 'Central', country: 'Paraguay', isDefault: false },
      ],
    }),
  })
  expect([200, 201], `alta de cliente: ${JSON.stringify(alta.body)}`).toContain(alta.status)
  const clienteId = alta.body.id

  // Producto propio con stock simple: el servidor exige los seriales exactos
  // cuando hay unidades serializadas y este spec vende por cantidad.
  const altaProducto = await api(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `Producto perfil ${marca}`, sku: `QA160-${marca}`, pricePyg: 3000000, stock: 3 }),
  })
  expect([200, 201], JSON.stringify(altaProducto.body)).toContain(altaProducto.status)
  const producto = altaProducto.body
  expect(producto?.id).toBeTruthy()
  for (const [numero, total, pago] of [['QA-1901', 3000000, 1000000], ['QA-1902', 1500000, 1500000]]) {
    const pedido = await api(page, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderNumber: `${numero}-${marca}`,
        customerId: clienteId,
        items: [{ productId: producto.id, description: producto.name || producto.nombre, quantity: 1, unitPricePyg: total }],
        payment: { method: 'CASH', amountPyg: pago },
      }),
    })
    expect([200, 201], `alta de pedido ${numero}: ${JSON.stringify(pedido.body)}`).toContain(pedido.status)
  }

  // Listado: orden por actividad reciente y agregados del cliente nuevo.
  await page.goto('/clientes')
  await expect(page.getByLabel('Ordenar clientes')).toHaveValue('recientes')
  await page.getByLabel('Buscar clientes').fill(marca)
  const fila = page.getByTestId('cliente-fila').filter({ hasText: marca }).first()
  await expect(fila).toContainText('2')
  await expect(fila).toContainText('Gs 4.500.000')
  await page.screenshot({ path: `${SALIDA}/01-listado-actividad.png` })

  // Perfil: los once ítems de §19 en el Resumen.
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Total gastado', { exact: false }).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SALIDA}/02-perfil-resumen.png` })
  const resumen = (await ficha.innerText()).replace(/\s+/g, ' ')
  for (const item of ['Total gastado', 'Saldo pendiente', 'Órdenes activas', 'Pedidos', 'Última compra', 'Antigüedad', 'RUC', 'Paga impuestos', 'Dirección', 'Etiquetas', 'Últimas órdenes']) {
    await expect(ficha.getByText(new RegExp(item, 'i')).first(), `el Resumen muestra «${item}»`).toBeVisible()
  }
  await expect(ficha.getByText('Mayorista').first()).toBeVisible()
  await expect(ficha.getByText(/Paga impuestos: No \(exento\)/)).toHaveCount(0)
  expect(resumen).toMatch(/TOTAL GASTADO Gs 4\.500\.000/i)
  expect(resumen).toMatch(/PEDIDOS 2/i)
  expect(resumen).toMatch(/SALDO PENDIENTE Gs 2\.000\.000/i)
  // Cliente creado hoy: la antigüedad dice «Hoy» (antes «—»).
  expect(resumen).toMatch(/ANTIGÜEDAD: HOY/i)

  // Pedidos del cliente (el pendiente con saldo).
  await ficha.getByRole('tab', { name: /^Pedidos/ }).click()
  await page.waitForTimeout(700)
  await expect(ficha.getByText(new RegExp(`QA-?#?1901-${marca}`, 'i')).first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-perfil-pedidos.png` })

  // Estadísticas (misma lógica que la cuenta real).
  await ficha.getByRole('tab', { name: /^Estadísticas/ }).click()
  await page.waitForTimeout(900)
  const estadisticas = (await ficha.innerText()).replace(/\s+/g, ' ')
  expect(estadisticas).toMatch(/TICKET PROMEDIO Gs 2\.250\.000/i)
  await page.screenshot({ path: `${SALIDA}/04-perfil-estadisticas.png` })

  // Datos: direcciones (con la adicional), notas y seguro.
  await ficha.getByRole('tab', { name: /^Datos/ }).click()
  await page.waitForTimeout(700)
  const direcciones = ficha.getByTestId('perfil-direcciones').locator('li')
  await expect(direcciones).toHaveCount(2)
  await expect(ficha.getByTestId('perfil-direcciones')).toContainText('Depósito')
  await expect(ficha.getByTestId('perfil-direcciones')).toContainText('Predeterminada')
  await expect(ficha.getByLabel('Nota interna')).toBeVisible()
  await expect(ficha.getByLabel('Nota pública')).toBeVisible()
  await ficha.getByTestId('perfil-direcciones').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SALIDA}/05-perfil-datos-direcciones.png` })
  const seguro = ficha.getByRole('switch', { name: 'Seguro del cliente activo' })
  await expect(seguro).toBeChecked()
  await expect(ficha.getByLabel('Porcentaje del cliente')).toHaveValue('10')
  await expect(ficha.getByText(/Vacío = usa el de la empresa/)).toBeVisible()
  await ficha.getByText('Seguro del cliente').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SALIDA}/06-perfil-datos-seguro.png` })
})
