// #323 · FIN — adopción del modal/drawer estándar (docs/MODALES.md §3):
// Listas de precios (etiquetas visibles por ítem, error junto al campo y cierre
// con cambios) y Rechazo de autorización (motivo con FormField error, sin toast
// ni botón deshabilitado, y cierre con confirmación).
//
// Capturas reproducibles (claro/oscuro/desktop/mobile):
//   MOBOS_CAPTURAS=docs/qa/323-fin npx playwright test e2e/qa-323-fin-modales.spec.js -g capturas
import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const marca = () => Date.now().toString(36).toUpperCase()

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

async function abrirListaNueva(page) {
  await page.goto('/precios')
  await expect(page.getByRole('heading', { name: 'Listas de precios', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: '+ Nueva lista' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Nueva lista de precios' })
  await expect(dialogo).toBeVisible()
  return dialogo
}

// Solicitud de descuento pendiente para poder rechazarla (el seed no trae).
async function crearSolicitud(page, nombreCliente) {
  const cliente = await apiPagina(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: nombreCliente }) })
  expect([200, 201], JSON.stringify(cliente.body)).toContain(cliente.status)
  const solicitud = await apiPagina(page, '/api/authorizations', {
    method: 'POST',
    body: JSON.stringify({ kind: 'DISCOUNT', customerId: cliente.body.id, requestedValue: { discountPyg: 50000 }, note: `QA 323 ${nombreCliente}` }),
  })
  expect([200, 201], JSON.stringify(solicitud.body)).toContain(solicitud.status)
}

async function abrirRechazo(page, nombreCliente) {
  await page.goto('/autorizaciones')
  const fila = page.getByTestId('autorizacion-fila').filter({ hasText: nombreCliente }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.getByRole('button', { name: 'Rechazar' }).click()
  const modal = page.getByRole('dialog', { name: /^Rechazar / })
  await expect(modal).toBeVisible()
  return modal
}

test.describe('modal estándar en FIN (#323)', () => {
  test('Precios: etiquetas visibles, error junto al ítem y cierre con cambios', async ({ page }) => {
    const dialogo = await abrirListaNueva(page)

    // Etiquetas visibles en los ítems (el placeholder no es etiqueta). Se
    // buscan como <label>: el texto del Select no cuenta.
    await dialogo.getByRole('button', { name: '+ Ítem' }).click()
    for (const etiqueta of ['Tipo', 'Producto', 'Porcentaje']) {
      await expect(dialogo.locator('label').filter({ hasText: new RegExp(`^${etiqueta}$`) }).first()).toBeVisible()
    }

    // Sin producto, el error queda dentro del panel; el diálogo sigue abierto.
    await dialogo.getByLabel('Nombre').fill(`Lista QA 323 ${marca()}`)
    await dialogo.getByRole('button', { name: 'Guardar lista' }).click()
    await expect(dialogo.getByText('Elegí el producto de cada ítem o quitalo.')).toBeVisible()
    await expect(dialogo).toBeVisible()

    // Cerrar con cambios pide confirmación (dirty).
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(dialogo).toHaveCount(0)
  })

  test('Autorizaciones: el rechazo valida el motivo junto al campo y confirma al cerrar', async ({ page }) => {
    const nombre = `Cliente QA 323 ${marca()}`
    await page.goto('/resumen')
    await crearSolicitud(page, nombre)
    const modal = await abrirRechazo(page, nombre)

    // Sin motivo: error junto al campo (ya no toast ni botón deshabilitado).
    const rechazar = modal.getByRole('button', { name: 'Rechazar' })
    await expect(rechazar).toBeEnabled()
    await rechazar.click()
    await expect(modal.getByText('Contale al vendedor por qué se rechaza.')).toBeVisible()
    await expect(page.getByText('Motivo obligatorio')).toHaveCount(0)

    // Con motivo, cerrar con cambios pide confirmación y no rechaza nada.
    await modal.getByLabel('Motivo del rechazo').fill('Fuera de política de la tienda.')
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(modal).toHaveCount(0)
    await expect(page.getByTestId('autorizacion-fila').filter({ hasText: nombre }).first().getByText('Pendiente')).toBeVisible()
  })

  test('WhatsAppTemplates: el editor valida junto al campo y confirma al cerrar con cambios', async ({ page }) => {
    await page.goto('/plantillas')
    await expect(page.getByRole('heading', { name: 'Plantillas de WhatsApp' })).toBeVisible()
    await page.getByRole('button', { name: /Nueva plantilla/ }).click()
    const modal = page.getByRole('dialog', { name: 'Nueva plantilla' })
    await expect(modal).toBeVisible()

    // Labels visibles y error junto al campo al intentar crear vacío.
    for (const etiqueta of ['Nombre', 'Categoría', 'Mensaje']) {
      await expect(modal.locator('label').filter({ hasText: new RegExp(`^${etiqueta}$`) }).first()).toBeVisible()
    }
    await modal.getByRole('button', { name: 'Crear plantilla' }).click()
    await expect(modal.getByText('El nombre es obligatorio.')).toBeVisible()
    await expect(modal.getByText('El mensaje es obligatorio.')).toBeVisible()
    await expect(modal).toBeVisible()

    // Cerrar con cambios pide confirmación (dirty).
    await modal.getByLabel('Nombre').fill('Plantilla QA 323')
    await page.keyboard.press('Escape')
    const confirmacion = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
    await expect(confirmacion).toBeVisible()
    await confirmacion.getByRole('button', { name: 'Seguir editando' }).click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await confirmacion.getByRole('button', { name: 'Descartar y cerrar' }).click()
    await expect(modal).toHaveCount(0)
  })

  test('capturas de los modales FIN (#323)', async ({ page }) => {
    test.setTimeout(180_000)
    const salida = process.env.MOBOS_CAPTURAS || 'test-results/qa-323-fin'
    mkdirSync(salida, { recursive: true })
    const nombre = `Cliente QA 323 ${marca()}`
    await page.goto('/resumen')
    await crearSolicitud(page, nombre)
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.addInitScript(({ m }) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, { m: modo })
        await page.setViewportSize({ width: ancho, height: alto })

        // Precios: lista con un ítem y el error junto al campo.
        const dialogo = await abrirListaNueva(page)
        await dialogo.getByRole('button', { name: '+ Ítem' }).click()
        await dialogo.getByLabel('Nombre').fill('Mayorista VIP')
        await dialogo.getByRole('button', { name: 'Guardar lista' }).click()
        await expect(dialogo.getByText('Elegí el producto de cada ítem o quitalo.')).toBeVisible()
        await page.screenshot({ path: `${salida}/precios-lista-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await page.getByRole('dialog', { name: '¿Descartar los cambios?' }).getByRole('button', { name: 'Descartar y cerrar' }).click()
        await expect(dialogo).toHaveCount(0)

        // Autorizaciones: rechazo con el motivo validado junto al campo.
        const modal = await abrirRechazo(page, nombre)
        await modal.getByRole('button', { name: 'Rechazar' }).click()
        await expect(modal.getByText('Contale al vendedor por qué se rechaza.')).toBeVisible()
        await page.screenshot({ path: `${salida}/autorizaciones-rechazo-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await expect(modal).toHaveCount(0)

        // Plantillas: editor con los errores junto a los campos.
        await page.goto('/plantillas')
        await page.getByRole('button', { name: /Nueva plantilla/ }).click()
        const editorPlantilla = page.getByRole('dialog', { name: 'Nueva plantilla' })
        await editorPlantilla.getByRole('button', { name: 'Crear plantilla' }).click()
        await expect(editorPlantilla.getByText('El nombre es obligatorio.')).toBeVisible()
        await page.screenshot({ path: `${salida}/plantilla-editor-${tema}-${vista}.png` })
        await page.keyboard.press('Escape')
        await expect(editorPlantilla).toHaveCount(0)
      }
    }
  })
})
