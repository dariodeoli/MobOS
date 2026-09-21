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
    await expect(detalle.getByText('Verificado físicamente').first()).toBeVisible()
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
    await modal.getByRole('button', { name: new RegExp(datos.cliente.name) }).first().click()
    await modal.getByLabel('Duración en horas').fill('1')
    await modal.getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(page.getByText(/Reserva creada por 1 hora/)).toBeVisible({ timeout: 15_000 })

    // La cronología de la unidad muestra la reserva con el cliente de la ficha.
    const filaReservada = await buscarUnidad(page, serial)
    await filaReservada.click()
    const detalle2 = page.getByRole('dialog')
    await expect(detalle2.getByText('Reservado', { exact: true })).toBeVisible()
    await expect(detalle2.getByText(new RegExp(datos.cliente.name)).first()).toBeVisible()
    await detalle2.getByRole('button', { name: 'Liberar reserva' }).click()
    await expect(page.getByText('Reserva liberada y unidad disponible.')).toBeVisible({ timeout: 15_000 })
  } finally { await limpiar(page, datos) }
})
