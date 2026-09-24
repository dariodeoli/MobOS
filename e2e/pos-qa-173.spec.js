// Campaña QA #173: cobertura del POS nuevo con catálogo/stock real.
// - Venta completa: producto creado desde Inventario → POS → pedido → stock descontado.
// - Split con cotización: parte en Gs y parte en una cuenta USD con cotización.
// - Borrador con enlace público: se abre sin sesión y muestra el carrito.
// Los hallazgos de dominio se reportan (no se corrigen acá).
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { habilitarRetrySiCuarentena } from './helpers/cuarentena.mjs'

// Cuarentena de flaky (#CI): el retry lo habilita el workflow solo si este spec
// está en MOBOS_E2E_CUARENTENA (ver `.github/workflows/ci.yml`).
habilitarRetrySiCuarentena('pos-qa-173')

const API = SEED.api
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Producto real de inventario: nace con stock por el contador (sin unidades).
async function crearProducto(page, { nombre, precio = 100000, stock = 2, extra = {} }) {
  await page.goto('/pos')
  return page.evaluate(async ({ api, branchId, nombre, precio, stock, extra }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-QA183-${nombre.slice(-6)}`, name: nombre, category: 'Accesorios', pricePyg: precio, costPyg: 60000, stock, branchId, ...extra }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, nombre, precio, stock, extra })
}

async function stockDe(page, productId) {
  return page.evaluate(async ({ api, productId }) => {
    const filas = await fetch(`${api}/api/products?q=`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(filas) ? filas : []).find(p => p.id === productId)?.stock ?? null
  }, { api: API, productId })
}

async function pedidoDe(page, cliente) {
  return page.evaluate(async ({ api, cliente }) => {
    const filas = await fetch(`${api}/api/orders`, { credentials: 'include' }).then(r => r.json())
    return (Array.isArray(filas) ? filas : []).find(o => o.customer?.name === cliente) || null
  }, { api: API, cliente })
}

async function pagarEnPos(page, { cliente, producto, pagos }) {
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
  const search = page.getByPlaceholder('Buscar producto…')
  await search.fill(producto)
  const card = page.getByRole('button', { name: new RegExp(producto) })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.click()
  await expect(page.getByText('Productos de esta venta')).toBeVisible()

  const pagosSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  for (const [indice, pago] of pagos.entries()) {
    await page.getByRole('button', { name: '+ Agregar pago' }).click()
    // Cada fila se busca por su test id: «Cuenta de cobro», «Monto original» y
    // «Cotización» se repiten en todas las filas, así que el índice del pago no
    // alcanza para ubicar el campo correcto (el hallazgo 173-A nació así).
    const fila = pagosSection.getByTestId(`pago-fila-${indice}`)
    await fila.getByLabel('Cuenta de cobro').click()
    await page.getByRole('option', { name: new RegExp(pago.cuenta) }).click()
    await fila.getByLabel('Monto original').fill(pago.monto)
    if (pago.cotizacion) {
      // La cotización vive en la misma fila y solo aparece en cuentas USD/BRL.
      await fila.getByLabel('Cotización').fill(pago.cotizacion)
    }
    // El equivalente confirma que la fila se convirtió con la cotización tipeada
    // antes de enviar (si la conversión quedara vacía, el cobro no cierra).
    if (pago.equivalente) await expect(fila.getByText(`Equivalente: ${pago.equivalente}`)).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ })).toBeVisible()
  await page.getByRole('button', { name: /^(Confirmar venta|Crear pedido)/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible({ timeout: 20_000 })
}

test('venta completa desde inventario: el POS vende el producto y descuenta stock', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo QA ${id}`
  const cliente = `Cliente QA ${id}`
  const { productId } = await crearProducto(page, { nombre, stock: 2 })
  try {
    await pagarEnPos(page, { cliente, producto: nombre, pagos: [{ cuenta: 'Caja E2E', monto: '100000', equivalente: 'Gs 100.000' }] })
    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    expect(Number(orden.totalPyg)).toBe(100000)
    expect(await stockDe(page, productId), 'el stock baja de 2 a 1').toBe(1)
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('split con cotización: parte en guaraníes y parte en dólares', async ({ page }) => {
  // Hallazgo 173-A (POS), corregido: el split con una cuenta USD y su
  // cotización quedaba «Pendiente» porque la cotización tipeada no se aplicaba
  // a la fila. Ahora cada fila del cobro se edita por separado y el equivalente
  // en Gs se calcula con la cotización de esa fila.
  const id = clave()
  const nombre = `Equipo split QA ${id}`
  const cliente = `Cliente split QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 100000, stock: 1 })
  // Cuenta en dólares para cobrar la segunda parte.
  await page.evaluate(async ({ api, id }) => {
    const respuesta = await fetch(`${api}/api/payment-accounts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Cuenta USD QA ${id}`, currency: 'USD', kind: 'CASH', isActive: true, feePercent: 0 }) })
    if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => null))?.message || `payment-accounts: ${respuesta.status}`)
  }, { api: API, id })
  try {
    await pagarEnPos(page, { cliente, producto: nombre, pagos: [
      { cuenta: 'Caja E2E', monto: '25000', equivalente: 'Gs 25.000' },
      { cuenta: `Cuenta USD QA ${id}`, monto: '10', cotizacion: '7500', equivalente: 'Gs 75.000' },
    ] })
    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    const confirmados = (orden.payments || []).filter(p => p.status === 'CONFIRMED')
    expect(confirmados.length).toBeGreaterThanOrEqual(2)
    const enDolares = confirmados.find(p => p.currency === 'USD')
    expect(enDolares, 'la parte en dólares queda con su cotización').toBeTruthy()
    expect(Number(enDolares.originalAmount)).toBe(10)
    expect(Number(enDolares.exchangeRatePyg)).toBe(7500)
    expect(Number(enDolares.amountPyg)).toBe(75000)
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('el borrador con enlace público se abre sin sesión y muestra el carrito', async ({ page, browser }) => {
  const id = clave()
  const nombre = `Equipo borrador QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 150000, stock: 1 })
  let contexto
  try {
    // Se suspende el carrito y se genera su enlace público (misma API que usa el POS).
    const enlace = await page.evaluate(async ({ api, productId, branchId }) => {
      const pedir = async (ruta, opciones = {}) => {
        const respuesta = await fetch(`${api}/api/${ruta}`, { credentials: 'include', headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined, ...opciones })
        const payload = await respuesta.json().catch(() => null)
        if (!respuesta.ok) throw new Error(`${ruta}: ${payload?.message || respuesta.status}`)
        return payload
      }
      const suspendida = await pedir('suspended-sales', { method: 'POST', body: JSON.stringify({ branchId, label: 'QA 173', payload: { items: [{ productId, name: 'Equipo borrador', quantity: 1, unitPricePyg: 150000 }], totalPyg: 150000 } }) })
      const publica = await pedir('suspended-sales', { method: 'PATCH', body: JSON.stringify({ id: suspendida.id }) })
      return publica?.token || publica?.publicToken || null
    }, { api: API, productId, branchId: SEED.branchId })
    expect(enlace, 'el borrador devuelve un token público').toBeTruthy()

    // Sin sesión: contexto nuevo y limpio.
    contexto = await browser.newContext()
    const anonima = await contexto.newPage()
    await anonima.goto(`/carrito/${enlace}`)
    await expect(anonima.locator('body')).toContainText(/Equipo borrador|QA 173/i, { timeout: 20_000 })
  } finally {
    await contexto?.close()
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('carrito ultra-colapsado: el descuento individual se ve sin desplegar (#148 §5, #243)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo descuento QA ${id}`
  const cliente = `Cliente descuento QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 100000, stock: 1 })
  try {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await page.getByPlaceholder('Buscar producto…').fill(nombre)
    await page.getByRole('button', { name: new RegExp(nombre) }).click()
    await expect(page.getByText('Productos de esta venta')).toBeVisible()

    const fila = page.locator('#pos-resumen-venta .divide-y > div').first()
    // Con el detalle abierto se aplica el 10% de descuento de la línea.
    await fila.getByRole('button', { name: `Ver detalle de ${nombre}` }).click()
    await fila.getByLabel(`Descuento % de ${nombre}`).fill('10')

    // Colapsada: el descuento y el total de la línea siguen a la vista y la
    // cantidad/precio quedan guardados en el detalle.
    await fila.getByRole('button', { name: `Ver menos detalle de ${nombre}` }).click()
    await expect(fila.getByText('descuento − Gs 10.000')).toBeVisible()
    await expect(fila.getByText('Gs 90.000')).toBeVisible()
    await expect(fila.getByLabel(`Cantidad de ${nombre}`)).toHaveCount(0)
    await expect(fila.getByLabel(`Precio de venta de ${nombre}`)).toHaveCount(0)

    // Con descuento, la papelera pide confirmación (#243): cancelar conserva la
    // línea; confirmar la elimina junto con la venta.
    const papelera = fila.getByRole('button', { name: `Eliminar ${nombre}` })
    await expect(papelera).toHaveAttribute('title', 'Eliminar línea')
    await papelera.click()
    const confirmar = page.getByRole('dialog')
    await expect(confirmar).toContainText('un descuento')
    await confirmar.getByRole('button', { name: 'Cancelar' }).click()
    await expect(fila.getByText('descuento − Gs 10.000')).toBeVisible()

    await papelera.click()
    await confirmar.getByRole('button', { name: 'Eliminar línea' }).click()
    await expect(page.getByText('Todavía no agregaste productos.')).toBeVisible()
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})

test('split: un bloque marcado como no pagado deja el saldo pendiente y el pedido parcial (#148 §11)', async ({ page }) => {
  const id = clave()
  const nombre = `Equipo no pagado QA ${id}`
  const cliente = `Cliente no pagado QA ${id}`
  const { productId } = await crearProducto(page, { nombre, precio: 100000, stock: 1 })
  try {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(cliente)
    await page.getByPlaceholder('Buscar producto…').fill(nombre)
    await page.getByRole('button', { name: new RegExp(nombre) }).click()
    await expect(page.getByText('Productos de esta venta')).toBeVisible()

    // Dos bloques: 40.000 cobrados y 60.000 que no se cobran.
    const pagos = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
    for (const [indice, monto] of [['0', '40000'], ['1', '60000']]) {
      await page.getByRole('button', { name: '+ Agregar pago' }).click()
      const fila = pagos.getByTestId(`pago-fila-${indice}`)
      await fila.getByLabel('Cuenta de cobro').click()
      await page.getByRole('option', { name: /Caja E2E/ }).first().click()
      await fila.getByLabel('Monto original').fill(monto)
    }

    // El bloque 2 se marca «No pagado»: no suma al cobrado y el pendiente vuelve.
    const filaDos = pagos.getByTestId('pago-fila-1')
    const chip = filaDos.getByRole('button', { name: 'Pagado' })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await chip.click()
    await expect(filaDos.getByRole('button', { name: 'No pagado' })).toBeVisible()
    await expect(pagos.getByTestId('cobro-pendiente')).toContainText('Gs 60.000')
    await expect(pagos.getByTestId('cobro-pagado')).toContainText('Gs 40.000')

    // La venta queda parcial: se guarda como pedido (no «Confirmar venta»).
    const boton = page.getByRole('button', { name: /^Crear pedido/ })
    await expect(boton).toBeVisible()
    await boton.click()
    await expect(page.getByText(/Venta registrada correctamente/)).toBeVisible({ timeout: 20_000 })

    const orden = await pedidoDe(page, cliente)
    expect(orden, 'el pedido queda registrado').toBeTruthy()
    const pagosOrden = orden.payments || []
    expect(pagosOrden.filter(p => p.status === 'CONFIRMED').reduce((s, p) => s + Number(p.amountPyg), 0)).toBe(40000)
    expect(pagosOrden.filter(p => p.status === 'PENDING').reduce((s, p) => s + Number(p.amountPyg), 0)).toBe(60000)
    expect(orden.status).toBe('PENDING')
  } finally {
    await page.evaluate(async ({ api, productId }) => {
      await fetch(`${api}/api/products?id=${encodeURIComponent(productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, productId })
  }
})
