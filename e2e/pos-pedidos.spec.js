import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { codigoPedido } from '../src/utils/pedido.js'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Navegar a Pedidos muestra la lista (sin popups inesperados) y el detalle
// abre/cierra desde la fila.
test('pedidos: la lista abre sin popups y el detalle se abre y cierra', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(String(error?.message || error)))
  await page.goto('/pos')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  await page.getByRole('button', { name: 'Mis pedidos' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByTestId("pedido-fila").first()).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // La grilla de cada fila tiene 11 celdas (la última, la vista rápida) y la
  // fecha entra completa: nada descolgado ni cortado.
  const celdas = page.getByTestId("pedido-fila").first().locator(":scope > div > *")
  await expect(celdas).toHaveCount(11)
  const fecha = celdas.nth(1)
  expect(await fecha.evaluate(elemento => elemento.scrollWidth <= elemento.clientWidth + 1)).toBeTruthy()

  await page.reload()
  await expect(page.getByTestId('pedido-fila').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El clic lleva a la página exclusiva del pedido (no a un panel).
  await page.getByTestId('pedido-fila').first().click()
  await expect(page).toHaveURL(/\/pedidos\/[a-z0-9-]+$/i)
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Volver a pedidos' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // El ícono de acciones abre la vista rápida en panel sin redirigir.
  const urlLista = page.url()
  await page.getByRole('button', { name: /Vista rápida de/ }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveURL(urlLista)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  expect(errores, `Errores de página: ${errores.join(' | ')}`).toEqual([])
})

// Enlace directo a un pedido que NO está en la página cargada: el drawer tiene
// que resolverlo por API (antes quedaba un popup vacío y fijo).
test('pedidos: enlace directo a un pedido fuera de la página lo resuelve por API', async ({ page }) => {
  await page.goto('/pedidos')
  const ordenes = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    return response.ok ? await response.json() : []
  }, API)
  const objetivo = ordenes[0]
  expect(objetivo?.id).toBeTruthy()

  // Simula que el pedido no vino en la lista: la página queda vacía.
  await page.route(/\/api\/orders\?/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`/pedidos/${objetivo.id}`)
  await expect(page.getByText(codigoPedido(objetivo.orderNumber)).first()).toBeVisible()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
})

// Impresión del pedido: 80 mm (predeterminado), A4 y el rollo de 58 mm con
// diseño vertical propio. Nivel y formato se eligen con íconos (#207/#208).
test('pedidos: el comprobante ofrece 80 mm, A4 y 58 mm con diseño propio', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()

  const formato = page.getByRole('radiogroup', { name: 'Formato de impresión' })
  await expect(formato).toBeVisible()
  const opciones = await formato
    .getByRole('radio')
    .evaluateAll((radios) => radios.map((radio) => radio.getAttribute('aria-label')))
  expect(opciones).toEqual(['Formato 80 mm', 'Formato A4', 'Formato 58 mm'])
  await expect(formato.getByRole('radio', { name: 'Formato 80 mm' })).toBeChecked()

  const nivel = page.getByRole('radiogroup', { name: 'Tipo de comprobante' })
  await expect(nivel.getByRole('radio', { name: 'Comprobante Rápido' })).toBeChecked()

  const frame = page.locator('iframe[title="Vista previa del comprobante"]')
  // Los tres modelos: rápido identifica empresa y sucursal; el detallado imprime
  // la cronología del pedido.
  await nivel.getByRole('radio', { name: 'Comprobante Rápido' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /Empresa/, { timeout: 15000 })
  await nivel.getByRole('radio', { name: 'Comprobante Detallado' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /Cronología/, { timeout: 15000 })

  // 58 mm: una columna, total destacado y alto dinámico (no el A4 encogido).
  await formato.getByRole('radio', { name: 'Formato 58 mm' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:58mm auto;margin:3mm\}/, { timeout: 15000 })
  await expect(frame).toHaveAttribute('srcdoc', /class="t58"/)
  await expect(frame).toHaveAttribute('srcdoc', /class="row total"/)
  await expect(frame).toHaveAttribute('srcdoc', /nofiscal/)

  await formato.getByRole('radio', { name: 'Formato A4' }).click()
  await expect(frame).toHaveAttribute('srcdoc', /@page\{size:A4;margin:18mm 16mm\}/, { timeout: 15000 })
})

// Comprobante como imagen en MobOS (#240/#220, coordinado con POS): desde el
// mismo modal del comprobante se baja el PNG (y se comparte/copia con los otros
// botones del objeto compartido), sin depender del diálogo de impresión.
test('pedidos: el comprobante se descarga como imagen PNG', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await expect(page.locator('iframe[title="Vista previa del comprobante"]')).toBeVisible()

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('descargar-png').click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^comprobante-.*\.png$/)
  const png = readFileSync(await descarga.path())
  expect(png.length).toBeGreaterThan(10_000)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  await expect(page.getByText('Imagen descargada')).toBeVisible({ timeout: 15_000 })
  // El iframe del rasterizado se limpia (no queda basura oculta en el DOM).
  await expect(page.locator('iframe[data-png-documento]')).toHaveCount(0)
  await expect(page.getByTestId('compartir-imagen')).toBeVisible()
  await expect(page.getByTestId('copiar-png')).toBeVisible()
})

// La cronología tiene que mostrar a la persona real que creó el pedido, no un
// genérico "Sistema": el actor sale del usuario que confirmó la venta.
test('pedidos: la cronología muestra al vendedor que creó el pedido', async ({ page }) => {
  await page.goto('/pedidos')
  // Se elige un pedido real con cliente y vendedor (el código comercial puede
  // cambiar por la migración de códigos, así que no se fija ninguno).
  const objetivo = await page.evaluate(async (api) => {
    const rows = await (await fetch(`${api}/api/orders`, { credentials: 'include' })).json()
    const orden = rows.find((row) => row.customer?.name && row.seller?.name)
    return orden ? { orderNumber: orden.orderNumber, seller: orden.seller.name } : null
  }, API)
  expect(objetivo?.orderNumber).toBeTruthy()
  const fila = page
    .getByTestId('pedido-fila')
    .filter({ hasText: codigoPedido(objetivo.orderNumber) })
    .first()
  await expect(fila).toBeVisible()
  await fila.click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()

  // La cronología arranca plegada (#164): se abre para leer los movimientos.
  await page.getByRole('button', { name: /Cronología/ }).click()
  const creado = page.locator('article').filter({ hasText: 'Pedido creado' }).first()
  await expect(creado).toBeVisible()
  await expect(creado).not.toContainText('Sistema')
  await expect(creado).toContainText(objetivo.seller.split(' ')[0])
})

// #175 (§21): la nota interna del pedido se agrega y edita desde el detalle.
test('pedidos: la nota del pedido se edita desde el detalle', async ({ page }) => {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  const nota = `Nota E2E ${Date.now().toString(36)}`
  // La sección de cliente (donde vive la nota) arranca plegada.
  await page.locator('main').getByRole('button', { name: /^Cliente/ }).first().click()
  await page.getByRole('button', { name: /Agregar nota|Editar nota/ }).click()
  await page.getByLabel('Nota del pedido').fill(nota)
  await page.getByRole('button', { name: 'Guardar nota' }).click()
  await expect(page.getByText(`Nota: ${nota}`)).toBeVisible({ timeout: 15_000 })
})
