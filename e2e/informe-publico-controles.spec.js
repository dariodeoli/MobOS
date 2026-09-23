// #240: el informe público muestra los controles del dispositivo (iCloud,
// ESN/Blacklist y carrier/SIM) de la última consulta IMEI, con semáforo. Solo
// se publican los locks que el panel informó con valor (sin «—» verdes).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/informe-publico-controles'
const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

// IMEI ficticio con dígito control válido (mismo criterio que el harness de IMEI).
function imeiValido() {
  const base = `35${String(Date.now()).slice(-11)}${Math.floor(Math.random() * 10)}`.slice(0, 14)
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
}

async function preparar(page, imei) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, imei }) => {
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
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-CTRL-${imei.slice(-6)}`, name: `iPhone QA ${imei.slice(-6)}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }) })
    const unidad = await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId, serial: imei, condition: 'USED' }) })
    // Consulta mock «ok»: Find My Off, SIM Unlocked, blacklist sin reportes, sin MDM.
    const consulta = await pedir('imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-240ctrl-${Date.now()}` }) })
    return { productId: producto.id, unitId: unidad.id, status: consulta?.status }
  }, { api: API, branchId: SEED.branchId, imei })
}

async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.unitId, action: 'remove', reason: 'Limpieza del spec de controles públicos' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

test('el informe público muestra los controles del dispositivo con semáforo', async ({ page }) => {
  const imei = imeiValido()
  const datos = await preparar(page, imei)
  expect(datos.status).toBe('verificado')
  try {
    await page.goto(`/u/${imei}`)
    await expect(page.getByText('Informe de dispositivo').first()).toBeVisible({ timeout: 15_000 })
    const tarjeta = page.locator('section', { hasText: 'Consulta de IMEI' }).first()
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText('iCloud: Off')
    await expect(tarjeta).toContainText('ESN/Blacklist: Sin reportes actuales')
    await expect(tarjeta).toContainText('Carrier/SIM: Unlocked')
    // Semáforo: los tres locks informados están limpios (verde).
    await expect(tarjeta.getByText('iCloud: Off')).toHaveClass(/text-ok/)
    // Un lock sin dato no se publica como chip.
    await expect(tarjeta).not.toContainText('MDM')
    // El IMEI sigue enmascarado en el informe.
    await expect(tarjeta).not.toContainText(imei)

    mkdirSync(SALIDA, { recursive: true })
    await page.screenshot({ path: `${SALIDA}/01-informe-publico-controles.png`, fullPage: true })
  } finally { await limpiar(page, datos) }
})
