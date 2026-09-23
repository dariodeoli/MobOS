// #241 (F4 · dominios): pedidos, clientes, finanzas y servicio/garantías con el
// lenguaje v2 detrás del flag `preview v2`.
//
// Capturas claro/oscuro en 390/1280 con el flag prendido (y una muestra con el
// flag apagado, para dejar documentado que el default no cambia) y medición de
// contraste de cada pantalla: el shell se exige en AA, el contenido se informa.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'

const SHOTS = 'test-results/rediseno'
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

// Nombre, ruta, señal de que el contenido real ya está pintado y, si hace
// falta, la preparación de datos de la pantalla.
const PANTALLAS = [
  ['pedidos', '/pedidos', (page) => page.getByTestId('pedido-fila').first()],
  ['clientes', '/clientes', (page) => page.getByTestId('cliente-fila').first()],
  ['finanzas', '/finanzas/caja', (page) => page.getByText('Saldo esperado').first()],
  ['servicio', '/servicio', (page) => page.getByTestId('servicio-fila').first(), prepararTaller],
  ['garantias', '/garantias', (page) => page.getByTestId('garantia-fila').first(), prepararGarantias],
]

const preparar = (page, { modo, v2 = true }) =>
  page.addInitScript(({ modo, v2 }) => {
    try {
      localStorage.setItem('mobos:theme', modo)
      localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0')
    } catch { /* sin storage */ }
  }, { modo, v2 })

test.describe('dominios v2 · capturas y contraste', () => {
  for (const [dominio, ruta, listo, prepararDatos] of PANTALLAS) {
    test(`${dominio}: claro/oscuro en 390 y 1280 detrás del flag`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
        for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
          await page.setViewportSize({ width: ancho, height: alto })
          await preparar(page, { modo, v2: true })
          await page.goto(ruta)
          if (prepararDatos) await prepararDatos(page)
          await page.goto(ruta)
          await expect(page.locator('.tema-v2')).toHaveCount(1)
          await expect(listo(page)).toBeVisible({ timeout: 30_000 })
          const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
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
      await expect(page.locator('.tema-v2')).toHaveCount(0)
      await expect(listo(page)).toBeVisible({ timeout: 30_000 })
      await page.screenshot({ path: `${SHOTS}/c241f4b-${dominio}-off-claro-desktop.png` })
    })
  }
})
