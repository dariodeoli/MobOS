import { expect, test } from '@playwright/test'

// Editor de la plantilla del ticket de prueba (#277, PRN + diseño): el ticket
// corto es el predeterminado, el completo sigue disponible y la plantilla
// (incluido el tipo) se guarda en la impresora.
//
// La prueba NO se imprime en este spec (no hay puente ni impresora física): se
// cancela al final. El envío real —con copias y corte— lo cubren
// `impresion-remota.spec.js` y los unitarios del builder.
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
// Destino único por corrida: la base e2e se reutiliza y una plantilla guardada
// de la corrida anterior haría fallar el arranque del test.
const DESTINO = `lan:10.99.99.60:${9200 + Math.floor(Math.random() * 700)}`
const HOJA = 'iframe[title="Vista previa del ticket de prueba"]'
const tarjetaDe = (page, texto) => page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: texto })

test.describe('plantilla del ticket de prueba', () => {
  test('ADMIN edita la plantilla, la guarda y el ticket corto es el predeterminado', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/configuracion/dispositivos')
    const nombre = `Térmica plantilla E2E ${Date.now()}`
    // Impresora propia de la prueba (idempotente por destino): la base e2e se
    // reutiliza entre corridas.
    await page.evaluate(
      async ({ api, nombre, destino }) => {
        const lista = await fetch(`${api}/api/print/printers`, { credentials: 'include' })
        const { printers = [] } = await lista.json().catch(() => ({}))
        if (!printers.some((item) => item.destination === destino)) {
          await fetch(`${api}/api/print/printers`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: nombre, destination: destino, isActive: true }),
          })
        }
      },
      { api: API, nombre, destino: DESTINO },
    )
    await page.reload()
    const tarjeta = tarjetaDe(page, DESTINO)
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })

    // Entrada «Plantilla» de la ficha (#277): el mismo editor, con su título.
    await tarjeta.getByRole('button', { name: 'Plantilla', exact: true }).click()
    await expect(page.getByRole('dialog', { name: `Plantilla: ${nombre}` })).toBeVisible()
    await expect(page.getByRole('dialog').getByTestId('plantilla-prueba')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    const dialogo = page.getByRole('dialog')
    const editor = dialogo.getByTestId('plantilla-prueba')
    await expect(editor).toBeVisible()

    // Predeterminado (#277): ticket corto — título + validación, sin pie.
    await expect(dialogo.getByLabel('Tipo de prueba')).toHaveValue('breve')
    const hoja = page.frameLocator(HOJA)
    await expect(hoja.locator('pre')).toContainText('Ticket de prueba MobOS')
    await expect(hoja.locator('pre')).toContainText('VALIDACIÓN')
    await expect(hoja.locator('pre')).not.toContainText('Impresora')
    await expect(hoja.locator('pre')).not.toContainText('[QR]')
    // Los bloques que no aplican al corto quedan deshabilitados y apagados.
    await expect(editor.getByRole('button', { name: 'Trazabilidad' })).toBeDisabled()
    await expect(editor.getByRole('button', { name: 'QR y código de barras' })).toBeDisabled()

    // El ticket completo sigue disponible: ahí aplican todos los bloques.
    await dialogo.getByLabel('Tipo de prueba').selectOption('corta')
    await expect(hoja.locator('pre')).toContainText('TICKET DE PRUEBA')
    const chipCodigos = editor.getByRole('button', { name: 'QR y código de barras' })
    await expect(chipCodigos).toHaveAttribute('aria-pressed', 'true')
    await chipCodigos.click()
    await expect(chipCodigos).toHaveAttribute('aria-pressed', 'false')
    await expect(hoja.locator('pre')).not.toContainText('[QR]')

    // Ancho 58: el papel se angosta de verdad (58 mm ≈ 219 px contra 80 mm).
    const ancho80 = (await page.locator(HOJA).boundingBox())?.width || 0
    await expect(editor.getByRole('button', { name: '58 mm' })).toHaveAttribute('aria-pressed', 'false')
    await editor.getByRole('button', { name: '58 mm' }).click()
    await expect(editor.getByRole('button', { name: '58 mm' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await page.locator(HOJA).boundingBox())?.width || 0).toBeLessThan(ancho80 - 20)
    await expect(hoja.locator('pre')).toContainText('58 mm')

    // Corte: «Sin corte» quita la marca del papel.
    await editor.getByLabel('Corte').selectOption('ninguno')
    await expect(hoja.locator('pre')).not.toContainText('[CORTE]')

    // Copias: el contador sube y el pie del papel lo refleja.
    await editor.getByRole('button', { name: 'Una copia más' }).click()
    await expect(editor.locator('[aria-live="polite"]')).toHaveText('2')
    await expect(hoja.locator('pre')).toContainText(/Copias\s+2/)

    // Guardar: la plantilla queda en la impresora y se recuerda al reabrir.
    await dialogo.getByRole('button', { name: 'Guardar plantilla' }).click()
    await expect(dialogo.getByText('Guardada en esta impresora', { exact: true })).toBeVisible()
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toBeHidden()

    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    const reabierto = page.getByRole('dialog')
    await expect(reabierto.getByLabel('Tipo de prueba')).toHaveValue('corta', { timeout: 20_000 })
    await expect(reabierto.getByRole('button', { name: '58 mm' })).toHaveAttribute('aria-pressed', 'true')
    await expect(reabierto.getByRole('button', { name: 'QR y código de barras' })).toHaveAttribute('aria-pressed', 'false')
    await expect(reabierto.getByRole('group', { name: 'Copias' })).toContainText('2')
    await expect(reabierto.getByText('Guardada en esta impresora', { exact: true })).toBeVisible()
    await reabierto.getByRole('button', { name: 'Cancelar' }).click()
  })
})
