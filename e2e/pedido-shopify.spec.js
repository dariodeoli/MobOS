// Detalle del pedido estilo Shopify (cuenta real, con backend):
//  · «Imprimir» usa el último formato de cada usuario (dos usuarios, misma tienda);
//  · publicar un comentario interno y que siga ahí al recargar;
//  · abrir la ficha del cliente desde el pedido y volver;
//  · cambiar y quitar el cliente con el Popup único.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { completeSellerPin, loginCompany } from './helpers/login.js'
import { imprimirPedidoComo } from './helpers/pedido-imprimir.js'

const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function api(page, path, options = {}) {
  return page.evaluate(async ({ base, path, options }) => {
    const response = await fetch(`${base}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { base: SEED.api, path, options })
}

async function crearPedido(page, { customerId } = {}) {
  const sufijo = marca()
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `PSH-${sufijo}`, name: `Producto Shopify ${sufijo}`, pricePyg: 150000, stock: 5, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const pedido = await api(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `PSH-${sufijo}`, ...(customerId ? { customerId } : {}), items: [{ productId: producto.body.id, description: `Producto Shopify ${sufijo}`, quantity: 1, unitPricePyg: 150000 }], payment: { method: 'CASH', amountPyg: 150000 } }) })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
  return { id: pedido.body.id, numero: `PSH-${sufijo}`, producto: `Producto Shopify ${sufijo}` }
}

async function crearCliente(page, nombre) {
  const respuesta = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombre, phone: `0986${String(Date.now()).slice(-6)}` }) })
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201)
  return respuesta.body
}

test('Imprimir recuerda el último formato de cada usuario (dos usuarios)', async ({ page, browser }) => {
  // El vendedor Dos crea su pedido (un vendedor solo ve los suyos); el admin lo abre también.
  const otro = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const paginaVendedor = await otro.newPage()
  try {
    await loginCompany(paginaVendedor)
    await completeSellerPin(paginaVendedor, { pin: SEED.sellers[1].pin })
    const lista = await api(paginaVendedor, `/api/products?q=${encodeURIComponent(SEED.products.cable.sku)}`)
    const cable = (Array.isArray(lista.body) ? lista.body : lista.body?.items || []).find((producto) => producto.sku === SEED.products.cable.sku)
    expect(cable, 'producto del seed').toBeTruthy()
    const sufijo = marca()
    const pedido = await api(paginaVendedor, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `PSH-U-${sufijo}`, items: [{ productId: cable.id, description: cable.name, quantity: 1, unitPricePyg: 45000 }], payment: { method: 'CASH', amountPyg: 45000 } }) })
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)

    // Vendedor: imprime el comprobante A4 → pasa a ser SU último formato.
    await paginaVendedor.goto(`/pedidos/${pedido.body.id}`)
    await expect(paginaVendedor.getByText('Artículos preparados')).toBeVisible({ timeout: 20_000 })
    await imprimirPedidoComo(paginaVendedor, 'Comprobante A4')
    await expect(paginaVendedor.getByTestId('pedido-imprimir-principal')).toHaveAttribute('title', 'Imprimir: Comprobante A4')

    // Admin (otra sesión): su memoria es propia; imprime la página del pedido.
    await page.goto(`/pedidos/${pedido.body.id}`)
    await expect(page.getByText('Artículos preparados')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('pedido-imprimir-principal')).not.toHaveAttribute('title', 'Imprimir: Comprobante A4')
    await imprimirPedidoComo(page, 'Página del pedido')
    await expect(page.getByTestId('pedido-imprimir-principal')).toHaveAttribute('title', 'Imprimir: Página del pedido')

    // Al recargar, cada uno conserva el suyo y el botón principal imprime con él.
    await paginaVendedor.reload()
    await page.reload()
    await expect(paginaVendedor.getByTestId('pedido-imprimir-principal')).toHaveAttribute('title', 'Imprimir: Comprobante A4', { timeout: 20_000 })
    await expect(page.getByTestId('pedido-imprimir-principal')).toHaveAttribute('title', 'Imprimir: Página del pedido', { timeout: 20_000 })
    await page.getByTestId('pedido-imprimir-principal').click()
    await expect(page.getByText('Página del pedido listo', { exact: false })).toBeVisible()
  } finally {
    await otro.close()
  }
})

test('comentario interno: se publica y sigue ahí al recargar', async ({ page }) => {
  await page.goto('/pedidos')
  const pedido = await crearPedido(page)
  await page.goto(`/pedidos/${pedido.id}`)
  const cronologia = page.getByTestId('pedido-cronologia')
  await expect(cronologia).toBeVisible({ timeout: 20_000 })
  const publicar = cronologia.getByRole('button', { name: 'Publicar' })
  await expect(publicar).toBeDisabled()
  await expect(cronologia.getByText('Solo vos y el equipo ven los comentarios.')).toBeVisible()
  const texto = `El cliente pasa a retirarlo el viernes ${marca()}`
  await cronologia.getByLabel('Comentario del pedido').fill(texto)
  await publicar.click()
  await expect(cronologia.getByTestId('pedido-evento').filter({ hasText: texto })).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await expect(page.getByTestId('pedido-cronologia').getByTestId('pedido-evento').filter({ hasText: texto })).toBeVisible({ timeout: 20_000 })
  // Eventos agrupados por día, con el usuario y la hora.
  await expect(page.getByTestId('pedido-cronologia-dia').first().getByRole('heading', { name: 'Hoy' })).toBeVisible()
})

test('cliente: abrir su ficha desde el pedido y volver', async ({ page }) => {
  await page.goto('/pedidos')
  const nombre = `Cliente Ficha ${marca()}`
  const cliente = await crearCliente(page, nombre)
  const pedido = await crearPedido(page, { customerId: cliente.id })
  await page.goto(`/pedidos/${pedido.id}`)
  await expect(page.getByText('Artículos preparados')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('pedido-ver-perfil').click()
  await expect(page).toHaveURL(new RegExp(`/clientes\\?cliente=${cliente.id}`))
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(new RegExp(`/pedidos/${pedido.id}$`), { timeout: 15_000 })
  await expect(page.getByTestId('pedido-detalle-f3')).toBeVisible()
})

test('cliente: cambiar y quitar con el Popup único', async ({ page }) => {
  await page.goto('/pedidos')
  const sufijo = marca()
  const primero = await crearCliente(page, `Cliente Uno ${sufijo}`)
  const segundo = await crearCliente(page, `Cliente Dos ${sufijo}`)
  const pedido = await crearPedido(page, { customerId: primero.id })
  await page.goto(`/pedidos/${pedido.id}`)
  await expect(page.getByTestId('pedido-ver-perfil')).toContainText(`Cliente Uno ${sufijo}`, { timeout: 20_000 })

  // Cambiar cliente: el buscador del POS (nombre, teléfono, CI o RUC) en un Popup.
  await page.getByTestId('pedido-cambiar-cliente').click()
  const dialogo = page.getByRole('dialog', { name: 'Cambiar cliente' })
  await expect(dialogo).toBeVisible()
  const campo = dialogo.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  await expect(async () => {
    await campo.fill(segundo.name)
    await expect(dialogo.getByText('Cliente seleccionado')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await dialogo.getByTestId('cliente-del-pedido-guardar').click()
  await expect(page.getByTestId('pedido-ver-perfil')).toContainText(segundo.name, { timeout: 15_000 })

  // Quitar cliente: confirmación del Popup; el pedido queda ocasional.
  await page.getByTestId('pedido-quitar-cliente').click()
  const confirmar = page.getByRole('alertdialog')
  await expect(confirmar).toBeVisible()
  await confirmar.getByRole('button', { name: 'Quitar cliente', exact: true }).click()
  await expect(page.getByTestId('pedido-asignar-cliente')).toBeVisible({ timeout: 15_000 })

  // Cronología: los dos movimientos con el cliente anterior y el nuevo.
  await expect(page.getByText(new RegExp(`Cliente: Cliente Uno ${sufijo} → Cliente Dos ${sufijo}`)).first()).toBeVisible()
  await expect(page.getByText(/Cliente quitado/).first()).toBeVisible()
})
