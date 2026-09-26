// Abastecimiento F1 (#250/#254) · panel «Por comprar» sobre los datos de INV:
// contadores por estado, centro de compra, prioridad/fecha, costo/margen
// estimados, filtros de cola (sin asignar / vencidas) y asignación en bloque.
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

// Producto único por corrida: las necesidades de otras pruebas o corridas no se
// mezclan en la consolidación (mismo producto + condición + centro).
async function productoDePrueba(page, marca, extra = {}) {
  const sku = `E2E-254-${marca}`
  const { status, body } = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku, name: `Producto 254 ${marca}`, category: 'Accesorios', pricePyg: 100000, costPyg: 60000, stock: 0, branchId: SEED.branchId, ...extra }),
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

const numeroDeTab = async (page, nombre) => {
  const texto = await page.getByRole('tab', { name: new RegExp(`^${nombre}`) }).innerText()
  return Number((texto.match(/\((\d+)\)/) || [])[1] || 0)
}

test('Por comprar: contadores, tarjeta compacta (prioridad/fecha/costo) y filtros', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()
  const pendientesAntes = await numeroDeTab(page, 'Por comprar')

  const marca = Date.now().toString(36)
  const producto = await productoDePrueba(page, marca)
  const creada = await crearNecesidad(page, producto)
  await page.getByRole('button', { name: 'Actualizar' }).click()

  // Contador de la pestaña: sube exactamente uno.
  await expect(page.getByRole('tab', { name: new RegExp(`^Por comprar \\(${pendientesAntes + 1}\\)`) })).toBeVisible()

  // Tarjeta compacta con prioridad, condición, centro pendiente y costo estimado.
  await page.getByLabel('Buscar producto').fill(producto.name)
  const fila = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Urgente', { exact: true })).toBeVisible()
  await expect(fila.getByText('Nuevo', { exact: true })).toBeVisible()
  await expect(fila.getByText('Sin centro', { exact: true })).toBeVisible()
  await expect(fila.getByText('Faltan 2 unidades')).toBeVisible()
  await expect(fila.getByText(/Gs\s?120\.000/)).toBeVisible() // 2 × costo 60.000
  await expect(fila.getByText('Manual', { exact: true })).toBeVisible()
  await expect(fila.getByText(/Stock:/)).toBeVisible()

  // Pestañas por estado: los estados sin datos explican su vacío.
  for (const [tab, vacio] of [['Compradas', 'No hay compras registradas.'], ['Recibidas', 'Todavía no hay recepciones.'], ['Canceladas', 'No hay necesidades canceladas.']]) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
    await expect(page.getByText(vacio)).toBeVisible()
  }
  await page.getByRole('tab', { name: /^Por comprar/ }).click()
  await page.getByLabel('Buscar producto').fill(producto.name)

  // Prioridades y centro filtran del lado del servidor.
  await page.getByLabel('Prioridad').selectOption('BAJA')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)
  await page.getByLabel('Prioridad').selectOption('URGENTE')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()
  await page.getByLabel('Centro de compra').selectOption('CDE')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)
  await page.getByLabel('Centro de compra').selectOption('sin-centro')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()
  await page.getByLabel('Centro de compra').selectOption('todos')

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

test('Por comprar: asignar con centro de compra y cancelar con motivo', async ({ page }) => {
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()

  const marca = `c${Date.now().toString(36)}`
  const producto = await productoDePrueba(page, marca)
  const creada = await crearNecesidad(page, producto, { quantity: 1, priority: 'ALTA' })
  await page.getByRole('button', { name: 'Actualizar' }).click()

  const fila = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name }).first()
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: 'Asignar comprador' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('heading', { name: 'Asignar compra' })).toBeVisible()
  const opciones = dialogo.locator('#comprador option')
  const compradorId = await opciones.nth(1).getAttribute('value')
  await dialogo.locator('#comprador').selectOption(compradorId)
  await dialogo.locator('#centro-compra').fill('CDE')
  await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()
  await expect(page.getByText('Compra asignada')).toBeVisible()

  // El centro entra en la consolidación: la tarjeta lo muestra y los filtros lo respetan.
  await page.getByRole('tab', { name: /^Asignadas/ }).click()
  await expect(page.getByRole('tab', { name: /^Asignadas \(\d+\)/ })).toBeVisible()
  const filaAsignada = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name }).first()
  await expect(filaAsignada.getByText('CDE', { exact: true })).toBeVisible()
  await page.getByLabel('Centro de compra').selectOption('sin-centro')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)
  await page.getByLabel('Centro de compra').selectOption('CDE')
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()
  await page.getByLabel('Centro de compra').selectOption('todos')

  // Cancelar con motivo: sale de «Por comprar» y queda en «Canceladas».
  await page.getByRole('tab', { name: /^Por comprar/ }).click()
  const filaOtraVez = page.getByTestId('por-comprar-fila').filter({ hasText: producto.name }).first()
  await filaOtraVez.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const dialogoCancelar = page.getByRole('dialog')
  await dialogoCancelar.locator('#motivo').fill('Se compró por otro proveedor (e2e)')
  await dialogoCancelar.getByRole('button', { name: 'Cancelar necesidad' }).click()
  await expect(page.getByText('Necesidad cancelada')).toBeVisible()
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toHaveCount(0)

  await page.getByRole('tab', { name: /^Canceladas/ }).click()
  await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()

  const despues = await listarNecesidades(page)
  expect((despues.grupos || []).some((g) => g.producto === producto.name), 'la cancelada no vuelve').toBe(false)
  void creada
})

test('Por comprar: asignación en bloque de varios grupos', async ({ page }) => {
  await page.goto('/abastecimiento')
  await expect(page.getByTestId('por-comprar')).toBeVisible()

  const marca = Date.now().toString(36)
  const productoA = await productoDePrueba(page, `b${marca}a`)
  const productoB = await productoDePrueba(page, `b${marca}b`)
  const creadaA = await crearNecesidad(page, productoA, { quantity: 1 })
  const creadaB = await crearNecesidad(page, productoB, { quantity: 1 })
  await page.getByRole('button', { name: 'Actualizar' }).click()

  for (const producto of [productoA, productoB]) {
    await page.getByLabel(`Seleccionar ${producto.name}`).check()
  }
  await expect(page.getByText('2 grupos seleccionados')).toBeVisible()
  await page.getByRole('button', { name: 'Asignar seleccionados' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText('2 grupos seleccionados')).toBeVisible()
  await dialogo.locator('#comprador').selectOption(await dialogo.locator('#comprador option').nth(1).getAttribute('value'))
  await dialogo.getByRole('button', { name: 'Asignar', exact: true }).click()
  await expect(page.getByText('Compra asignada')).toBeVisible()
  await expect(page.getByText('2 grupos seleccionados')).toHaveCount(0)

  await page.getByRole('tab', { name: /^Asignadas/ }).click()
  for (const producto of [productoA, productoB]) {
    await expect(page.getByTestId('por-comprar-fila').filter({ hasText: producto.name })).toBeVisible()
  }

  // Limpieza: se cancelan las dos (de a una, con motivo).
  await cancelarNecesidad(page, creadaA.id)
  await cancelarNecesidad(page, creadaB.id)
})
