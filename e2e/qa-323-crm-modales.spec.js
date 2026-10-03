// #323 · CRM — adopción del modal/drawer estándar (docs/MODALES.md §3):
// crear cliente (teléfono con error junto al campo y cierre con cambios),
// ficha del cliente (nombre validado junto al campo) y solicitud de la ficha
// (motivo del rechazo con FormField error, sin toast ni botón deshabilitado).
//
// Capturas reproducibles (claro/oscuro/desktop/mobile):
//   MOBOS_CAPTURAS=docs/qa/323-crm npx playwright test e2e/qa-323-crm-modales.spec.js -g capturas
import { mkdirSync } from 'node:fs'
import { request, test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const marca = () => Date.now().toString(36).toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

// La solicitud la pide el vendedor (sesión sembrada): una propia del admin no
// se puede resolver desde la ficha (la UI la oculta).
async function crearSolicitud(page, nombreCliente) {
  const cliente = await apiPagina(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombreCliente }) })
  expect([200, 201], JSON.stringify(cliente.body)).toContain(cliente.status)
  const vendedor = await request.newContext({
    baseURL: API,
    storageState: 'e2e/.auth/seller.json',
    extraHTTPHeaders: { Origin: `http://localhost:${process.env.MOBOS_E2E_WEB_PORT || '5175'}` },
  })
  try {
    const solicitud = await vendedor.post('/api/authorizations', {
      data: { kind: 'DISCOUNT', customerId: cliente.body.id, requestedValue: { discountPyg: 50000 }, note: `QA 323 CRM ${nombreCliente}` },
    })
    expect([200, 201], await solicitud.text()).toContain(solicitud.status())
  } finally {
    await vendedor.dispose()
  }
  return cliente.body
}

async function cerrarConDescarte(page, dialogo) {
  await page.keyboard.press('Escape')
  const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(confirmacion).toBeVisible()
  await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
  await expect(dialogo).toHaveCount(0)
}

test.describe('modal estándar en CRM (#323)', () => {
  test('crear cliente: el teléfono inválido queda junto al campo y cerrar con datos confirma', async ({ page }) => {
    await page.goto('/clientes')
    await page.getByRole('button', { name: '+ Crear cliente' }).click()
    const modal = page.getByRole('dialog', { name: 'Crear cliente' })
    await expect(modal).toBeVisible()
    await modal.getByLabel('Primer nombre', { exact: true }).fill(`QA 323 ${marca()}`)
    const telefono = modal.getByLabel('Teléfono', { exact: true })
    await telefono.fill('123')
    await modal.getByRole('button', { name: 'Guardar cliente' }).click()

    // El error queda adentro del diálogo, junto al campo, y no se cierra solo.
    await expect(modal.getByText(/Teléfono inválido/)).toBeVisible()
    await expect(modal).toBeVisible()

    // Corregir el campo limpia el error.
    await telefono.fill('0981123456')
    await expect(modal.getByText(/Teléfono inválido/)).toHaveCount(0)

    // Cerrar con datos cargados pide confirmación en vez de descartarlos.
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(modal).toBeVisible()
    await cerrarConDescarte(page, modal)
  })

  test('ficha del cliente: el nombre se valida junto al campo y cerrar con datos confirma', async ({ page }) => {
    await page.goto('/cotizaciones')
    await page.getByRole('button', { name: '+ Nueva cotización' }).click()
    await page.getByRole('textbox', { name: 'Cliente' }).fill(`QA ficha ${marca()}`)
    await page.getByTestId('cotizacion-crear-ficha').click()
    const modal = page.getByTestId('ficha-cliente')
    await expect(modal).toBeVisible()

    // Sin nombre: el botón sigue habilitado y el error va junto al campo.
    const nombre = modal.getByLabel('Nombre, teléfono, CI o RUC del cliente')
    await nombre.fill('')
    await modal.getByTestId('ficha-cliente-guardar').click()
    await expect(modal.getByText('Escribí el nombre del cliente.')).toBeVisible()

    await nombre.fill(`QA ficha corregida ${marca()}`)
    await expect(modal.getByText('Escribí el nombre del cliente.')).toHaveCount(0)

    await cerrarConDescarte(page, modal)
  })

  test('solicitud de la ficha: el motivo del rechazo se valida junto al campo', async ({ page }) => {
    const nombre = `Cliente QA 323 CRM ${marca()}`
    await page.goto('/resumen')
    const cliente = await crearSolicitud(page, nombre)

    await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.id)}`)
    const ficha = page.getByRole('dialog', { name: /^Cliente:/ })
    await expect(ficha).toBeVisible({ timeout: 20_000 })
    await ficha.getByRole('tab', { name: /^Datos/ }).click()
    const fila = ficha.locator('li').filter({ hasText: 'Descuento' }).filter({ hasText: nombre }).first()
    await expect(fila).toBeVisible({ timeout: 20_000 })
    await fila.getByRole('button', { name: 'Rechazar' }).click()
    const modal = page.getByRole('dialog', { name: 'Rechazar solicitud' })
    await expect(modal).toBeVisible()

    // Sin motivo: error junto al campo (ya no toast ni botón deshabilitado).
    const rechazar = modal.getByRole('button', { name: 'Rechazar' })
    await expect(rechazar).toBeEnabled()
    await rechazar.click()
    await expect(modal.getByText('Contale al vendedor por qué se rechaza.')).toBeVisible()
    await expect(page.getByText('Motivo obligatorio')).toHaveCount(0)

    // Con motivo, cerrar con cambios pide confirmación y no rechaza nada.
    await modal.getByLabel('Motivo del rechazo').fill('Fuera de política de la tienda.')
    await cerrarConDescarte(page, modal)
    await expect(fila.getByText('Pendiente')).toBeVisible()
  })

  test('capturas de los modales CRM (#323)', async ({ page }) => {
    test.setTimeout(180_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/qa-323-crm'
    mkdirSync(salida, { recursive: true })
    const nombre = `Cliente QA 323 CRM ${marca()}`
    await page.goto('/resumen')
    const cliente = await crearSolicitud(page, nombre)
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
        await page.setViewportSize({ width: ancho, height: alto })

        // Crear cliente con el teléfono inválido junto al campo.
        await page.goto('/clientes')
        await page.getByRole('button', { name: '+ Crear cliente' }).click()
        const alta = page.getByRole('dialog', { name: 'Crear cliente' })
        await alta.getByLabel('Primer nombre', { exact: true }).fill(`QA captura ${marca()}`)
        await alta.getByLabel('Teléfono', { exact: true }).fill('123')
        await alta.getByRole('button', { name: 'Guardar cliente' }).click()
        await expect(alta.getByText(/Teléfono inválido/)).toBeVisible()
        await page.screenshot({ path: `${salida}/crear-cliente-${tema}-${vista}.png` })
        await cerrarConDescarte(page, alta)

        // Solicitud de la ficha con el motivo validado junto al campo.
        await page.goto(`/clientes?cliente=${encodeURIComponent(cliente.id)}`)
        const ficha = page.getByRole('dialog', { name: /^Cliente:/ })
        await expect(ficha).toBeVisible({ timeout: 20_000 })
        await ficha.getByRole('tab', { name: /^Datos/ }).click()
        const fila = ficha.locator('li').filter({ hasText: 'Descuento' }).filter({ hasText: nombre }).first()
        await expect(fila).toBeVisible({ timeout: 20_000 })
        await fila.getByRole('button', { name: 'Rechazar' }).click()
        const modal = page.getByRole('dialog', { name: 'Rechazar solicitud' })
        await modal.getByRole('button', { name: 'Rechazar' }).click()
        await expect(modal.getByText('Contale al vendedor por qué se rechaza.')).toBeVisible()
        await page.screenshot({ path: `${salida}/rechazar-solicitud-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await expect(modal).toHaveCount(0)
      }
    }
  })
})
