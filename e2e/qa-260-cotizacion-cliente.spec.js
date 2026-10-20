// #260 — Cotizaciones: buscar una ficha existente (mismo buscador del POS, con
// última compra), crear una ficha sin salir de la cotización y «Consumidor
// final». Al guardar, la cotización queda ligada a la ficha.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { mkdirSync } from 'node:fs'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-260-cotizacion-cliente'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: SEED.api, path, options })
}

test('cotización: buscar cliente, crear ficha y consumidor final', async ({ page }) => {
  await page.goto('/cotizaciones')
  const marca = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
  const fichaNombre = `Distribuidora Tecnológica Paraguay S.A. ${marca}`
  const fichaTelefono = `0985${String(Date.now()).slice(-6)}`
  const fichaDocumento = `800${String(Date.now()).slice(-7)}-${Math.floor(Math.random() * 10)}`

  // Ficha con una compra para que el resultado muestre la última compra.
  const ficha = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: fichaNombre, document: fichaDocumento, phone: fichaTelefono, countryCode: '+595', email: `cotiza-${marca.toLowerCase()}@ejemplo.com` }) })
  expect(ficha.status, JSON.stringify(ficha.body)).toBe(201)
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `COT-${marca}`, name: 'Producto cotización', pricePyg: 150000, stock: 3 }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const pedido = await api(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `COT-${marca}`, customerId: ficha.body.id, items: [{ productId: producto.body.id, description: 'Producto cotización', quantity: 1, unitPricePyg: 150000 }], payment: { method: 'CASH', amountPyg: 150000 } }) })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)

  // 1) Buscar una ficha existente: resultados útiles con la última compra.
  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  await page.getByRole('textbox', { name: 'Cliente' }).fill(fichaNombre)
  const lista = page.getByTestId('cotizacion-clientes')
  await expect(lista).toBeVisible({ timeout: 10000 })
  await expect(lista).toContainText('última compra')
  await page.screenshot({ path: `${SHOTS}/01-resultados.png` })
  await lista.getByRole('button', { name: new RegExp(`^${fichaNombre}`) }).click()
  await expect(page.getByText('Cliente de la ficha')).toBeVisible()
  const evidenceDir = process.env.MOBOS_390_EVIDENCE_DIR
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true })
    for (const [width, height] of [[1440, 900], [390, 844], [360, 800]]) {
      await page.setViewportSize({ width, height })
      await page.screenshot({ path: `${evidenceDir}/cotizacion-${width}-light.png` })
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForTimeout(120)
      await page.screenshot({ path: `${evidenceDir}/cotizacion-${width}-dark.png` })
      await page.evaluate(() => document.documentElement.classList.remove('dark'))
    }
  }
  await page.getByPlaceholder('Descripción del ítem').fill('Servicio de cotización')
  await page.getByRole('button', { name: 'Crear cotización' }).click()
  await expect(page.getByText(/Cotización creada/)).toBeVisible({ timeout: 15000 })

  // El cambio y la eliminación son acciones reversibles: Escape no confirma ni
  // cierra la cotización, sólo devuelve el foco al buscador.
  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  const selectorModal = page.getByRole('dialog', { name: 'Nueva cotización' })
  const selectorInput = selectorModal.getByRole('textbox', { name: 'Cliente' })
  await selectorInput.fill(fichaNombre)
  await expect(selectorModal.getByTestId('cotizacion-clientes')).toBeVisible()
  await selectorModal.getByTestId('cotizacion-clientes').getByRole('button', { name: new RegExp(`^${fichaNombre}`) }).click()
  await selectorModal.getByTestId('cotizacion-cliente-seleccionado').focus()
  await page.keyboard.press('Escape')
  await expect(selectorInput).toBeVisible()
  await selectorModal.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  const quitarModal = page.getByRole('dialog', { name: 'Nueva cotización' })
  const quitarInput = quitarModal.getByRole('textbox', { name: 'Cliente' })
  await quitarInput.fill('Distribuidora')
  await expect(quitarModal.getByTestId('cotizacion-clientes')).toBeVisible()
  await quitarModal.getByTestId('cotizacion-clientes').getByRole('button', { name: new RegExp(`^${fichaNombre}`) }).click()
  await quitarModal.getByRole('button', { name: 'Quitar cliente' }).click()
  await expect(quitarInput).toBeVisible()
  await quitarModal.getByRole('button', { name: 'Cancelar' }).click()

  // 2) Alta rápida: crear la ficha sin salir de la cotización.
  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  await page.getByRole('textbox', { name: 'Cliente' }).fill(`Nueva ${marca}`)
  await page.getByTestId('cotizacion-crear-ficha').click()
  const modal = page.getByTestId('ficha-cliente')
  await expect(modal).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: `${SHOTS}/02-crear-ficha.png` })
  await modal.getByTestId('ficha-cliente-guardar').click()
  await expect(page.getByText('Cliente de la ficha')).toBeVisible({ timeout: 15000 })
  await page.getByPlaceholder('Descripción del ítem').fill('Servicio nuevo')
  await page.getByRole('button', { name: 'Crear cotización' }).click()
  await expect(page.getByText(/Cotización creada/)).toBeVisible({ timeout: 15000 })

  // 3) Consumidor final: cotización sin ficha.
  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  await page.getByTestId('cotizacion-consumidor-final').click()
  await expect(page.getByRole('textbox', { name: 'Cliente' })).toHaveValue('Consumidor final')
  await expect(page.getByText('Sin ficha: se guarda solo el nombre.')).toBeVisible()
  await page.getByPlaceholder('Descripción del ítem').fill('Venta ocasional')
  await page.getByRole('button', { name: 'Crear cotización' }).click()
  await expect(page.getByText(/Cotización creada/)).toBeVisible({ timeout: 15000 })

  // Verificación por API: la primera queda ligada a la ficha elegida y la
  // segunda a la ficha creada; la de consumidor final no tiene ficha.
  const filas = (body) => Array.isArray(body) ? body : body?.rows || []
  const primera = await api(page, `/api/quotes?q=${encodeURIComponent(fichaNombre)}`)
  const filaPrimera = filas(primera.body).find((fila) => fila.customerName === fichaNombre)
  expect(filaPrimera?.customerId, JSON.stringify(primera.body)).toBe(ficha.body.id)
  const segunda = await api(page, `/api/quotes?q=${encodeURIComponent(`Nueva ${marca}`)}`)
  const filaSegunda = filas(segunda.body).find((fila) => fila.customerName === `Nueva ${marca}`)
  expect(filaSegunda?.customerId, JSON.stringify(segunda.body)).toBeTruthy()
  const nuevas = await api(page, `/api/customers?q=${encodeURIComponent(`Nueva ${marca}`)}`)
  expect((nuevas.body || []).some((cliente) => cliente.name === `Nueva ${marca}`), JSON.stringify(nuevas.body)).toBe(true)
  const finales = await api(page, `/api/quotes?q=${encodeURIComponent('Consumidor final')}`)
  const filaFinal = filas(finales.body).find((fila) => (fila.items || []).some((item) => item.description === 'Venta ocasional'))
  expect(filaFinal?.customerId || null).toBeNull()

  // La lista muestra la cotización ya guardada con su cliente.
  await page.getByLabel('Buscar cotizaciones').fill(fichaNombre)
  await expect(page.getByText(fichaNombre).first()).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/03-cotizacion-guardada.png` })
})
