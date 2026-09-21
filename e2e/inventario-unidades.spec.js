// Inventario compacto (#122): la tabla muestra condición por color, ubicación
// con color y verificación con usuario real; la verificación rápida y la
// reserva dejan rastro en la cronología por unidad.
//
// Autosuficiente: cada test crea por API su producto, su ubicación, sus
// unidades y (cuando hace falta) su cliente, y limpia al terminar. No depende
// del seed ni del estado que dejaron otras corridas.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Crea (o reutiliza) una ubicación propia del spec para no depender del seed.
async function preparar(page, marca) {
  // La app primero: los fetch con cookies necesitan el origen del panel.
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, marca }) => {
    const pedir = async (ruta, opciones = {}) => {
      const respuesta = await fetch(`${api}/api/${ruta}`, {
        credentials: 'include',
        headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
        ...opciones,
      })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`${ruta}: ${datos?.message || respuesta.status}`)
      return datos
    }
    const ubicaciones = await pedir(`stock-locations?branchId=${encodeURIComponent(branchId)}`)
    let ubicacion = (Array.isArray(ubicaciones) ? ubicaciones : []).find(item => item.name === 'Piso de venta QA')
    if (!ubicacion) ubicacion = await pedir('stock-locations', { method: 'POST', body: JSON.stringify({ branchId, name: 'Piso de venta QA' }) })

    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-INV-${marca}`, name: `iPhone QA ${marca} · 256 GB`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }) })
    const unidades = []
    for (let i = 1; i <= 3; i += 1) {
      const unidad = await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId, locationId: ubicacion.id, serial: `ZZINV${marca}${i}`, condition: i === 2 ? 'USED' : 'NEW', batteryHealth: 80 + i }) })
      unidades.push({ id: unidad.id, serial: unidad.serial })
    }
    const cliente = await pedir('customers', { method: 'POST', body: JSON.stringify({ name: `Cliente QA ${marca}`, phone: '0981000000', document: `QA${marca}` }) })
    return { productId: producto.id, locationName: ubicacion.name, unidades, cliente: { id: cliente.id, name: cliente.name } }
  }, { api: API, branchId: SEED.branchId, marca })
}

// Limpieza: libera reservas, saca las unidades del stock visible y da de baja
// el producto. Se ejecuta siempre para que la corrida no deje basura.
async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      for (const unidad of datos.unidades) {
        await fetch(`${api}/api/inventory-reservations`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release', serials: [unidad.serial] }) }).catch(() => {})
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza del spec de QA' }) }).catch(() => {})
      }
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

async function buscarUnidad(page, serial) {
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  return page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
}

test('la tabla muestra ubicación con color, condición y verificación compacta', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    const fila = await buscarUnidad(page, datos.unidades[0].serial)
    await expect(fila).toBeVisible()
    await expect(fila.getByText(datos.locationName)).toBeVisible()
    await expect(fila.getByLabel('Condición: Nuevo')).toBeVisible()
    await expect(fila.getByText(/Sin verificar|\d{2} [a-z]{3} \d{2} · \d{2}:\d{2}/i)).toBeVisible()
  } finally { await limpiar(page, datos) }
})

test('la verificación rápida registra usuario y fecha en la cronología', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    const fila = await buscarUnidad(page, datos.unidades[0].serial)
    await expect(fila).toBeVisible()
    await fila.getByRole('button', { name: '✓ Verificar' }).click()
    await expect(fila.getByText('Sin verificar')).toHaveCount(0, { timeout: 15_000 })

    await fila.click()
    const detalle = page.getByRole('dialog')
    await expect(detalle.getByText(/Verificado por /)).toBeVisible()
    await expect(detalle.getByTestId('unidad-cronologia').getByText('Verificado físicamente')).toBeVisible()
  } finally { await limpiar(page, datos) }
})

test('el detalle muestra QR, código de barras y el ingreso a stock', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    const serial = datos.unidades[1].serial
    const fila = await buscarUnidad(page, serial)
    await fila.click()
    const detalle = page.getByRole('dialog')
    await expect(detalle.getByText('Códigos de esta unidad')).toBeVisible()
    await expect(detalle.locator('img[alt^="QR de"]')).toBeVisible()
    await expect(detalle.getByText('Ingresó a stock').first()).toBeVisible()
    await expect(detalle.getByText(/días? en stock/)).toBeVisible()
    await expect(detalle.getByText(serial, { exact: true }).first()).toBeVisible()
    await detalle.getByRole('button', { name: 'Copiar IMEI/serial' }).click()
  } finally { await limpiar(page, datos) }
})

test('la reserva desde el detalle usa la ficha existente y deja la cronología', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    const serial = datos.unidades[2].serial
    const fila = await buscarUnidad(page, serial)
    await fila.click()
    const detalle = page.getByRole('dialog')
    // La reserva se abre sobre el inventario: el detalle se cierra al abrirla.
    await detalle.getByRole('button', { name: 'Reservar', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Reservar unidad' })
    await expect(modal).toBeVisible()
    await modal.getByPlaceholder('Buscar cliente o reservar sin cliente').fill(datos.cliente.name)
    // Elegir la ficha de la lista y confirmar que quedó seleccionada antes de enviar.
    await modal.getByRole('button', { name: new RegExp(datos.cliente.name) }).first().click()
    await expect(modal.getByText(/Reserva a nombre de la ficha del cliente/)).toBeVisible()
    await modal.getByLabel('Duración en horas').fill('1')
    await modal.getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(page.getByText(/Reserva creada por 1 hora/)).toBeVisible({ timeout: 15_000 })
    await expect(modal).toHaveCount(0)

    // La cronología de la unidad muestra la reserva con el cliente de la ficha.
    const filaReservada = await buscarUnidad(page, serial)
    await filaReservada.click()
    const detalle2 = page.getByRole('dialog')
    await expect(detalle2.getByTestId('unidad-estado')).toHaveText('Reservado')
    const cronologia = detalle2.getByTestId('unidad-cronologia')
    await expect(cronologia.getByText('Reservado', { exact: true })).toBeVisible()
    await expect(cronologia.getByText(new RegExp(datos.cliente.name)).first()).toBeVisible()
    await detalle2.getByRole('button', { name: 'Liberar reserva' }).click()
    await expect(page.getByText('Reserva liberada y unidad disponible.')).toBeVisible({ timeout: 15_000 })
  } finally { await limpiar(page, datos) }
})

// Crea solo el producto (sin unidades) para los tests de costo.
async function crearProducto(page, marca) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, marca }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-COSTO-${marca}`, name: `Producto costo QA ${marca}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return { productId: datos.id }
  }, { api: API, branchId: SEED.branchId, marca })
}

// Limpieza por serial: saca las unidades creadas por el test y da de baja el producto.
async function limpiarSeriales(page, seriales) {
  try {
    await page.evaluate(async ({ api, seriales }) => {
      for (const serial of seriales) {
        const filas = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' }).then(r => r.json()).catch(() => [])
        const unidad = (Array.isArray(filas) ? filas : []).find(item => item.serial === serial)
        if (!unidad) continue
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza del spec de costo' }) }).catch(() => {})
        if (unidad.productId) await fetch(`${api}/api/products?id=${encodeURIComponent(unidad.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
      }
    }, { api: API, seriales })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

test('la carga rápida guarda el costo en USD con su cotización y crea el proveedor', async ({ page }) => {
  const clave = marca()
  const serial = `ZZUSD${clave}`
  const proveedor = `Proveedor QA ${clave}`
  const { productId } = await crearProducto(page, clave)
  try {
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()
    const modal = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
    await expect(modal).toBeVisible()
    // Lo mínimo: modelo y IMEI; el proveedor y el costo son opcionales.
    await modal.getByLabel('Modelo', { exact: true }).selectOption(productId)
    await modal.getByLabel('IMEI o serial', { exact: true }).fill(serial)
    await modal.getByLabel('Proveedor', { exact: true }).fill(proveedor)
    await modal.getByLabel('Moneda del costo', { exact: true }).selectOption('USD')
    await modal.getByLabel('Monto del costo', { exact: true }).fill('350,50')
    await modal.getByLabel('Cotización', { exact: true }).fill('7500')
    await expect(modal.getByText('Costo en Gs:')).toBeVisible()
    await modal.getByRole('button', { name: 'Guardar unidad' }).click()
    await expect(page.getByText(/1 unidad recibida/)).toBeVisible({ timeout: 15_000 })

    // El costo queda convertido a Gs y el proveedor nuevo, en el catálogo.
    const datos = await page.evaluate(async ({ api, serial, proveedor }) => {
      const filas = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' }).then(r => r.json())
      const unidad = (Array.isArray(filas) ? filas : []).find(item => item.serial === serial)
      const proveedores = await fetch(`${api}/api/suppliers?q=${encodeURIComponent('Proveedor QA')}`, { credentials: 'include' }).then(r => r.json())
      return {
        costPyg: unidad?.costPyg, originalCost: unidad?.originalCost, costCurrency: unidad?.costCurrency, exchangeRatePyg: unidad?.exchangeRatePyg,
        proveedor: unidad?.supplier?.name || unidad?.supplierName || null,
        proveedorCreado: (Array.isArray(proveedores) ? proveedores : []).some(p => p.name === proveedor),
      }
    }, { api: API, serial, proveedor })
    expect(datos.costPyg).toBe(2628750)
    expect(Number(datos.originalCost)).toBe(350.5)
    expect(datos.costCurrency).toBe('USD')
    expect(Number(datos.exchangeRatePyg)).toBe(7500)
    expect(datos.proveedor).toBe(proveedor)
    expect(datos.proveedorCreado).toBe(true)

    // En la tabla ya no figura como pendiente de costo.
    const fila = await buscarUnidad(page, serial)
    await expect(fila.getByText('Sin costo')).toHaveCount(0)
  } finally { await limpiarSeriales(page, [serial]) }
})

test('el costo se puede dejar pendiente y completar desde el detalle', async ({ page }) => {
  const clave = marca()
  const serial = `ZZSINC${clave}`
  const { productId } = await crearProducto(page, clave)
  try {
    // Alta sin costo (la carga rápida lo permite: queda pendiente).
    await page.evaluate(async ({ api, productId, serial, branchId }) => {
      const respuesta = await fetch(`${api}/api/inventory-units`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, serial, branchId }) })
      if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => null))?.message || `inventory-units: ${respuesta.status}`)
    }, { api: API, productId, serial, branchId: SEED.branchId })

    const fila = await buscarUnidad(page, serial)
    await expect(fila.getByText('Sin costo')).toBeVisible()

    await fila.click()
    const detalle = page.getByRole('dialog')
    const costo = detalle.getByTestId('unidad-costo')
    await expect(costo.getByText('Pendiente', { exact: true })).toBeVisible()
    await costo.getByLabel('Monto del costo', { exact: true }).fill('1.500.000')
    await costo.getByTestId('unidad-costo-guardar').click()
    await expect(page.getByText('Costo guardado.')).toBeVisible({ timeout: 15_000 })
    await expect(costo.getByText('Cargado', { exact: true })).toBeVisible()
    // La cronología deja el evento del costo con su valor.
    const cronologia = detalle.getByTestId('unidad-cronologia')
    await expect(cronologia.getByText('Costo del equipo')).toBeVisible()
    await expect(cronologia.getByText(/Gs 1\.500\.000/)).toBeVisible()

    const guardado = await page.evaluate(async ({ api, serial }) => {
      const filas = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(serial)}`, { credentials: 'include' }).then(r => r.json())
      return (Array.isArray(filas) ? filas : []).find(item => item.serial === serial)?.costPyg ?? null
    }, { api: API, serial })
    expect(guardado).toBe(1500000)
  } finally { await limpiarSeriales(page, [serial]) }
})

// #209: el motivo de baja arranca con el último usado y la pantalla lo avisa.
test('el motivo de baja recuerda el último usado', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    await (await buscarUnidad(page, datos.unidades[0].serial)).click()
    const detalle = page.getByRole('dialog')
    await detalle.getByRole('button', { name: 'Dar de baja' }).click()
    const baja = page.getByRole('dialog', { name: 'Dar de baja' })
    await baja.getByLabel('Motivo').selectOption('Daño')
    await baja.getByPlaceholder('Indicá el motivo').fill('Pantalla rota (QA #209)')
    await baja.getByRole('button', { name: 'Dar de baja' }).click()
    await expect(page.getByText(/retirado/)).toBeVisible({ timeout: 15_000 })

    // Segunda baja, tras recargar: el motivo viene recordado y se avisa.
    await page.reload()
    await (await buscarUnidad(page, datos.unidades[1].serial)).click()
    const detalle2 = page.getByRole('dialog')
    await detalle2.getByRole('button', { name: 'Dar de baja' }).click()
    const baja2 = page.getByRole('dialog', { name: 'Dar de baja' })
    await expect(baja2.getByLabel('Motivo')).toHaveValue('Daño')
    await expect(baja2.getByText('Recordamos tu último motivo')).toBeVisible()
    const guardado = await page.evaluate(() => {
      const crudo = localStorage.getItem('mobos:inventario:motivo-baja')
      try { return JSON.parse(crudo) } catch { return crudo }
    })
    expect(guardado).toBe('Daño')
  } finally { await limpiar(page, datos) }
})

// #209: la carga rápida arranca con la última sucursal y depósito usados.
test('la carga rápida recuerda la última sucursal y depósito', async ({ page }) => {
  const clave = marca()
  const serial = `ZZMEM${clave}`
  const { productId } = await crearProducto(page, clave)
  const ubicacion = await page.evaluate(async ({ api, branchId, clave }) => {
    const respuesta = await fetch(`${api}/api/stock-locations`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId, name: `Depósito memoria ${clave}` }) })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `stock-locations: ${respuesta.status}`)
    return datos
  }, { api: API, branchId: SEED.branchId, clave })
  try {
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()
    const alta = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
    await alta.getByLabel('Modelo', { exact: true }).selectOption(productId)
    await alta.getByLabel('IMEI o serial', { exact: true }).fill(serial)
    await alta.getByLabel('Ubicación', { exact: true }).selectOption(ubicacion.id)
    await alta.getByRole('button', { name: 'Guardar unidad' }).click()
    await expect(page.getByText(/1 unidad recibida/)).toBeVisible({ timeout: 15_000 })

    // Al reabrir (incluso tras recargar) quedan recordadas y se avisa.
    await page.reload()
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()
    const siguiente = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
    await expect(siguiente.getByLabel('Sucursal', { exact: true })).toHaveValue(SEED.branchId)
    await expect(siguiente.getByLabel('Ubicación', { exact: true })).toHaveValue(ubicacion.id)
    await expect(siguiente.getByText('Recordamos tu última sucursal y depósito')).toBeVisible()
  } finally { await limpiarSeriales(page, [serial]) }
})
