// Ocultos de plataforma (#251): rutas que los QR ya imprimían y caían al
// catch-all, el enlace al estado público desde Ayuda, el aviso del modo
// offline del POS en el shell y el opt-out visible del rediseño (v2).
//
// Capturas reproducibles:
//   MOBOS_CAPTURAS=docs/qa/ocultos npx playwright test e2e/ocultos-plataforma.spec.js -g capturas
// Sin variable escribe en test-results y CI no ensucia el repo.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const TICKET_PRUEBA = '/prueba?d=lan%3A192.168.1.23%3A9100&v=4821&f=2026-09-20T12%3A00%3A00.000Z&t=qr'

test.describe('ocultos de plataforma', () => {
  // (a) Los QR de etiqueta de góndola apuntan a /producto/<sku>.
  test('el QR de góndola abre la ficha del producto (/producto/:sku)', async ({ page }) => {
    await page.goto(`/producto/${SEED.products.cable.sku}`)
    await expect(page.getByText('Producto MobOS')).toBeVisible()
    await expect(page.getByRole('heading', { name: SEED.products.cable.name })).toBeVisible()
    await expect(page.getByText(SEED.products.cable.sku).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver en el catálogo' }))
      .toHaveAttribute('href', `/productos?q=${encodeURIComponent(SEED.products.cable.sku)}`)
  })

  test('un SKU desconocido se explica en la ficha (ya no cae al login)', async ({ page }) => {
    await page.goto('/producto/E2E-NO-EXISTE')
    await expect(page).toHaveURL(/\/producto\/E2E-NO-EXISTE$/)
    await expect(page.getByRole('heading', { name: 'No encontramos este producto' })).toBeVisible()
  })

  // (a) El QR del ticket de prueba abre /prueba con los datos del papel.
  test('el QR del ticket de prueba abre la verificación física (/prueba)', async ({ page }) => {
    await page.goto(TICKET_PRUEBA)
    await expect(page.getByRole('heading', { name: 'Verificación física' })).toBeVisible()
    await expect(page.getByText('4821')).toBeVisible()
    await expect(page.getByText('lan:192.168.1.23:9100')).toBeVisible()
  })

  test('sin datos, /prueba explica que el código llegó vacío', async ({ page }) => {
    await page.goto('/prueba')
    await expect(page.getByRole('heading', { name: 'Este código llegó sin datos de prueba' })).toBeVisible()
  })

  // (b) La Ayuda enlaza al estado público de los servicios.
  test('la Ayuda enlaza al estado público de los servicios', async ({ page }) => {
    await page.goto('/ayuda/ayuda')
    const enlace = page.getByTestId('ayuda-estado-servicios')
    await expect(enlace).toBeVisible()
    await expect(enlace).toHaveAttribute('href', 'https://moboss.online/status')
    await expect(enlace).toHaveAttribute('target', '_blank')
  })

  // (c) El modo offline del POS se ve en el shell/menú y abre la cola.
  test('el shell avisa el modo offline del POS y abre la cola', async ({ page, context }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    // Con conexión y sin pendientes, el aviso no ocupa lugar.
    await expect(page.getByTestId('shell-cola-offline')).toHaveCount(0)

    await context.setOffline(true)
    const aviso = page.getByTestId('shell-cola-offline')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('POS sin conexión')

    await aviso.click()
    const detalle = page.getByRole('dialog')
    await expect(detalle.getByRole('heading', { name: 'Ventas sin conexión' })).toBeVisible()
    await expect(detalle.getByText('No hay ventas sin conexión.')).toBeVisible()
    await detalle.getByRole('button', { name: 'Cerrar' }).last().click()

    await context.setOffline(false)
    await expect(aviso).toHaveCount(0)
  })

  // (d) Selector visible para volver al diseño anterior, por dispositivo.
  test('Preferencias permite volver al diseño anterior y lo recuerda', async ({ page }) => {
    await page.goto('/configuracion/preferencias')
    const volver = page.getByLabel('Volver al diseño anterior')
    await expect(page.getByTestId('shell')).toHaveAttribute('data-tema-v2', '1')
    await expect(volver).not.toBeChecked()

    await volver.check()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-tema-v2', '0')
    expect(await page.evaluate(() => localStorage.getItem('mobos:tema-v2'))).toBe('0')

    // El opt-out es del dispositivo: sobrevive a la recarga.
    await page.reload()
    await expect(page.getByLabel('Volver al diseño anterior')).toBeChecked()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-tema-v2', '0')

    await page.getByLabel('Volver al diseño anterior').uncheck()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-tema-v2', '1')
    expect(await page.evaluate(() => localStorage.getItem('mobos:tema-v2'))).toBe('1')
  })

  // Capturas del cambio, reproducibles (claro/oscuro/mobile).
  test('capturas de los ocultos', async ({ page, context }) => {
    test.setTimeout(180_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/ocultos'
    mkdirSync(salida, { recursive: true })

    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
      await page.setViewportSize({ width: 1280, height: 900 })

      await page.goto(`/producto/${SEED.products.cable.sku}`)
      await expect(page.getByRole('heading', { name: SEED.products.cable.name })).toBeVisible()
      await page.screenshot({ path: `${salida}/producto-${tema}-desktop.png` })

      await page.goto(TICKET_PRUEBA)
      await expect(page.getByRole('heading', { name: 'Verificación física' })).toBeVisible()
      await page.screenshot({ path: `${salida}/prueba-${tema}-desktop.png` })

      await page.goto('/ayuda/ayuda')
      await expect(page.getByTestId('ayuda-estado-servicios')).toBeVisible()
      await page.screenshot({ path: `${salida}/ayuda-status-${tema}-desktop.png` })

      await page.goto('/configuracion/preferencias')
      await expect(page.getByLabel('Volver al diseño anterior')).toBeVisible()
      await page.screenshot({ path: `${salida}/preferencias-v2-${tema}-desktop.png` })
    }

    // Mobile: el aviso offline vive en la barra y en el menú.
    await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'light') } catch { /* sin storage */ } })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    await context.setOffline(true)
    await expect(page.getByTestId('shell-cola-offline-pill')).toBeVisible()
    await page.screenshot({ path: `${salida}/offline-badge-mobile.png` })
    await page.getByRole('button', { name: 'Menú', exact: true }).click()
    await expect(page.getByTestId('shell-cola-offline-menu')).toBeVisible()
    await page.screenshot({ path: `${salida}/offline-badge-menu-mobile.png` })
    await context.setOffline(false)
  })
})
