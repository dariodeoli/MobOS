// #279 (A4) · Vender en tránsito: apartar una unidad que viaja desde el panel,
// bloqueada para otras ventas, con el IMEI vinculado al recibir y el aviso en la
// bandeja. `QA_279_ANTES=1` captura el «antes» (la fila en tránsito sin el
// apartado: el código previo no tiene el chip ni la acción).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = join('docs', 'qa', '279-vender-transito')
const ANTES = Boolean(process.env.QA_279_ANTES)
const PREFIJO = ANTES ? 'antes' : 'despues'
const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`.toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

test('#279 · A4: se aparta una unidad en tránsito, queda bloqueada y al llegar se vincula', async ({ page, browser }) => {
  mkdirSync(DIR, { recursive: true })
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
  const adminPage = await adminCtx.newPage()
  await adminPage.goto('/inventario/unidades')
  const marca = clave()
  const serial = `ZZA4E2E${marca}`.slice(0, 20)
  let productoOrigen = ''
  let productoDestino = ''
  let gerenteId = ''
  try {
    // El seed no tiene productos en la sucursal 2 (la API de productos exige la
    // propia): una gerente **sin sucursal** crea la unidad allá y la cerramos;
    // la unidad viaja 2 → 1 en un traslado del dueño.
    const pinGerente = String(1000 + Math.floor(Math.random() * 8999))
    const gerente = await apiPagina(adminPage, '/api/users', { method: 'POST', body: JSON.stringify({ name: `QA 279 Gerente ${marca}`, pin: pinGerente, role: 'GERENTE' }) })
    expect(gerente.status, JSON.stringify(gerente.body)).toBe(201)
    gerenteId = gerente.body.id
    const ctxGerente = await browser.newContext()
    const gerentePage = await ctxGerente.newPage()
    await gerentePage.goto('/login')
    const sesionGerente = await gerentePage.evaluate(async ({ api, pin, sellerId, company }) => {
      const login = await fetch(`${api}/api/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: company.email, password: company.password, deviceId: 'zz279-device' }) })
      const pinR = await fetch(`${api}/api/auth/pin`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sellerId, pin }) })
      return { login: login.status, pin: pinR.status }
    }, { api: API, pin: pinGerente, sellerId: gerente.body.id, company: SEED.company })
    expect(sesionGerente, JSON.stringify(sesionGerente)).toEqual({ login: 200, pin: 200 })
    const producto = await apiPagina(gerentePage, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `ZZ279-${marca}`, name: `ZZ279 iPhone ${marca}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2100000, stock: 0, branchId: SEED.branch2Id, capacity: '128 GB' }) })
    expect(producto.status, JSON.stringify(producto.body)).toBe(201)
    productoOrigen = producto.body.id
    // La unidad en la sucursal 2 la crea el dueño (ADMIN puede operar en cualquier sucursal).
    const unidad = await apiPagina(adminPage, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: productoOrigen, serial, branchId: SEED.branch2Id, condition: 'NEW' }) })
    expect(unidad.status, JSON.stringify(unidad.body)).toBe(201)
    await ctxGerente.close()
    const transferencia = await apiPagina(adminPage, '/api/transfers', { method: 'POST', body: JSON.stringify({ sourceBranchId: SEED.branch2Id, destinationBranchId: SEED.branchId, lines: [{ productId: productoOrigen, quantity: 1, serials: [serial] }] }) })
    expect(transferencia.status, JSON.stringify(transferencia.body)).toBe(201)
    productoDestino = transferencia.body.lines[0].destinationProduct.id

    // La unidad viaja: aparece en «En tránsito» de la sucursal destino.
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: 'En tránsito', exact: true }).click()
    const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
    await expect(fila).toBeVisible({ timeout: 20_000 })
    const listaTransito = page.getByTestId('inventario-tabla')
    await listaTransito.screenshot({ path: join(DIR, `${PREFIJO}-transito-fila-light.png`) })
    for (const modo of ['dark']) {
      await tema(page, modo)
      await listaTransito.screenshot({ path: join(DIR, `${PREFIJO}-transito-fila-${modo}.png`) })
    }

    if (!ANTES) {
      // Apartado desde el menú de la fila, con el cliente buscado en la ficha.
      await fila.getByLabel(`Acciones de ${serial}`).click()
      await page.getByRole('button', { name: 'Apartar para una venta', exact: true }).click()
      const modal = page.getByRole('dialog', { name: 'Apartar equipo en tránsito' })
      await expect(modal).toBeVisible()
      await modal.getByLabel('Cliente del apartado').fill('Cliente A4 E2E')
      await modal.getByLabel('Observación del apartado').fill('Llega mañana; lo espera el cliente (e2e)')
      await page.screenshot({ path: join(DIR, 'apartar-modal-light.png') })
      await modal.getByRole('button', { name: 'Apartar equipo' }).click()
      await expect(page.getByText(/Equipo apartado/)).toBeVisible({ timeout: 20_000 })
      // La fila queda marcada y el segundo intento no puede doble-asignar.
      await expect(fila.getByTestId('unidad-apartada')).toBeVisible()
      await page.screenshot({ path: join(DIR, 'tras-apartar-fila-light.png') })
      const segundo = await apiPagina(adminPage, '/api/transit-assignments', { method: 'POST', body: JSON.stringify({ serial }) })
      expect(segundo.status, JSON.stringify(segundo.body)).toBe(409)
      expect(String(segundo.body?.message || '')).toMatch(/apartado para otra venta/i)

      // Llega la unidad: el IMEI se vincula y la fila sale de tránsito.
      const recepcion = await apiPagina(adminPage, '/api/inventory-units/verify', { method: 'POST', body: JSON.stringify({ serial }) })
      expect(recepcion.status, JSON.stringify(recepcion.body)).toBe(200)
      await page.reload()
      await page.getByTestId('tabs-inventario').getByRole('button', { name: 'Inventario', exact: true }).click()
      const recibida = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
      await expect(recibida).toBeVisible({ timeout: 20_000 })
      await expect(recibida.getByText('Reservado')).toBeVisible()
      await page.screenshot({ path: join(DIR, 'unidad-recibida-reservada-light.png') })

      // El aviso del vínculo, en la campana.
      await page.getByTestId('notificaciones-aviso').click()
      const panel = page.getByTestId('notificaciones-panel')
      await expect(panel).toBeVisible()
      await panel.getByRole('button', { name: 'Actualizar' }).click()
      const aviso = panel.getByRole('button', { name: /Llegó el equipo que apartaste/ }).filter({ hasText: serial })
      await expect(aviso).toBeVisible({ timeout: 20_000 })
      await expect(aviso).toContainText(serial)
      await page.screenshot({ path: join(DIR, 'aviso-vinculo-light.png') })
      for (const modo of ['dark']) {
        await tema(page, modo)
        await page.screenshot({ path: join(DIR, `aviso-vinculo-${modo}.png`) })
      }
    }
  } finally {
    // Limpieza: liberar la reserva, dar de baja la unidad y borrar los productos.
    await apiPagina(adminPage, '/api/inventory-reservations', { method: 'PATCH', body: JSON.stringify({ action: 'release', serials: [serial] }) }).catch(() => {})
    const unidades = await apiPagina(adminPage, `/api/inventory-units?q=${encodeURIComponent(serial)}`).catch(() => ({ body: [] }))
    const filas = Array.isArray(unidades.body) ? unidades.body : unidades.body?.items || []
    for (const filaUnidad of filas) await apiPagina(adminPage, '/api/inventory-units', { method: 'PATCH', body: JSON.stringify({ id: filaUnidad.id, action: 'remove', reason: 'Limpieza QA #279' }) }).catch(() => {})
    for (const id of [productoOrigen, productoDestino]) if (id) await apiPagina(adminPage, `/api/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    if (gerenteId) await apiPagina(adminPage, '/api/users', { method: 'PATCH', body: JSON.stringify({ id: gerenteId, status: 'INACTIVE' }) }).catch(() => {})
    await adminCtx.close()
  }
})
