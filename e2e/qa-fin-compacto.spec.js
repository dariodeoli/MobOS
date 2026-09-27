// Batch compacto de Finanzas (#241 · F4): métricas claras (tiles de consola),
// controles agrupados y tablas densas en Gastos, Créditos, Cuotas, Publicidad y
// Comisiones. Capturas antes/después (v2 apagado/prendido): el «después» cubre
// claro/oscuro en desktop y mobile; el «antes» deja claro/oscuro en desktop.
// Además: contraste del shell con v2 y sin scroll horizontal en 360/390/768/1440.
//
// Capturas: `QA_FIN_COMPACTO` (default test-results/fin-compacto) — se versionan
// en docs/qa/fin-compacto/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.QA_FIN_COMPACTO || 'test-results/fin-compacto'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

// Semillas mínimas para que las capturas muestren carga real (una vez por test).
const apiPagina = (page, path, options = {}) => page.evaluate(async ({ api, path, options }) => {
  const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, path, options })

const movimiento = (page, body) => apiPagina(page, `/api/finance?branchId=${encodeURIComponent(SEED.branchId)}`, {
  method: 'POST',
  body: JSON.stringify({ action: 'movement', kind: 'EXPENSE', direction: 'OUT', currency: 'PYG', exchangeRatePyg: 1, accountId: null, ...body }),
})

async function sembrarCredito(page, marca) {
  const cliente = await apiPagina(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente Compacto ${marca}`, phone: '0981555000', countryCode: '+595' }) })
  const pedido = await apiPagina(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `E2E-CMP-${marca}`, customerId: cliente.body?.id, items: [{ description: `Equipo compacto ${marca}`, quantity: 1, unitPricePyg: 900000 }] }) })
  const orderId = pedido.body?.id
  if (!orderId) return
  await apiPagina(page, '/api/payments', { method: 'POST', body: JSON.stringify({ orderId, method: 'CREDIT', status: 'PENDING', amountPyg: 350000, reference: 'Cuota 1/2', dueAt: new Date(Date.now() - 6 * 86400000).toISOString() }) })
  await apiPagina(page, '/api/payments', { method: 'POST', body: JSON.stringify({ orderId, method: 'CREDIT', status: 'PENDING', amountPyg: 350000, reference: 'Cuota 2/2', dueAt: new Date(Date.now() + 3 * 86400000).toISOString() }) })
}

async function sembrarGastos(page, marca) {
  await movimiento(page, { originalAmount: '185000', description: `Seguro de mercadería ${marca}` })
  await movimiento(page, { kind: 'CHEQUE', originalAmount: '420000', description: `Cheque proveedor ${marca}`, dueAt: new Date(Date.now() + 10 * 86400000).toISOString() })
}

async function sembrarPublicidad(page, marca) {
  await movimiento(page, { originalAmount: '260000', description: `Publicidad: Meta Ads · captura ${marca}` })
  await movimiento(page, { originalAmount: '140000', description: `Publicidad: Google Ads · captura ${marca}` })
}

async function sembrarComisiones(page) {
  const usuarios = await apiPagina(page, '/api/users')
  const lista = Array.isArray(usuarios.body) ? usuarios.body : []
  const alguien = lista.find((usuario) => usuario.status !== 'INACTIVE')
  if (!alguien) return
  await apiPagina(page, '/api/commission-rules', { method: 'POST', body: JSON.stringify({ userId: alguien.id, percentPyg: 1.5 }) })
}

// Caja (continuación del batch): una compra a crédito y un repuesto del taller
// con deuda para que las dos grillas densas tengan filas.
async function sembrarCaja(page, marca) {
  await apiPagina(page, `/api/finance?branchId=${encodeURIComponent(SEED.branchId)}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'supplierPayable', supplierName: `Proveedor Compacto ${marca}`, concept: `Repuestos ${marca}`, condition: 'CREDITO', amountPyg: 320000, dueAt: new Date(Date.now() + 6 * 86400000).toISOString(), reference: `FAC-CMP-${marca}` }),
  })
  await apiPagina(page, '/api/workshop/parts', {
    method: 'POST',
    body: JSON.stringify({ name: `Pantalla compacta ${marca}`, ownership: 'PROPIO', paymentMode: 'CREDITO', quantity: 2, unitCostPyg: 95000, dueAt: new Date(Date.now() - 3 * 86400000).toISOString(), branchId: SEED.branchId }),
  })
}

const PANTALLAS = [
  ['caja', '/finanzas/caja', (page) => page.getByTestId('caja-por-pagar'), sembrarCaja, (page) => page.locator('[data-testid^="proveedor-"]')],
  ['gastos', '/finanzas/gastos', (page) => page.getByTestId('gastos-resumen'), sembrarGastos, (page) => page.getByTestId('gasto-fila')],
  ['creditos', '/finanzas/creditos', (page) => page.getByTestId('creditos-resumen'), sembrarCredito, (page) => page.getByTestId('credito-fila')],
  ['cuotas', '/finanzas/cuotas', (page) => page.getByTestId('cuotas-resumen'), sembrarCredito, (page) => page.getByTestId('cuota-fila')],
  ['publicidad', '/finanzas/publicidad', (page) => page.getByTestId('ads-resumen'), sembrarPublicidad, (page) => page.getByTestId('ad-fila')],
  ['comisiones', '/finanzas/comisiones', (page) => page.getByTestId('comisiones-resumen'), sembrarComisiones, (page) => page.getByTestId('regla-comision')],
]

const preparar = (page, { modo, v2 }) => page.addInitScript(({ modo, v2 }) => {
  try {
    localStorage.setItem('mobos:theme', modo)
    localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
  } catch { /* sin storage */ }
}, { modo, v2 })

test.describe('finanzas compacto · capturas antes/después', () => {
  for (const [dominio, ruta, listo, sembrar, conDatos] of PANTALLAS) {
    test(`${dominio}: antes (v2 off) y después (v2 on) por tema y viewport`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await page.goto('/pos')
      if (sembrar) await sembrar(page, Date.now().toString(36))
      const combos = [
        ['antes', false, 'claro', 'light', 'desktop', 1280, 900],
        ['antes', false, 'oscuro', 'dark', 'desktop', 1280, 900],
        ['despues', true, 'claro', 'light', 'desktop', 1280, 900],
        ['despues', true, 'oscuro', 'dark', 'desktop', 1280, 900],
        ['despues', true, 'claro', 'light', 'mobile', 390, 844],
        ['despues', true, 'oscuro', 'dark', 'mobile', 390, 844],
      ]
      for (const [estado, v2, tema, modo, vista, ancho, alto] of combos) {
        await page.setViewportSize({ width: ancho, height: alto })
        await preparar(page, { modo, v2 })
        await page.goto(ruta)
        await expect(listo(page)).toBeVisible({ timeout: 30_000 })
        // La captura espera la carga real: las filas sembradas tienen que estar.
        await expect(conDatos(page).first()).toBeVisible({ timeout: 25_000 })
        if (v2) {
          const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
          informar(`${dominio}-${estado}-${vista}-${tema}`, medicion)
          expect(medicion.bajos, `AA del shell en ${dominio} (${vista} ${tema})`).toEqual([])
        }
        await page.screenshot({ path: `${SHOTS}/fin-compacto-${dominio}-${estado}-${tema}-${vista}.png` })
      }
    })
  }
})

test.describe('finanzas compacto · sin scroll horizontal', () => {
  const ANCHOS = [360, 390, 768, 1440]
  for (const [dominio, ruta, listo] of PANTALLAS) {
    test(`${dominio}: 360/390/768/1440 sin scroll del documento`, async ({ page }) => {
      await preparar(page, { modo: 'light', v2: true })
      for (const ancho of ANCHOS) {
        await page.setViewportSize({ width: ancho, height: 900 })
        await page.goto(ruta)
        await expect(listo(page)).toBeVisible({ timeout: 30_000 })
        const medida = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
        expect(medida.scrollWidth, `${dominio} a ${ancho}px`).toBeLessThanOrEqual(medida.clientWidth + 1)
      }
    })
  }
})
