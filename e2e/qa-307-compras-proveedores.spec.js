// #307 · Compras y Abastecimiento: proveedores coherentes, alta en drawer,
// etiquetas con una acción primaria + menú secundario y copiar precios con
// vista previa antes de tocar el portapapeles.
//
// Corre en el demo anónimo (datos ficticios). Evidencia en docs/qa/307-compras/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'qa', '307-compras')
const PRODUCTO = 'iPhone 15 Pro 256GB Titanio'
const PROVEEDORES = ['Importadora Tecnológica', 'Distribuidora del Este', 'Mayorista Apple PY']

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

test('#307 · compras del demo con proveedores coherentes y acciones con preview', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await page.goto('/compras')

  // 1) Las compras y el catálogo de proveedores hablan de los mismos proveedores.
  const filas = page.getByTestId('compra-fila')
  await expect(filas.first()).toBeVisible()
  await expect(filas.filter({ hasText: PROVEEDORES[0] })).toHaveCount(1)
  await expect(filas.filter({ hasText: PROVEEDORES[1] })).toHaveCount(1)
  await expect(filas.filter({ hasText: 'Proveedor Sur' })).toHaveCount(0)
  await expect(filas.filter({ hasText: 'Proveedor Norte' })).toHaveCount(0)
  // Recepción (parcial/completa) y devolución siguen como patrón.
  await expect(filas.filter({ hasText: PROVEEDORES[1] }).getByRole('button', { name: 'Recibir mercadería' })).toBeVisible()
  await expect(filas.filter({ hasText: PROVEEDORES[0] }).getByRole('button', { name: 'Devolver al proveedor' })).toBeVisible()

  await page.getByRole('button', { name: 'Proveedores' }).click()
  const proveedores = page.getByRole('dialog', { name: 'Proveedores' })
  await expect(proveedores.getByText('Sin proveedores registrados.')).toHaveCount(0)
  for (const nombre of PROVEEDORES) await expect(proveedores.getByTestId('proveedor-fila').filter({ hasText: nombre })).toHaveCount(1)
  await capturar(page, 'proveedores-1440-light.png', false)
  await capturar(page, 'proveedores-1440-dark.png', true)
  await proveedores.getByRole('button', { name: 'Cerrar' }).click()

  // 2) El alta vive en un drawer y cada campo lleva su etiqueta.
  await page.getByRole('button', { name: 'Nueva compra' }).click()
  const alta = page.getByRole('dialog', { name: 'Nueva compra' })
  await expect(alta).toBeVisible()
  for (const etiqueta of ['Proveedor', 'Sucursal de recepción', 'Producto', 'Cantidad', 'Costo unitario', 'Lote / referencia']) {
    await expect(alta.getByText(etiqueta, { exact: true })).toBeVisible()
  }
  await capturar(page, 'alta-drawer-1440-light.png', false)
  await capturar(page, 'alta-drawer-1440-dark.png', true)
  await page.setViewportSize({ width: 390, height: 844 })
  await capturar(page, 'alta-drawer-390-light.png', false)
  await page.setViewportSize({ width: 1440, height: 900 })
  await alta.getByRole('button', { name: 'Cancelar' }).click()

  // 3) Etiquetas: una acción primaria y el resto en el menú secundario.
  await page.goto('/productos')
  await page.getByTestId('producto-fila').first().click()
  await page.getByRole('button', { name: 'Etiqueta de precio' }).click()
  const etiquetas = page.getByRole('dialog', { name: 'Etiquetas de góndola' })
  await expect(etiquetas.getByRole('button', { name: 'Imprimir etiquetas' })).toBeVisible()
  await expect(etiquetas.getByRole('button', { name: 'Más acciones' })).toBeVisible()
  await expect(etiquetas.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0)
  await expect(etiquetas.getByRole('button', { name: 'Compartir imagen' })).toHaveCount(0)
  await etiquetas.getByRole('button', { name: 'Más acciones' }).click()
  const menu = page.getByRole('menu', { name: 'Más acciones de etiquetas' })
  for (const accion of ['Compartir imagen', 'Descargar PNG', 'Copiar imagen', 'Descargar PDF']) {
    await expect(menu.getByRole('menuitem', { name: accion })).toBeVisible()
  }
  await capturar(page, 'etiquetas-acciones-1440-light.png', false)
  await etiquetas.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()

  // 4) Copiar precios: primero la vista previa, después la acción.
  await page.getByTestId('producto-fila').first().getByRole('checkbox').check()
  await page.getByTestId('copiar-precios').click()
  const preview = page.getByRole('dialog', { name: 'Copiar precios' })
  await expect(preview.getByTestId('preview-precios')).toBeVisible()
  await expect(preview.getByText(PRODUCTO)).toBeVisible()
  await capturar(page, 'copiar-precios-preview-1440-light.png', false)
  await preview.getByTestId('preview-precios-copiar').click()
  await expect(page.getByText(/producto\(s\) copiados/)).toBeVisible()
})
