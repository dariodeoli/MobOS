// Importador de productos (#109): CSV y Excel con validación fila por fila,
// duplicados, vista previa y deshacer. La base e2e es persistente entre
// corridas, así que cada test arma SKU únicos y deshace lo que importó.
import { test, expect } from '@playwright/test'
import { xlsxBuffer } from './helpers/xlsx.js'

const marca = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()

async function abrirImportador(page) {
  // El catálogo (con el importador) vive en /productos; el inventario operativo
  // por IMEI es /inventario.
  await page.goto('/productos')
  await page.getByTestId('importar-productos').click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('heading', { name: 'Importar productos (CSV o Excel)' })).toBeVisible()
  return modal
}

async function buscarEnCatalogo(page, sku) {
  const campo = page.getByLabel('Buscar productos')
  await campo.fill(sku)
  await campo.press('Enter')
}

test('importa un xlsx con vista previa, valida duplicados y deshace el lote', async ({ page }) => {
  const id = marca()
  const sku1 = `ZZ-IMP-XLSX-${id}-1`
  const sku2 = `ZZ-IMP-XLSX-${id}-2`
  const nombre1 = `Producto importado ${id} uno`
  const archivo = await xlsxBuffer([
    ['SKU', 'Nombre', 'Precio', 'Stock', 'Condición'],
    [sku1, nombre1, 125000, 3, 'Nuevo'],
    ['E2E-CABLE', 'Duplicado del catálogo', 45000, 0, 'Nuevo'],
    [sku1, 'Duplicado en el archivo', 99000, 0, 'Nuevo'],
    [sku2, `Producto importado ${id} dos`, '1.500.000', 0, 'Semi'],
    [`ZZ-IMP-MALO-${id}`, `Producto con precio inválido ${id}`, 'mil', 0, 'Nuevo'],
  ])

  const modal = await abrirImportador(page)
  await modal.getByLabel('Archivo de productos').setInputFiles({
    name: 'productos.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: archivo,
  })

  // Vista previa: 2 filas para crear y 3 con error, cada una con su motivo.
  const previa = modal.getByTestId('importar-previa')
  await expect(previa).toBeVisible()
  await expect(modal.getByText('2 para crear')).toBeVisible()
  await expect(modal.getByText('3 con error')).toBeVisible()
  await expect(modal.getByText('SKU repetido en el archivo')).toBeVisible()
  await expect(modal.getByText('Ya existe un producto con ese SKU')).toBeVisible()
  await expect(modal.getByText('Precio inválido: usá un entero en guaraníes.', { exact: true })).toBeVisible()

  await modal.getByTestId('importar-confirmar').click()
  const resultado = modal.getByTestId('importar-resultado')
  await expect(resultado).toBeVisible()
  await expect(resultado.getByText('2 creados')).toBeVisible()

  // Los productos importados aparecen en el catálogo.
  await modal.getByRole('button', { name: 'Cerrar' }).click()
  await buscarEnCatalogo(page, sku1)
  await expect(page.getByTestId('producto-fila')).toHaveCount(1)
  await expect(page.getByText(nombre1)).toBeVisible()
  await buscarEnCatalogo(page, sku2)
  await expect(page.getByTestId('producto-fila')).toHaveCount(1)

  // Deshacer el lote desde el mismo diálogo: se dan de baja los dos creados.
  await page.getByTestId('importar-productos').click()
  await modal.getByTestId('importar-deshacer').click()
  await page.getByRole('button', { name: 'Deshacer importación', exact: true }).last().click()
  const deshecho = modal.getByTestId('importar-deshacer-resultado')
  await expect(deshecho).toBeVisible()
  await expect(deshecho.getByText('2 productos eliminados')).toBeVisible()
  await modal.getByRole('button', { name: 'Cerrar' }).click()
  await buscarEnCatalogo(page, sku1)
  await expect(page.getByTestId('producto-fila')).toHaveCount(0)
})

test('el CSV importa solo las filas válidas y también se puede deshacer', async ({ page }) => {
  const id = marca()
  const sku = `ZZ-IMP-CSV-${id}`
  const nombre = `Producto CSV ${id}`
  const csv = [
    'SKU;Nombre;Precio;Stock;Categoría;Condición',
    `${sku};${nombre};250000;4;Accesorios;Nuevo`,
    'E2E-FUNDA;Duplicado del catálogo;80000;0;Accesorios;Nuevo',
    `ZZ-IMP-MALO-CSV-${id};Sin precio válido;abc;0;Accesorios;Nuevo`,
  ].join('\n')

  const modal = await abrirImportador(page)
  await modal.getByLabel('Archivo de productos').setInputFiles({
    name: 'productos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
  })

  await expect(modal.getByTestId('importar-previa')).toBeVisible()
  await expect(modal.getByText('1 para crear')).toBeVisible()
  await expect(modal.getByText('2 con error')).toBeVisible()
  await modal.getByTestId('importar-confirmar').click()
  await expect(modal.getByTestId('importar-resultado')).toBeVisible()
  await expect(modal.getByTestId('importar-resultado').getByText('1 creado')).toBeVisible()

  await modal.getByRole('button', { name: 'Cerrar' }).click()
  await buscarEnCatalogo(page, sku)
  await expect(page.getByTestId('producto-fila')).toHaveCount(1)
  await expect(page.getByText(nombre)).toBeVisible()

  await page.getByTestId('importar-productos').click()
  await modal.getByTestId('importar-deshacer').click()
  await page.getByRole('button', { name: 'Deshacer importación', exact: true }).last().click()
  await expect(modal.getByTestId('importar-deshacer-resultado').getByText('1 producto eliminado')).toBeVisible()
})
