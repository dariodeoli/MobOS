// Abastecimiento F1 (#250/#254) · panel «Por comprar»: la necesidad manual se
// consolida en una tarjeta compacta, se asigna comprador y se cancela con
// motivo (auditado). Capturas claro/oscuro × desktop/mobile.
//
// Capturas: `QA_254_CAPTURAS` (default test-results/qa-254) — se versionan en
// docs/qa/254-por-comprar/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_254_CAPTURAS || join('test-results', 'qa-254')

// API desde la página: la cookie de sesión y el origen son los de la app.
const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

// Producto único por corrida: las necesidades de otras pruebas o corridas no
// se mezclan en la consolidación (mismo producto + condición).
async function productoDePrueba(page, marca) {
  const sku = `E2E-254-${marca}`
  const { status, body } = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku, name: `Producto 254 ${marca}`, category: 'Accesorios', pricePyg: 100000, stock: 0, branchId: SEED.branchId }),
  })
  expect([200, 201], `POST /api/products → ${status} ${JSON.stringify(body)}`).toContain(status)
  return body
}

async function crearNecesidad(page, producto, extra = {}) {
  const { status, body } = await apiPagina(page, '/api/supply/needs', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.id, quantity: 2, priority: 'URGENTE', notes: 'QA #254', ...extra }),
  })
  expect([200, 201], `POST /api/supply/needs → ${status} ${JSON.stringify(body)}`).toContain(status)
  return body
}

const cancelarNecesidad = (page, id) => apiPagina(page, '/api/supply/needs', {
  method: 'PATCH',
  body: JSON.stringify({ id, action: 'cancel', reason: 'Fin de la prueba e2e' }),
})

const listarNecesidades = async (page) => (await apiPagina(page, '/api/supply/needs')).body

test('Por comprar: la necesidad se consolida y se ve en la tarjeta compacta', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()

  const marca = Date.now().toString(36)
  const producto = await productoDePrueba(page, marca)
  const creada = await crearNecesidad(page, producto)
  await page.getByRole('button', { name: 'Actualizar' }).click()

  // La búsqueda deja solo el producto de la prueba.
  await page.getByLabel('Buscar producto').fill(producto.name)
  const fila = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Urgente', { exact: true })).toBeVisible()
  await expect(fila.getByText('Faltan 2 unidades')).toBeVisible()
  await expect(fila.getByText('Manual', { exact: true })).toBeVisible()

  // Prioridad filtra y vuelve.
  await page.getByLabel('Prioridad').selectOption('BAJA')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)
  await page.getByLabel('Prioridad').selectOption('URGENTE')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()

  for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
    await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/abastecimiento')
    await expect(page.getByTestId('por-comprar-fila').first()).toBeVisible()
    await page.screenshot({ path: join(DIR, `por-comprar-${tema}-desktop.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(DIR, `por-comprar-${tema}-mobile.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'sin scroll horizontal').toBe(true)
  }

  await cancelarNecesidad(page, creada.id)
})

test('Por comprar: asignar comprador y cancelar con motivo quedan auditados', async ({ page }) => {
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()

  const marca = `b${Date.now().toString(36)}`
  const producto = await productoDePrueba(page, marca)
  const creada = await crearNecesidad(page, producto, { quantity: 1, priority: 'ALTA' })
  await page.getByRole('button', { name: 'Actualizar' }).click()

  const fila = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name }).first()
  await expect(fila).toBeVisible()

  // Asignar comprador: se elige de la lista real de usuarios.
  await fila.getByRole('button', { name: 'Asignar comprador' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('heading', { name: 'Asignar comprador' })).toBeVisible()
  const opciones = dialogo.locator('#comprador option')
  await expect(opciones.first()).toHaveText(/Elegí quién compra/)
  const compradorId = await opciones.nth(1).getAttribute('value')
  await dialogo.locator('#comprador').selectOption(compradorId)
  await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()
  await expect(page.getByText('Compra asignada')).toBeVisible()

  const asignadas = await listarNecesidades(page)
  const grupo = (asignadas.grupos || []).find((g) => g.producto === producto.name)
  expect(grupo, 'el grupo sigue por comprar (asignado)').toBeTruthy()

  // Cancelar con motivo: sale de la lista y queda auditado.
  const filaOtraVez = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name }).first()
  await filaOtraVez.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const dialogoCancelar = page.getByRole('dialog')
  await dialogoCancelar.locator('#motivo').fill('Se compró por otro proveedor (e2e)')
  await dialogoCancelar.getByRole('button', { name: 'Cancelar necesidad' }).click()
  await expect(page.getByText('Necesidad cancelada')).toBeVisible()
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)

  const despues = await listarNecesidades(page)
  expect((despues.grupos || []).some((g) => g.producto === producto.name), 'la cancelada no vuelve').toBe(false)
  void creada
})
