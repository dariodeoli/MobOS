// #241 · Lote C (Inventario y Compras) — cierre: el tile de equipo suma el
// **grado oficial** (#240) y los **chips de locks** con su fuente y hora, con el
// flag `preview v2`; sin el flag el tile queda como estaba.
//
// Autosuficiente: crea su producto y su unidad con un IMEI Luhn válido, guarda
// una inspección (grado A) y deja una consulta IMEI real del serial (adaptador
// simulado del arnés). Capturas antes/después: las del antes son las del lote
// (`c241f4b-inventario-tiles-*`, tile sin grado ni locks) y las de acá son el
// después (`c241f4c-inventario-tiles-*`).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { auditarContraste, informar, SHELL } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const marca = () => `LC${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// IMEI ficticio con checksum Luhn válido (mismo criterio que imei-mock.spec.js).
function imeiValido() {
  const base = `35${String(Date.now()).slice(-11)}${Math.floor(Math.random() * 10)}`.slice(0, 14)
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
}

// Unidad propia + inspección grado A + consulta IMEI guardada del serial.
async function prepararUnidad(page, clave, conInspeccion = true) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, clave, imei, conInspeccion }) => {
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
    let ubicacion = (Array.isArray(ubicaciones) ? ubicaciones : []).find((item) => item.name === 'Piso de venta QA')
    if (!ubicacion) ubicacion = await pedir('stock-locations', { method: 'POST', body: JSON.stringify({ branchId, name: 'Piso de venta QA' }) })
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-LC-${clave}`, name: `iPhone Lote C ${clave} · 128 GB`, category: 'Celulares', pricePyg: 2600000, costPyg: 1900000, stock: 0, branchId }) })
    const unidad = await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId, locationId: ubicacion.id, serial: imei, condition: 'USED', batteryHealth: 91 }) })
    if (conInspeccion) {
      const claves = ['pantalla', 'camaras', 'faceId', 'audio', 'sensores', 'botones', 'conexiones', 'carga', 'bateria', 'carcasa']
      const items = Object.fromEntries(claves.map((item) => [item, { estado: 'ok' }]))
      await pedir('inventory-units', { method: 'PATCH', body: JSON.stringify({ id: unidad.id, action: 'inspection', inspection: { items, cosmetico: 'buen estado', bateriaPct: '91', bateriaCiclos: '480' } }) })
    }
    await pedir('imei', { method: 'POST', body: JSON.stringify({ action: 'precheck', imei: imei, servicio: 'APPLE_BASIC' }) })
    await pedir('imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: imei, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-241-lc-${Date.now()}` }) })
    return { productId: producto.id, unidadId: unidad.id, serial: unidad.serial }
  }, { api: API, branchId: SEED.branchId, clave, imei: imeiValido(), conInspeccion })
}

async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.unidadId, action: 'remove', reason: 'Limpieza del spec de QA' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* limpieza best-effort */ }
}

// Abre el inventario en la vista cuadrícula con el tema/flag pedidos.
async function abrirTiles(page, { modo = 'light', v2 = true } = {}) {
  await page.addInitScript(({ modo, v2 }) => {
    try { localStorage.setItem('mobos:theme', modo); localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0'); localStorage.setItem('mobos:inventario-vista', 'grid') } catch { /* sin storage */ }
  }, { modo, v2 })
  await page.goto('/inventario/unidades')
  const tile = page.getByTestId('inventario-tarjeta').first()
  await expect(tile).toBeVisible({ timeout: 20_000 })
  return tile
}

const tileDe = (page, serial) => page.getByTestId('inventario-tarjeta').filter({ hasText: serial }).first()

test('el tile de equipo muestra el grado oficial y los locks con fuente (#241 lote C)', async ({ page }) => {
  const datos = await prepararUnidad(page, marca())
  try {
    // Con el flag: grado oficial + chips de locks + fuente.
    await abrirTiles(page, { v2: true })
    const tile = tileDe(page, datos.serial)
    await expect(tile).toBeVisible({ timeout: 20_000 })
    await expect(tile).toHaveClass(/v2-tile/)
    await expect(tile.getByText('Grado A')).toBeVisible()
    const locks = tile.getByTestId('tile-locks')
    await expect(locks).toBeVisible()
    expect(await locks.locator('li').count(), 'los cuatro locks del equipo').toBeGreaterThanOrEqual(3)
    await expect(locks.getByText('iCloud / Find My')).toBeVisible()
    const fuente = tile.getByTestId('tile-locks-fuente')
    await expect(fuente).toContainText('Apple Basic')
    await expect(fuente).toContainText(/\d{1,2}\/\d{1,2}\/\d{2,4}/)

    // Sin scroll horizontal en 390 con la cuadrícula y el flag.
    await page.setViewportSize({ width: 390, height: 844 })
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(desborde, `desborde horizontal de ${desborde} px`).toBeLessThanOrEqual(1)

    // Sin el flag: el default no cambia (ni grado ni locks en el tile).
    await abrirTiles(page, { v2: false })
    const tileOff = tileDe(page, datos.serial)
    await expect(tileOff).toBeVisible({ timeout: 20_000 })
    await expect(tileOff).not.toHaveClass(/v2-tile/)
    await expect(tileOff.getByTestId('tile-locks')).toHaveCount(0)
    await expect(tileOff.getByText('Grado A')).toHaveCount(0)
  } finally { await limpiar(page, datos) }
})

test('el tile de equipo queda capturado en claro/oscuro 1280 y 390 con AA (#241 lote C)', async ({ page }) => {
  const datos = await prepararUnidad(page, marca())
  try {
    mkdirSync(SHOTS, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width: ancho, height: alto })
        await abrirTiles(page, { modo, v2: true })
        const tile = tileDe(page, datos.serial)
        await expect(tile).toBeVisible({ timeout: 20_000 })
        await expect(page.locator('.tema-v2').first()).toBeVisible({ timeout: 30_000 })
        await expect(tile.getByTestId('tile-locks')).toBeVisible()
        await tile.scrollIntoViewIfNeeded()
        const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
        informar(`lote-c-tiles-on-${vista}-${tema}`, medicion)
        await page.screenshot({ path: `${SHOTS}/c241f4c-inventario-tiles-on-${tema}-${vista}.png` })
        expect(medicion.bajos, `AA del shell en el tile (${vista} ${tema})`).toEqual([])
      }
    }
    // Muestra con el flag apagado: el default queda igual.
    await page.setViewportSize({ width: 1280, height: 900 })
    await abrirTiles(page, { modo: 'light', v2: false })
    await expect(page.locator('.tema-v2')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/c241f4c-inventario-tiles-off-claro-desktop.png` })
  } finally { await limpiar(page, datos) }
})
