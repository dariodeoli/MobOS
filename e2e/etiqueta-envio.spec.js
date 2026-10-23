import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

// Etiqueta de envío 10 × 15 cm desde Delivery (demo, datos ficticios): por pedido
// y en lote, una etiqueta por página, con destinatario, número de pedido, bulto,
// contra reembolso con el saldo, QR del seguimiento y código de barras.
test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

async function entrarDelivery(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  await page.goto('/delivery')
  await expect(page.getByTestId('reparto-admin-pedido').first()).toBeVisible({ timeout: 20_000 })
}

// La impresión abre un iframe oculto con el HTML: se lee desde ahí sin diálogo.
async function ultimaHoja(page) {
  await expect.poll(() => page.locator('iframe[aria-hidden="true"]').count()).toBeGreaterThan(0)
  return page.evaluate(() => {
    const frames = [...document.querySelectorAll('iframe[aria-hidden="true"]')]
    const doc = frames[frames.length - 1].contentDocument
    const secciones = [...doc.querySelectorAll('section.etiqueta')]
    const estilo = doc.querySelector('style')?.textContent || ''
    return {
      paginas: secciones.length,
      arroba: /@page\{size:100mm 150mm;margin:0\}/.test(estilo),
      ancho: secciones[0] ? getComputedStyle(secciones[0]).width : '',
      alto: secciones[0] ? getComputedStyle(secciones[0]).height : '',
      textos: secciones.map((s) => s.textContent),
      qr: secciones.map((s) => Boolean(s.querySelector('img.qr')?.src?.startsWith('data:image/png'))),
      enlaces: secciones.map((s) => s.querySelector('img.qr')?.dataset.enlace || ''),
      barras: secciones.map((s) => s.querySelectorAll('.barras svg rect, .barras svg path').length > 0),
    }
  })
}

test('imprime la etiqueta de envío 10×15 de un pedido con 2 bultos y contra reembolso', async ({ page }) => {
  await entrarDelivery(page)
  const tarjeta = page.locator('[data-testid="reparto-admin-pedido"][data-pedido="AUR-0003"]')
  await tarjeta.getByTestId('etiqueta-envio-pedido').click()
  await expect(page.getByTestId('etiqueta-envio-popup')).toBeVisible()
  await page.getByLabel('Bultos por pedido').fill('2')
  await page.getByTestId('etiqueta-envio-imprimir').click()

  const hoja = await ultimaHoja(page)
  expect(hoja.paginas).toBe(2)
  expect(hoja.arroba).toBe(true)
  expect(Math.abs(parseFloat(hoja.ancho) - 377.953)).toBeLessThan(0.1) // 100 mm
  expect(Math.abs(parseFloat(hoja.alto) - 566.929)).toBeLessThan(0.1) // 150 mm
  expect(hoja.textos[0]).toContain('Lucía Franco')
  expect(hoja.textos[0]).toContain('AUR-0003')
  expect(hoja.textos[0]).toContain('1 de 2')
  expect(hoja.textos[1]).toContain('2 de 2')
  expect(hoja.textos[0]).toContain('Contra reembolso')
  expect(hoja.textos[0]).toContain('1.880.000')
  expect(hoja.qr).toEqual([true, true])
  expect(hoja.enlaces[0]).toMatch(/\/pedidos\//)
  expect(hoja.barras).toEqual([true, true])
})

test('en lote: una etiqueta por página para los repartos marcados', async ({ page }) => {
  await entrarDelivery(page)
  await page.getByLabel('Marcar AUR-0003 para etiqueta de envío').check()
  await page.getByLabel('Marcar AUR-0012 para etiqueta de envío').check()
  await page.getByTestId('etiquetas-envio-imprimir-lote').click()
  await page.getByTestId('etiqueta-envio-imprimir').click()

  const hoja = await ultimaHoja(page)
  expect(hoja.paginas).toBe(2)
  expect(hoja.textos[0]).toContain('AUR-0003')
  expect(hoja.textos[1]).toContain('AUR-0012')
  expect(hoja.textos[1]).toContain('Hugo Benítez')
})
