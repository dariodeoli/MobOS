// #240: el informe público por serial muestra el checklist de la inspección
// (semáforo + resumen de conformes) con las notas únicamente de los ítems no
// conformes: las notas de los ítems OK no viajan al enlace compartido.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'test-results/informe-publico-checklist'
const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function preparar(page, clave) {
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
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-PUB-${clave}`, name: `iPhone QA ${clave} · 256 GB`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }) })
    const unidad = await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId, serial: `ZZPUB${clave}`, condition: 'USED' }) })
    return { productId: producto.id, unitId: unidad.id, serial: unidad.serial }
  }, { api: API, branchId: SEED.branchId, clave })
}

async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.unitId, action: 'remove', reason: 'Limpieza del spec del informe público' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* la limpieza no puede hacer fallar el test */ }
}

test('el informe público muestra el checklist con notas solo de lo no conforme', async ({ page }) => {
  const clave = marca()
  const datos = await preparar(page, clave)
  try {
    // Inspección: un ítem OK (con una nota que NO debe viajar) y otro con observación.
    await page.goto('/inventario/unidades')
    const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
    await campo.fill(datos.serial)
    await campo.press('Enter')
    const fila = page.getByTestId('inventario-fila').first()
    await fila.waitFor({ state: 'visible', timeout: 15_000 })
    await fila.click()
    const ficha = page.getByRole('dialog')
    const checklist = ficha.getByTestId('unidad-phonecheck')
    await checklist.getByRole('button', { name: 'Bien', exact: true }).nth(0).click()
    await checklist.getByRole('button', { name: 'Con observación', exact: true }).nth(1).click()
    await ficha.getByLabel('Nota de Pantalla / táctil').fill('nota interna que no se comparte')
    await ficha.getByLabel('Nota de Cámaras (frontal y traseras)').fill('Mancha en el lente')
    await ficha.getByTestId('unidad-phonecheck-guardar').click()
    await expect(page.getByText('Inspección guardada.')).toBeVisible({ timeout: 15_000 })

    // El enlace público muestra el checklist con el semáforo y el resumen.
    await page.goto(`/u/${datos.serial}`)
    await expect(page.getByText('Informe de dispositivo').first()).toBeVisible({ timeout: 15_000 })
    const tarjeta = page.locator('section', { hasText: 'Checklist de inspección' }).first()
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText('1 de 2 conformes')
    await expect(tarjeta).toContainText('75/100')
    await expect(tarjeta).toContainText('Pantalla / táctil')
    await expect(tarjeta).toContainText('Cámaras (frontal y traseras)')
    await expect(tarjeta).toContainText('Mancha en el lente')
    // Privacidad: la nota del ítem conforme no viaja al informe compartido.
    await expect(tarjeta).not.toContainText('nota interna que no se comparte')
    // El grado de la inspección acompaña al checklist (en la ficha y en el certificado).
    await expect(page.getByText('Grado B').first()).toBeVisible()

    // #240: el certificado compartido (FichaCertificado + CodigoQr) resume la
    // inspección: «x de y pass» y el QR al informe.
    await expect(page.getByText('1 de 2 pass')).toBeVisible()
    await expect(page.getByAltText('QR del informe del dispositivo')).toBeVisible()
    // La biblioteca v0.35.0 dejó la tarjeta sin el rótulo «Certificado»: se
    // ancla en el aviso legal del informe (siempre presente) y en la tarjeta.
    await expect(page.getByText('No es un certificado oficial', { exact: false })).toBeVisible()

    mkdirSync(SALIDA, { recursive: true })
    await page.screenshot({ path: `${SALIDA}/01-informe-publico-checklist.png`, fullPage: true })
  } finally { await limpiar(page, datos) }
})
