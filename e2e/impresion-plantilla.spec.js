import { expect, test } from '@playwright/test'

// Editor de la plantilla del ticket de prueba (PRN + diseño): qué bloques
// incluye, ancho 58/80, variante de corte y copias, todo desde la ficha de la
// impresora (Configuración → Dispositivos → Impresoras → Probar).
//
// La prueba NO se imprime en este spec (no hay puente ni impresora física): se
// cancela al final. El envío real —con copias y corte— lo cubren
// `impresion-remota.spec.js` y los unitarios del builder.
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DESTINO = 'lan:10.99.99.60:9100'
const HOJA = 'iframe[title="Vista previa del ticket de prueba"]'
const tarjetaDe = (page, texto) => page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: texto })

test.describe('plantilla del ticket de prueba', () => {
  test('ADMIN edita qué incluye, ancho, corte y copias, y el papel responde', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/configuracion/dispositivos')
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
      { api: API, nombre: `Térmica plantilla E2E ${Date.now()}`, destino: DESTINO },
    )
    await page.reload()
    const tarjeta = tarjetaDe(page, '10.99.99.60')
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })
    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    const dialogo = page.getByRole('dialog')
    const editor = dialogo.getByTestId('plantilla-prueba')
    await expect(editor).toBeVisible()

    // Vista previa abierta por defecto: el papel muestra el ticket completo.
    const hoja = page.frameLocator(HOJA)
    await expect(hoja.locator('pre')).toContainText('TICKET DE PRUEBA')
    await expect(hoja.locator('pre')).toContainText('[CORTE]')

    // Qué incluye: apagar «QR y código de barras» los saca del papel.
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

    // Cancelar: no se encola ninguna impresión.
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toBeHidden()
  })
})
