// Etiquetas de unidades (#220): la etiqueta sale DIRECTO por el agente (sin
// diálogo) con modelo, identificador, IMEI/serial completo, QR y código de
// barras separados; se puede imprimir individual, en lote (seleccionadas) y
// reimprimir desde la recepción en tránsito (al llegar a otra sucursal).
//
// El agente local se simula (como en los e2e de impresión): /health dice
// presente y /print guarda el cuerpo que mandó la app.

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { SEED } from './helpers/seed-data.js'
import { habilitarRetrySiCuarentena } from './helpers/cuarentena.mjs'

// Cuarentena de flaky (#CI): el retry lo habilita el workflow solo si este spec
// está en MOBOS_E2E_CUARENTENA (ver `.github/workflows/ci.yml`).
habilitarRetrySiCuarentena('etiquetas-unidad')

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function apiPagina(page, ruta, opciones = {}) {
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

async function agenteFalso(page, capturados) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-mobos-print-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  await page.route('http://127.0.0.1:17890/**', (ruta) => {
    const peticion = ruta.request()
    if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cors })
    if (peticion.url().includes('/health')) {
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.6.3', equipo: 'e2e' }) })
    }
    if (peticion.method() === 'POST' && peticion.url().endsWith('/print')) {
      capturados.push(JSON.parse(peticion.postData() || '{}'))
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    }
    return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
  })
}

const textoDelTicket = (capturado) => Buffer.from(String(capturado?.data || ''), 'base64').toString('latin1')

// Crea un producto con una unidad física y devuelve el serial usado.
async function sembrarUnidad(page, { marca, serial, branchId = 'e2e-branch-1' }) {
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `E2E-ETQ-${marca}`, name: `Equipo etiqueta ${marca}`, model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio', pricePyg: 100000, stock: 0, branchId }),
  })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  const unidad = await apiPagina(page, '/api/inventory-units', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.datos.id, branchId, serial }),
  })
  expect(unidad.status, JSON.stringify(unidad.datos)).toBe(201)
  return producto.datos.id
}

// Sin diálogo: la impresión directa no crea el iframe del respaldo.
const sinDialogo = (page) => expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)

test('la etiqueta de una unidad sale directo por el agente con el contenido #220', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serial = `3567890${String(marca).slice(-8)}`
  // La página tiene que estar cargada para poder sembrar por API.
  await page.goto('/inventario/unidades')
  await sembrarUnidad(page, { marca, serial })

  await page.reload()
  await page.getByLabel('Buscar en inventario').fill(serial)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.click()

  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Etiqueta', exact: true }).click()
  await expect(page.getByText('Etiqueta enviada a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiqueta-stock')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('ETIQUETA DE UNIDAD')
  expect(texto).toContain('iPhone 15 Pro')
  expect(texto).toContain('IDENTIFICADOR')
  expect(texto).toContain(serial.slice(-4))
  expect(texto).toContain('IMEI / SERIAL')
  // El serial completo viaja en el papel (no enmascarado ni cortado).
  expect(texto).toContain(serial)
  // Las vocales acentuadas viajan en CP850: se comparan sin el acento.
  expect(texto).toContain('DIGO QR')
  expect(texto).toContain('DIGO DE UNIDAD')
  expect(texto).toContain(`MOBOS:${serial}`)
  await sinDialogo(page)
})

test('las etiquetas de las unidades seleccionadas salen en un solo trabajo directo', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serialA = `3520001${String(marca).slice(-8)}`
  const serialB = `3520002${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarUnidad(page, { marca, serial: serialA })
  await sembrarUnidad(page, { marca, serial: serialB })

  await page.reload()
  await page.getByLabel('Buscar en inventario').fill(String(marca))
  await expect(page.getByText(serialA)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('checkbox', { name: new RegExp(`Seleccionar Equipo etiqueta ${marca}.*${serialA}`) }).first().check()
  await page.getByRole('checkbox', { name: new RegExp(`Seleccionar Equipo etiqueta ${marca}.*${serialB}`) }).first().check()
  await page.getByRole('button', { name: 'Imprimir etiquetas' }).click()
  await expect(page.getByText('Etiqueta enviada a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiquetas-stock')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain(serialA)
  expect(texto).toContain(serialB)
  expect(texto).toContain(`MOBOS:${serialA}`)
  expect(texto).toContain(`MOBOS:${serialB}`)
  await sinDialogo(page)
})

// Unidad EN_TRANSIT en la sucursal activa: se siembra con SQL porque el
// traslado real exige origen en otra sucursal y la sesión e2e está acotada a la
// suya. Es el estado con el que llega un lote a destino (#218).
function sembrarUnidadEnTransito({ marca, serial }) {
  const pgPort = process.env.MOBOS_E2E_PGPORT || '5439'
  const pgDb = process.env.MOBOS_E2E_DB || 'mobos_e2e'
  execFileSync('/opt/homebrew/bin/psql', [
    '-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', pgDb,
    '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO "Product" ("id","tenantId","branchId","sku","name","pricePyg","stock","condition","updatedAt")
     SELECT 'e2e-etq-t-${marca}', t."id", '${SEED.branchId}', 'E2E-ETQ-T-${marca}', 'Equipo en tránsito ${marca}', 100000, 0, 'NEW', CURRENT_TIMESTAMP
     FROM "Tenant" t WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT ("id") DO NOTHING;
     INSERT INTO "InventoryUnit" ("id","tenantId","productId","branchId","serial","condition","status","updatedAt")
     SELECT 'e2e-etq-u-${marca}', t."id", 'e2e-etq-t-${marca}', '${SEED.branchId}', '${serial}', 'NEW', 'IN_TRANSIT', CURRENT_TIMESTAMP
     FROM "Tenant" t WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT DO NOTHING;`,
  ], { stdio: 'ignore' })
}

test('al llegar a otra sucursal se reimprime la etiqueta desde la recepción', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serial = `3540001${String(marca).slice(-8)}`
  // El equipo llegó de otra sucursal y está en tránsito en la activa: desde la
  // recepción se reimprime la etiqueta sin depender del origen.
  sembrarUnidadEnTransito({ marca, serial })

  await page.goto('/inventario/unidades?tab=transito')
  await page.getByLabel('Buscar en inventario').fill(serial)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.click()

  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await expect(llegada).toBeVisible()
  await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).click()
  await expect(page.getByText('Etiqueta enviada a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiqueta-stock')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('ETIQUETA DE UNIDAD')
  expect(texto).toContain(serial)
  await sinDialogo(page)
})
