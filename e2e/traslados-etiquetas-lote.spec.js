// Reimpresión de etiquetas del lote (#218): desde Traslados se reimprimen las
// etiquetas de todas las unidades del lote y, desde la recepción, la de una
// unidad puntual. El lote se siembra como recién llegado a la sucursal activa
// (unidades EN_TRANSIT en el destino) con el traslado apuntando desde otra
// sucursal: se reimprime desde el destino, sin depender del origen.

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const SALIDA = 'docs/qa/218-etiquetas-lote'
mkdirSync(SALIDA, { recursive: true })

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

// Deja el lote "en destino": unidades EN_TRANSIT en la sucursal activa y el
// traslado apuntando desde la sucursal 2, con los seriales en la línea.
function marcarLoteEnDestino({ marca, seriales, productoId }) {
  const pgPort = process.env.MOBOS_E2E_PGPORT || '5439'
  const pgDb = process.env.MOBOS_E2E_DB || 'mobos_e2e'
  const jsonSeriales = JSON.stringify(seriales).replace(/'/g, "''")
  const listaSeriales = seriales.map((serial) => `'${serial}'`).join(', ')
  execFileSync('/opt/homebrew/bin/psql', [
    '-h', '127.0.0.1', '-p', pgPort, '-U', 'postgres', '-d', pgDb,
    '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO "Branch" ("id","tenantId","name","updatedAt")
     SELECT '${SEED.branch2Id}', t."id", '${SEED.branch2Name}', CURRENT_TIMESTAMP
     FROM "Tenant" t WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name";
     INSERT INTO "StockTransfer" ("id","tenantId","sourceBranchId","destinationBranchId","createdById","createdAt")
     SELECT 'e2e-lote-${marca}', t."id", '${SEED.branch2Id}', '${SEED.branchId}', (SELECT u."id" FROM "User" u WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN' LIMIT 1), CURRENT_TIMESTAMP
     FROM "Tenant" t WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT ("id") DO NOTHING;
     INSERT INTO "StockTransferLine" ("id","transferId","sourceProductId","destinationProductId","quantity","serials")
     SELECT 'e2e-lote-line-${marca}', 'e2e-lote-${marca}', '${productoId}', '${productoId}', ${seriales.length}, '${jsonSeriales}'::jsonb
     WHERE EXISTS (SELECT 1 FROM "StockTransfer" WHERE "id" = 'e2e-lote-${marca}')
     ON CONFLICT ("id") DO NOTHING;
     UPDATE "InventoryUnit" SET "status" = 'IN_TRANSIT' WHERE "serial" IN (${listaSeriales});`,
  ], { stdio: 'ignore' })
}

// Producto + unidades en la sucursal activa y el lote marcado en destino.
async function sembrarLote(page, { marca, seriales }) {
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `E2E-LOTE-${marca}`, name: `Equipo lote ${marca}`, model: 'iPhone 15 Pro', capacity: '256GB', pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: 'e2e-branch-1' }),
  })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  for (const serial of seriales) {
    const unidad = await apiPagina(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.datos.id, branchId: 'e2e-branch-1', serial }) })
    expect(unidad.status, JSON.stringify(unidad.datos)).toBe(201)
  }
  marcarLoteEnDestino({ marca, seriales, productoId: producto.datos.id })
  return producto.datos
}

async function filaDelLote(page, marca) {
  await page.goto('/inventario/traslados')
  const fila = page.getByTestId('traslado-fila').filter({ hasText: `Equipo lote ${marca}` }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  return fila
}

test('desde el destino se reimprimen las etiquetas del lote completo (sin depender del origen)', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const seriales = [`352100${String(marca).slice(-8)}`, `352200${String(marca).slice(-8)}`]
  await page.goto('/inventario/unidades')
  await sembrarLote(page, { marca, seriales })

  const fila = await filaDelLote(page, marca)
  const boton = fila.getByRole('button', { name: 'Etiquetas', exact: true })
  await expect(boton).toHaveAttribute('title', /Reimprimir las etiquetas de todas las unidades del lote/i)
  await page.screenshot({ path: `${SALIDA}/01-traslado-en-destino.jpg` })
  await boton.click()
  await expect(page.getByText(/enviada a la impresora/)).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiquetas-stock')
  const texto = textoDelTicket(capturados[0])
  for (const serial of seriales) {
    expect(texto).toContain(serial)
    expect(texto).toContain(`MOBOS:${serial}`)
  }
  expect(texto).toContain('ETIQUETA DE UNIDAD')
  await page.screenshot({ path: `${SALIDA}/02-lote-impreso.jpg` })
})

test('desde la recepción del destino se reimprime la etiqueta de una unidad', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serial = `352300${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarLote(page, { marca, seriales: [serial] })

  await page.goto('/inventario/transito')
  await page.getByLabel('Buscar en inventario').fill(serial)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('button', { name: 'Recibir en sucursal' }).click()
  const llegada = page.getByRole('dialog', { name: 'Recibir equipo en tránsito' })
  await expect(llegada).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/03-recepcion-destino.jpg` })
  await llegada.getByRole('button', { name: 'Reimprimir etiqueta' }).click()
  await expect(page.getByText(/enviada a la impresora/)).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiqueta-stock')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain(serial)
  expect(texto).toContain(`MOBOS:${serial}`)
})

test('la recepción del lote lo deja disponible en stock del destino', async ({ page }) => {
  const marca = Date.now()
  const seriales = [`352600${String(marca).slice(-8)}`, `352700${String(marca).slice(-8)}`]
  await page.goto('/inventario/unidades')
  await sembrarLote(page, { marca, seriales })

  const fila = await filaDelLote(page, marca)
  await fila.getByRole('button', { name: 'Recibir lote', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Recibir lote en tránsito' })
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(`${seriales.length} equipo(s)`)
  const deposito = modal.getByLabel('Depósito destino')
  let opciones = await deposito.locator('option').evaluateAll((nodos) => nodos.map((nodo) => nodo.value).filter(Boolean))
  if (!opciones.length) {
    // El arnés puede no tener depósitos: se crea uno para la sucursal activa.
    const creado = await apiPagina(page, '/api/stock-locations', { method: 'POST', body: JSON.stringify({ name: `Depósito lote ${marca}`, code: `L${String(marca).slice(-4)}`, branchId: 'e2e-branch-1' }) })
    expect(creado.status, JSON.stringify(creado.datos)).toBe(201)
    await page.reload()
    await filaDelLote(page, marca)
    await page.getByTestId('traslado-fila').filter({ hasText: `Equipo lote ${marca}` }).first().getByRole('button', { name: 'Recibir lote', exact: true }).click()
    await expect(modal).toBeVisible()
    opciones = await deposito.locator('option').evaluateAll((nodos) => nodos.map((nodo) => nodo.value).filter(Boolean))
  }
  await deposito.selectOption(opciones[0])
  await page.screenshot({ path: `${SALIDA}/06-recepcion-lote.jpg` })
  await modal.getByRole('button', { name: 'Recibir todo el lote' }).click()
  await expect(page.getByText(/Lote recibido: \d+ equipo\(s\) disponibles en stock/)).toBeVisible({ timeout: 20_000 })

  // Las unidades dejaron el tránsito y quedan disponibles en el destino.
  await page.goto('/inventario/unidades')
  await page.getByLabel('Buscar en inventario').fill(seriales[0])
  const unidad = page.getByTestId('inventario-fila').filter({ hasText: seriales[0] }).first()
  await expect(unidad).toBeVisible({ timeout: 20_000 })
  await expect(unidad).toContainText('Disponible')
  await page.screenshot({ path: `${SALIDA}/07-lote-recibido.jpg` })
})

test('sin impresora, el lote deja el PDF de 80 mm con las dos etiquetas', async ({ page }) => {
  await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
  await page.route('**/api/print/printers', (ruta) => ruta.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ printers: [], bridges: [], remoteEnabled: true }),
  }))
  const marca = Date.now()
  const seriales = [`352400${String(marca).slice(-8)}`, `352500${String(marca).slice(-8)}`]
  await page.goto('/inventario/unidades')
  await sembrarLote(page, { marca, seriales })

  const fila = await filaDelLote(page, marca)
  await fila.getByRole('button', { name: 'Etiquetas', exact: true }).click()

  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 10_000 })
  const contenido = await marco.contentFrame().locator('body').innerText()
  for (const serial of seriales) expect(contenido).toContain(serial)
  await page.screenshot({ path: `${SALIDA}/04-respaldo-lote.jpg` })

  // PDF de 80 mm con el mismo HTML que la app manda a «Guardar como PDF».
  const html = await marco.contentFrame().locator('html').evaluate((el) => el.outerHTML)
  const hoja = await page.context().newPage()
  await hoja.setViewportSize({ width: 302, height: 900 })
  await hoja.emulateMedia({ media: 'print' })
  await hoja.setContent(html, { waitUntil: 'load' })
  await hoja.waitForTimeout(250)
  const altoPx = await hoja.locator('body').evaluate((body) => body.getBoundingClientRect().height)
  await hoja.pdf({
    path: `${SALIDA}/etiquetas-lote-80.pdf`,
    width: '80mm',
    height: `${Math.ceil((altoPx / 3.7795275591) + 12)}mm`,
    printBackground: true,
    margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' },
  })
  await hoja.screenshot({ path: `${SALIDA}/05-etiquetas-lote-80.jpg`, type: 'jpeg', quality: 75, fullPage: true })
  await hoja.close()
})
