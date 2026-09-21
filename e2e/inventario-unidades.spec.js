// Inventario compacto (#122): la tabla muestra condición por color, ubicación
// con color y verificación con usuario real; la verificación rápida y la
// reserva dejan rastro en la cronología por unidad. Se usan las unidades de QA
// que el seed deja en "Depósito 2" y "Piso de venta".
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

async function buscarUnidad(page, serial) {
  await page.goto('/inventario/unidades')
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  return page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
}

test('la tabla muestra ubicación con color, condición y verificación compacta', async ({ page }) => {
  const fila = await buscarUnidad(page, 'ZZQADEP21')
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Depósito 2')).toBeVisible()
  await expect(fila.getByLabel('Condición: Nuevo')).toBeVisible()
  await expect(fila.getByText(/Sin verificar|\d{2} [a-z]{3} \d{2} · \d{2}:\d{2}/i)).toBeVisible()
})

test('la verificación rápida registra usuario y fecha en la cronología', async ({ page }) => {
  const fila = await buscarUnidad(page, 'ZZQAPISO2')
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: '✓ Verificar' }).click()
  await expect(fila.getByText('Sin verificar')).toHaveCount(0, { timeout: 15_000 })

  await fila.click()
  const detalle = page.getByRole('dialog')
  await expect(detalle.getByText(/Verificado por /)).toBeVisible()
  await expect(detalle.getByText('Verificado físicamente').first()).toBeVisible()
})

test('el detalle muestra QR, código de barras y el ingreso a stock', async ({ page }) => {
  const fila = await buscarUnidad(page, 'ZZQADEP22')
  await fila.click()
  const detalle = page.getByRole('dialog')
  await expect(detalle.getByText('Códigos de esta unidad')).toBeVisible()
  await expect(detalle.locator('img[alt^="QR de"]')).toBeVisible()
  await expect(detalle.getByText('Ingresó a stock').first()).toBeVisible()
  await expect(detalle.getByText(/días? en stock/)).toBeVisible()
  await expect(detalle.getByText('ZZQADEP22', { exact: true }).first()).toBeVisible()
  await detalle.getByRole('button', { name: 'Copiar IMEI/serial' }).click()
})

test('la reserva desde el detalle usa la ficha existente y deja la cronología', async ({ page }) => {
  try {
    const fila = await buscarUnidad(page, 'ZZQAPISO1')
    await fila.click()
    const detalle = page.getByRole('dialog')
    // La reserva se abre sobre el inventario: el detalle se cierra al abrirla.
    await detalle.getByRole('button', { name: 'Reservar', exact: true }).click()
    const modal = page.getByRole('dialog').filter({ hasText: 'Reservar unidad' })
    await expect(modal).toBeVisible()
    await modal.getByPlaceholder('Buscar cliente o reservar sin cliente').fill('Cliente E2E Checkout')
    await modal.getByRole('button', { name: /Cliente E2E Checkout/ }).first().click()
    await modal.getByLabel('Duración en horas').fill('1')
    await modal.getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(page.getByText(/Reserva creada por 1 hora/)).toBeVisible({ timeout: 15_000 })

    // La cronología de la unidad muestra la reserva con el cliente de la ficha.
    const filaReservada = await buscarUnidad(page, 'ZZQAPISO1')
    await filaReservada.click()
    const detalle2 = page.getByRole('dialog')
    await expect(detalle2.getByText('Reservado', { exact: true })).toBeVisible()
    await expect(detalle2.getByText(/Cliente E2E Checkout/).first()).toBeVisible()
    await detalle2.getByRole('button', { name: 'Liberar reserva' }).click()
    await expect(page.getByText('Reserva liberada y unidad disponible.')).toBeVisible({ timeout: 15_000 })
  } finally {
    // Reintentable: si algo falló después de reservar, se libera por API.
    await page.evaluate(async ({ api, serial }) => {
      await fetch(`${api}/api/inventory-reservations`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', serials: [serial] }),
      })
    }, { api: API, serial: 'ZZQAPISO1' })
  }
})
