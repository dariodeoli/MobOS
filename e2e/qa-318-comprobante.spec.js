// #318 — Comprobante de una venta real (auditoría del demo v1.0.209).
//
// La vista previa tiene que mostrar la venta real —empresa, cliente, número,
// artículos y total—, nunca placeholders: la venta sembrada de María González
// (Gs 7.250.000) viaja por el listado como fila plana sin ítems y el
// comprobante la resuelve igual. El modal mantiene el encabezado y el pie fijos
// con el cuerpo desplazable, y el papel se dimensiona a su contenido para que
// no quede cortado. Evidencia en claro, oscuro y móvil.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SALIDA = 'docs/qa/318-comprobante'
mkdirSync(SALIDA, { recursive: true })

const VENTA = {
  cliente: 'María González',
  numero: 'demo-venta-extra-1',
  producto: 'iPhone 15 Pro Max 256GB Titanio Natural',
  total: 'Gs 7.250.000',
}

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await cerrarGuiaDemo(page)
}

async function abrirComprobante(page) {
  await page.goto('/pedidos')
  await page.getByTestId('pedido-fila').filter({ hasText: VENTA.cliente }).first().click()
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
  await page.getByLabel('Tipo de comprobante').waitFor()
  const iframe = page.locator('iframe[title="Vista previa del comprobante"]')
  await expect(iframe).toBeVisible()
  return iframe
}

const textoDelComprobante = (iframe) => iframe.evaluate((frame) => frame.contentDocument.body.innerText)

// Captura el comprobante suelto (todo el papel, sin el modal) reabriendo su
// HTML en una pestaña limpia: es la evidencia de que el impreso completo lleva
// los datos reales.
async function capturarComprobante(page, ruta) {
  const html = await page.locator('iframe[title="Vista previa del comprobante"]').evaluate((frame) => frame.contentDocument.documentElement.outerHTML)
  const suelta = await page.context().newPage()
  await suelta.setContent(html)
  await suelta.screenshot({ path: ruta, fullPage: true })
  await suelta.close()
}

test.describe('#318 comprobante con datos reales', () => {
  test('la venta demo se imprime con empresa, cliente, número y artículos reales', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'dark') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    const iframe = await abrirComprobante(page)

    await expect.poll(async () => textoDelComprobante(iframe)).toContain('Aurora Móviles S.A.')
    const texto = await textoDelComprobante(iframe)
    expect(texto).toContain(VENTA.cliente)
    expect(texto).toContain(VENTA.producto)
    expect(texto).toContain(VENTA.total)
    expect(texto).toContain(VENTA.numero)
    expect(texto).toMatch(/Total de\s*ítems\s*1/)
    expect(texto).not.toContain('Consumidor final')
    // La empresa del comprobante es la de la sesión (la venta), no la marca de
    // la app ni un texto vacío.
    expect(texto).toMatch(/EMPRESA\s+Aurora Móviles S\.A\./)

    // El papel se dimensiona a su contenido: nada queda cortado dentro del
    // iframe.
    const medidas = await iframe.evaluate((frame) => ({
      marco: frame.clientHeight,
      contenido: frame.contentDocument.documentElement.scrollHeight,
    }))
    expect(Math.abs(medidas.marco - medidas.contenido)).toBeLessThanOrEqual(4)

    // Encabezado y pie fijos: al scrollear el cuerpo hasta el final, el título
    // no se mueve y las acciones siguen a la vista.
    const dialogo = page.getByRole('dialog')
    const cuerpo = dialogo.getByTestId('modal-cuerpo')
    const pie = dialogo.getByTestId('modal-pie')
    await expect(pie).toBeVisible()
    await expect(pie.getByLabel('Tipo de comprobante')).toBeVisible()
    await expect(pie.getByRole('button', { name: 'Imprimir con diálogo' })).toBeVisible()
    expect(await cuerpo.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await page.screenshot({ path: `${SALIDA}/modal-oscuro.png` })

    const titulo = dialogo.getByRole('heading', { name: 'Comprobante' })
    const antes = await titulo.boundingBox()
    await cuerpo.evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(150)
    const despues = await titulo.boundingBox()
    expect(Math.abs((despues?.y || 0) - (antes?.y || 0))).toBeLessThanOrEqual(1)
    await expect(pie).toBeVisible()

    await capturarComprobante(page, `${SALIDA}/comprobante-oscuro.png`)
  })

  test('el comprobante se ve completo en tema claro y en formato A4', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    const iframe = await abrirComprobante(page)
    await expect.poll(async () => textoDelComprobante(iframe)).toContain(VENTA.cliente)

    // Cambiar de formato rearma la vista con el ancho real de cada papel.
    await page.getByLabel('Formato de impresión').getByRole('radio', { name: 'Formato A4' }).click()
    await expect.poll(async () => textoDelComprobante(iframe)).toContain(VENTA.producto)
    await page.screenshot({ path: `${SALIDA}/modal-claro.png` })
    await capturarComprobante(page, `${SALIDA}/comprobante-claro.png`)
  })

  test('en móvil el pie queda usable y el comprobante se recorre sin cortes', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light') })
    await page.setViewportSize({ width: 390, height: 844 })
    await entrarDemo(page)
    const iframe = await abrirComprobante(page)
    await expect.poll(async () => textoDelComprobante(iframe)).toContain(VENTA.cliente)

    const dialogo = page.getByRole('dialog')
    const cuerpo = dialogo.getByTestId('modal-cuerpo')
    await expect(dialogo.getByTestId('modal-pie').getByRole('button', { name: 'Imprimir con diálogo' })).toBeVisible()
    expect(await cuerpo.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await page.screenshot({ path: `${SALIDA}/modal-movil.png` })
    await capturarComprobante(page, `${SALIDA}/comprobante-movil.png`)
  })

  test('imprimir con diálogo avisa con un toast el resultado', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('mobos:theme', 'dark')
      // El diálogo nativo de impresión no existe en el test: se registra la
      // llamada y el toast avisa igual.
      window.print = () => { window.__impreso = true }
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await entrarDemo(page)
    await abrirComprobante(page)
    await page.getByRole('button', { name: 'Imprimir con diálogo' }).click()
    await expect(page.getByText('Comprobante listo')).toBeVisible()
    await page.screenshot({ path: `${SALIDA}/toast-impresion.png` })
  })
})
