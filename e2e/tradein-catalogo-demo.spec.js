// Catálogo de modelos + valores de toma + cotización con equipo que entrega el cliente.
// - Demo (dueño): «Agregar valor» busca el modelo en el catálogo y la capacidad depende del modelo;
//   edición masiva en grilla, exportar/importar CSV.
// - Demo (vendedor): cotización con equipo → descuenta el valor estimado y muestra el FALTANTE;
//   «Copiar texto» arma el mensaje de WhatsApp con el aviso de revisión.
// La parte con API real está en tradein-catalogo-api.spec.js.
// Capturas: MOBOS_CAPTURAS=docs/rediseno npx playwright test e2e/tradein-catalogo-demo.spec.js
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'
import { esperarAnimaciones } from './helpers/animaciones.js'
import { clickRowAction } from './helpers/row-actions.js'
import { openShellDestination } from './helpers/shell-navigation.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/tradein-catalogo'

async function abrirDemo(page, rol) {
  await page.goto('/demo')
  await page.getByRole('button', { name: rol }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await page.getByTestId('shell').waitFor({ timeout: 30_000, state: 'attached' })
  await cerrarGuiaDemo(page, { timeout: 8000 })
}

test('valores de toma (demo): el modelo sale del catálogo y la capacidad depende del modelo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page, /Dueño/)
  await page.goto('/trade-in')
  await expect(page.getByTestId('valoraciones-tabla')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /Valores de toma · \d+ cargados/ })).toBeVisible()

  await page.getByRole('button', { name: 'Agregar valor' }).click()
  const modal = page.getByRole('dialog', { name: 'Nuevo valor de toma' })
  await expect(modal).toBeVisible()
  // Buscar «15 pro max» ofrece solo ese modelo y no «15 Pro».
  await modal.getByRole('combobox', { name: 'Modelo' }).fill('15 pro max')
  await expect(modal.getByRole('listbox').getByRole('option')).toHaveCount(1)
  await modal.getByRole('option', { name: /iPhone 15 Pro Max/ }).click()
  // Elegido el modelo, el buscador se reemplaza por una fila compacta con «Cambiar».
  await expect(modal.getByTestId('modelo-catalogo-elegido')).toContainText('iPhone 15 Pro Max')
  await expect(modal.getByRole('combobox', { name: 'Modelo' })).toHaveCount(0)

  const capacidad = modal.getByLabel('Capacidad')
  await expect(capacidad.locator('option')).toHaveText(['Elegí la capacidad', '256GB', '512GB', '1TB'])
  await capacidad.selectOption('512GB')
  // Cambiar de modelo reinicia la capacidad: es dependiente.
  await modal.getByRole('button', { name: 'Cambiar modelo' }).click()
  await modal.getByRole('combobox', { name: 'Modelo' }).fill('iphone 11')
  await modal.getByRole('listbox').getByRole('option').filter({ has: page.locator('span', { hasText: /^iPhone 11$/ }) }).click()
  await expect(modal.getByLabel('Capacidad').locator('option')).toHaveText(['Elegí la capacidad', '64GB', '128GB', '256GB'])
  await expect(modal.getByLabel('Capacidad')).toHaveValue('')
  // Sin color en el valor de toma: solo modelo, capacidad y condición.
  await expect(modal.getByLabel('Color')).toHaveCount(0)

  await modal.getByLabel('Capacidad').selectOption('128GB')
  await modal.getByLabel('Condición').selectOption('NEW')
  await modal.getByLabel('Valor base (Gs)').fill('1500000')
  await modal.getByLabel('Valor máximo (Gs, opcional)').fill('1700000')
  await esperarAnimaciones(page)
  await page.screenshot({ path: `${SHOTS}/tradein-01-nuevo-valor.png` })
  await modal.getByRole('button', { name: 'Guardar valor' }).click()
  await expect(page.getByText(/Valor creado/)).toBeVisible()
  await page.getByLabel('Buscar valores por modelo').fill('iphone 11 128')
  const fila = page.getByTestId('valoracion-fila').filter({ has: page.getByText('Nuevo', { exact: true }) })
  await expect(fila).toHaveCount(1)
  await expect(fila).toContainText('iPhone 11')
  await expect(fila).toContainText('128GB')
  await expect(fila).toContainText('Gs 1.500.000')
})

test('valores de toma (demo): edición masiva en grilla y CSV', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page, /Dueño/)
  await page.goto('/trade-in')
  await expect(page.getByTestId('valoraciones-tabla')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Edición masiva' }).click()
  const masiva = page.getByRole('dialog', { name: 'Edición masiva de valores de toma' })
  await expect(masiva).toBeVisible()
  await masiva.getByLabel('Buscar modelo en la grilla').fill('14 pro max')
  // Una fila por capacidad del modelo, con el valor que ya existe.
  const filas = masiva.getByTestId('masiva-fila')
  await expect(filas).toHaveCount(4)
  await expect(filas.first()).toHaveAttribute('data-modelo', 'iPhone 14 Pro Max')
  const base = masiva.getByLabel('Valor base de iPhone 14 Pro Max 128GB')
  await expect(base).not.toHaveValue('')
  await expect(masiva.getByText('Sin cambios')).toBeVisible()
  await base.fill('4400000')
  await masiva.getByLabel('Valor máximo de iPhone 14 Pro Max 128GB').fill('4800000')
  await masiva.getByLabel('Valor base de iPhone 14 Pro Max 1TB').fill('5900000')
  await expect(masiva.getByText('2 cambio(s) sin guardar')).toBeVisible()
  await esperarAnimaciones(page)
  await page.screenshot({ path: `${SHOTS}/tradein-02-edicion-masiva.png` })
  await masiva.getByRole('button', { name: 'Guardar 2 cambio(s)' }).click()
  await expect(masiva).toBeHidden()
  await expect(page.getByText(/Cambios guardados: \d+ nuevos, \d+ actualizados/)).toBeVisible()

  // Exportar CSV: trae los montos completos y lo editado.
  await page.getByLabel('Buscar valores por modelo').fill('14 pro max')
  await page.getByTestId('valores-mas').getByRole('button').click()
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Exportar CSV' }).click()])
  const csv = await (await import('node:fs/promises')).readFile(await descarga.path(), 'utf8')
  expect(csv).toContain('"iPhone 14 Pro Max","128GB","Seminuevo","4400000","4800000","Sí"')
  expect(csv).toContain('"iPhone 14 Pro Max","1TB","Seminuevo","5900000"')

  // Importar CSV: resumen de lo que cambia antes de guardar.
  await page.getByTestId('valores-mas').getByRole('button').click()
  const archivo = 'Modelo,Capacidad,Condición,Valor base,Valor máximo\niPhone 14 Pro Max,256GB,Seminuevo,"4.700.000","5.000.000"\niPhone 14 Pro Max,999GB,Seminuevo,1000000,\n'
  await page.getByTestId('valores-csv-archivo').setInputFiles({ name: 'valores.csv', mimeType: 'text/csv', buffer: Buffer.from(archivo) })
  const importar = page.getByRole('dialog', { name: 'Importar valores de toma' })
  await expect(importar).toBeVisible()
  await expect(importar).toContainText('Línea 3: iPhone 14 Pro Max no viene en 999GB')
  await expect(importar.getByRole('button', { name: /Importar \d+ valor/ })).toBeDisabled()
  await importar.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByTestId('valores-csv-archivo').setInputFiles({ name: 'valores.csv', mimeType: 'text/csv', buffer: Buffer.from(archivo.split('\n').slice(0, 2).join('\n')) })
  await expect(importar).toContainText('1 fila(s) válidas, 1 con cambios')
  await importar.getByRole('button', { name: 'Importar 1 valor(es)' }).click()
  await expect(page.getByText(/Importación lista: 0 nuevos, 1 actualizados/)).toBeVisible()
  await expect(page.getByTestId('valoracion-fila').filter({ hasText: '256GB' }).filter({ hasText: 'Gs 4.700.000' })).toHaveCount(1)
})

test('cotización (demo): equipo que entrega el cliente, faltante y texto de WhatsApp', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page, /Vendedor/)
  await openShellDestination(page, 'Cotizaciones')
  await page.getByTestId('cotizacion-fila').first().waitFor({ timeout: 20_000 })

  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  const modal = page.getByRole('dialog', { name: 'Nueva cotización' })
  await modal.getByTestId('cotizacion-consumidor-final').click()
  await modal.getByPlaceholder('Descripción del ítem').fill('iPhone 15 Pro Max 256GB')
  await modal.getByLabel('Precio unitario del ítem').fill('8000000')
  await modal.getByTestId('cotizacion-agregar-equipo').click()
  const equipo = modal.getByTestId('cotizacion-equipo')
  await equipo.getByRole('combobox', { name: 'Modelo' }).fill('iphone 13')
  await equipo.getByRole('option').filter({ has: page.locator('span', { hasText: /^iPhone 13$/ }) }).click()
  await equipo.getByRole('button', { name: '128GB' }).click()
  await equipo.getByRole('button', { name: 'Seminuevo' }).click()
  // El valor sale de la tabla de valores de toma y la cotización muestra el faltante.
  await expect(equipo.getByTestId('cotizacion-equipo-valor')).toContainText('Valor estimado de toma: Gs 2.100.000')
  await expect(equipo).toContainText('Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas).')
  await expect(modal.getByTestId('cotizacion-descuento-equipo')).toContainText('−Gs 2.100.000')
  await expect(modal.getByTestId('cotizacion-faltante')).toContainText('Gs 5.900.000')
  await esperarAnimaciones(page)
  await page.screenshot({ path: `${SHOTS}/tradein-03-cotizacion-equipo.png` })
  await modal.getByRole('button', { name: 'Crear cotización' }).click()
  await expect(page.getByText(/Cotización creada/)).toBeVisible({ timeout: 10_000 })

  // La fila lista el equipo que entrega; «Copiar texto» arma el mensaje para WhatsApp.
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: 'iPhone 15 Pro Max 256GB' }).first()
  await expect(fila).toContainText('Entrega: iPhone 13 128GB (Seminuevo)')
  await clickRowAction(page, fila, 'Enlace/QR')
  const enlace = page.getByRole('dialog', { name: /Enlace de/ })
  await expect(enlace.getByTestId('cotizacion-copiar-texto')).toBeEnabled({ timeout: 10_000 })
  await enlace.getByTestId('cotizacion-copiar-texto').click()
  await expect(page.getByText('Texto copiado: pegalo en WhatsApp.')).toBeVisible()
  const texto = await page.evaluate(() => navigator.clipboard.readText())
  expect(texto).toMatch(/^🧾 \*Cotización /)
  expect(texto).toContain('📱 *Detalle*')
  expect(texto).toContain('• 1 × iPhone 15 Pro Max 256GB — Gs 8.000.000')
  expect(texto).toContain('💰 *Total: Gs 8.000.000*')
  expect(texto).toContain('🔄 *Equipo que entregás*')
  expect(texto).toContain('• iPhone 13 128GB (Seminuevo)')
  expect(texto).toContain('✅ *Faltante a pagar: Gs 5.900.000*')
  expect(texto).toContain('_Valor estimado sujeto a revisión: se confirma al traer el equipo a la tienda (batería, estado, fallas)._')
  expect(texto).toContain('/cotizacion/')
  expect(texto).not.toMatch(/costo|margen/i)
  // Además del texto: WhatsApp, PDF y compartir nativo.
  await expect(enlace.getByTestId('cotizacion-whatsapp')).toBeVisible()
  await expect(enlace.getByRole('button', { name: 'Descargar PDF' })).toBeVisible()
  await expect(enlace.getByTestId('compartir-pdf')).toBeVisible()
})

test('cotizador (demo): «15 pro max» muestra sus capacidades con rango por condición y pasa los datos del equipo al POS', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page, /Vendedor/)
  await page.goto('/trade-in')
  const modelo = page.getByRole('combobox', { name: 'Modelo' })
  await expect(modelo).toBeVisible({ timeout: 20_000 })
  await modelo.fill('15 pro max')
  await page.getByRole('listbox').getByRole('option').first().click()
  const capacidades = page.getByTestId('cotizador-capacidad')
  await expect(capacidades).toHaveCount(3)
  await expect(capacidades.nth(0)).toHaveAttribute('data-capacidad', '256GB')
  // Rango base–máximo por condición y promedio.
  await expect(capacidades.nth(0)).toContainText('Gs 5.600.000')
  await expect(capacidades.nth(0)).toContainText('Gs 6.160.000')
  await expect(capacidades.nth(0)).toContainText('promedio Gs 5.880.000')
  await capacidades.nth(0).getByRole('button', { name: /256GB Seminuevo/ }).click()
  await expect(page.getByText(/Valor sugerido:/)).toContainText('Gs 5.600.000')
  await page.getByRole('button', { name: 'Usar' }).first().click()

  // Datos del equipo al aceptarlo: color del modelo, batería, accesorios e IMEI.
  const color = page.getByLabel('Color')
  await expect(color.locator('option')).toContainText(['Elegí el color', 'Titanio natural', 'Titanio azul', 'Titanio blanco', 'Titanio negro'])
  await color.selectOption('Titanio azul')
  await page.getByLabel('Batería (% de salud)').fill('87')
  await page.getByRole('checkbox', { name: 'Caja' }).check()
  await page.getByLabel('IMEI / serial').fill('356789102345678')
  await page.getByLabel('Detalle de la condición').fill('Sin marcas')
  await esperarAnimaciones(page)
  await page.getByRole('button', { name: 'Continuar en POS' }).click()
  await expect(page).toHaveURL(/\/pos$/, { timeout: 15_000 })
})

// Móvil 390: sin scroll horizontal y con objetivos táctiles de 44 px en lo nuevo.
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const alturaMinima = (locator) => locator.evaluateAll((nodos) => Math.min(...nodos.filter((n) => n.offsetParent !== null).map((n) => n.getBoundingClientRect().height)))

test('móvil 390 (demo): valores de toma, edición masiva y cotizador', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page, /Dueño/)
  await page.goto('/trade-in')
  await expect(page.getByTestId('valoraciones-tabla')).toBeVisible({ timeout: 20_000 })
  expect(await sinScrollHorizontal(page)).toBe(true)
  await page.getByRole('button', { name: 'Edición masiva' }).click()
  const masiva = page.getByRole('dialog', { name: 'Edición masiva de valores de toma' })
  await expect(masiva.getByTestId('masiva-fila').first()).toBeVisible()
  expect(await sinScrollHorizontal(page)).toBe(true)
  expect(await alturaMinima(masiva.getByLabel(/^Valor base de /))).toBeGreaterThanOrEqual(43)
  await page.keyboard.press('Escape')
})

test('móvil 390 (demo): el cotizador muestra capacidades, valores y datos del equipo sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page, /Vendedor/)
  await page.goto('/trade-in')
  const modelo = page.getByRole('combobox', { name: 'Modelo' })
  await expect(modelo).toBeVisible({ timeout: 20_000 })
  await modelo.fill('15 pro max')
  await page.getByRole('listbox').getByRole('option').first().click()
  await expect(page.getByTestId('cotizador-capacidades')).toBeVisible()
  await expect(page.getByTestId('cotizador-capacidad')).toHaveCount(3)
  expect(await sinScrollHorizontal(page)).toBe(true)
  expect(await alturaMinima(page.getByTestId('cotizador-capacidades').getByRole('button'))).toBeGreaterThanOrEqual(43)
  await expect(page.getByLabel('Color')).toBeVisible()
  await expect(page.getByLabel('Batería (% de salud)')).toBeVisible()
  expect(await sinScrollHorizontal(page)).toBe(true)
})
