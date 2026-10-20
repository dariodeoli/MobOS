import { test, expect } from '@playwright/test'
import { ensureCobro } from '../helpers/ensure-cobro.js'

// Crédito sobre el límite y entrega (demo frontend-only, sin backend):
//  · una venta a crédito que supera el crédito del cliente (o de un cliente sin
//    crédito) queda «Pendiente de autorización de crédito» y NO se entrega;
//  · solo un administrador/gerente autoriza (su sesión o su PIN, nunca el del vendedor);
//  · una venta nunca se marca «Retirado» sola: el POS pregunta «¿El cliente ya se
//    llevó el producto?» y por defecto queda en preparación.
const WIDTH = 1280

async function entrar(page, rol) {
  await page.setViewportSize({ width: WIDTH, height: 900 })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: `Entrar como ${rol}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true }).getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

async function productoSimple(page) {
  return page.evaluate(async () => {
    const { getProductos } = await import('/src/lib/storage.js')
    const { agruparProductos } = await import('/src/utils/colores.js')
    const familia = agruparProductos(getProductos().filter(p => p.activo))
      .find(f => f.items.length === 1 && Number(f.items[0].stock) >= 2 && Number(f.items[0].precioVenta) >= 100000 && /Funda|Cargador/.test(f.base))
    return familia ? { nombre: familia.base, precio: Number(familia.items[0].precioVenta) } : null
  })
}

async function agregarProducto(page) {
  const producto = await productoSimple(page)
  expect(producto, 'el demo tiene un producto simple con stock').not.toBeNull()
  await page.getByPlaceholder('Buscar producto…').fill(producto.nombre)
  await page.locator('.pos-product-card', { hasText: producto.nombre }).first().click()
  await ensureCobro(page)
  return producto
}

async function elegirCliente(page, texto) {
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(texto)
  await page.getByTestId('pos-bloque-cliente').locator('button.block').first().click()
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
}

const cobrar = page => page.getByTestId('pos-cobro').locator('button[type="submit"]').first()

test('vendedor: venta a crédito de un cliente sin crédito queda pendiente de autorización y no se entrega', async ({ page }) => {
  await entrar(page, 'Vendedor')
  await agregarProducto(page)
  await elegirCliente(page, 'Carlos')

  // El interruptor está disponible aunque el cliente no tenga crédito, con el aviso claro.
  await page.getByTestId('pos-credito').getByRole('switch').check()
  const aviso = page.getByTestId('pos-credito-aviso')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('no tiene crédito habilitado')
  await expect(aviso).toContainText('Pendiente de autorización de crédito')
  // El vendedor no puede autorizarse solo: no ve el check «Autorizo yo», solo el PIN.
  await expect(page.getByTestId('pos-credito-yo')).toHaveCount(0)
  await expect(page.getByTestId('pos-credito-pin')).toBeVisible()
  await expect(cobrar(page)).toContainText('pendiente de autorización')

  await cobrar(page).click()
  // El pedido nace retenido: nada de «Retirado» ni pregunta de entrega.
  await expect(page.getByTestId('credito-pendiente')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('credito-pendiente')).toContainText('Pendiente de autorización de crédito')
  await expect(page.getByTestId('estado-credito')).toContainText('Pendiente de autorización de crédito')
  await expect(page.getByTestId('entrega-pregunta')).toHaveCount(0)

  // El vendedor no aprueba: sin PIN no hay botón; con el PIN de otro vendedor tampoco.
  await expect(page.getByTestId('credito-autorizar')).toHaveCount(0)
  const pin = page.getByTestId('credito-pin')
  await pin.locator('input').first().fill('2006') // PIN de otra vendedora
  await page.getByTestId('credito-autorizar-pin').click()
  await expect(page.getByTestId('credito-error')).toContainText('incorrecto')
  await expect(page.getByTestId('credito-pendiente')).toBeVisible()

  // Con el PIN de la gerente se autoriza, queda registrado quién y recién ahí se pregunta por la entrega.
  await pin.locator('input').first().fill('2002')
  await page.getByTestId('credito-autorizar-pin').click()
  await expect(page.getByTestId('credito-autorizado')).toContainText('Ana Giménez')
  await expect(page.getByTestId('credito-pendiente')).toHaveCount(0)
})

test('vendedor: con el PIN del gerente en el mostrador la venta a crédito nace autorizada, pero sin entregar', async ({ page }) => {
  await entrar(page, 'Vendedor')
  await agregarProducto(page)
  await elegirCliente(page, 'Carlos')
  await page.getByTestId('pos-credito').getByRole('switch').check()

  await page.getByTestId('pos-credito-pin').locator('input').first().fill('2001') // PIN del propio vendedor: no vale
  await cobrar(page).click()
  await expect(page.getByText('PIN de gerente o administrador incorrecto')).toBeVisible()

  await page.getByTestId('pos-credito-pin').locator('input').first().fill('2002')
  await expect(cobrar(page)).toContainText('Crear pedido a crédito')
  await cobrar(page).click()
  await expect(page.getByTestId('credito-autorizado')).toContainText('Ana Giménez', { timeout: 10000 })
  // Autorizar el crédito no entrega: el pedido sigue «En preparación» y se pregunta.
  await expect(page.getByTestId('entrega-pregunta')).toBeVisible()
  await expect(page.getByTestId('entrega-pregunta')).toContainText('¿El cliente ya se llevó el producto?')
  await page.getByTestId('entrega-no').click()
  await expect(page.getByTestId('entrega-pregunta')).toHaveCount(0)
  await expect(page.getByText(/Prepar/).first()).toBeVisible()
  await expect(page.getByTestId('paso-activo')).not.toContainText('Retirado')
})

test('dueño: puede autorizar el crédito él mismo (queda a su nombre) y confirma la entrega aparte', async ({ page }) => {
  await entrar(page, 'Dueño')
  await agregarProducto(page)
  await elegirCliente(page, 'Carlos')
  await page.getByTestId('pos-credito').getByRole('switch').check()
  await page.getByTestId('pos-credito-yo').check()
  await expect(page.getByTestId('pos-credito-pin')).toHaveCount(0)
  await cobrar(page).click()
  await expect(page.getByTestId('credito-autorizado')).toContainText('Hernán Acosta', { timeout: 10000 })
  await page.getByTestId('entrega-si').click()
  await expect(page.getByText('Retirado', { exact: true }).first()).toBeVisible()
})

test('venta de mostrador: nunca queda «Retirado» sola, se pregunta y por defecto no se entrega', async ({ page }) => {
  await entrar(page, 'Dueño')
  await agregarProducto(page)
  await cobrar(page).click() // «Crear pedido sin pago»
  await expect(page.getByTestId('entrega-pregunta')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('entrega-pregunta')).toContainText('¿El cliente ya se llevó el producto?')
  // Sin responder, el estado es «en preparación» (no «Retirado»).
  await expect(page.getByText(/Prepar/).first()).toBeVisible()
  await page.getByTestId('entrega-si').click()
  await expect(page.getByTestId('entrega-pregunta')).toHaveCount(0)
  await expect(page.getByText('Retirado', { exact: true }).first()).toBeVisible()
})
