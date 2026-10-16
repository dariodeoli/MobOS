import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
async function enter(page) {
  await page.route('**/api/**', route =>
    new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.fulfill({ status: 503, json: { error: 'API real bloqueada' } })
      : route.continue(),
  )
  await page.route('https://**', route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-session', 'active')
    sessionStorage.setItem('mobos:demo-session:role', 'ADMIN')
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/e2e/fixtures/plantillas507.html')
  await expect(page.getByRole('button', { name: 'Nueva plantilla', exact: true })).toBeEnabled()
}
async function preset(page, kind, name) {
  await page.getByLabel('Tipo de documento', { exact: true }).selectOption(kind)
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar plantilla de impresión', exact: true })
  await editor.getByLabel('Nombre de la plantilla', { exact: true }).fill(name)
  await expect(editor.locator('iframe')).toBeVisible()
  await editor.getByRole('button', { name: 'Guardar plantilla', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Plantilla creada')
  await editor.getByRole('button', { name: 'Cerrar editor', exact: true }).click()
  const row = page
    .getByTestId('plantillas-empresa')
    .locator('li')
    .filter({ has: page.getByRole('button', { name: `Editar ${name}`, exact: true }) })
  await row.getByRole('button', { name: 'Usar en esta sucursal', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Predeterminado actualizado')
}
async function pdf(page, button, count, box = '/MediaBox [0 0 311.81 170.08]') {
  const pending = page.waitForEvent('download')
  await button.click()
  const text = await readFile(await (await pending).path(), 'latin1')
  expect(text).toContain(`/Count ${count}`)
  expect(text).toContain(box)
}
test('507 Stock mixto adopta defaults reales del cliente y separa PDFs exactos sin agente', async ({
  page,
}) => {
  await enter(page)
  await preset(page, 'etiquetas-stock', 'Unidades guardadas')
  await preset(page, 'etiquetas-producto', 'Productos guardados')
  await page.getByRole('button', { name: 'Etiquetas de Stock fixture', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Etiquetas de Stock', exact: true })
  await expect(modal.getByText(/4 etiquetas/)).toBeVisible()
  const unit = modal.getByRole('region', { name: 'Formato etiquetas-stock', exact: true })
  const product = modal.getByRole('region', { name: 'Formato etiquetas-producto', exact: true })
  await expect(unit.getByLabel('Plantilla del PDF')).not.toHaveValue('')
  await expect(product.getByLabel('Plantilla del PDF')).not.toHaveValue('')
  await expect(
    unit.frameLocator('iframe').getByText('350000000000001', { exact: true }),
  ).toBeVisible()
  await expect(product.frameLocator('iframe').getByText('Cable QA', { exact: true })).toBeVisible()
  expect(
    await unit.locator('iframe').evaluate(e => e.contentDocument.body.innerText),
  ).not.toContain('PRIVADO')
  await expect(modal.getByRole('button', { name: 'Continuar con formato habitual' })).toBeDisabled()
  await pdf(page, unit.getByRole('button', { name: 'Descargar PDF con plantilla' }), 2)
  await pdf(page, product.getByRole('button', { name: 'Descargar PDF con plantilla' }), 2)
  await expect(page.getByTestId('legacy-calls')).toHaveText('0')
  await unit.getByLabel('Plantilla del PDF').selectOption('')
  await expect(modal.getByRole('button', { name: 'Continuar con formato habitual' })).toBeDisabled()
  await product.getByLabel('Plantilla del PDF').selectOption('')
  await modal.getByRole('button', { name: 'Continuar con formato habitual' }).click()
  await expect(page.getByTestId('legacy-calls')).toHaveText('1')
})
test('507 Taller lote e individual usan default y conservan IMEI al exportar', async ({ page }) => {
  await enter(page)
  await preset(page, 'etiquetas-stock', 'Taller guardada')
  await page.getByTestId('rack-imprimir-serie').click()
  const modal = page.getByRole('dialog', { name: 'Imprimir en serie', exact: true })
  await expect(modal.getByLabel('Plantilla del PDF')).not.toHaveValue('')
  await expect(modal.getByTestId('rack-imprimir-serie-confirmar')).toBeDisabled()
  await pdf(page, modal.getByRole('button', { name: 'Descargar PDF con plantilla' }), 2)
  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByTestId('rack-equipo')
    .first()
    .getByRole('button', { name: 'Etiqueta', exact: true })
    .click()
  await expect(modal.getByTestId('rack-impresion-resumen')).toContainText('1 etiqueta(s)')
  await pdf(page, modal.getByRole('button', { name: 'Descargar PDF con plantilla' }), 1)
  await expect(page.getByTestId('legacy-calls')).toHaveText('0')
})
test('507 Pedido usa plantilla guardada con el mismo HTML premium e importes', async ({ page }) => {
  await enter(page)
  await preset(page, 'comprobante', 'Pedido guardada')
  await page.getByRole('button', { name: 'Comprobante del pedido fixture', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Comprobante', exact: true })
  await expect(modal.getByLabel('Plantilla del PDF')).not.toHaveValue('')
  await modal.getByRole('radio', { name: 'Formato A4', exact: true }).click()
  const frame = modal.frameLocator('iframe')
  await expect(frame.getByText('Funda real del fixture', { exact: false })).toBeVisible()
  const text = await modal.locator('iframe').evaluate(e => e.contentDocument.body.innerText)
  expect(text).toContain('180.000')
  expect(text).toContain('QA-507-REAL')
  await expect(
    modal.getByRole('button', { name: 'Imprimir con diálogo', exact: true }),
  ).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeDisabled()
  const pending = page.waitForEvent('download')
  await modal.getByRole('button', { name: 'Descargar PDF con plantilla', exact: true }).click()
  const result = await readFile(await (await pending).path(), 'latin1')
  expect(result).toContain('/Count 1')
  expect(result).toMatch(/\/MediaBox \[0 0 226.77 [0-9.]+\]/)
})

test('507 cambio de empresa invalida la selección abierta del Taller', async ({ page }) => {
  await enter(page)
  await preset(page, 'etiquetas-stock', 'Empresa A')
  await page.getByTestId('rack-imprimir-serie').click()
  const modal = page.getByRole('dialog', { name: 'Imprimir en serie', exact: true })
  await expect(modal.locator('iframe')).toBeVisible()
  // Cambio del contexto proveedor aunque exista un modal abierto: simula cierre
  // de sesión/sucursal externo, sin reutilizar el callback de impresión.
  await page.getByRole('button', { name: 'Cambiar empresa fixture' }).evaluate(button => button.click())
  await expect(modal).toHaveCount(0)
  await page.getByTestId('rack-imprimir-serie').click()
  await expect(modal.getByLabel('Plantilla del PDF')).toHaveValue('')
  await expect(modal.getByTestId('rack-imprimir-serie-confirmar')).toBeEnabled()
  await expect(page.getByTestId('legacy-calls')).toHaveText('0')
})
