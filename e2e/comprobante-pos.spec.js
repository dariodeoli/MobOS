// Comprobante del pago desde el mismo cobro del POS (transferencia a verificar).
// - Sin comprobante el cobro no se confirma y el motivo está a la vista.
// - Con comprobante (cámara o archivo, miniatura, quitar) la venta se confirma y el pedido
//   muestra el cobro «Pendiente de verificación» con la miniatura; el servidor lo guarda una sola vez.
// - Celular: el comprobante se adjunta en la confirmación del cobro, sin scroll horizontal.
// La política «verificar» se activa solo para una cuenta propia de la spec: ninguna otra spec cambia.
import { test, expect } from '@playwright/test'
import { ensureCobro } from './helpers/ensure-cobro.js'
import { esperarAnimaciones } from './helpers/animaciones.js'
import { SEED } from './helpers/seed-data.js'
import { PNG_1X1, activarVerificacion, crearCuentaYProducto, psql, restaurarVerificacion } from './helpers/pagos-verificar.js'

test.describe.configure({ mode: 'serial' })

const sufijo = `C${Date.now().toString(36).toUpperCase()}`
let original
let cuenta
let producto
const botonConfirmar = (page) => page.getByRole('button', { name: /^(Confirmar venta|Crear pedido|Guardar pedido)/ })

test.afterAll(() => restaurarVerificacion(original))

test('prepara una cuenta de transferencia a verificar y un producto propios', async ({ page }) => {
  await page.goto('/resumen')
  ;({ cuenta, producto } = await crearCuentaYProducto(page, { kind: 'TRANSFER', sufijo, precio: 45000 }))
  original = activarVerificacion([cuenta.id])
  expect(cuenta.id).toBeTruthy()
})

async function armarVentaDeEscritorio(page) {
  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`Cliente comprobante ${sufijo}`)
  await page.getByPlaceholder('Buscar producto…').fill(producto.name)
  const tarjeta = page.getByRole('button', { name: new RegExp(producto.name) }).first()
  await expect(tarjeta).toBeVisible({ timeout: 15_000 })
  await tarjeta.click()
  await ensureCobro(page)
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('option', { name: new RegExp(cuenta.name) }).first().click()
  return fila
}

test('escritorio: sin comprobante no confirma; con comprobante sí y el pedido queda pendiente de verificación', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const fila = await armarVentaDeEscritorio(page)
  const comprobante = fila.getByTestId('pago-comprobante')
  await expect(comprobante).toBeVisible()
  await expect(comprobante).toHaveAttribute('data-estado', 'falta')
  await expect(comprobante).toContainText('obligatorio')
  // Cámara y archivo: la cámara abre la trasera en el celular (capture) y el archivo acepta imagen o PDF.
  await expect(comprobante.getByRole('button', { name: 'Sacar foto', exact: true })).toBeVisible()
  await expect(comprobante.locator('input[type=file][capture="environment"]')).toHaveCount(1)
  await expect(comprobante.getByRole('button', { name: 'Adjuntar comprobante', exact: true })).toBeVisible()
  // El motivo está a la vista y el cobro no se confirma.
  await expect(page.getByText(/Adjuntá el comprobante de .*QA Verificación TRANSFER/)).toBeVisible()
  await expect(botonConfirmar(page)).toBeDisabled()

  // Adjuntar → miniatura; quitar → vuelve a faltar; adjuntar de nuevo.
  const archivo = { name: 'transferencia.png', mimeType: 'image/png', buffer: PNG_1X1 }
  await comprobante.locator('input[type=file]').last().setInputFiles(archivo)
  await expect(comprobante).toHaveAttribute('data-estado', 'adjunto')
  await expect(comprobante.getByTestId('comprobante-pos-miniatura')).toBeVisible()
  await comprobante.getByTestId('comprobante-quitar').click()
  await expect(comprobante).toHaveAttribute('data-estado', 'falta')
  await expect(botonConfirmar(page)).toBeDisabled()
  await comprobante.locator('input[type=file]').last().setInputFiles(archivo)
  await expect(comprobante).toHaveAttribute('data-estado', 'adjunto')
  await esperarAnimaciones(page)
  if (process.env.MOBOS_CAPTURAS) await page.screenshot({ path: `${process.env.MOBOS_CAPTURAS}/comprobante-pos-escritorio.png`, fullPage: true })
  await expect(botonConfirmar(page)).toBeEnabled()
  await botonConfirmar(page).click()

  // El pedido muestra el cobro «Pendiente de verificación» con la miniatura del comprobante.
  await expect(page).toHaveURL(/\/pedidos\/[^/?#]+$/, { timeout: 20_000 })
  const pedidoId = new URL(page.url()).pathname.split('/').pop()
  await expect(page.getByTestId('pago-estado').first()).toHaveText('Pendiente de verificación', { timeout: 20_000 })
  await expect(page.getByTestId('comprobante-miniatura').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('pago-subir-comprobante')).toHaveCount(0)
  // El servidor guardó el archivo una sola vez, ligado a ese pago.
  expect(Number(psql(`SELECT COUNT(*) FROM "PaymentProof" pr JOIN "Payment" p ON p."id" = pr."paymentId" WHERE p."orderId" = '${pedidoId}'`))).toBe(1)
  expect(psql(`SELECT p."status"::text || '/' || p."pendingReason" FROM "Payment" p WHERE p."orderId" = '${pedidoId}'`)).toBe('PENDING/VERIFICACION')

  // Reintento idempotente: subir otra vez el mismo archivo no duplica.
  const pagoId = psql(`SELECT "id" FROM "Payment" WHERE "orderId" = '${pedidoId}'`)
  const repetido = await page.evaluate(async ({ api, pagoId, bytes }) => {
    const cuerpo = new FormData()
    cuerpo.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'transferencia.png')
    const respuesta = await fetch(`${api}/api/payments/${pagoId}/proofs`, { method: 'POST', credentials: 'include', body: cuerpo })
    return respuesta.status
  }, { api: SEED.api, pagoId, bytes: [...PNG_1X1] })
  // El archivo del POS pasó por la compresión del navegador: si sus bytes cambiaron es un archivo distinto (201); el mismo da 200.
  expect([200, 201]).toContain(repetido)
  const mismo = await page.evaluate(async ({ api, pagoId }) => {
    const lista = await (await fetch(`${api}/api/payments/${pagoId}/proofs`, { credentials: 'include' })).json()
    const primero = lista[0]
    const bytes = await (await fetch(`${api}/api/payments/${pagoId}/proofs/${primero.id}`, { credentials: 'include' })).arrayBuffer()
    const cuerpo = new FormData()
    cuerpo.append('file', new Blob([bytes], { type: primero.mimeType }), primero.fileName)
    const otra = await fetch(`${api}/api/payments/${pagoId}/proofs`, { method: 'POST', credentials: 'include', body: cuerpo })
    return { status: otra.status, id: (await otra.json()).id, primero: primero.id }
  }, { api: SEED.api, pagoId })
  expect(mismo.status).toBe(200)
  expect(mismo.id).toBe(mismo.primero)
})

test('efectivo no pide comprobante', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/pos')
  await page.getByPlaceholder('Buscar producto…').fill(producto.name)
  await page.getByRole('button', { name: new RegExp(producto.name) }).first().click()
  await ensureCobro(page)
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('option', { name: /Caja E2E/ }).first().click()
  await expect(fila.getByTestId('cuenta-capsula')).toBeVisible()
  await expect(page.getByTestId('pago-comprobante')).toHaveCount(0)
  await expect(botonConfirmar(page)).toBeEnabled()
})

test('celular 390: el comprobante se adjunta en la confirmación del cobro, sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/pos')
  await expect(page.getByRole('region', { name: 'Nueva venta' })).toBeVisible()
  await page.getByPlaceholder('Buscar producto…').fill(producto.name)
  await page.getByRole('button', { name: new RegExp(producto.name) }).first().click()
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  await page.getByTestId(`medio-${cuenta.id}`).click()
  await page.getByTestId('cuenta-marcar-pagado').click()
  const confirmar = page.getByTestId('cobro-confirmar')
  await expect(confirmar).toBeVisible()
  const comprobante = confirmar.getByTestId('pago-comprobante')
  await expect(comprobante).toHaveAttribute('data-estado', 'falta')
  await expect(confirmar).toContainText(/Falta: Adjuntá el comprobante de/)
  const venta = page.getByTestId('cobro-confirmar-venta')
  await expect(venta).toBeDisabled()
  await comprobante.locator('input[type=file]').last().setInputFiles({ name: 'transferencia.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await expect(comprobante).toHaveAttribute('data-estado', 'adjunto')
  await esperarAnimaciones(page)
  // Sin scroll horizontal y con botones de 44 px.
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(desborde).toBeLessThanOrEqual(0)
  const quitar = await comprobante.getByTestId('comprobante-quitar').boundingBox()
  expect(quitar.width).toBeGreaterThanOrEqual(44)
  expect(quitar.height).toBeGreaterThanOrEqual(44)
  if (process.env.MOBOS_CAPTURAS) await page.screenshot({ path: `${process.env.MOBOS_CAPTURAS}/comprobante-pos-movil.png` })
  await expect(venta).toBeEnabled()
  await venta.click()
  await expect(page.getByTestId('hoja-exito')).toBeVisible({ timeout: 20_000 })
  // Todos los cobros de esta cuenta (escritorio y celular) quedaron con su comprobante.
  const sinSubir = psql(`SELECT COUNT(*) FROM "Payment" p WHERE p."accountId" = '${cuenta.id}' AND NOT EXISTS (SELECT 1 FROM "PaymentProof" pr WHERE pr."paymentId" = p."id")`)
  expect(Number(sinSubir)).toBe(0)
  expect(Number(psql(`SELECT COUNT(*) FROM "Payment" p WHERE p."accountId" = '${cuenta.id}'`))).toBe(2)
})
