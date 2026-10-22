// Módulo «Mayoristas»:
// - Apagado: el POS no aplica ni muestra el precio mayorista (el servidor tampoco), Clientes no
//   ofrece el filtro/KPI/tipo Mayorista y el catálogo no muestra el precio mayorista.
// - Activo: el POS aplica el precio mayorista al cliente mayorista.
// - La pantalla Módulos lista «Mayoristas».
// El estado se cambia en la base (Tenant.settings.moduleStore): el servidor lo lee en cada
// pedido y el front al cargar la página. Al terminar queda activo, como lo siembra el global-setup.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { ensureCobro } from './helpers/ensure-cobro.js'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

function psql(sql) {
  const puerto = process.env.MOBOS_E2E_PGPORT || '5439'
  const base = process.env.MOBOS_E2E_DB || 'mobos_e2e'
  execFileSync('/opt/homebrew/bin/psql', ['-h', '127.0.0.1', '-p', puerto, '-U', 'postgres', '-d', base, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql])
}

function fijarMayoristas(enabled) {
  psql(`UPDATE "Tenant" SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{moduleStore,modules,mayoristas}', '{"enabled":${enabled}}'::jsonb, true) WHERE "email" = '${SEED.company.email}';`)
}

async function api(page, ruta, opciones = {}) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
    return { status: respuesta.status, datos: await respuesta.json().catch(() => null) }
  }, { api: API, ruta, opciones })
}

test.afterAll(() => { fijarMayoristas(true) })

test('pantalla Módulos: lista «Mayoristas» con su detalle', async ({ page }) => {
  fijarMayoristas(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/configuracion/modulos')
  const fila = page.getByTestId('modulo-fila-mayoristas')
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await expect(fila).toContainText('Mayoristas')
  await expect(fila).toHaveAttribute('data-estado', 'activo')
})

// Producto con precio mayorista y cliente mayorista propios de cada prueba (el POS recuerda el
// borrador de la venta dentro de una misma sesión, por eso cada estado usa su propio par).
async function crearPar(page) {
  const id = clave()
  const nombre = `Producto mayorista QA ${id}`
  const cliente = `Cliente mayorista QA ${id}`
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/pos')
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-MAY-${id}`, name: nombre, category: 'Accesorios', pricePyg: 100000, wholesalePricePyg: 80000, costPyg: 60000, stock: 10, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  const mayorista = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: cliente, phone: `0981${String(Date.now()).slice(-6)}`, pricingTier: 'WHOLESALE' }) })
  expect(mayorista.status, JSON.stringify(mayorista.datos)).toBeLessThan(300)
  return { nombre, cliente, productoId: producto.datos.id, clienteId: mayorista.datos.id }
}

const precioServidor = (page, par) => api(page, `/api/pricing?productId=${encodeURIComponent(par.productoId)}&customerId=${encodeURIComponent(par.clienteId)}&quantity=1`)

async function agregarAlPos(page, par) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(par.cliente)
  // Con un único resultado exacto el POS lo elige solo; si no, se toca la opción.
  const opcion = page.getByRole('option', { name: new RegExp(par.cliente) }).first()
  if (await opcion.isVisible({ timeout: 3000 }).catch(() => false)) await opcion.click()
  await expect(page.getByText(par.cliente).first()).toBeVisible()
  await page.getByPlaceholder('Buscar producto…').fill(par.nombre)
  const tarjeta = page.getByRole('button', { name: new RegExp(par.nombre) }).first()
  await expect(tarjeta).toBeVisible({ timeout: 15_000 })
  await tarjeta.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()
  await ensureCobro(page)
}

test('mayoristas apagado: el POS y el servidor no aplican precio mayorista; Clientes sin filtro', async ({ page }) => {
  const par = await crearPar(page)
  try {
    fijarMayoristas(false)
    const servidor = await precioServidor(page, par)
    expect(servidor.status).toBe(200)
    expect(servidor.datos.origin).toBe('RETAIL')
    expect(Number(servidor.datos.unitPricePyg)).toBe(100000)

    await agregarAlPos(page, par)
    const resumen = page.locator('#pos-resumen-venta')
    await expect(resumen).toContainText('100.000')
    await expect(resumen).not.toContainText('80.000')
    await expect(page.getByTestId('cliente-chips')).not.toContainText('Mayorista')
    await expect(page.getByTestId('cliente-chips')).not.toContainText('Cliente final')

    // Plantillas: «Precios mayoristas» no se ofrece ni se edita con el módulo apagado.
    const plantillas = await api(page, '/api/message-templates?category=CUSTOMERS')
    expect(plantillas.status).toBe(200)
    expect(plantillas.datos.map(item => item.key)).not.toContain('mayorista')

    await page.goto('/clientes')
    await expect(page.getByRole('group', { name: 'Filtrar clientes' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Filtrar clientes' }).getByRole('button', { name: 'Mayoristas' })).toHaveCount(0)
  } finally {
    fijarMayoristas(true)
    await api(page, `/api/products?id=${encodeURIComponent(par.productoId)}`, { method: 'DELETE' })
  }
})

test('mayoristas activo: el POS y el servidor aplican el precio mayorista; el tipo de cliente se conserva', async ({ page }) => {
  const par = await crearPar(page)
  try {
    fijarMayoristas(true)
    const servidor = await precioServidor(page, par)
    expect(servidor.datos.origin).toBe('WHOLESALE')
    expect(Number(servidor.datos.unitPricePyg)).toBe(80000)

    await agregarAlPos(page, par)
    await expect(page.locator('#pos-resumen-venta')).toContainText('80.000')
    await expect(page.getByTestId('cliente-chips')).toContainText('Mayorista')

    const plantillas = await api(page, '/api/message-templates?category=CUSTOMERS')
    expect(plantillas.datos.map(item => item.key)).toContain('mayorista')

    await page.goto('/clientes')
    await expect(page.getByRole('group', { name: 'Filtrar clientes' }).getByRole('button', { name: 'Mayoristas' })).toBeVisible()
  } finally {
    await api(page, `/api/products?id=${encodeURIComponent(par.productoId)}`, { method: 'DELETE' })
  }
})
