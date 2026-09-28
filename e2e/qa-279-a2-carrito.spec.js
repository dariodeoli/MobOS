// #279 A2 · Carrito POS privado: el carrito ACTIVO es del vendedor de la sesión
// (empresa + sucursal + usuario) y el borrador GUARDADO es compartido, con
// registro de quién lo creó y quién lo retomó.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { loginAsSeller } from './helpers/login.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const CAPTURAS = process.env.MOBOS_CAPTURAS || ''

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('el borrador guardado registra quién lo creó y quién lo retomó, sin borrarse (#279 A2)', async ({ page, browser }) => {
  const marca = Date.now().toString(36).toUpperCase()
  const etiqueta = `A2 borrador ${marca}`
  const cliente = `Cliente A2 ${marca}`

  // 1) Un vendedor deja un borrador guardado (carrito compartido en el server)
  //    y su carrito activo vive bajo su propia clave.
  // Contexto del vendedor sin la sesión de gerencia del proyecto: el login por
  // PIN de `loginAsSeller` necesita la pantalla de acceso (contexto limpio).
  const contextoVendedor = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const vendedor = await contextoVendedor.newPage()
  await loginAsSeller(vendedor)
  await vendedor.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
  await vendedor.getByPlaceholder('Buscar producto…').fill('Cable')
  await vendedor.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await expect(vendedor.getByText('Productos de esta venta')).toBeVisible()

  const sesionVendedor = await vendedor.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json()), API)
  const usuarioVendedor = sesionVendedor.user
  const claveVendedor = `mobos:pos-cart:v1:${usuarioVendedor.tenantId}:${usuarioVendedor.branchId}:${usuarioVendedor.id}`
  const clavesVendedor = await vendedor.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:pos-cart:v1')))
  expect(clavesVendedor, `el carrito activo usa la clave del vendedor (${claveVendedor})`).toContain(claveVendedor)

  await vendedor.getByRole('button', { name: 'Suspender venta' }).click()
  const dialogo = vendedor.getByRole('dialog', { name: 'Suspender venta' })
  await dialogo.getByLabel('Etiqueta (opcional)').fill(etiqueta)
  await dialogo.getByRole('button', { name: 'Suspender venta' }).click()
  await expect(vendedor.getByText(/Venta suspendida/).first()).toBeVisible({ timeout: 15_000 })
  await contextoVendedor.close()

  // 2) Gerencia ve el borrador con quién lo creó y lo retoma.
  await page.goto('/pos')
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const lista = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  const fila = lista.getByRole('article').filter({ hasText: etiqueta }).first()
  await expect(fila).toBeVisible()
  await expect(fila).toContainText(`Creada por ${SEED.sellers[0].name}`)
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/real-01-pendientes-creada-por.jpg`, type: 'jpeg', quality: 76 })
  await fila.getByRole('button', { name: 'Recuperar' }).click()
  await expect(page.getByText(/Venta recuperada/)).toBeVisible()
  await expect(page.locator('#pos-resumen-venta').getByText(SEED.products.cable.name)).toBeVisible()

  // 3) El borrador NO se borra: queda en «Retomadas» con quién lo retomó y ya
  //    no aparece entre los pendientes.
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const lista2 = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  await lista2.getByRole('tab', { name: /Retomadas \(1\)/ }).click()
  const retomada = lista2.getByRole('article').filter({ hasText: etiqueta }).first()
  await expect(retomada).toContainText(`Creada por ${SEED.sellers[0].name}`)
  await expect(retomada).toContainText(`Retomada por ${SEED.admin.name}`)
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/real-02-retomadas-quien-la-retomo.jpg`, type: 'jpeg', quality: 76 })
  await lista2.getByRole('tab', { name: /Pendientes/ }).click()
  await expect(lista2.getByRole('article').filter({ hasText: etiqueta })).toHaveCount(0)

  // La API confirma el registro (sigue existiendo, con su retoma).
  const filas = await api(page, '/api/suspended-sales')
  const registro = (filas.body || []).find((row) => row.label === etiqueta)
  expect(registro, 'el borrador retomado sigue en el servidor').toBeTruthy()
  expect(registro.resumedAt).toBeTruthy()
  expect(registro.resumedBy?.name).toBe(SEED.admin.name)
  expect(registro.user?.name).toBe(SEED.sellers[0].name)

  // Limpieza: descartar el borrador retomado.
  await lista2.getByRole('tab', { name: /Retomadas/ }).click()
  await retomada.getByRole('button', { name: 'Descartar' }).click()
  await page.getByRole('dialog', { name: 'Descartar venta suspendida' }).getByRole('button', { name: 'Descartar' }).click()
  await expect(lista2.getByRole('article').filter({ hasText: etiqueta })).toHaveCount(0)
})

test('el carrito activo es privado: no lee la clave compartida vieja ni la de otro vendedor (#279 A2)', async ({ page }) => {
  await page.goto('/pos')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente clave ${Date.now().toString(36)}`)
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  const sesion = await page.evaluate(async (api) => (await (await fetch(`${api}/api/auth/me`, { credentials: 'include' })).json()), API)
  const usuario = sesion.user
  const clavePropia = `mobos:pos-cart:v1:${usuario.tenantId}:${usuario.branchId}:${usuario.id}`
  const claveVieja = `mobos:pos-cart:v1:${usuario.tenantId}:${usuario.branchId}`
  const claves = await page.evaluate(() => Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:pos-cart:v1')))
  expect(claves).toContain(clavePropia)
  expect(claves, 'nadie escribe el carrito activo en la clave compartida vieja').not.toContain(claveVieja)

  // Otro vendedor deja "su" carrito bajo la clave vieja compartida y bajo otra
  // clave de usuario: al recargar, mi carrito sigue intacto y el ajeno no aparece.
  await page.evaluate(({ claveVieja }) => {
    localStorage.setItem(claveVieja, JSON.stringify({ items: [{ key: 'ajeno', productoId: 'x', nombre: 'Carrito ajeno', precio: 1, quantity: 1 }] }))
    localStorage.setItem('mobos:pos-cart:v1:otro-usuario', JSON.stringify({ items: [] }))
  }, { claveVieja })
  await page.reload()
  const carrito = page.locator('#pos-resumen-venta')
  await expect(carrito.getByText(SEED.products.cable.name)).toBeVisible()
  await expect(page.getByText('Carrito ajeno')).toHaveCount(0)

  // Limpieza: vaciar el carrito propio y las claves inyectadas.
  await carrito.getByRole('button', { name: 'Vaciar carrito' }).click()
  await page.evaluate(({ claveVieja }) => {
    localStorage.removeItem(claveVieja)
    localStorage.removeItem('mobos:pos-cart:v1:otro-usuario')
  }, { claveVieja })
})
