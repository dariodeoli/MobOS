// #241 (F3): el tablero real detrás del flag VITE_OPS_V2 (encendido en el
// harness e2e). Lee el rack del taller (#240) y los pedidos reales de la
// empresa sembrada, y deja las capturas claro/oscuro/móvil. La vista previa
// con datos ficticios sigue cubierta en `ops-preview.spec.js`.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const SALIDA = 'test-results/qa-241-ops-tablero'

const clave = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// Crea el modelo por API para poder recibir la unidad desde la UI del
// inventario (la mutación real que después tiene que ver el tablero).
async function crearProductoDeTaller(page, key) {
  const productId = await page.evaluate(async ({ api, branchId, key }) => {
    const respuesta = await fetch(`${api}/api/products`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-OPS-${key}`, name: `Equipo tablero ${key}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }),
    })
    const datos = await respuesta.json().catch(() => null)
    if (!respuesta.ok) throw new Error(datos?.message || `products: ${respuesta.status}`)
    return datos.id
  }, { api: SEED.api, branchId: SEED.branchId, key })
  return { productId, serial: `ZZOPS${key}` }
}

async function limpiarUnidadDeTaller(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      const filas = await fetch(`${api}/api/inventory-units?q=${encodeURIComponent(datos.serial)}`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
      const unidad = (Array.isArray(filas) ? filas : []).find((item) => item.serial === datos.serial)
      if (unidad) {
        await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza del spec del tablero' }) }).catch(() => {})
      }
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: SEED.api, datos })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

test('el tablero F3 lee inventario y pedidos reales detrás del flag', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(`localhost:${API_PORT}`) && url.includes('/api/')) llamadas.push(url)
  })
  mkdirSync(SALIDA, { recursive: true })

  await page.goto('/ops')
  const tablero = page.getByTestId('ops-tablero')
  await expect(tablero).toBeVisible()
  await expect(tablero).toHaveClass(/v2-piloto/)
  await expect(page.getByTestId('ops-preview')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByTestId('ops-actualizado')).toContainText('Datos reales')

  // Los cuatro KPIs, ya no con los números del mock.
  for (const clave of ['cobrado', 'pedidos', 'taller', 'listos']) {
    await expect(page.getByTestId(`ops-kpi-${clave}`)).toBeVisible()
  }
  await expect(page.getByTestId('ops-kpi-cobrado')).toContainText(/Gs\s?[\d.]/)
  await expect(page.getByTestId('ops-kpi-pedidos')).toContainText(/pagados · \d+ pendientes/)

  // Datos reales: consultó inventario y pedidos del backend.
  await expect.poll(() => llamadas.some((url) => url.includes('/api/inventory-units'))).toBe(true)
  await expect.poll(() => llamadas.some((url) => url.includes('/api/orders'))).toBe(true)

  // Las tres colas del taller con equipos reales del rack sembrado.
  for (const estado of ['por-verificar', 'verificado', 'listo']) {
    await expect(page.getByTestId(`ops-cola-${estado}`)).toBeVisible()
  }
  await expect(page.getByTestId('ops-cola-item').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/tablero-claro.jpg`, type: 'jpeg', quality: 72 })

  // Tema oscuro.
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch { /* sin storage */ } })
  await page.reload()
  await expect(page.getByTestId('ops-tablero')).toHaveClass(/v2-piloto/)
  // Espera a que la recarga termine de leer los datos (marca con hora).
  await expect(page.getByTestId('ops-actualizado')).toContainText(/\d{1,2}[:.]\d{2}/)
  await expect(page.getByTestId('ops-kpi-cobrado')).toContainText(/Gs\s?[\d.]/)
  await page.screenshot({ path: `${SALIDA}/tablero-oscuro.jpg`, type: 'jpeg', quality: 72 })

  // Móvil.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Equipos en proceso' })).toBeVisible()
  await expect(page.getByTestId('ops-cola-item').first()).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/tablero-movil.jpg`, type: 'jpeg', quality: 72 })
})

// Datos reales de punta a punta (#240/#241): una unidad recibida desde la UI
// del inventario (mutación real contra el API) aparece en el tablero y el KPI
// «En taller» la cuenta.
test('el tablero F3 cuenta una unidad real recibida en el taller', async ({ page }) => {
  const key = clave()
  await page.goto('/ops')
  const valorTaller = page.getByTestId('ops-valor-taller')
  // El tablero pinta 0 antes de que lleguen los datos: se espera el sello con
  // la hora para que «antes» sea el valor real (base fresca del CI).
  await expect(page.getByTestId('ops-actualizado')).toContainText('·', { timeout: 30_000 })
  await expect(valorTaller).toHaveText(/^\d+$/)
  const antes = Number(await valorTaller.textContent())

  const datos = await crearProductoDeTaller(page, key)
  try {
    // Recepción por el camino real de la app: inventario → + Recibir unidad.
    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: '+ Recibir unidad' }).click()
    const alta = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
    // #250: el alta es dependiente (modelo → capacidad → color) y crea el
    // producto desde el buscador cuando no está en el catálogo.
    const comboModelo = alta.getByRole('combobox').first()
    await comboModelo.fill(`Equipo tablero ${key}`)
    await alta.getByRole('option', { name: new RegExp(`Equipo tablero ${key}`) }).first().click()
    await alta.getByLabel('IMEI o serial', { exact: true }).fill(datos.serial)
    await alta.getByRole('button', { name: 'Guardar unidad' }).click()
    await expect(page.getByText(/1 unidad recibida/)).toBeVisible({ timeout: 15_000 })

    // El tablero la cuenta y la muestra en «Equipos en proceso» y en su cola.
    await page.goto('/ops')
    await expect(valorTaller).toHaveText(String(antes + 1))
    await expect(page.getByTestId('ops-equipo').filter({ hasText: datos.serial })).toBeVisible()
    await expect(page.getByTestId('ops-cola-por-verificar').getByTestId('ops-cola-item').filter({ hasText: key })).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/tablero-datos-reales.jpg`, type: 'jpeg', quality: 72 })
  } finally {
    await limpiarUnidadDeTaller(page, datos)
  }
})
