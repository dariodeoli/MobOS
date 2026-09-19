// Impresión remota (configuración): el backend es la autoridad de impresoras
// y puentes; localStorage es solo caché de lectura. La parte de cola remota
// con puente falso vive en la suite del slice 5.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const NOMBRE = 'Térmica E2E remota'
const DESTINO = 'lan:10.99.99.10:9100'
const NOMBRE_VIEJO = 'Impresora vieja de caché'

async function apiImpresion(page, ruta, opciones = {}) {
  return page.evaluate(
    async ({ api, ruta, opciones }) => {
      const respuesta = await fetch(`${api}${ruta}`, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...opciones,
      })
      const datos = await respuesta.json().catch(() => null)
      return { status: respuesta.status, datos }
    },
    { api: API, ruta, opciones },
  )
}

// Idempotente entre corridas: reutiliza la impresora si ya existe.
async function asegurarImpresora(page) {
  const lista = await apiImpresion(page, '/api/print/printers')
  const existente = (lista.datos?.printers || []).find((impresora) => impresora.destination === DESTINO)
  if (existente) return existente
  const creada = await apiImpresion(page, '/api/print/printers', {
    method: 'POST',
    body: JSON.stringify({
      name: NOMBRE,
      brand: 'E2E',
      model: 'Remota',
      location: SEED.branchName,
      connection: 'lan',
      destination: DESTINO,
      width: 80,
      copies: 1,
      cut: true,
      density: 3,
      characters: true,
      isDefault: true,
      isActive: true,
    }),
  })
  if (creada.status !== 201) throw new Error(`no se pudo crear la impresora E2E: HTTP ${creada.status}`)
  return creada.datos
}

function leerCache(page) {
  return page.evaluate(() => {
    const clave = Object.keys(localStorage).find((k) => k.startsWith('mobos:impresoras:v1:'))
    return clave ? { clave, store: JSON.parse(localStorage.getItem(clave)) } : null
  })
}

test.describe('impresión remota: configuración', () => {
  test('dos dispositivos ven la misma configuración del backend', async ({ page, browser }) => {
    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })
    // La caché quedó con la impresora del backend (no con datos propios).
    const cache = await leerCache(page)
    expect(cache?.store?.version).toBe(2)
    expect((cache?.store?.impresoras || []).some((impresora) => impresora.destino === DESTINO)).toBe(true)

    // Segundo dispositivo: contexto nuevo, sin localStorage previo.
    const contexto = await browser.newContext({ storageState: 'e2e/.auth/admin.json' })
    const otra = await contexto.newPage()
    await otra.goto('/configuracion/impresoras')
    await expect(otra.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })
    await contexto.close()
  })

  test('el backend pisa la caché vieja de localStorage', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })

    await page.evaluate((nombreViejo) => {
      const clave = Object.keys(localStorage).find((k) => k.startsWith('mobos:impresoras:v1:'))
      const store = JSON.parse(localStorage.getItem(clave))
      store.impresoras = [{ id: 'imp-vieja', nombre: nombreViejo, destino: 'lan:10.0.0.9:9100', ancho: 80, copias: 1, activa: true, predeterminada: true }]
      store.syncedAt = '2020-01-01T00:00:00.000Z'
      localStorage.setItem(clave, JSON.stringify(store))
    }, NOMBRE_VIEJO)

    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(NOMBRE_VIEJO)).toHaveCount(0)
    const cache = await leerCache(page)
    expect((cache?.store?.impresoras || []).some((impresora) => impresora.nombre === NOMBRE_VIEJO)).toBe(false)
    expect((cache?.store?.impresoras || []).some((impresora) => impresora.destino === DESTINO)).toBe(true)
  })

  test('sin backend se muestra la última caché sin escribirla', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })

    // Marca testigo: si la UI escribiera la caché, desaparecería.
    const antes = await page.evaluate(() => {
      const clave = Object.keys(localStorage).find((k) => k.startsWith('mobos:impresoras:v1:'))
      const store = JSON.parse(localStorage.getItem(clave))
      store.marcaDePrueba = 'no-tocar'
      localStorage.setItem(clave, JSON.stringify(store))
      return { syncedAt: store.syncedAt }
    })

    await page.route('**/api/print/**', (ruta) => ruta.abort())
    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })

    const despues = await leerCache(page)
    expect(despues?.store?.marcaDePrueba).toBe('no-tocar')
    expect(despues?.store?.syncedAt).toBe(antes.syncedAt)
    expect((despues?.store?.impresoras || []).some((impresora) => impresora.destino === DESTINO)).toBe(true)
  })
})
