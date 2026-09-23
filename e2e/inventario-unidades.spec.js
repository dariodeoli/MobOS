// Inventario compacto (#122): la tabla muestra condición por color, ubicación
// con color y verificación con usuario real; la verificación rápida y la
// reserva dejan rastro en la cronología por unidad.
//
// Autosuficiente: cada test crea por API su producto, su ubicación, sus
// unidades y (cuando hace falta) su cliente, y limpia al terminar. No depende
// del seed ni del estado que dejaron otras corridas.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Agente de impresión falso (mismo patrón que etiquetas-unidad.spec.js): sin
// impresora real, /health dice presente y /print guarda el trabajo que mandó la
// app, para verificar el contenido y que no se abra el diálogo de respaldo.
async function agenteFalso(page, capturados) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-mobos-print-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  await page.route('http://127.0.0.1:17890/**', (ruta) => {
    const peticion = ruta.request()
    if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cors })
    if (peticion.url().includes('/health')) {
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.6.3', equipo: 'e2e' }) })
    }
    if (peticion.method() === 'POST' && peticion.url().endsWith('/print')) {
      capturados.push(JSON.parse(peticion.postData() || '{}'))
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    }
    return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
  })
}

const textoDelTicket = (capturado) => Buffer.from(String(capturado?.data || ''), 'base64').toString('latin1')

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

// #217/§8: «Vender todos» deja la venta armada en el POS: producto, cantidad,
// IMEI elegidos y precio de lista; el vendedor solo revisa y cobra.
test('vender todos deja el lote elegido en el POS con producto, cantidad e IMEI', async ({ page }) => {
  const clave = marca()
  const datos = await preparar(page, clave)
  const seriales = datos.unidades.slice(0, 2).map((unidad) => unidad.serial)
  const nombre = `iPhone QA ${clave} · 256 GB`
  try {
    await page.goto('/inventario/unidades')
    const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
    // Los seriales del lote comparten el prefijo del spec: filtra las 3 unidades.
    await campo.fill(`ZZINV${clave}`)
    await campo.press('Enter')
    for (const serial of seriales) {
      const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
      await expect(fila).toBeVisible()
      await fila.getByRole('checkbox', { name: new RegExp(serial) }).check()
    }
    await page.getByTestId('vender-todos').click()
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/pos/)
    // La línea nace colapsada (#243): se despliega para ver cantidad e IMEI.
    await page.getByRole('button', { name: `Ver detalle de ${nombre}` }).click()
    await expect(page.getByLabel(`Cantidad de ${nombre}`)).toHaveValue('2')
    // El orden de los IMEI es el del listado (más recientes primero): se piden ambos.
    const linea = page.getByText(/^IMEI ZZINV/)
    await expect(linea).toContainText(seriales[0])
    await expect(linea).toContainText(seriales[1])
    // El precio de lista viajó en la línea: 2 × 3.000.000.
    await expect(page.getByTestId('resumen-compra')).toContainText('6.000.000')
  } finally {
    // El carrito queda persistido por empresa/sucursal: no debe contaminar otros specs.
    await page.evaluate(() => { Object.keys(localStorage).filter((clave) => clave.startsWith('mobos:pos-cart:v1')).forEach((clave) => localStorage.removeItem(clave)) }).catch(() => {})
    await limpiar(page, datos)
  }
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

// Regresión #226: /inventario/alertas quedaba en blanco por TDZ de canViewAlerts.
test('la solapa Alertas renderiza sin quedar en blanco', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(error.message))
  await page.goto('/inventario/alertas')
  await expect(page.getByRole('button', { name: /^Alertas \(/ })).toBeVisible()
  await expect(page.getByText(/Sin alertas de reposición|Bajo el umbral de reposición|Unidades sin costo/).first()).toBeVisible({ timeout: 15_000 })
  expect(errores, `errores de página: ${errores.join(' | ')}`).toEqual([])
})

// #240 §4: modo taller/rack — estados (por verificar → verificado → listo) y
// acciones en serie (verificar/imprimir etiquetas) con la impresión de punta a
// punta por un agente falso: etiquetas por estación, por selección y hoja de
// estación A4, sin impresora real.
test('el modo taller agrupa por estado y verifica e imprime en serie', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const datos = await preparar(page, marca())
  try {
    mkdirSync('test-results/qa-240-taller', { recursive: true })
    await page.goto('/inventario/unidades')
    await expect(page.getByRole('heading', { name: 'Unidades' })).toBeVisible()
    await page.screenshot({ path: 'test-results/qa-240-taller/01-antes-inventario.jpg', type: 'jpeg', quality: 70 })

    await page.goto('/inventario/taller')
    const rack = page.getByTestId('rack-taller')
    await expect(rack).toBeVisible()
    for (const columna of ['por-verificar', 'verificado', 'listo']) {
      await expect(page.getByTestId(`rack-columna-${columna}`)).toBeVisible()
    }
    for (const unidad of datos.unidades) {
      const tile = page.getByTestId('rack-equipo').filter({ hasText: unidad.serial })
      await expect(tile).toBeVisible()
      // Stepper del flujo: recién recibidas arrancan en el paso 1.
      await expect(tile.getByTestId('rack-pasos')).toHaveAttribute('data-paso', '1')
    }
    await page.screenshot({ path: 'test-results/qa-240-taller/02-despues-rack.jpg', type: 'jpeg', quality: 70 })

    // Estaciones: una sola a la vez.
    await page.getByTestId('rack-estacion-por-verificar').click()
    await expect(page.getByTestId('rack-columna-por-verificar')).toBeVisible()
    await expect(page.getByTestId('rack-columna-listo')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/qa-240-taller/04-rack-estacion.jpg', type: 'jpeg', quality: 70 })
    await page.getByTestId('rack-estacion-todas').click()
    await expect(page.getByTestId('rack-columna-listo')).toBeVisible()

    // Filtros: búsqueda por IMEI (y ubicación) sobre el rack.
    await page.getByLabel('Buscar en el taller').fill(datos.unidades[0].serial)
    await expect(page.getByTestId('rack-equipo')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/qa-240-taller/05-rack-busqueda.jpg', type: 'jpeg', quality: 70 })
    await page.getByLabel('Buscar en el taller').fill('')
    await page.getByLabel('Filtrar por ubicación').selectOption({ label: datos.locationName })
    await expect(page.getByTestId('rack-equipo').filter({ hasText: datos.unidades[0].serial })).toBeVisible()
    await page.getByLabel('Filtrar por ubicación').selectOption('')

    // Selección de las unidades nuevas.
    for (const unidad of datos.unidades) await page.getByLabel(`Seleccionar ${unidad.serial}`).check()
    await expect(page.getByTestId('rack-seleccionados')).toHaveText('3 seleccionados')

    // Impresión por estación: el «Imprimir (3)» del carril manda el trabajo
    // directo (sin modal ni diálogo) con las etiquetas de toda la estación.
    await page.getByTestId('rack-imprimir-por-verificar').click()
    await expect(page.getByText('Etiqueta enviada a la impresora.')).toBeVisible({ timeout: 15_000 })
    expect(capturados).toHaveLength(1)
    expect(capturados[0].tipo).toBe('etiquetas-stock')
    const textoEstacion = textoDelTicket(capturados[0])
    for (const unidad of datos.unidades) expect(textoEstacion).toContain(unidad.serial)

    // Impresión en serie: carril completo y modal con alcance (selección,
    // estación o todo lo filtrado) + hoja de estación.
    await page.getByTestId('rack-imprimir-serie').click()
    const modalImpresion = page.getByRole('dialog', { name: 'Imprimir en serie' })
    await expect(modalImpresion).toBeVisible()
    await expect(page.getByTestId('rack-alcance-seleccion')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('rack-alcance-filtrados')).toBeVisible()
    await expect(page.getByTestId('rack-impresion-resumen')).toContainText('3 etiqueta')
    await expect(page.getByTestId('rack-hoja-estacion')).toBeEnabled()
    await page.screenshot({ path: 'test-results/qa-240-taller/06-rack-imprimir-serie.jpg', type: 'jpeg', quality: 70 })

    // Hoja de estación: el A4 del alcance elegido sale con los 3 equipos
    // (mismo camino que usa la app: printHtml sobre el iframe oculto).
    await page.getByTestId('rack-hoja-estacion').click()
    await expect(modalImpresion).toHaveCount(0)
    const marco = page.locator('iframe[aria-hidden="true"]')
    await expect(marco).toHaveCount(1)
    const hoja = await marco.evaluate((frame) => frame.contentDocument?.documentElement?.outerHTML || '')
    expect(hoja).toContain('Hoja de estación')
    expect(hoja).toContain('Equipos en preparación')
    expect(hoja).toContain('Taller')
    for (const unidad of datos.unidades) expect(hoja).toContain(unidad.serial)
    writeFileSync('test-results/qa-240-taller/07-hoja-estacion.html', hoja)
    await marco.evaluate((frame) => frame.remove())

    // Etiquetas en serie de la selección: un solo trabajo directo con las 3.
    await expect(page.getByTestId('rack-seleccionados')).toHaveText('3 seleccionados')
    await page.getByTestId('rack-imprimir-serie').click()
    await expect(modalImpresion).toBeVisible()
    await expect(page.getByTestId('rack-impresion-resumen')).toContainText('3 etiqueta')
    await page.getByTestId('rack-imprimir-serie-confirmar').click()
    await expect.poll(() => capturados.length).toBe(2)
    expect(capturados[1].tipo).toBe('etiquetas-stock')
    const textoLote = textoDelTicket(capturados[1])
    for (const unidad of datos.unidades) {
      expect(textoLote).toContain(unidad.serial)
      expect(textoLote).toContain(`MOBOS:${unidad.serial}`)
    }
    // La impresión directa no deja el respaldo del diálogo abierto.
    await expect(marco).toHaveCount(0)
    await page.screenshot({ path: 'test-results/qa-240-taller/08-rack-etiquetas-enviadas.jpg', type: 'jpeg', quality: 70 })

    // Verificación en serie de las 3 unidades (la impresión limpió la selección).
    for (const unidad of datos.unidades) await page.getByLabel(`Seleccionar ${unidad.serial}`).check()
    await expect(page.getByTestId('rack-seleccionados')).toHaveText('3 seleccionados')
    await page.getByTestId('rack-verificar-lote').click()
    await expect(page.getByText('3 unidades verificadas.')).toBeVisible({ timeout: 20000 })

    // Las tres pasan a «verificado» (todavía sin costo).
    for (const unidad of datos.unidades) {
      const tile = page.getByTestId('rack-columna-verificado').getByTestId('rack-equipo').filter({ hasText: unidad.serial })
      await expect(tile).toBeVisible({ timeout: 20000 })
      await expect(tile.getByTestId('rack-pasos')).toHaveAttribute('data-paso', '2')
    }
    await page.screenshot({ path: 'test-results/qa-240-taller/03-rack-verificado.jpg', type: 'jpeg', quality: 70 })
  } finally {
    await limpiar(page, datos)
  }
})
