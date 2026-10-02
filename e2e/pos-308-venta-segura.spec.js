// #308 · POS: venta segura (auditoría del demo v1.0.209).
// - Con más de una variante, el POS pide elegir la variante exacta antes de
//   agregarla (no elige sola la primera).
// - El selector de IMEI cierra con una decisión explícita: unidad exacta o
//   «vender sin IMEI» (sobre pedido), y el pedido deja la traza.
// - Sin productos no se cargan pagos ni se canjean gift cards.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function crearProducto(page, { nombre, precio = 90000, stock = 2, color, imei }) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, branchId, nombre, precio, stock, color, imei }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: `ZZ-QA308-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name: nombre, category: 'Celulares', pricePyg: precio, costPyg: 60000, stock, branchId,
        ...(color ? { color } : {}),
        ...(imei ? { imei, condition: 'NEW' } : {}),
      }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, nombre, precio, stock, color, imei })
}

async function borrarProducto(page, productId) {
  await page.evaluate(async ({ api, productId }) => {
    await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, { api: API, productId })
}

async function agregar(page, nombre) {
  const buscar = page.getByPlaceholder('Buscar producto…')
  await buscar.fill(nombre)
  const tarjeta = page.getByRole('button', { name: new RegExp(nombre) }).first()
  await expect(tarjeta).toBeVisible({ timeout: 15_000 })
  await tarjeta.click()
}

async function ordenDe(page, cliente) {
  return page.evaluate(async ({ api, cliente }) => {
    const filas = await fetch(`${api}/api/orders`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(filas) ? filas : []).find(o => o.customer?.name === cliente) || null
  }, { api: API, cliente })
}

test('con más de una variante hay que elegir antes de agregar (#308)', async ({ page }) => {
  const id = clave()
  const base = `Producto 308 ${id}`
  const azul = await crearProducto(page, { nombre: `${base} Azul`, precio: 90000, color: 'Azul' })
  const negro = await crearProducto(page, { nombre: `${base} Negro`, precio: 95000, color: 'Negro' })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente 308 ${id}`)

    await agregar(page, base)

    // Selector obligatorio: el carrito no cambia hasta que el vendedor elige.
    const selector = page.getByTestId('selector-variante')
    await expect(selector).toBeVisible()
    await expect(selector.getByTestId('variante-opcion')).toHaveCount(2)
    await expect(page.getByText('Todavía no agregaste productos.')).toBeVisible()

    // Elegir la variante exacta la suma con su color.
    await selector.getByTestId('variante-opcion').filter({ hasText: 'Azul' }).click()
    await expect(selector).toHaveCount(0)
    const filas = page.locator('#pos-resumen-venta [data-estado]')
    await expect(filas).toHaveCount(1)
    await expect(filas.first()).toContainText('Azul')
  } finally {
    await borrarProducto(page, azul.productId)
    await borrarProducto(page, negro.productId)
  }
})

test('el selector de IMEI no cierra sin elegir la unidad exacta (#308)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo 308 ${id}`
  const cliente = `Cliente imei 308 ${id}`
  const imei = `35${Date.now().toString().slice(-13)}`
  const { productId } = await crearProducto(page, { nombre, stock: 1, imei })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await agregar(page, nombre)

    const fila = page.locator('#pos-resumen-venta [data-estado]').first()
    await expect(fila).toHaveAttribute('data-estado', 'falta-imei')
    await fila.getByRole('button', { name: /^Elegir IMEI de / }).click()

    const dialogo = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
    await expect(dialogo).toBeVisible()
    const listo = dialogo.getByRole('button', { name: 'Listo' })

    // Con la unidad disponible: «Listo» no cierra sin elegir la unidad exacta
    // (con stock la salida «sin IMEI» está bloqueada y se explica).
    await expect(listo).toBeDisabled()
    await expect(dialogo.getByTestId('imei-falta-eleccion')).toBeVisible()
    await expect(dialogo.getByText(/Con stock no se vende sin IMEI/)).toBeVisible()

    await dialogo.getByRole('button', { name: 'Reservar este' }).first().click()
    await expect(listo).toBeEnabled()
    await listo.click()
    await expect(fila).toHaveAttribute('data-estado', 'reservado')

    // La decisión queda en la venta: el pedido guarda el IMEI elegido.
    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })
    const orden = await ordenDe(page, cliente)
    expect(orden?.items?.[0]?.serials, 'la venta guarda el IMEI elegido').toContain(imei)
  } finally {
    await borrarProducto(page, productId)
  }
})

test('la salida explícita «vender sin IMEI» habilita el cierre en la demo (#308)', async ({ page }) => {
  // La demo lista unidades ficticias pero no persiste el stock real: el modal
  // permite marcar explícitamente «sin IMEI» y recién ahí cierra.
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 30_000 })
  // La guía de la demo se abre sola la primera vez y tapa los clics (#201).
  await cerrarGuiaDemo(page)

  await page.goto('/pos')
  await agregar(page, 'iPhone 15 Pro Max')
  const fila = page.locator('#pos-resumen-venta [data-estado="falta-imei"]').first()
  await expect(fila).toBeVisible({ timeout: 15_000 })
  await fila.getByRole('button', { name: /^Elegir IMEI de / }).click()

  const dialogo = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
  const listo = dialogo.getByRole('button', { name: 'Listo' })
  await expect(listo).toBeDisabled()
  await expect(dialogo.getByTestId('imei-falta-eleccion')).toBeVisible()

  await dialogo.getByRole('checkbox').check()
  await expect(listo).toBeEnabled()
  await listo.click()
  await expect(page.locator('#pos-resumen-venta').getByText('Sobre pedido')).toBeVisible()
})

test('la salida explícita «sobre pedido» deja la traza en el pedido (#308)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto sin stock 308 ${id}`
  const cliente = `Cliente sin stock 308 ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 0 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await agregar(page, nombre)

    // Carrito con una línea sin stock: la única salida es la decisión explícita.
    const guia = page.getByTestId('guia-venta')
    await expect(guia).toBeVisible()
    await guia.getByRole('button', { name: 'Sobre pedido' }).click()
    await expect(page.locator('#pos-resumen-venta [data-estado="sobre-pedido"]')).toHaveCount(1)

    await page.getByRole('button', { name: /^Crear pedido sin pago/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })
    const orden = await ordenDe(page, cliente)
    expect(Number(orden?.items?.[0]?.stockPending || 0), 'queda como sobre pedido').toBe(1)
  } finally {
    await borrarProducto(page, productId)
  }
})

test('sin productos no se cargan pagos ni se canjean gift cards (#308)', async ({ page }) => {
  const id = clave()
  const nombre = `Producto pagos 308 ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 2 })
  try {
    await page.goto('/pos')
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente pagos 308 ${id}`)

    // Carrito vacío: cobrar y canjear quedan bloqueados con su aviso.
    await expect(page.getByRole('button', { name: '+ Agregar pago' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '+ Canjear gift card' })).toBeDisabled()
    await expect(page.getByTestId('cobro-sin-productos')).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Crear pedido|Confirmar venta|Guardar pedido)/ })).toBeDisabled()

    // Con un producto vuelven a estar disponibles.
    await agregar(page, nombre)
    await expect(page.getByRole('button', { name: '+ Agregar pago' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '+ Canjear gift card' })).toBeEnabled()
    await expect(page.getByTestId('cobro-sin-productos')).toHaveCount(0)
  } finally {
    await borrarProducto(page, productId)
  }
})
