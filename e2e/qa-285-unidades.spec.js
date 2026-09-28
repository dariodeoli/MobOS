// #285 · Tabla de Unidades: estructura final en una línea
// (Producto · IMEI · Verificación · Ubicación · Estado · Costo · Acciones).
//
// Mide desbordes (scrollWidth/clienteWidth del contenedor), alto de fila y
// ancho de cada columna en 1280/1440, claro y oscuro, y deja las capturas en
// `docs/qa/285-unidades/`. Con `QA_285_ANTES=1` genera el «antes»: solo mide y
// captura (el código viejo no cumple la estructura nueva).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = join('docs', 'qa', '285-unidades')
const ANTES = Boolean(process.env.QA_285_ANTES)
const PREFIJO = ANTES ? 'antes' : 'despues'
const COLUMNAS = ['', 'Producto', 'IMEI', 'Verificación', 'Ubicación', 'Estado', 'Costo', 'Acciones']

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  return { status: respuesta.status, body: await respuesta.json().catch(() => null) }
}, { api: API, ruta, opciones })

const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch { /* sin storage */ } }, modo)

// Medición cruda: contenedor, alto de fila y ancho de cada columna del encabezado.
const medir = (page) => page.evaluate(() => {
  // El testid del contenedor llega con #285; sin él se mide la caja real de la fila.
  const contenedor = document.querySelector('[data-testid="inventario-tabla"]')
    || document.querySelector('[data-testid="inventario-fila"]')?.closest('.overflow-x-auto')
    || document.querySelector('[data-testid="inventario-fila"]')?.parentElement?.parentElement
  const encabezado = document.querySelector('[data-testid="inventario-encabezado"]')
  const filas = [...document.querySelectorAll('[data-testid="inventario-fila"]')]
  return {
    scrollWidth: contenedor?.scrollWidth ?? null,
    clientWidth: contenedor?.clientWidth ?? null,
    scrollPagina: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    columnas: [...(encabezado?.children || [])].map((celda) => ({ titulo: (celda.textContent || '').trim(), ancho: Math.round(celda.getBoundingClientRect().width) })),
    filaAlto: filas[0] ? Math.round(filas[0].getBoundingClientRect().height) : null,
    filas: filas.length,
  }
})

// Siembra mínima y estable: una unidad verificada con depósito «D1» y una
// reservada, para que la captura muestre verificación, ubicación y estado.
async function sembrar(page) {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`.toUpperCase()
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `ZZ285 ${marca}`, sku: `ZZ285-${marca}`, category: 'Celulares', pricePyg: 2500000, costPyg: 1800000, stock: 0, branchId: SEED.branchId, capacity: '256 GB', color: 'Negro' }),
  })
  if (producto.status !== 201) console.log('DBG producto', producto.status, JSON.stringify(producto.body).slice(0, 300))
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const ubicaciones = await apiPagina(page, `/api/stock-locations?branchId=${encodeURIComponent(SEED.branchId)}`)
  const deposito = (ubicaciones.body || []).find((fila) => fila.code === 'D1') || (await apiPagina(page, '/api/stock-locations', { method: 'POST', body: JSON.stringify({ branchId: SEED.branchId, name: 'Depósito 1', code: 'D1' }) })).body
  const seriales = [`ZZ285A${marca}`.slice(0, 20), `ZZ285B${marca}`.slice(0, 20)]
  const creadas = []
  for (const serial of seriales) {
    const unidad = await apiPagina(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.body.id, serial, branchId: SEED.branchId, locationId: deposito?.id || null, condition: 'NEW', costPyg: 1800000 }) })
    expect(unidad.status, JSON.stringify(unidad.body)).toBe(201)
    creadas.push(unidad.body)
  }
  await apiPagina(page, '/api/inventory-units/verify', { method: 'POST', body: JSON.stringify({ serial: seriales[0] }) })
  return { marca, productoId: producto.body.id, seriales, unidadReservada: creadas[1]?.id }
}

async function limpiar(page, datos) {
  try {
    await apiPagina(page, '/api/inventory-reservations', { method: 'PATCH', body: JSON.stringify({ action: 'release', serials: datos.seriales }) })
    const lista = await apiPagina(page, `/api/inventory-units?q=${encodeURIComponent(datos.seriales[0])}`)
    const filas = Array.isArray(lista.body) ? lista.body : lista.body?.items || lista.body?.rows || []
    for (const unidad of filas) {
      await apiPagina(page, '/api/inventory-units', { method: 'PATCH', body: JSON.stringify({ id: unidad.id, action: 'remove', reason: 'Limpieza QA #285' }) })
    }
    if (datos.productoId) await apiPagina(page, `/api/products?id=${encodeURIComponent(datos.productoId)}`, { method: 'DELETE' })
  } catch { /* la limpieza no falla el test */ }
}

test('#285 · estructura final en una línea: columnas, alto y sin scroll (1280/1440, claro/oscuro)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/inventario/unidades')
  const datos = await sembrar(page)
  const mediciones = {}
  try {
    for (const ancho of [1280, 1440]) {
      for (const modo of ['light', 'dark']) {
        await tema(page, modo)
        await page.setViewportSize({ width: ancho, height: 900 })
        await page.goto('/inventario/unidades')
        await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
        const medida = await medir(page)
        mediciones[`${ancho}-${modo}`] = medida
        if (!ANTES) {
          expect(medida.columnas.map((columna) => columna.titulo), 'columnas del encabezado').toEqual(COLUMNAS)
          expect(medida.scrollWidth, `${ancho}/${modo}: el contenedor no desborda`).toBeLessThanOrEqual(medida.clientWidth + 1)
          expect(medida.scrollPagina.scrollWidth, `${ancho}/${modo}: la página no desborda`).toBeLessThanOrEqual(medida.scrollPagina.clientWidth + 1)
          expect(medida.filaAlto, `${ancho}/${modo}: la fila queda en una línea`).toBeLessThanOrEqual(48)
          // Proveedor sale de la fila: el dato vive en el detalle.
          await expect(page.getByTestId('inventario-encabezado').getByText('Proveedor')).toHaveCount(0)
          await expect(page.getByTestId('inventario-fila').first()).toContainText('ZZ285')
        }
        await page.screenshot({ path: join(DIR, `${PREFIJO}-unidades-${ancho}-${modo}.png`) })
      }
    }
    writeFileSync(join(DIR, `${PREFIJO}-mediciones.json`), `${JSON.stringify(mediciones, null, 2)}\n`)
  } finally {
    await limpiar(page, datos)
  }
})

test('#285 · mobile 390: la tabla scrollea dentro de su caja', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/inventario/unidades')
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
  const medida = await medir(page)
  // La página no desborda; el scroll horizontal queda dentro de la caja de la tabla.
  expect(medida.scrollPagina.scrollWidth, 'la página no desborda en 390').toBeLessThanOrEqual(medida.scrollPagina.clientWidth + 1)
  expect(medida.scrollWidth, 'la tabla scrollea dentro de su caja').toBeGreaterThan(medida.clientWidth)
  await page.screenshot({ path: join(DIR, `${PREFIJO}-unidades-390-mobile.png`) })
})
