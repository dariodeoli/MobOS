// Finanzas → Caja (#199): turno con cobro en efectivo, auditoría del rango y
// cierre con arqueo, contra datos reales del arnés. Deja la caja abierta con
// la apertura de 100.000 como la espera `admin.spec.js`.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearCobroEfectivo(page, sufijo) {
  return page.evaluate(async ({ api, sufijo }) => {
    const post = async (path, body) => {
      const respuesta = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
    }
    // Producto propio del test: no depende del stock que dejen otras specs.
    const producto = await post('/api/products', { name: `QA Caja ${sufijo}`, sku: `QA-CAJA-${sufijo}`, pricePyg: 250000, stock: 5 })
    const orden = await post('/api/orders', {
      items: [{ productId: producto.data.id, description: producto.data.name, quantity: 1, unitPricePyg: producto.data.pricePyg }],
      payments: [{ method: 'CASH', amountPyg: producto.data.pricePyg, status: 'CONFIRMED', reference: `CAJA-${sufijo}` }],
    })
    return { status: orden.status, orden: orden.data }
  }, { api: API, sufijo })
}
test.describe('finanzas · caja', () => {
  test('el efectivo cobrado se audita y el cierre calcula la diferencia', async ({ page }) => {
    // Primero una página de la app: el fetch con cookies sale del mismo origen.
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const cobro = await crearCobroEfectivo(page, sufijo)
    expect(cobro.status, JSON.stringify(cobro.orden)).toBe(201)
    const numero = cobro.orden.orderNumber

    await page.goto('/finanzas/caja')
    await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()

    // La sesión puede venir abierta (admin.spec) o cerrada (otra corrida):
    // se espera el estado y se abre solo si hace falta.
    await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible()
    if (await page.getByRole('heading', { name: 'Abrir caja' }).count()) {
      await page.locator('#opening').fill('100000')
      await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    }
    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()
    await expect(page.locator('strong').filter({ hasText: 'Abierta' }).first()).toBeVisible()

    // El cobro entra en "Auditoría de medios" (efectivo) y en la auditoría del rango.
    await page.getByText('Entradas por medio de pago').scrollIntoViewIfNeeded()
    await expect(page.getByText(/Efectivo/).first()).toBeVisible()

    const filaCobro = page.getByTestId('auditoria-fila').filter({ hasText: numero })
    await expect(filaCobro).toBeVisible()

    // Lote 6-C (#169): la grilla de auditoría entra sin scroll horizontal.
    const medidaAuditoria = await page.getByTestId('auditoria-efectivo-tabla').evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
    expect(medidaAuditoria.scrollWidth, 'la auditoría no debe pedir scroll horizontal').toBeLessThanOrEqual(medidaAuditoria.clientWidth + 1)

    const estadoSelect = filaCobro.getByRole('combobox')
    await estadoSelect.selectOption('VERIFIED')
    await expect(estadoSelect).toHaveValue('VERIFIED')
    const guardar = filaCobro.getByRole('button', { name: 'Guardar' })
    await expect(guardar).toBeEnabled()
    await guardar.click()
    // El badge es un span; la opción del selector tiene el mismo texto.
    const badgeVerificado = filaCobro.locator('span').filter({ hasText: /^Verificado$/ }).first()
    await expect(badgeVerificado).toBeVisible()

    // Persistencia de la marca: al recargar sigue verificada.
    await page.reload()
    const filaRecargada = page.getByTestId('auditoria-fila').filter({ hasText: numero })
    await expect(filaRecargada.locator('span').filter({ hasText: /^Verificado$/ }).first()).toBeVisible()

    // #148 §18: corte por caja del período con la sesión del turno.
    await expect(page.getByRole('heading', { name: 'Ventas por caja' })).toBeVisible()
    const filaCaja = page.getByTestId('ventas-por-caja-fila').first()
    await expect(filaCaja).toBeVisible()
    await expect(filaCaja.getByText('Abierta', { exact: true })).toBeVisible()
    const medidaCajas = await page.getByTestId('ventas-por-caja-tabla').evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
    expect(medidaCajas.scrollWidth, 'el corte por caja no debe pedir scroll horizontal').toBeLessThanOrEqual(medidaCajas.clientWidth + 1)

    // Cierre con el esperado exacto: diferencia 0 y estado "Cerrada".
    const esperado = await page.evaluate(async (api) => {
      const respuesta = await fetch(`${api}/api/cash`, { credentials: 'include' })
      const data = await respuesta.json()
      return Number(data?.session?.expectedPyg ?? data?.expectedPyg ?? 0)
    }, API)
    expect(esperado).toBeGreaterThan(0)
    await page.locator('#counted').fill(String(esperado))
    await page.getByRole('button', { name: /Cerrar caja/ }).click()
    await expect(page.locator('strong').filter({ hasText: 'Cerrada' }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()

    // Se restaura el estado que espera la suite: caja abierta con 100.000.
    await page.locator('#opening').fill('100000')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    await expect(page.locator('strong').filter({ hasText: 'Abierta' }).first()).toBeVisible()
  })

  // #249 · Auditoría responsive mobile (H2/H3): en 390 px los controles de
  // Finanzas que la auditoría midió llegan a 44 px de área táctil — solapas del
  // dominio, selector de período y acciones por fila de la auditoría de
  // efectivo/medios. Con MOBOS_QA_CAPTURAS=1 deja capturas y mediciones en
  // docs/qa/249-finanzas/ (MOBOS_QA_FASE=antes|despues rotula los archivos).
  test('responsive: los controles de finanzas llegan a 44 px en mobile', async ({ page }) => {
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const cobro = await crearCobroEfectivo(page, sufijo)
    expect(cobro.status, JSON.stringify(cobro.orden)).toBe(201)
    const numero = cobro.orden.orderNumber

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/finanzas/caja')
    await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
    await expect(page.getByTestId('auditoria-fila').filter({ hasText: numero })).toBeVisible()

    const controles = [
      ['solapa de finanzas', page.getByRole('tab', { name: 'Caja', exact: true })],
      ['selector de período', page.getByRole('button', { name: /30 días|7 días|Hoy|Ayer|Este mes|Mes pasado|Trimestre|Este año/ }).first()],
      ['fila · Guardar', page.getByTestId('auditoria-fila').first().getByRole('button', { name: 'Guardar' })],
      ['fila · casilla Coincide', page.locator('label:has-text("Coincide")').first()],
    ]
    const mediciones = {}
    for (const [nombre, locator] of controles) {
      await locator.scrollIntoViewIfNeeded()
      const caja = await locator.boundingBox()
      mediciones[nombre] = caja ? { ancho: Math.round(caja.width), alto: Math.round(caja.height) } : null
    }

    if (process.env.MOBOS_QA_CAPTURAS === '1') {
      const fs = await import('node:fs/promises')
      const fase = process.env.MOBOS_QA_FASE || 'actual'
      await fs.mkdir('docs/qa/249-finanzas', { recursive: true })
      await fs.writeFile(`docs/qa/249-finanzas/mediciones-${fase}.json`, JSON.stringify({ fecha: new Date().toISOString(), ancho: 390, mediciones }, null, 2))
      await page.screenshot({ path: `docs/qa/249-finanzas/caja-390-${fase}.png`, fullPage: true })
      await page.getByRole('tab', { name: 'Caja', exact: true }).locator('..').screenshot({ path: `docs/qa/249-finanzas/subtabs-390-${fase}.png` })
      await page.getByTestId('auditoria-efectivo-tabla').screenshot({ path: `docs/qa/249-finanzas/auditoria-390-${fase}.png` })
      await page.locator('article:has-text("Coincide")').first().screenshot({ path: `docs/qa/249-finanzas/medios-390-${fase}.png` })
    }

    for (const [nombre, medida] of Object.entries(mediciones)) {
      expect(medida, `${nombre} visible`).not.toBeNull()
      expect(medida.alto, `${nombre} · alto táctil`).toBeGreaterThanOrEqual(44)
    }
  })
})
