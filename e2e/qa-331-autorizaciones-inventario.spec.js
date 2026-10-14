import { selectInventorySection } from './helpers/shell-navigation.js'
// #331 · Inventario resuelve las autorizaciones de stock desde su propia
// bandeja (Control → Autorizaciones): retiro/ajuste de unidad y transferencia.
//
// El recorrido pedido → aprobado usa el vendedor sembrado, que pide por API con
// el mismo POST que dispara UnidadDetalle, y el dueño, que resuelve desde la
// bandeja. La semántica no cambia: lo aprobado se consume una sola vez con el
// PATCH de inventory-units que ejecuta la ficha (acá se verifica el ciclo
// completo vía API, sin duplicar ese flujo de UI). Capturas claro/oscuro y
// 390/1280 en el último test.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { contextoVendedorApi } from './helpers/seller-api.js'
import { auditarContraste, informar, SHELL } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const marca = () => `A331${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
const motivo = (clave) => `Retiro de prueba ${clave}: sale de stock para revisión.`

// Unidad propia en la sucursal del vendedor sembrado (el backend exige que la
// solicitud esté dentro del alcance de quien la pide).
async function prepararUnidad(page, clave) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, clave }) => {
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
    const producto = await pedir('products', {
      method: 'POST',
      body: JSON.stringify({ sku: `ZZ-A331-${clave}`, name: `iPhone A331 ${clave} · 128 GB`, category: 'Celulares', pricePyg: 2600000, costPyg: 1900000, stock: 0, branchId }),
    })
    const serial = `A331${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 10)}`
    const unidad = await pedir('inventory-units', {
      method: 'POST',
      body: JSON.stringify({ productId: producto.id, branchId, serial, condition: 'USED', batteryHealth: 88 }),
    })
    return { productId: producto.id, unitId: unidad.id, serial: unidad.serial }
  }, { api: API, branchId: SEED.branchId, clave })
}

// El vendedor pide exactamente como lo hace UnidadDetalle (POST STOCK_ADJUST).
async function solicitarComoVendedor(browser, datos, texto) {
  const vendedor = await contextoVendedorApi({ origen: `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}` })
  try {
    const res = await vendedor.post('/api/authorizations', {
      data: { kind: 'STOCK_ADJUST', requestedValue: { unitId: datos.unitId, action: 'remove', reason: texto } },
    })
    const respuesta = { status: res.status(), data: await res.json().catch(() => null) }
    expect(respuesta.status, `solicitud del vendedor: ${JSON.stringify(respuesta.data)}`).toBe(201)
    return respuesta.data
  } finally {
    await vendedor.dispose()
  }
}

// Baja la unidad, resuelve la solicitud si quedó pendiente (para no dejar
// pedidos huérfanos en la bandeja) y borra el producto de prueba.
async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      if (datos.authId) {
        await fetch(`${api}/api/authorizations`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.authId, action: 'reject', resolvedNote: 'Limpieza del spec de QA' }) }).catch(() => {})
      }
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.unitId, action: 'remove', reason: 'Limpieza del spec de QA' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* limpieza best-effort */ }
}

// Abre Inventario → Control → Autorizaciones (la bandeja vive en la pestaña).
async function abrirBandeja(page) {
  await page.goto('/inventario/unidades')
  await selectInventorySection(page, 'autorizaciones')
  const bandeja = page.getByTestId('inventario-autorizaciones')
  await expect(bandeja).toBeVisible({ timeout: 20_000 })
  return bandeja
}

// Estado actual de la autorización de una unidad, leído del API.
async function autorizacionDe(page, unitId) {
  return page.evaluate(async ({ api, unitId }) => {
    const res = await fetch(`${api}/api/authorizations?kind=STOCK_ADJUST`, { credentials: 'include' })
    const rows = await res.json()
    return rows.find((row) => row.entityId === unitId) || null
  }, { api: API, unitId })
}

test('el dueño ve y aprueba una solicitud de stock desde Inventario (#331)', async ({ page, browser }) => {
  const clave = marca()
  const datos = await prepararUnidad(page, clave)
  try {
    datos.authId = (await solicitarComoVendedor(browser, datos, motivo(clave))).id
    const bandeja = await abrirBandeja(page)

    const fila = bandeja.getByTestId('autorizacion-stock-pendiente').filter({ hasText: datos.serial })
    await expect(fila).toBeVisible({ timeout: 20_000 })
    await expect(fila).toContainText(`iPhone A331 ${clave}`)
    await expect(fila).toContainText(motivo(clave))
    await expect(fila).toContainText(SEED.sellers[0].name)
    await expect(fila).toContainText('Dar de baja')

    // #331: Stock refleja los pendientes con un contador en la vista Autorizaciones
    // (la pestaña Control es del shell, que no lleva contadores) y deja a Control activa.
    await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="control"]')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('subtabs-inventario').getByRole('tab', { name: /Autorizaciones/ })).toContainText(/\d+/)

    await fila.getByRole('button', { name: 'Aprobar' }).click()
    const modal = page.getByRole('dialog')
    await expect(modal.getByRole('heading', { name: /Aprobar/ })).toBeVisible()
    await modal.getByRole('button', { name: 'Aprobar' }).click()
    await expect(page.getByText('Solicitud aprobada', { exact: false })).toBeVisible()
    const resuelta = bandeja.getByTestId('autorizacion-stock-resuelta').filter({ hasText: datos.serial })
    await expect(resuelta).toContainText('Aprobada')

    // Semántica intacta: la aprobación queda sin consumir, lista para que el
    // vendedor ejecute el retiro desde la ficha.
    const aprobada = await autorizacionDe(page, datos.unitId)
    expect(aprobada?.status).toBe('APPROVED')
    expect(aprobada?.usedAt).toBeFalsy()
    expect(aprobada?.resolvedValue).toEqual({ approved: true })

    // La ejecución es el mismo PATCH que dispara UnidadDetalle: consume la
    // autorización (usedAt) y recién ahí retira la unidad.
    const vendedor = await contextoVendedorApi({ origen: `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}` })
    try {
      const res = await vendedor.patch('/api/inventory-units', {
        data: { id: datos.unitId, action: 'remove', reason: 'Ejecución con autorización aprobada', authorizationId: aprobada.id },
      })
      expect(res.status()).toBe(200)
    } finally {
      await vendedor.dispose()
    }
    await expect.poll(async () => (await autorizacionDe(page, datos.unitId))?.usedAt || null).toBeTruthy()
  } finally {
    await limpiar(page, datos)
  }
})

test('rechazar sin motivo se valida junto al campo y deja el historial (#331)', async ({ page, browser }) => {
  const clave = marca()
  const datos = await prepararUnidad(page, clave)
  try {
    datos.authId = (await solicitarComoVendedor(browser, datos, motivo(clave))).id
    const bandeja = await abrirBandeja(page)

    const fila = bandeja.getByTestId('autorizacion-stock-pendiente').filter({ hasText: datos.serial })
    await expect(fila).toBeVisible({ timeout: 20_000 })
    await fila.getByRole('button', { name: 'Rechazar' }).click()

    const modal = page.getByRole('dialog')
    await modal.getByRole('button', { name: 'Rechazar' }).click()
    // #323: el motivo se valida junto al campo, no por toast.
    await expect(modal.getByText('Contale al vendedor por qué se rechaza.')).toBeVisible()
    await modal.getByLabel('Motivo del rechazo').fill('No corresponde: el equipo no tiene daños.')
    await modal.getByRole('button', { name: 'Rechazar' }).click()
    await expect(page.getByText('Solicitud rechazada', { exact: false })).toBeVisible()

    const resuelta = bandeja.getByTestId('autorizacion-stock-resuelta').filter({ hasText: datos.serial })
    await expect(resuelta).toContainText('Rechazada')
    await expect(resuelta).toContainText('No corresponde: el equipo no tiene daños.')

    const estado = await autorizacionDe(page, datos.unitId)
    expect(estado?.status).toBe('REJECTED')
    expect(estado?.resolvedNote).toBe('No corresponde: el equipo no tiene daños.')
    expect(estado?.usedAt).toBeFalsy()
  } finally {
    await limpiar(page, datos)
  }
})

test('la bandeja queda capturada en claro/oscuro 1280 y 390 con AA (#331)', async ({ page, browser }) => {
  const clave = marca()
  const datos = await prepararUnidad(page, clave)
  try {
    datos.authId = (await solicitarComoVendedor(browser, datos, motivo(clave))).id
    mkdirSync(SHOTS, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width: ancho, height: alto })
        await page.addInitScript(({ modo }) => {
          try { localStorage.setItem('mobos:theme', modo) } catch { /* sin storage */ }
        }, { modo })
        const bandeja = await abrirBandeja(page)
        const fila = bandeja.getByTestId('autorizacion-stock-pendiente').filter({ hasText: datos.serial })
        await expect(fila).toBeVisible({ timeout: 20_000 })
        await fila.scrollIntoViewIfNeeded()
        const medicion = await auditarContraste(page, SHELL)
        informar(`a331-bandeja-${vista}-${tema}`, medicion)
        await page.screenshot({ path: `${SHOTS}/c331-autorizaciones-stock-${tema}-${vista}.png` })
        expect(medicion.bajos, `AA del shell (${vista} ${tema})`).toEqual([])
      }
    }
  } finally {
    await limpiar(page, datos)
  }
})
