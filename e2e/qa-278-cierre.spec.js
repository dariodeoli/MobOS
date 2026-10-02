// #278 · cierre de los hallazgos de las auditorías (#250/#148/#256) del slot
// INVENTARIO:
//   1. la lista de compra 80 mm (§11 de #250) impresa desde Compras del Centro;
//   2. el historial del serial en la cadena de abastecimiento en la ficha de la
//      unidad (`GET /api/supply/serials/:serial`);
//   3. los compactos de #256 que faltaban: Precios · Celulares · Comparador
//      (INV) y Autorizaciones (FIN).
//
// Capturas: `docs/qa/278-cierre/` (se versionan con el cierre).
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_278_CAPTURAS || join('docs', 'qa', '278-cierre')

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const respuesta = await fetch(`${api}${ruta}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opciones })
  const body = await respuesta.json().catch(() => null)
  return { status: respuesta.status, body }
}, { api: API, ruta, opciones })

/** Completa el dígito verificador Luhn de una base de 14 dígitos. */
function imeiValido(base14) {
  let suma = 0
  for (let indice = 0; indice < 14; indice += 1) {
    let digito = Number(base14[13 - indice])
    if (indice % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  return base14 + String((10 - (suma % 10)) % 10)
}

const sufijo = () => `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`

// Agente de impresión simulado (mismo patrón que etiquetas-unidad.spec.js).
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

const sinDesborde = async (page) => {
  const medida = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ventana: window.innerWidth }))
  expect(medida.scroll, JSON.stringify(medida)).toBeLessThanOrEqual(medida.ventana + 1)
}

// 1) Lista de compra 80 mm: el impreso de §11 se adopta desde el panel. La
// compra cubre una necesidad (prioridad/origen/promesa) y suma reposición libre.
test('#278 · lista de compra 80 mm impresa desde Compras del Centro', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/compras-centro')
  await expect(page.getByTestId('compras-centro')).toBeVisible()

  const marca = sufijo()
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E 278 ${marca}`, sku: `E2E-278-${marca}`, category: 'Celulares', pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: SEED.branchId, capacity: '256 GB', color: 'Negro' }),
  })
  expect([200, 201], JSON.stringify(producto.body)).toContain(producto.status)
  const necesidad = await apiPagina(page, '/api/supply/needs', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.body.id, quantity: 1, branchId: SEED.branchId, priority: 'ALTA', promisedAt: '2026-10-01T12:00:00.000Z', origin: 'CDE', notes: 'Para la lista impresa (e2e)' }),
  })
  expect([200, 201], JSON.stringify(necesidad.body)).toContain(necesidad.status)
  const compra = await apiPagina(page, '/api/supply/purchases', {
    method: 'POST',
    body: JSON.stringify({
      supplierName: `Proveedor 278 ${marca}`,
      currency: 'PYG',
      branchId: SEED.branchId,
      reference: `FAC-278-${marca}`,
      lines: [{ needId: necesidad.body.id, productId: producto.body.id, quantity: 1 }, { productId: producto.body.id, quantity: 2 }],
    }),
  })
  expect([200, 201], JSON.stringify(compra.body)).toContain(compra.status)

  // El catálogo del buscador sale del espejo local: se recarga para incluirlo.
  await page.reload()
  await expect(page.getByTestId('compras-centro')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const fila = page.getByTestId('compra-centro-fila').filter({ hasText: compra.body.code })
  await expect(fila).toBeVisible({ timeout: 20_000 })

  // El botón adopta el impreso: abre la vista previa del papel real.
  await fila.getByTestId('compra-lista-imprimir').click()
  const modal = page.getByRole('dialog', { name: new RegExp(`Lista de compra · ${compra.body.code}`) })
  await expect(modal).toBeVisible()
  const marco = page.frameLocator('iframe[title="Vista previa de la lista de compra"]')
  await expect(marco.getByText('Lista de compra').first()).toBeVisible({ timeout: 20_000 })
  await expect(marco.getByText(compra.body.code).first()).toBeVisible()
  await expect(marco.getByText('Prioridad Alta · Carga manual · Reposición libre').first()).toBeVisible()
  await expect(marco.getByText(`CDE → ${SEED.branchName}`).first()).toBeVisible()
  await expect(marco.getByText(`Proveedor 278 ${marca}`).first()).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'lista-compra-modal-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'lista-compra-modal-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })

  // Impresión directa (agente simulado): el papel sale por el tipo `lista-compra`.
  await modal.getByTestId('lista-compra-imprimir').click()
  await expect(page.getByText('Lista enviada')).toBeVisible({ timeout: 15_000 })
  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('lista-compra')
  const papel = textoDelTicket(capturados[0])
  expect(papel).toContain('LISTA DE COMPRA')
  expect(papel).toContain(compra.body.code)
  expect(papel).toContain(`Proveedor 278 ${marca}`)
  expect(papel).toContain(producto.body.name)
  // El rollo viaja en CP850 (acentos y el separador «·» cambian) y las líneas
  // envuelven solas: se compara por patrón, no por literales acentuados.
  expect(papel).toContain('Prioridad Alta')
  expect(papel).toContain('Carga manual')
  expect(papel).toMatch(/Reposici.n\s+libre/)
  expect(papel).toContain('3 u') // la línea agrupa la necesidad + la reposición libre
  expect(papel).toContain('Unidades')
  expect(papel).toMatch(/L.neas urgentes\/altas/)
  expect(await page.locator('iframe[aria-hidden="true"]').count()).toBe(0)

  // PDF real descargable desde el mismo modal (mismo HTML de la vista previa).
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByTestId('descargar-pdf').click(),
  ])
  expect(pdf.suggestedFilename()).toMatch(/^lista-compra-.*\.pdf$/)
  const archivo = readFileSync(await pdf.path())
  expect(archivo.length).toBeGreaterThan(5_000)
  expect(archivo.subarray(0, 5).toString('latin1')).toBe('%PDF-')
})

// 2) Ficha de la unidad: la cadena completa (necesidad → compra → lote → stock)
// que devuelve `GET /api/supply/serials/:serial` ahora se muestra en el detalle.
test('#278 · la ficha de la unidad muestra su cadena de abastecimiento', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/inventario/unidades')
  await expect(page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')).toBeVisible({ timeout: 20_000 })

  const marca = sufijo()
  const deposito = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito 278 ${marca}`, code: `C${marca.slice(-4)}` }),
  })
  expect([200, 201], JSON.stringify(deposito.body)).toContain(deposito.status)

  const base = `4901542${marca.slice(0, 7)}`
  const imei = imeiValido(base)
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E 278 cadena ${marca}`, sku: `E2E-278C-${marca}`, category: 'Celulares', pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: SEED.branchId }),
  })
  expect([200, 201], JSON.stringify(producto.body)).toContain(producto.status)
  const necesidad = await apiPagina(page, '/api/supply/needs', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.body.id, quantity: 1, branchId: SEED.branchId, priority: 'ALTA', origin: 'CDE', promisedAt: '2026-10-05T12:00:00.000Z' }),
  })
  expect([200, 201], JSON.stringify(necesidad.body)).toContain(necesidad.status)
  const compra = await apiPagina(page, '/api/supply/purchases', {
    method: 'POST',
    body: JSON.stringify({ supplierName: `Proveedor cadena ${marca}`, currency: 'PYG', branchId: SEED.branchId, reference: `FAC-CAD-${marca}`, lines: [{ needId: necesidad.body.id, productId: producto.body.id, quantity: 1, serials: [imei] }] }),
  })
  expect([200, 201], JSON.stringify(compra.body)).toContain(compra.status)
  const lote = await apiPagina(page, '/api/supply/shipments', {
    method: 'POST',
    body: JSON.stringify({ purchaseId: compra.body.id, origin: 'CDE', destinationBranchId: SEED.branchId, method: 'BUS', company: 'Bus E2E', etaAt: '2026-09-28T10:00:00.000Z' }),
  })
  expect([200, 201], JSON.stringify(lote.body)).toContain(lote.status)
  for (const accion of [['prepare'], ['dispatch', { guide: `G-${marca}` }], ['transit']]) {
    const respuesta = await apiPagina(page, '/api/supply/shipments', { method: 'PATCH', body: JSON.stringify({ id: lote.body.id, action: accion[0], ...(accion[1] || {}) }) })
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200)
  }

  // Recepción por API: recién al confirmar nace el stock (regla dura de #250).
  const abierta = await apiPagina(page, '/api/supply/receptions', { method: 'POST', body: JSON.stringify({ shipmentId: lote.body.id }) })
  expect([200, 201], JSON.stringify(abierta.body)).toContain(abierta.status)
  const recepcionId = abierta.body.recepcion.id
  const escaneo = await apiPagina(page, '/api/supply/receptions', { method: 'PATCH', body: JSON.stringify({ id: recepcionId, action: 'scan', serial: imei }) })
  expect([200, 201], JSON.stringify(escaneo.body)).toContain(escaneo.status)
  const confirmada = await apiPagina(page, '/api/supply/receptions', { method: 'PATCH', body: JSON.stringify({ id: recepcionId, action: 'confirm', locationId: deposito.body.id }) })
  expect(confirmada.status, JSON.stringify(confirmada.body)).toBe(200)

  // La API ya devolvía la cadena; ahora la ficha la muestra.
  const cadenaApi = await apiPagina(page, `/api/supply/serials/${imei}`)
  expect(cadenaApi.status, JSON.stringify(cadenaApi.body)).toBe(200)
  expect(cadenaApi.body?.enStock).toBe(true)
  expect(cadenaApi.body?.compra?.code).toBe(compra.body.code)
  expect(cadenaApi.body?.lotes?.[0]?.envio).toBe(lote.body.code)

  await page.reload()
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await expect(campo).toBeVisible({ timeout: 20_000 })
  await campo.fill(imei)
  await campo.press('Enter')
  const fila = page.getByTestId('inventario-fila').filter({ hasText: imei }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.click()

  const detalle = page.getByRole('dialog')
  const cadena = detalle.getByTestId('unidad-cadena')
  await expect(cadena).toBeVisible({ timeout: 20_000 })
  await expect(cadena.getByText('Cadena de abastecimiento')).toBeVisible()
  await expect(cadena.getByText('En stock', { exact: true })).toBeVisible()
  // Necesidad → compra → lote, con destino, recorrido y estados legibles.
  await expect(cadena.getByText('Manual').first()).toBeVisible()
  await expect(cadena.getByText(compra.body.code)).toBeVisible()
  await expect(cadena.getByText(`Proveedor cadena ${marca}`)).toBeVisible()
  await expect(cadena.getByText(`Ref. FAC-CAD-${marca}`)).toBeVisible()
  await expect(cadena.getByText(lote.body.code)).toBeVisible()
  await expect(cadena.getByText('Bus')).toBeVisible()
  await expect(cadena.getByText(/Recibido/).first()).toBeVisible()
  await expect(cadena.getByText(new RegExp(`CDE → ${SEED.branchName}`))).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await cadena.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(DIR, 'unidad-cadena-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'unidad-cadena-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await detalle.getByRole('button', { name: 'Cerrar' }).click()
})

// 3) Compactos #256: Precios · Celulares · Comparador (INV) y Autorizaciones
// (FIN) con barra del módulo (identidad + acciones) y sin desborde en móvil.
test('#278 · compactos de Precios, Celulares, Comparador y Autorizaciones', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const pantallas = [
    { ruta: '/precios', barra: 'barra-precios', extra: 'Nueva lista' },
    { ruta: '/celulares', barra: 'barra-celulares', extra: 'Comparar' },
    { ruta: '/comparador', barra: 'barra-comparador', extra: 'Semi-nuevos' },
    { ruta: '/autorizaciones', barra: 'barra-autorizaciones', extra: 'Actualizar' },
  ]
  for (const pantalla of pantallas) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(pantalla.ruta)
    const barra = page.getByTestId(pantalla.barra)
    await expect(barra).toBeVisible({ timeout: 20_000 })
    // #320: la barra no repite el título visible de la página.
    await expect(barra.getByRole('heading')).toHaveCount(0)
    await expect(page.getByRole('button', { name: pantalla.extra }).first()).toBeVisible()
    const nombre = pantalla.ruta.replace('/', '')
    await page.screenshot({ path: join(DIR, `compacto-${nombre}-claro-desktop.png`) })
    // 390 px: la barra envuelve sin desbordar.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(barra).toBeVisible()
    await sinDesborde(page)
    await page.screenshot({ path: join(DIR, `compacto-${nombre}-claro-mobile.png`) })
  }
})
