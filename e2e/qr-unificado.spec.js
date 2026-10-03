// QR unificados: todo código es una URL de la app (src/lib/printing/qr.js).
// Los payloads que salen impresos están cubiertos por las unitarias
// (qr.test.js y tickets.test.js); acá se verifica el otro extremo: que esas
// URLs rendericen sin sesión y que las fichas pidan login con retorno.
//
// OJO (#330): esta spec NO está en el testMatch de playwright.config.js
// (playwright.config.js es de PLT), así que hoy no la corre nadie. Se deja
// alineada al contrato vigente para que PLT la enganche.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test('el QR de la prueba abre /prueba sin sesión con los datos del papel', async ({ page }) => {
  await page.goto('/prueba?d=lan%3A192.168.1.23%3A9100&v=4821&f=2026-09-20T12%3A00%3A00.000Z&t=qr')

  await expect(page.getByRole('heading', { name: 'Verificación física' })).toBeVisible()
  await expect(page.getByText('Datos de esta prueba')).toBeVisible()
  await expect(page.getByText('lan:192.168.1.23:9100')).toBeVisible()
  await expect(page.getByText('4821')).toBeVisible()
  await expect(page.getByText('Ticket con QR')).toBeVisible()
  await expect(page.getByText(/de 2026/)).toBeVisible()
  await expect(page.getByText('El papel tiene que salir')).toBeVisible()

  // Sin sesión, el camino a la impresora pasa primero por el login y vuelve
  // a Dispositivos (#253: el slug viejo /configuracion/impresoras redirige).
  await expect(page.getByRole('link', { name: 'Configuración → Impresoras' }).first())
    .toHaveAttribute('href', '/login?next=%2Fconfiguracion%2Fdispositivos')
})

test('una URL de prueba sin datos no inventa una verificación', async ({ page }) => {
  await page.goto('/prueba')
  await expect(page.getByText('Este código llegó sin datos de prueba')).toBeVisible()
})

test('el QR de una unidad abre el informe público sin pedir sesión', async ({ page }) => {
  await page.goto(`/u/${SEED.products.iphone.imei}`)

  // Desde #240 el informe por serial es público (IMEI enmascarado): el QR de
  // la etiqueta y del informe abre el documento directo, sin login de por medio.
  await expect(page.getByText('Informe de dispositivo')).toBeVisible()
  await expect(page.getByText(SEED.company.name).first()).toBeVisible()
  await expect(page.getByText('No encontramos este equipo')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(0)
})

test('el QR de un producto pide sesión y guarda el destino para volver', async ({ page }) => {
  await page.goto('/producto/IPH-15-128')

  await expect(page.getByRole('heading', { name: 'Este código pertenece a un producto de MobOS' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Iniciar sesión' }))
    .toHaveAttribute('href', `/login?next=${encodeURIComponent('/producto/IPH-15-128')}`)
})
