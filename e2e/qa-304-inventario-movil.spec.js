// #304 · Inventario móvil: trabajo primero, sin scroll infinito.
// En 375–390 px el primer producto se ve sin desplazar, en tarjetas compactas
// que no ocultan el IMEI ni piden scroll horizontal; la tabla ancha queda para
// escritorio. Corre en el demo anónimo (banner reducido incluido).
// Evidencia en docs/qa/304-inventario/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'qa', '304-inventario')
const VIEWPORTS = [['375', 375, 667], ['390', 390, 844]]

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
  // El aviso del demo es el mismo (texto largo en escritorio, corto en móvil).
  await expect(page.getByRole('status').filter({ hasText: /datos ficticios/ }).first()).toBeVisible()
}

async function capturar(page, nombre, oscuro) {
  await page.evaluate((modo) => {
    document.documentElement.classList.toggle('dark', modo)
    try { localStorage.setItem('mobos:theme', modo ? 'dark' : 'light') } catch { /* sin storage */ }
  }, Boolean(oscuro))
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(DIR, nombre) })
}

test('#304 · el primer producto entra en el primer viewport móvil', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await entrarDemo(page)
  // El banner del demo queda en una línea compacta en móvil (#304).
  const banner = page.getByRole('status').filter({ hasText: /Demo: datos ficticios/ })
  await expect(banner).toBeVisible()

  for (const [etiqueta, ancho, alto] of VIEWPORTS) {
    await page.setViewportSize({ width: ancho, height: alto })
    await page.goto('/inventario/unidades')
    const tarjeta = page.getByTestId('inventario-tarjeta-movil').first()
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })

    // La tabla ancha no existe en móvil y la página no desborda.
    await expect(page.getByTestId('inventario-tabla')).toHaveCount(0)
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(desborde, `${etiqueta}: desborde horizontal de ${desborde} px`).toBeLessThanOrEqual(1)

    // El primer producto se ve completo sin desplazar la página.
    const caja = await tarjeta.boundingBox()
    expect(caja.y, `${etiqueta}: la tarjeta arranca en y=${Math.round(caja.y)}`).toBeLessThan(alto)
    expect(caja.y + caja.height, `${etiqueta}: la tarjeta termina en ${Math.round(caja.y + caja.height)} con viewport ${alto}`).toBeLessThanOrEqual(alto)

    // Datos de trabajo visibles: modelo, IMEI completo, verificación y estado.
    await expect(tarjeta.locator('b').first()).not.toBeEmpty()
    const imei = await tarjeta.getByTestId('unidad-imei').evaluate((nodo) => ({ texto: (nodo.textContent || '').trim(), title: nodo.getAttribute('title') || '', scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
    expect(imei.texto.length, 'el IMEI viaja completo').toBeGreaterThan(8)
    expect(imei.title).toContain(imei.texto)
    expect(imei.scrollWidth, 'el IMEI no se recorta').toBeLessThanOrEqual(imei.clientWidth + 1)
    await expect(tarjeta.getByTestId('unidad-verificacion')).toBeVisible()
    await expect(tarjeta.getByText(/^(Disponible|Reservado|Vendido|En revisión|En tránsito)$/).first()).toBeVisible()

    if (etiqueta === '375') await capturar(page, 'inventario-375-light.png', false)
    if (etiqueta === '390') {
      await capturar(page, 'inventario-390-light.png', false)
      await capturar(page, 'inventario-390-dark.png', true)
    }
  }
})

test('#304 · Ver abre la ficha y Más agrupa las acciones de la tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await entrarDemo(page)
  await page.goto('/inventario/unidades')
  const tarjeta = page.getByTestId('inventario-tarjeta-movil').first()
  await expect(tarjeta).toBeVisible({ timeout: 20_000 })

  // Ver abre la ficha de la unidad (sin scroll horizontal).
  await tarjeta.getByRole('button', { name: 'Ver', exact: true }).click()
  const ficha = page.getByRole('dialog')
  await expect(ficha).toBeVisible({ timeout: 20_000 })
  await expect(ficha.getByText('Ficha del equipo')).toBeVisible({ timeout: 20_000 })
  await ficha.getByRole('button', { name: 'Cerrar' }).click()

  // Más: las acciones de siempre, incluida Verificar (la tarjeta no tiene botón inline).
  await tarjeta.getByLabel(/^Acciones de/).click()
  for (const accion of ['Vender', 'Reservar', 'Verificar', 'Dar de baja']) {
    await expect(tarjeta.getByRole('button', { name: accion, exact: true })).toBeVisible()
  }
})
