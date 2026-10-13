// #241 · Lote C (Inventario y Compras) — cierre: el **grado oficial** (#240) y los
// **chips de locks** con su fuente y hora siguen a un clic del equipo en Stock,
// con el flag `preview v2`; sin el flag no cambia el default.
//
// Autosuficiente: crea su producto y su unidad con un IMEI Luhn válido, guarda
// una inspección (grado A) y deja una consulta IMEI real del serial (adaptador
// simulado del arnés). Capturas antes/después: las del antes son las del lote
// (`c241f4b-inventario-tiles-*`, tile sin grado ni locks) y las de acá son el
// después (`c241f4c-inventario-tiles-*`).
//
// Stock unificado: la vista cuadrícula con tiles se retiró. En escritorio
// (>= 768 px) la lista es la fila `inventario-fila` (modelo, IMEI, batería,
// proveedor, costo, estado) y el grado oficial + los locks con fuente viven en
// la ficha que abre la fila. Por debajo, `inventario-tarjeta-movil` (IMEI
// completo, sin grado ni locks). Anti-flake:
// `npx playwright test e2e/qa-241-lote-c-tile.spec.js --repeat-each=3`.
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
  await page.goto('/stock/unidades')
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

const esMovil = (page) => (page.viewportSize()?.width ?? 1280) < 768
const testidFila = (page) => (esMovil(page) ? 'inventario-tarjeta-movil' : 'inventario-fila')
// La lista pagina por cursor: se llega con el serial en la URL (?q=) para que
// la unidad entre en la primera página sin depender del orden.
const filaDe = (page, serial) => page.getByTestId(testidFila(page)).filter({ hasText: serial }).first()

// Abre Stock con el tema/flag pedidos y devuelve la fila (o tarjeta) del serial.
async function abrirLista(page, serial, { modo = 'light', v2 = true } = {}) {
  await page.addInitScript(({ modo, v2 }) => {
    try { localStorage.setItem('mobos:theme', modo); localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0') } catch { /* sin storage */ }
  }, { modo, v2 })
  await page.goto(`/stock/unidades?q=${encodeURIComponent(serial)}`)
  const fila = filaDe(page, serial)
  await expect(fila).toBeVisible({ timeout: 20_000 })
  return fila
}

test('el grado oficial y los locks con fuente están a un clic del equipo en Stock (#241 lote C)', async ({ page }) => {
  const datos = await prepararUnidad(page, marca())
  try {
    // Escritorio con el flag: la fila muestra el IMEI completo y la ficha que
    // abre trae grado oficial + chips de locks + fuente con fecha.
    await page.setViewportSize({ width: 1280, height: 900 })
    const fila = await abrirLista(page, datos.serial, { v2: true })
    await expect(fila.getByTestId('unidad-imei')).toHaveText(datos.serial)
    await fila.getByTestId('unidad-modelo').click()
    const ficha = page.getByRole('dialog')
    await expect(ficha.getByTestId('unidad-phonecheck-oficial')).toContainText('Grado A', { timeout: 20_000 })
    const locks = ficha.getByTestId('unidad-locks')
    await expect(locks).toBeVisible()
    expect(await locks.locator('span').count(), 'chips de locks del equipo').toBeGreaterThan(0)
    const fuente = ficha.getByTestId('unidad-locks-fuente')
    await expect(fuente).toContainText('Apple Basic')
    await expect(fuente).toContainText(/\d{1,2}\/\d{1,2}\/\d{2,4}/)
    await page.keyboard.press('Escape')

    // #304: a 390 entra la tarjeta móvil; su contrato (IMEI completo y estado)
    // manda y no inventa grado ni locks. Sin scroll horizontal.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(fila).toHaveCount(0)
    const movil = filaDe(page, datos.serial)
    await expect(movil).toBeVisible({ timeout: 20_000 })
    await expect(movil.getByTestId('unidad-imei')).toHaveText(datos.serial)
    await expect(movil.getByTestId('tile-locks')).toHaveCount(0)
    await expect(movil.getByText('Grado A')).toHaveCount(0)
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde, `desborde horizontal de ${desborde} px`).toBeLessThanOrEqual(1)

    // Sin el flag el default de escritorio no cambia: sin raíz v2 y sin grado
    // ni locks en la fila.
    await page.setViewportSize({ width: 1280, height: 900 })
    const filaOff = await abrirLista(page, datos.serial, { v2: false })
    await expect(page.locator('.tema-v2')).toHaveCount(0)
    await expect(filaOff.getByTestId('tile-locks')).toHaveCount(0)
    await expect(filaOff.getByText('Grado A')).toHaveCount(0)
  } finally { await limpiar(page, datos) }
})

test('la lista de Stock queda capturada en claro/oscuro 1280 y 390 con AA (#241 lote C)', async ({ page }) => {
  const datos = await prepararUnidad(page, marca())
  try {
    mkdirSync(SHOTS, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width: ancho, height: alto })
        const fila = await abrirLista(page, datos.serial, { modo, v2: true })
        await expect(page.locator('.tema-v2').first()).toBeVisible({ timeout: 30_000 })
        // Fila y tarjeta llevan el IMEI completo; ni una ni otra traen grado ni locks.
        await expect(fila.getByTestId('unidad-imei')).toHaveText(datos.serial)
        await expect(fila.getByTestId('tile-locks')).toHaveCount(0)
        await fila.scrollIntoViewIfNeeded()
        const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
        informar(`lote-c-stock-on-${vista}-${tema}`, medicion)
        await page.screenshot({ path: `${SHOTS}/c241f4c-stock-on-${tema}-${vista}.png` })
        expect(medicion.bajos, `AA del shell en la lista de Stock (${vista} ${tema})`).toEqual([])
      }
    }
    // Muestra con el flag apagado: el default de escritorio queda igual.
    await page.setViewportSize({ width: 1280, height: 900 })
    await abrirLista(page, datos.serial, { modo: 'light', v2: false })
    await expect(page.locator('.tema-v2')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/c241f4c-stock-off-claro-desktop.png` })
  } finally { await limpiar(page, datos) }
})
