// #305 · Inventario escritorio: menos capas antes de la tabla, navegación
// agrupada (Stock · Movimientos · Control) y tabla sin scroll horizontal ni
// datos recortados (IMEI de 15 dígitos completo y verificación con fecha
// completa). La garantía y los locks salen de la fila: viven en el detalle.
//
// Corre con la sesión admin del arnés. Evidencia en docs/qa/305-inventario/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const DIR = join('docs', 'qa', '305-inventario')
const API = SEED.api

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await respuesta.json().catch(() => null)
  return { status: respuesta.status, body }
}, { api: API, ruta, opciones })

async function capturar(page, nombre, oscuro, fullPage = true) {
  await page.evaluate((modo) => {
    document.documentElement.classList.toggle('dark', modo)
    try { localStorage.setItem('mobos:theme', modo ? 'dark' : 'light') } catch { /* sin storage */ }
  }, Boolean(oscuro))
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(DIR, nombre), fullPage })
}

const medirDesborde = (locator) => locator.evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))

test('#305 · una barra, navegación agrupada y tabla completa en escritorio', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/inventario/unidades')
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })

  // Una sola barra antes de la tabla: buscador, orden y vista adentro; sin el
  // resumen de métricas que apilaba capas (#305).
  const barra = page.getByTestId('barra-inventario')
  await expect(barra).toHaveCount(1)
  await expect(barra.getByLabel('Buscar en inventario')).toBeVisible()
  await expect(barra.getByLabel('Orden del inventario')).toBeVisible()
  await expect(barra.getByRole('button', { name: '+ Recibir unidad', exact: true })).toBeVisible()
  await expect(barra.getByRole('button', { name: 'Más', exact: true })).toBeVisible()
  await expect(page.getByTestId('resumen-inventario')).toHaveCount(0)

  // Navegación agrupada: solo las vistas del grupo activo.
  const grupos = page.getByTestId('grupos-inventario')
  const tabs = page.getByTestId('tabs-inventario')
  for (const grupo of ['Stock', 'Movimientos', 'Control']) {
    await expect(grupos.getByRole('button', { name: grupo, exact: true })).toBeVisible()
  }
  await expect(tabs.getByRole('button', { name: 'Reservas', exact: true })).toBeVisible()
  await grupos.getByRole('button', { name: 'Movimientos', exact: true }).click()
  await expect(tabs.getByRole('button', { name: 'En tránsito', exact: true })).toBeVisible()
  await grupos.getByRole('button', { name: 'Control', exact: true }).click()
  await expect(tabs.getByRole('button', { name: 'Conteos', exact: true })).toBeVisible()
  await grupos.getByRole('button', { name: 'Stock', exact: true }).click()
  await expect(tabs.getByRole('button', { name: 'Inventario', exact: true })).toBeVisible()

  // Unidad propia con IMEI real de 15 dígitos, verificada, para medir la fila.
  const producto = await apiPagina(page, `/api/products?q=${encodeURIComponent('E2E-IPHONE15')}`)
  const productId = (Array.isArray(producto.body) ? producto.body : producto.body?.items || [])[0]?.id
  expect(productId, 'producto iPhone del seed').toBeTruthy()
  const serial = `35${String(Date.now()).slice(-13)}`
  const alta = await apiPagina(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId, serial, branchId: SEED.branchId, condition: 'NEW' }) })
  expect(alta.status, JSON.stringify(alta.body)).toBe(201)
  const verificacion = await apiPagina(page, '/api/inventory-units/verify', { method: 'POST', body: JSON.stringify({ serial }) })
  expect(verificacion.status, JSON.stringify(verificacion.body)).toBe(200)

  try {
    await page.goto(`/inventario/unidades?q=${encodeURIComponent(serial)}`)
    const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
    await expect(fila).toBeVisible({ timeout: 20_000 })

    // La tabla entra sin scroll horizontal en 1280.
    const tabla = page.getByTestId('inventario-tabla')
    const anchoTabla = await medirDesborde(tabla)
    expect(anchoTabla.scrollWidth, `la tabla scrollea ${anchoTabla.scrollWidth - anchoTabla.clientWidth} px en 1280`).toBeLessThanOrEqual(anchoTabla.clientWidth + 1)

    // IMEI completo y verificación con fecha completa, sin recortes.
    const celdaImei = fila.getByTestId('unidad-imei')
    const celdaVerificacion = fila.getByTestId('unidad-verificacion')
    await expect(celdaImei).toHaveText(serial)
    await expect(celdaVerificacion).toContainText(/\d{2}\/\d{2}\/\d{4}/)
    for (const [nombre, celda] of [['IMEI', celdaImei], ['verificación', celdaVerificacion]]) {
      const medida = await medirDesborde(celda)
      expect(medida.scrollWidth, `la celda de ${nombre} se recorta`).toBeLessThanOrEqual(medida.clientWidth + 1)
    }
    // La garantía salió de la tabla (vive en el detalle, botón de ojo).
    await expect(fila.getByText(/^Garantía/)).toHaveCount(0)

    // «Verificar» aparece una sola vez: el botón de la columna, no en el menú.
    await expect(fila.getByLabel('✓ Verificar')).toBeVisible()
    await fila.getByLabel(/^Acciones de/).click()
    await expect(page.getByRole('button', { name: 'Verificar', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await capturar(page, 'inventario-1280-light.png', false)
    await capturar(page, 'inventario-1280-dark.png', true)
  } finally {
    // Limpieza: la unidad de prueba queda en Eliminados (no se borra).
    if (alta.body?.id) await apiPagina(page, '/api/inventory-units', { method: 'PATCH', body: JSON.stringify({ id: alta.body.id, action: 'remove', reason: 'Limpieza QA #305' }) }).catch(() => {})
  }

  // Mobile: tarjetas compactas (#304), sin desborde de página.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/inventario/unidades')
  await expect(page.getByTestId('inventario-tarjeta-movil').first()).toBeVisible({ timeout: 20_000 })
  await capturar(page, 'inventario-390-light.png', false, false)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde, `desborde horizontal de ${desborde} px en mobile`).toBeLessThanOrEqual(1)
})
