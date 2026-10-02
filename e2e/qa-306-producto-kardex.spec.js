// #306 · Producto y Kardex: la ficha se divide en secciones (Resumen ·
// Unidades · Kardex · Precios · Compras · Historial) y el kardex del demo es
// verificable: se reconstruye de las unidades ficticias, cierra contra el stock
// y exporta el CSV del mismo rango.
//
// Corre en el demo anónimo (sin datos reales). Evidencia en
// docs/qa/306-producto-kardex/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'qa', '306-producto-kardex')
const PRODUCTO = 'iPhone 15 Pro 256GB Titanio'

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await expect(page.getByText('Modo demo', { exact: false }).first()).toBeVisible()
}

async function capturar(page, nombre, oscuro) {
  await page.evaluate((modo) => {
    document.documentElement.classList.toggle('dark', modo)
    try { localStorage.setItem('mobos:theme', modo ? 'dark' : 'light') } catch { /* sin storage */ }
  }, Boolean(oscuro))
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(DIR, nombre) })
}

test('#306 · secciones de la ficha y kardex del demo con saldo verificado', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await page.goto('/productos')
  await page.getByTestId('producto-fila').filter({ hasText: PRODUCTO }).first().click()

  const ficha = page.getByRole('dialog')
  const tabs = ficha.getByRole('tablist', { name: 'Secciones del producto' })
  for (const nombre of ['Resumen', 'Unidades', 'Kardex', 'Precios', 'Compras', 'Historial']) {
    await expect(tabs.getByRole('tab', { name: nombre })).toBeVisible()
  }
  await expect(ficha.getByTestId('producto-seccion-resumen')).toBeVisible()

  // El resumen operativo (hallazgo de la auditoría) muestra valores de gestión.
  const resumen = ficha.getByTestId('producto-resumen-stock')
  await expect(resumen.getByText('Valor de stock')).toBeVisible()
  await expect(resumen.getByText('Margen por unidad')).toBeVisible()

  // El stock operativo sale de las unidades ficticias (no del «necesita una
  // cuenta real»): la ficha y el kardex tienen que mostrar el mismo número.
  const stock = Number(await ficha.getByTestId('producto-stock').innerText())
  expect(stock).toBeGreaterThan(0)
  await expect(ficha.getByText('Este producto del demo no tiene unidades con IMEI.')).toHaveCount(0)
  const unidades = ficha.locator('section#producto-seccion-unidades')
  await expect(unidades.getByText('AUR', { exact: false }).first()).toBeVisible()
  await capturar(page, 'ficha-secciones-1440-light.png', false)
  await capturar(page, 'ficha-secciones-1440-dark.png', true)
  // Compras del demo: el ingreso de cada unidad ficticia con su proveedor.
  await expect(ficha.locator('section#producto-seccion-compras').getByTestId('producto-compra').first()).toBeVisible()
  // Historial del demo: altas, ventas y traslados en orden.
  await tabs.getByRole('tab', { name: 'Historial' }).click()
  await ficha.locator('section#producto-seccion-historial').getByRole('button', { name: /Ver historial/ }).click()
  await expect(ficha.getByTestId('producto-historial-demo').getByRole('listitem').first()).toBeVisible()

  // Kardex: se abre desde su sección y audita el movimiento completo.
  await tabs.getByRole('tab', { name: 'Kardex' }).click()
  const kardex = ficha.getByTestId('kardex-contenido')
  await expect(kardex).toBeVisible()
  await expect(kardex.getByText(`Stock actual: ${stock}`)).toBeVisible()
  const movimientos = kardex.getByTestId('kardex-movimiento')
  await expect(movimientos.first()).toBeVisible()
  expect(await movimientos.count()).toBeGreaterThan(0)
  await expect(kardex.getByText('Saldo inicial', { exact: true })).toBeVisible()
  // El saldo corrido cierra contra el stock de la ficha.
  await expect(movimientos.last().getByText(String(stock), { exact: true })).toBeVisible()

  // Export del kardex del demo: mismas columnas que la cuenta real.
  await expect(kardex.getByTestId('kardex-exportar')).toBeEnabled()
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    kardex.getByTestId('kardex-exportar').click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^mobos-kardex-.+\.csv$/)
  const csv = await readFile(await descarga.path(), 'utf8')
  expect(csv).toContain('Fecha;Movimiento;Detalle;Referencia;Usuario;Entrada;Salida;Saldo')
  expect(csv).toContain('Saldo inicial')
  expect(csv).toContain(`;${stock}`)
  // Se espera a que el aviso de exportación se retire para la captura.
  await page.waitForTimeout(5000)
  await capturar(page, 'ficha-kardex-1440-light.png', false)
  await capturar(page, 'ficha-kardex-1440-dark.png', true)

  // Mobile: la ficha se recorre completa sin desbordar la pantalla.
  await page.setViewportSize({ width: 390, height: 844 })
  await kardex.scrollIntoViewIfNeeded()
  await capturar(page, 'ficha-kardex-390-light.png', false)
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde).toBeLessThanOrEqual(1)
})
