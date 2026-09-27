// #268 — Unificar clientes duplicados: aviso al crear, preview de lo que se
// mueve, elección de la ficha principal, archivado con puntero y cronología.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-268-unificar-clientes'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('unificar dos fichas: preview, principal, archivo con puntero y cronología', async ({ page }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const telefono = `0981${String(Date.now()).slice(-6)}`

  const a = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Unificar A ${marca}`, phone: telefono }) })
  expect(a.status, JSON.stringify(a.body)).toBe(201)
  const b = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Unificar B ${marca}`, phone: `0982${String(Date.now()).slice(-6)}`, email: `unificar-${marca.toLowerCase()}@ejemplo.com`, tags: ['whatsapp'] }) })
  expect(b.status, JSON.stringify(b.body)).toBe(201)
  // El duplicado real: mismo teléfono, editado después del alta.
  await api(page, `/api/customers/${encodeURIComponent(b.body.id)}`, { method: 'PATCH', body: JSON.stringify({ phone: telefono }) })
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `UNI-${marca}`, name: 'Producto unificar', pricePyg: 200000, stock: 3 }) })
  await api(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `UNI-${marca}`, customerId: b.body.id, items: [{ productId: producto.body.id, description: 'Producto unificar', quantity: 1, unitPricePyg: 200000 }], payment: { method: 'CASH', amountPyg: 80000 } }) })
  await api(page, `/api/customers/${encodeURIComponent(b.body.id)}/notes`, { method: 'POST', body: JSON.stringify({ content: `Nota del duplicado ${marca}` }) })

  // Aviso de posible duplicado al crear con el mismo teléfono.
  await page.goto('/clientes')
  await page.getByRole('button', { name: '+ Crear cliente' }).click()
  const modalAlta = page.getByRole('dialog', { name: 'Crear cliente' })
  await modalAlta.getByLabel('Teléfono').fill(telefono)
  const aviso = page.getByTestId('posible-duplicado')
  await expect(aviso).toBeVisible({ timeout: 10000 })
  await expect(aviso).toContainText(`Unificar A ${marca}`)
  await page.screenshot({ path: `${SHOTS}/01-aviso-posible-duplicado.png` })
  await modalAlta.getByRole('button', { name: 'Cancelar' }).click()

  // Ficha de A → Unificar → buscar B → preview.
  await page.goto(`/clientes?cliente=${encodeURIComponent(a.body.id)}`)
  const ficha = page.getByRole('dialog')
  await ficha.getByText('Saldo pendiente', { exact: false }).first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/02-antes-unificar.png` })
  await ficha.getByTestId('unificar-cliente-boton').click()
  await page.getByTestId('unificar-cliente').getByLabel('Buscar el cliente duplicado').fill(`Unificar B ${marca}`)
  await page.getByTestId('unificar-resultados').getByText(`Unificar B ${marca}`).click()
  await expect(page.getByTestId('merge-lado-b')).toContainText('Pedidos')
  await expect(page.getByTestId('merge-lado-b')).toContainText('Notas')
  await page.screenshot({ path: `${SHOTS}/03-preview-unificacion.png` })
  await page.getByRole('button', { name: 'Unificar clientes' }).click()
  await expect(page.getByText('Clientes unificados')).toBeVisible({ timeout: 15000 })

  // La ficha principal quedó con el correo/tags del duplicado y su pedido.
  const tras = await api(page, `/api/customers/${encodeURIComponent(a.body.id)}`)
  expect(tras.body.customer.email).toBe(`unificar-${marca.toLowerCase()}@ejemplo.com`)
  expect(tras.body.orders.some((orden) => orden.orderNumber === `UNI-${marca}`)).toBe(true)
  const archivada = await api(page, `/api/customers/${encodeURIComponent(b.body.id)}`)
  expect(archivada.body.customer.archivedAt).toBeTruthy()
  expect(archivada.body.customer.mergedIntoId).toBe(a.body.id)
  await page.screenshot({ path: `${SHOTS}/04-despues-ficha-principal.png` })

  // La ficha archivada muestra su puntero y las cronologías registran el merge.
  await page.goto(`/clientes?cliente=${encodeURIComponent(b.body.id)}`)
  await expect(page.getByTestId('ficha-fusionada')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('ficha-fusionada')).toContainText(`Unificar A ${marca}`)
  await page.screenshot({ path: `${SHOTS}/05-ficha-archivada-con-puntero.png` })
  const fichaA = page.getByRole('dialog')
  await page.goto(`/clientes?cliente=${encodeURIComponent(a.body.id)}`)
  await fichaA.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(fichaA.getByText('Cliente unificado').first()).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: `${SHOTS}/06-cronologia-unificado.png` })
})

test('unificar desde la lista: seleccionar dos fichas y confirmar', async ({ page }) => {
  await page.goto('/clientes')
  const marca = `SEL${Date.now().toString(36).toUpperCase()}`
  const telefono = `0983${String(Date.now()).slice(-6)}`
  const a = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Lista A ${marca}`, phone: telefono }) })
  expect(a.status, JSON.stringify(a.body)).toBe(201)
  const b = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Lista B ${marca}`, phone: `0984${String(Date.now()).slice(-6)}` }) })
  expect(b.status, JSON.stringify(b.body)).toBe(201)
  await api(page, `/api/customers/${encodeURIComponent(b.body.id)}`, { method: 'PATCH', body: JSON.stringify({ phone: telefono }) })

  // Selección por lote: con exactamente dos fichas aparece «Unificar».
  await page.goto('/clientes')
  await page.getByLabel('Buscar clientes').fill(marca)
  await expect(page.getByLabel(`Seleccionar a Lista A ${marca}`)).toBeVisible()
  await expect(page.getByLabel(`Seleccionar a Lista B ${marca}`)).toBeVisible()
  // Seleccionar las visibles + abrir, en un solo intento: la tabla puede
  // re-montarse al asentar el buscador y perder la selección.
  await expect(async () => {
    if (!(await page.getByLabel('Seleccionar visibles').isChecked())) await page.getByLabel('Seleccionar visibles').check()
    await expect(page.getByText('2 seleccionada(s)')).toBeVisible({ timeout: 1500 })
    await page.getByTestId('unificar-seleccionados').click({ timeout: 1500 })
  }).toPass({ timeout: 30000 })
  await expect(page.getByTestId('merge-lado-b')).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/07-unificar-desde-lista.png` })
  await page.getByRole('button', { name: 'Unificar clientes' }).click()
  await expect(page.getByText('Clientes unificados')).toBeVisible({ timeout: 15000 })

  // Una de las dos quedó archivada con puntero a la otra (el orden de la lista
  // define cuál es la principal).
  const detalleA = await api(page, `/api/customers/${encodeURIComponent(a.body.id)}`)
  const detalleB = await api(page, `/api/customers/${encodeURIComponent(b.body.id)}`)
  const archivada = detalleA.body.customer.archivedAt ? detalleA.body.customer : detalleB.body.customer
  const principal = detalleA.body.customer.archivedAt ? detalleB.body.customer : detalleA.body.customer
  expect(archivada.mergedIntoId).toBe(principal.id)
  await page.screenshot({ path: `${SHOTS}/08-lista-tras-unificar.png` })
})
