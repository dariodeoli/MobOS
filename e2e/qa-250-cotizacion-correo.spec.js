// Cotización por correo (junto con POS/PRN): el vendedor envía la cotización
// desde /cotizaciones; si el cliente no tiene correo, la UI lo pide y lo guarda
// en su ficha. Sin transporte configurado el envío no miente: avisa.
// Capturas: QA_250_CAPTURAS (default test-results/qa-250-cotizacion-correo).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_250_CAPTURAS || join('test-results', 'qa-250-cotizacion-correo')

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

const sufijo = () => `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`

test('la cotización se envía por correo y la UI pide el que falta', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/resumen')

  const marca = sufijo()
  const cliente = await apiPagina(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente correo E2E ${marca}` }) })
  expect([200, 201], JSON.stringify(cliente.body)).toContain(cliente.status)
  const cotizacion = await apiPagina(page, '/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ customerId: cliente.body.id, customerName: cliente.body.name, items: [{ description: 'Equipo cotizado E2E', quantity: 1, unitPricePyg: 750000 }] }),
  })
  expect([200, 201], JSON.stringify(cotizacion.body)).toContain(cotizacion.status)

  // Navegación fresca: la lista se arma con la cotización ya creada.
  await page.goto('/cotizaciones')
  await expect(page.getByTestId('cotizaciones-tabla')).toBeVisible({ timeout: 20_000 })
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: cotizacion.body.number }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Correo' }).click()

  // Sin correo guardado: la UI lo pide y muestra el enlace que recibirá.
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText(/todavía no tiene correo guardado/)).toBeVisible()
  await expect(dialogo.getByText(new RegExp(`/cotizacion/${cotizacion.body.publicToken}`))).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'cotizacion-correo-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'cotizacion-correo-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })

  const correo = `cliente-${marca}@ejemplo.com`
  await dialogo.getByLabel('Correo del cliente').fill(correo)
  await dialogo.getByRole('button', { name: 'Enviar cotización' }).click()

  // En el arnés no hay transporte: se guarda el correo y el envío avisa.
  await expect(dialogo.getByText(/no está configurado/)).toBeVisible({ timeout: 20_000 })
  const guardado = await apiPagina(page, `/api/customers?q=${encodeURIComponent(cliente.body.name)}`)
  const ficha = (guardado.body || []).find((filaCliente) => filaCliente.id === cliente.body.id)
  expect(ficha?.email, JSON.stringify(guardado.body).slice(0, 300)).toBe(correo)

  // La cotización sigue en borrador (no se envió nada) y se puede reintentar.
  const detalle = await apiPagina(page, '/api/quotes')
  const enBorrador = (detalle.body || []).find((filaCotizacion) => filaCotizacion.id === cotizacion.body.id)
  expect(enBorrador?.status || 'DRAFT').toBe('DRAFT')
  await expect(dialogo.getByRole('button', { name: 'Enviar cotización' })).toBeEnabled()
})
