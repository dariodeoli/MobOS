// #241 (F4 · dominios): pedidos, clientes, finanzas y servicio/garantías con el
// lenguaje v2 detrás del flag `preview v2`.
//
// Capturas claro/oscuro en 390/1280 con el flag prendido (y una muestra con el
// flag apagado, para dejar documentado que el default no cambia) y medición de
// contraste de cada pantalla: el shell se exige en AA, el contenido se informa.
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'
// Token del pedido semilla (lo escribe el global-setup): la página pública se
// audita con el mismo pedido que usa el tracking.
// El archivo lo crea el global-setup del harness: tolerar su ausencia deja que
// `playwright --list` (y el guardián de shards en CI) funcione sin setup.
let PEDIDO_SEMILLA = { publicToken: '', orderNumber: '' }
try {
  PEDIDO_SEMILLA = JSON.parse(readFileSync(new URL('./.auth/seed-order.json', import.meta.url), 'utf8'))
} catch { /* sin setup: el listado no lo necesita */ }


const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const MARCA = 'F4V2'

// Datos mínimos para que las capturas del taller y de garantías muestren carga
// real. Idempotente (misma marca) y sin limpieza: la base e2e se restaura por
// snapshot en cada corrida del harness.
async function prepararTaller(page) {
  await page.goto('/servicio')
  await page.evaluate(async ({ api, marca }) => {
    const ordenes = await fetch(`${api}/api/service-orders`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
    if (Array.isArray(ordenes) && ordenes.some((orden) => String(orden.device || '').includes(marca))) return
    const cliente = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Cliente Taller ${marca}`, phone: '0981555000', countryCode: '+595' }),
    }).then((r) => r.json()).catch(() => null)
    const crear = (device, serviceName, pricePyg, costPyg) => fetch(`${api}/api/service-orders`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: cliente?.id, customerName: cliente?.name,
        device: `${device} ${marca}`, serial: `${marca}-${device.split(' ')[0]}`,
        serviceName, reportedIssue: 'Revisión general', pricePyg, costPyg,
      }),
    }).then((r) => r.json())
    const diagnostico = await crear('iPhone 14', 'Diagnóstico de pantalla', 480000, 210000)
    const reparado = await crear('MacBook Air', 'Reparación de placa', 1250000, 700000)
    await crear('iPhone 13', 'Cambio de batería', 250000, 120000)
    const avanzar = (orden, status, extra = {}) => fetch(`${api}/api/service-orders`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orden?.id, status, ...extra }),
    })
    await avanzar(diagnostico, 'DIAGNOSTICO', { diagnosis: 'Batería agotada' })
    await avanzar(reparado, 'REPARADO', { technicianName: 'Técnico E2E' })
  }, { api: API, marca: MARCA })
}

async function prepararGarantias(page) {
  await page.goto('/garantias')
  await page.evaluate(async ({ api, marca }) => {
    const casos = await fetch(`${api}/api/warranties`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
    if (Array.isArray(casos) && casos.some((caso) => String(caso.serial || '').includes(marca))) return
    const cliente = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Cliente Garantía ${marca}`, phone: '0981555001', countryCode: '+595' }),
    }).then((r) => r.json()).catch(() => null)
    const crear = (description, serial) => fetch(`${api}/api/warranties`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: cliente?.id, customerName: cliente?.name, serial, description }),
    }).then((r) => r.json())
    await crear('iPhone 12 con batería inflada', `GT-${marca}-1`)
    await crear('AirPods con falla de carga', `GT-${marca}-2`)
  }, { api: API, marca: MARCA })
}

// Compras: una recibida completa y una parcial (para ver el avance de
// recepción). Idempotente por el nombre del proveedor.
async function prepararCompras(page) {
  await page.goto('/compras')
  await page.evaluate(async ({ api, marca, branchId }) => {
    const compras = await fetch(`${api}/api/purchases`, { credentials: 'include' }).then((r) => r.json()).catch(() => [])
    if (Array.isArray(compras) && compras.some((compra) => String(compra.supplierName || '').includes(marca))) return
    const producto = await fetch(`${api}/api/products`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: `ZZ-${marca}`, name: `Repuesto ${marca}`, category: 'Accesorios', pricePyg: 180000, costPyg: 120000, stock: 0, branchId }),
    }).then((r) => r.json()).catch(() => null)
    const crear = (supplierName, quantity) => fetch(`${api}/api/purchases`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierName, branchId, lines: [{ productId: producto?.id, quantity, unitCostPyg: 120000 }] }),
    }).then((r) => r.json())
    const recibir = (compra, lines) => fetch(`${api}/api/purchases`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: compra?.id, action: 'receive', ...(lines ? { lines } : {}) }),
    })
    const completa = await crear(`Proveedor ${marca} Uno`, 3)
    const parcial = await crear(`Proveedor ${marca} Dos`, 4)
    await recibir(completa)
    const linea = parcial?.lines?.[0]
    if (linea) await recibir(parcial, [{ id: linea.id, quantity: 1 }])
  }, { api: API, marca: MARCA, branchId: SEED.branchId })
}

// Nombre, ruta, señal de que el contenido real ya está pintado y, si hace
// falta, la preparación de datos de la pantalla.
const PANTALLAS = [
  ['pedidos', '/pedidos', (page) => page.getByTestId('pedido-fila').first()],
  ['pedido-detalle', '/pedidos', (page) => page.getByTestId('pedido-fila').first(), undefined, async (page) => {
    // Contenedor del pedido: el stepper del flujo de entrega vive acá.
    await page.getByTestId('pedido-fila').first().click()
    await page.waitForURL(/\/pedidos\/[^/]+$/, { timeout: 20_000 })
    await expect(page.getByRole('button', { name: /Imprimir comprobante/ })).toBeVisible({ timeout: 20_000 })
  }],
  ['clientes', '/clientes', (page) => page.getByTestId('cliente-fila').first()],
  ['clientes-resumen', '/clientes', (page) => page.getByTestId('cliente-fila').first(), undefined, async (page) => {
    // Resumen rápido del cliente (el ojito): popup de la fila.
    await page.getByRole('button', { name: /Resumen rápido de/ }).first().click({ timeout: 10_000 })
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 15_000 })
  }],
  ['finanzas', '/finanzas/caja', (page) => page.getByText('Saldo esperado').first()],
  ['finanzas-conciliacion', '/finanzas/conciliacion', (page) => page.getByText('Ingresos conciliables').first()],
  ['servicio', '/servicio', (page) => page.getByTestId('servicio-fila').first(), prepararTaller],
  ['garantias', '/garantias', (page) => page.getByTestId('garantia-fila').first(), prepararGarantias],
  ['resumen', '/resumen', (page) => page.getByText('Facturado').first()],
  ['analisis-reportes', '/analisis/reportes', (page) => page.locator('[data-testid="reportes-abc-tabla"]').or(page.getByText('Cómo se calcula el resultado')).first()],
  ['analisis-ganancias', '/analisis/ganancias', (page) => page.getByTestId('ganancia-resultado')],
  ['compras', '/compras', (page) => page.getByTestId('compra-fila').first(), prepararCompras, async (page) => {
    // La compra parcial expandida es la que muestra el "x de y" de recepción.
    const parcial = page.getByTestId('compra-fila').filter({ hasText: 'Parcial' }).first()
    if (await parcial.count()) await parcial.click()
  }],
  ['equipo', '/configuracion/equipo', (page) => page.getByTestId('integrante-fila').first()],
  ['roles', '/configuracion/roles', (page) => page.getByText('Matriz de capacidades')],
  // Públicas (lote G): la página del pedido y la vista previa de la landing.
  ['pedido-publico', `/pedido/${PEDIDO_SEMILLA.publicToken}`, (page) => page.getByText(PEDIDO_SEMILLA.orderNumber).first()],
  ['landing', '/landing-preview', (page) => page.locator('h1:visible').first()],
  // Paso 3: el tablero operativo (pantalla completa, sin shell).
  ['ops', '/ops', (page) => page.getByTestId('ops-tablero')],
  ['inventario-tiles', '/inventario/unidades', (page) => page.getByTestId('inventario-tarjeta').first(), async (page) => {
    // Tiles de equipo (lote C): la vista lista/cuadrícula se recuerda por pantalla.
    await page.evaluate(() => { try { localStorage.setItem('mobos:inventario-vista', 'grid') } catch { /* sin storage */ } })
  }],
]

// Raíces v2 de las pantallas: el panel usa `.tema-v2`; las vistas propias del
// rediseño (tablero operativo) traen `.v2-piloto` y no dependen del opt-out.
const RAICES_V2 = ['.tema-v2', '.v2-piloto']

const preparar = (page, { modo, v2 = true }) =>
  page.addInitScript(({ modo, v2 }) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin storage */ }
  }, { modo, v2 })

test.describe('dominios v2 · capturas y contraste', () => {
  for (const [dominio, ruta, listo, prepararDatos, antesDeCapturar] of PANTALLAS) {
    test(`${dominio}: claro/oscuro en 390 y 1280 detrás del flag`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
        for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
          await page.setViewportSize({ width: ancho, height: alto })
          await preparar(page, { modo, v2: true })
          await page.goto(ruta)
          if (prepararDatos) await prepararDatos(page)
          await page.goto(ruta)
          await expect(page.locator(RAICES_V2.join(', ')).first()).toBeVisible({ timeout: 30_000 })
          await expect(listo(page)).toBeVisible({ timeout: 30_000 })
          if (antesDeCapturar) await antesDeCapturar(page)
          const medicion = await auditarContraste(page, SHELL, RAICES_V2)
          informar(`${dominio}-on-${vista}-${tema}`, medicion)
          await page.screenshot({ path: `${SHOTS}/c241f4b-${dominio}-on-${tema}-${vista}.png` })
          expect(medicion.bajos, `AA del shell en ${dominio} (${vista} ${tema})`).toEqual([])
        }
      }
    })

    test(`${dominio}: con el flag apagado el default no cambia`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await page.setViewportSize({ width: 1280, height: 900 })
      await preparar(page, { modo: 'light', v2: false })
      await page.goto(ruta)
      // La preparación de datos también deja la pantalla en su estado capturable
      // (p. ej. la vista cuadrícula del inventario) y sin el flag no cambia nada.
      if (prepararDatos) await prepararDatos(page, 1280)
      await page.goto(ruta)
      await expect(page.locator('.tema-v2')).toHaveCount(0)
      await expect(listo(page)).toBeVisible({ timeout: 30_000 })
      if (antesDeCapturar) await antesDeCapturar(page)
      await page.screenshot({ path: `${SHOTS}/c241f4b-${dominio}-off-claro-desktop.png` })
    })
  }
})
