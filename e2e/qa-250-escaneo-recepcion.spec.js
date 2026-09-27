// #250 F3/F5 · UI de abastecimiento: preparación de IMEI de la compra
// (escaneo/pegado con Luhn y duplicados) y recepción del lote contra el
// manifiesto (escaneo, sobrante con nota, depósito y confirmación con stock).
//
// Capturas: `QA_250_CAPTURAS` (default test-results/qa-250) — se versionan en
// docs/qa/250-escaneo-recepcion/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_250_CAPTURAS || join('test-results', 'qa-250')

const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
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

// Agente de impresión simulado (como en etiquetas-unidad.spec.js): /health dice
// presente y /print guarda el ticket que mandó la app.
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
const sinDialogo = (page) => expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)

// PNG de 1×1 para la foto de la incidencia.
const PNG_E2E = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function prepararLote(page, cantidad, seriales) {
  const marca = sufijo()
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E 250 ${marca}`, sku: `E2E-250-${marca}`, category: 'Celulares', pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: SEED.branchId }),
  })
  expect([200, 201], JSON.stringify(producto.body)).toContain(producto.status)
  const compra = await apiPagina(page, '/api/supply/purchases', {
    method: 'POST',
    body: JSON.stringify({
      supplierName: `Proveedor E2E ${marca}`,
      currency: 'PYG',
      originalCost: 1500000 * cantidad,
      lines: [{ productId: producto.body.id, quantity: cantidad, ...(seriales.length ? { serials: seriales } : {}) }],
    }),
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
  return { producto: producto.body, compra: compra.body, lote: lote.body, marca }
}

test('F3 · preparar compra: escaneo, Luhn, duplicados y pegado múltiple', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/preparacion')
  await expect(page.getByTestId('preparar-compra')).toBeVisible()

  const base = `4901542${sufijo().slice(0, 7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const { compra } = await prepararLote(page, 2, [imeiA])
  await page.getByRole('button', { name: 'Actualizar' }).click()

  const fila = page.getByTestId('preparar-compra-fila').filter({ hasText: compra.code })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('1 IMEI pendiente')).toBeVisible()
  await fila.getByRole('button', { name: 'Preparar IMEI' }).click()
  await expect(fila.getByText('1 faltan')).toBeVisible()

  // Luhn: un dígito cambiado se rechaza antes de mandar.
  const imeiRoto = `${imeiB.slice(0, 14)}${(Number(imeiB[14]) + 1) % 10}`
  await page.getByLabel('IMEI a escanear').fill(imeiRoto)
  await page.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(page.getByText(/IMEI inválido/)).toBeVisible()

  // Duplicado: el IMEI que ya tiene la línea se rechaza.
  await page.getByLabel('IMEI a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(page.getByText(/cargad|duplicad|repetid/i).first()).toBeVisible({ timeout: 20_000 })

  // Pegado múltiple: el válido entra, el repetido y el roto no.
  await page.getByRole('button', { name: 'Pegar varios' }).click()
  await page.getByLabel('IMEI para pegar').fill(`${imeiB}, ${imeiA}\n${imeiRoto}`)
  await page.getByRole('button', { name: 'Cargar lote' }).click()
  // El pegado deja 1 válido (el otro es duplicado y el tercero roto). El aviso
  // puede llegar como «1 cargado(s)» o ya resuelto por el refresco (línea
  // completa): se acepta cualquiera y, si no, el mensaje muestra el panel.
  // El pegado deja 1 válido (duplicado y roto se rechazan). El resultado puede
  // verse como «1 cargado(s)»/«Línea completa» o como la compra ya fuera de
  // «pendientes» (si el refresco llegó primero): se aceptan los tres.
  await expect(async () => {
    const panel = await page.getByTestId('preparar-compra').innerText()
    const ok = /1 cargado\(s\)/.test(panel) || /Línea completa/.test(panel) || /0 IMEI pendientes|No hay compras/.test(panel)
    expect(ok, `pegado de IMEI: ${panel.replace(/\s+/g, ' ').slice(0, 400)}`).toBe(true)
  }).toPass({ timeout: 30_000 })

  // La compra deja de estar pendiente de preparación.
  const pendientes = await apiPagina(page, '/api/supply/purchases?pendientes=1')
  expect((pendientes.body?.compras || []).some((filaCompra) => filaCompra.id === compra.id)).toBe(false)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'preparar-compra-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'preparar-compra-claro-mobile.png') })
})

test('F5 · recepción: escaneo contra el manifiesto, sobrante con nota y stock al confirmar', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/recepcion')
  await expect(page.getByTestId('recepcion')).toBeVisible()

  const marca = sufijo()
  const deposito = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito E2E ${marca}`, code: `E${marca.slice(-4)}` }),
  })
  expect([200, 201], JSON.stringify(deposito.body)).toContain(deposito.status)

  const base = `4901542${marca.slice(0, 7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const imeiExtra = imeiValido(String(Number(base) + 2).padStart(14, '0'))
  const { producto, lote } = await prepararLote(page, 2, [imeiA, imeiB])
  await page.getByRole('button', { name: 'Actualizar' }).click()

  const llegada = page.getByTestId('recepcion-llegada').filter({ hasText: lote.code })
  await expect(llegada).toBeVisible()
  await expect(llegada.getByText('2 unidades')).toBeVisible()
  await llegada.getByRole('button', { name: 'Recibir' }).click()

  const activa = page.getByTestId('recepcion-activa')
  await expect(activa).toBeVisible()
  await expect(activa.getByTestId('recepcion-esperado')).toHaveCount(2)

  // Escaneo del esperado A y rechazo del repetido.
  await page.getByLabel('Código a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(activa.getByText('1 recibidas')).toBeVisible()
  await page.getByLabel('Código a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText(/ya (fue|está)|repetido|escaneado/i).first()).toBeVisible()

  // Un IMEI que no estaba en el manifiesto entra como sobrante y pide nota.
  await page.getByLabel('Código a escanear').fill(imeiExtra)
  await page.getByRole('button', { name: 'Registrar' }).click()
  const sobrante = activa.getByTestId('recepcion-sobrante')
  await expect(sobrante).toBeVisible()
  await sobrante.getByRole('button', { name: 'Agregar nota' }).click()
  await page.getByLabel('Nota').fill('Llegó un equipo que no figuraba en el manifiesto (e2e)')
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('Incidencia registrada')).toBeVisible()

  // La incidencia acepta foto: se adjunta y queda listada en el diálogo.
  await sobrante.getByRole('button', { name: 'Editar nota' }).click()
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: `sobrante-${sufijo()}.png`, mimeType: 'image/png', buffer: PNG_E2E })
  await expect(page.getByRole('dialog').getByText(/sobrante-\d+\.png/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click()

  // Depósito destino (sugerido o elegido) y confirmación: B queda faltante.
  await page.getByLabel('Depósito destino').selectOption({ label: `Depósito E2E ${marca} (E${marca.slice(-4)})` })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'recepcion-escaneo-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'recepcion-escaneo-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByTestId('recepcion-confirmada')).toBeVisible()
  // El lote parcial sigue en llegadas (queda por recibir el faltante): se
  // verifica por API el estado, no que desaparezca.

  // El stock entró solo para lo recibido (1 de 2) y el serial quedó en inventario.
  const unidades = await apiPagina(page, `/api/inventory-units?q=${imeiA}`)
  const filas = unidades.body?.items || unidades.body || []
  expect((filas || []).some((fila) => fila.serial === imeiA), JSON.stringify(unidades.body).slice(0, 300)).toBe(true)
  const conFaltante = await apiPagina(page, `/api/supply/receptions?shipmentId=${lote.id}`)
  const recepcionCerrada = (conFaltante.body?.recepciones || [])[0]
  // El resumen es la fuente de verdad de lo que pasó: 1 recibida, 1 faltante
  // (la que no se escaneó) y 1 sobrante con nota.
  expect(recepcionCerrada?.resumen, JSON.stringify(conFaltante.body).slice(0, 300)).toMatchObject({ RECIBIDO: 1, FALTANTE: 1, SOBRANTE: 1 })
  expect(recepcionCerrada?.status).toBe('CONFIRMADA')
  // El LOTE queda en CON_INCIDENCIA (contrato F5: sobrantes/dañados/incorrectos
  // mandan sobre el parcial) y sigue en llegadas pendientes para retomarlo.
  const lotes = await apiPagina(page, `/api/supply/shipments?purchaseId=${lote.purchaseId}`)
  const loteTrasRecepcion = (lotes.body?.envios || []).find((fila) => fila.id === lote.id)
  expect(loteTrasRecepcion?.status, JSON.stringify(lotes.body).slice(0, 300)).toBe('CON_INCIDENCIA')
  const llegadas = await apiPagina(page, '/api/supply/receptions?pendientes=1')
  expect((llegadas.body?.llegadas || []).some((fila) => fila.id === lote.id || fila.code === lote.code)).toBe(true)
  void producto
})

test('F5 · recibir todo el lote con depósito alternativo (y freno si falta IMEI)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/recepcion')
  await expect(page.getByTestId('recepcion')).toBeVisible()

  const marca = sufijo()
  const depositoA = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito A ${marca}`, code: `A${marca.slice(-4)}` }),
  })
  const depositoB = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito B ${marca}`, code: `B${marca.slice(-4)}` }),
  })
  expect([200, 201], JSON.stringify(depositoA.body)).toContain(depositoA.status)
  expect([200, 201], JSON.stringify(depositoB.body)).toContain(depositoB.status)

  // Lote con IMEI diferido: «recibir todo» avisa y no confirma nada.
  const diferido = await prepararLote(page, 1, [])
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const llegadaDiferida = page.getByTestId('recepcion-llegada').filter({ hasText: diferido.lote.code })
  await expect(llegadaDiferida).toBeVisible()
  await llegadaDiferida.getByRole('button', { name: 'Recibir' }).click()
  await expect(page.getByTestId('recepcion-activa')).toBeVisible()
  await expect(page.getByText(/IMEI por completar/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Recibir todo el lote' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Recibir todo' }).click()
  await expect(page.getByText(/preparalos antes de recibir todo/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar recepción' }).click()
  await expect(page.getByTestId('recepcion')).toBeVisible()

  // Lote completo: depósito sugerido precargado y alternativo elegido a mano.
  const base = `4901542${marca.slice(-7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const completo = await prepararLote(page, 2, [imeiA, imeiB])
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const llegada = page.getByTestId('recepcion-llegada').filter({ hasText: completo.lote.code })
  await expect(llegada).toBeVisible()
  await llegada.getByRole('button', { name: 'Recibir' }).click()
  await expect(page.getByTestId('recepcion-activa')).toBeVisible()
  await expect(page.getByLabel('Depósito destino')).not.toHaveValue('')

  await page.getByLabel('Depósito destino').selectOption({ label: `Depósito B ${marca} (B${marca.slice(-4)})` })
  await page.getByRole('button', { name: 'Recibir todo el lote' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText(/Se marcan 2 unidad\(es\)/)).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'recibir-todo-dialogo-claro-desktop.png') })
  await dialogo.getByRole('button', { name: 'Recibir todo' }).click()

  const confirmada = page.getByTestId('recepcion-confirmada')
  await expect(confirmada).toBeVisible()
  await expect(confirmada.getByText('2 recibidas')).toBeVisible()
  await expect(confirmada.getByRole('button', { name: 'Imprimir comprobante' })).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recepcion-confirmada-claro-desktop.png') })

  // API: recepción confirmada, 2 recibidas, depósito alternativo y stock ahí.
  const detalle = await apiPagina(page, `/api/supply/receptions?shipmentId=${completo.lote.id}`)
  const fila = (detalle.body?.recepciones || [])[0]
  expect(fila?.status, JSON.stringify(detalle.body).slice(0, 300)).toBe('CONFIRMADA')
  expect(fila?.resumen, JSON.stringify(detalle.body).slice(0, 300)).toMatchObject({ RECIBIDO: 2 })
  expect(fila?.location?.id).toBe(depositoB.body.id)
  for (const serial of [imeiA, imeiB]) {
    const unidades = await apiPagina(page, `/api/inventory-units?q=${serial}`)
    const unidad = (unidades.body?.items || unidades.body || []).find((filaUnidad) => filaUnidad.serial === serial)
    expect(unidad?.locationId || unidad?.location?.id, JSON.stringify(unidades.body).slice(0, 200)).toBe(depositoB.body.id)
  }
})

test('F5 · incidencia con foto en una unidad escaneada (y freno en las pendientes)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/recepcion')
  await expect(page.getByTestId('recepcion')).toBeVisible()

  const marca = sufijo()
  const base = `4901542${marca.slice(-7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const { lote } = await prepararLote(page, 2, [imeiA, imeiB])
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const llegada = page.getByTestId('recepcion-llegada').filter({ hasText: lote.code })
  await expect(llegada).toBeVisible()
  await llegada.getByRole('button', { name: 'Recibir' }).click()

  const activa = page.getByTestId('recepcion-activa')
  await expect(activa).toBeVisible()
  const tarjetaA = activa.getByTestId('recepcion-esperado').filter({ hasText: imeiA })
  const tarjetaB = activa.getByTestId('recepcion-esperado').filter({ hasText: imeiB })

  // Una unidad sin escanear no inventa incidencias: se explica el camino.
  await expect(tarjetaB.getByText(/Escaneá su IMEI para marcar dañado o incorrecto/)).toBeVisible()
  await expect(tarjetaB.getByRole('button', { name: 'Dañado' })).toHaveCount(0)
  await expect(tarjetaA.getByRole('button', { name: 'Dañado' })).toHaveCount(0)

  // Escaneada la unidad, la incidencia se registra sobre ella (con nota y foto).
  await page.getByLabel('Código a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(activa.getByText('1 recibidas')).toBeVisible()
  await expect(tarjetaA.getByRole('button', { name: 'Dañado' })).toBeVisible()
  await tarjetaA.getByRole('button', { name: 'Dañado' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByText(/Incidencia: Dañado/)).toBeVisible()
  await page.getByLabel('Nota').fill('Pantalla rayada al abrir la caja (e2e)')
  const foto = `incidencia-${marca}.png`
  await dialogo.locator('input[type=file]').setInputFiles({ name: foto, mimeType: 'image/png', buffer: PNG_E2E })
  await expect(dialogo.getByText(foto)).toBeVisible({ timeout: 15_000 })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'recepcion-incidencia-foto-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'recepcion-incidencia-foto-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await dialogo.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText('Incidencia registrada')).toBeVisible()
  // El chip del estado queda en la tarjeta junto a la nota y la foto.
  await expect(tarjetaA.locator('span').filter({ hasText: /^Dañado$/ }).first()).toBeVisible()
  await expect(tarjetaA.getByText('Pantalla rayada al abrir la caja (e2e)')).toBeVisible()
  await expect(tarjetaA.getByText(foto)).toBeVisible()

  // La API confirma resultado, nota y adjunto sobre la unidad de la recepción.
  const lista = await apiPagina(page, `/api/supply/receptions?shipmentId=${lote.id}`)
  const recepcionId = (lista.body?.recepciones || [])[0]?.id
  const detalle = await apiPagina(page, `/api/supply/receptions?id=${recepcionId}`)
  const item = (detalle.body?.recepcion?.items || []).find((fila) => fila.serial === imeiA)
  expect(item?.resultado).toBe('DANADO')
  expect(item?.nota).toContain('Pantalla rayada')
  const adjuntos = await apiPagina(page, `/api/attachments?entity=SUPPLY_RECEPTION&entityId=${item?.id}`)
  expect((adjuntos.body || []).map((fila) => fila.fileName)).toContain(foto)

  await page.getByRole('button', { name: 'Cancelar recepción' }).click()
  await expect(page.getByTestId('recepcion')).toBeVisible()
})

test('F3 · las etiquetas de la preparación salen por el agente (con pendientes)', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const capturados = []
  await agenteFalso(page, capturados)
  await page.goto('/preparacion')
  await expect(page.getByTestId('preparar-compra')).toBeVisible()

  const marca = sufijo()
  const base = `4901542${marca.slice(-7)}`
  const imeiA = imeiValido(base)
  const { compra } = await prepararLote(page, 2, [imeiA])
  await page.getByRole('button', { name: 'Actualizar' }).click()
  const fila = page.getByTestId('preparar-compra-fila').filter({ hasText: compra.code })
  await fila.getByRole('button', { name: 'Etiquetas' }).click()

  const listaEtiquetas = page.getByTestId('etiquetas-preparacion-lista')
  await expect(listaEtiquetas).toBeVisible()
  await expect(listaEtiquetas.getByText('1/2')).toBeVisible()
  await expect(listaEtiquetas.getByText('2/2')).toBeVisible()
  await expect(listaEtiquetas.getByText(imeiA)).toBeVisible()
  await expect(listaEtiquetas.getByText(/Pendiente · se carga antes de despachar/)).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'etiquetas-preparacion-claro-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'etiquetas-preparacion-claro-mobile.png') })
  await page.setViewportSize({ width: 1280, height: 900 })

  // Impresión de la tira completa: un ticket con las dos unidades.
  await page.getByRole('button', { name: 'Imprimir etiquetas' }).click()
  await expect(page.getByText('Etiquetas enviadas a la impresora.')).toBeVisible({ timeout: 15_000 })
  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('etiquetas-lote')
  const tira = textoDelTicket(capturados[0])
  expect(tira).toContain(imeiA)
  expect(tira).toContain('PENDIENTE')
  expect(tira).toContain(compra.code)

  // Reimpresión de una sola unidad (la que ya tiene IMEI).
  await listaEtiquetas.getByRole('button', { name: 'Reimprimir' }).first().click()
  await expect(page.getByText('Etiqueta enviada a la impresora.')).toBeVisible({ timeout: 15_000 })
  expect(capturados).toHaveLength(2)
  expect(capturados[1].tipo).toBe('etiquetas-lote')
  expect(textoDelTicket(capturados[1])).toContain(imeiA)
  expect(textoDelTicket(capturados[1])).not.toContain('PENDIENTE')
  await sinDialogo(page)

})

// F3/F4 · IMEI diferido del lote: el panel completa las unidades pendientes de
// un despacho (escaneo de a uno y pegado múltiple) antes de la recepción.
test('F3 · preparar lote: IMEI diferido por escaneo y pegado', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  const base = `4901542${sufijo().slice(0, 7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const imeiRoto = `${imeiB.slice(0, 14)}${(Number(imeiB[14]) + 1) % 10}`
  await page.goto('/preparar-lote')
  await expect(page.getByTestId('preparar-lote')).toBeVisible()
  const { compra, lote } = await prepararLote(page, 2, [])
  await page.getByRole('button', { name: 'Actualizar' }).click()

  const fila = page.getByTestId('preparar-lote-fila').filter({ hasText: lote.code })
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await expect(fila.getByText('2 IMEI pendientes')).toBeVisible()
  await expect(fila).toContainText(compra.code)
  await fila.getByRole('button', { name: 'Cargar IMEI' }).click()

  // Escaneo de a uno: el inválido (Luhn) no sale del panel.
  const activa = page.getByTestId('preparar-lote-activa')
  await expect(activa).toBeVisible()
  await expect(activa.getByText('2 pendientes')).toBeVisible()
  await page.getByLabel('IMEI del lote a escanear').fill(imeiRoto)
  await page.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(page.getByText(/IMEI inválido/)).toBeVisible()

  // El válido entra por escaneo y el lote baja a 1 pendiente.
  await page.getByLabel('IMEI del lote a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Cargar', exact: true }).click()
  await expect(async () => {
    const pendientes = await apiPagina(page, `/api/supply/shipments?purchaseId=${compra.id}`)
    expect((pendientes.body?.envios || [])[0]?.pendientes, JSON.stringify(pendientes.body).slice(0, 240)).toBe(1)
  }).toPass({ timeout: 20_000 })

  // Pegado múltiple: el válido entra y el roto se rechaza con el motivo.
  await page.getByRole('button', { name: 'Pegar varios' }).click()
  await page.getByLabel('IMEI del lote para pegar').fill(`${imeiB}, ${imeiRoto}`)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'preparar-lote-pegado-desktop.png') })
  await page.getByRole('button', { name: 'Cargar lote' }).click()
  await expect(async () => {
    const completos = await apiPagina(page, `/api/supply/shipments?purchaseId=${compra.id}`)
    const envio = (completos.body?.envios || [])[0]
    expect(envio?.pendientes, JSON.stringify(completos.body).slice(0, 240)).toBe(0)
    expect(envio?.conImei).toBe(2)
  }).toPass({ timeout: 20_000 })

  // Completo: sale de la lista de lotes con IMEI pendientes.
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await expect(page.getByTestId('preparar-lote').getByTestId('preparar-lote-fila').filter({ hasText: lote.code })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'preparar-lote-completo-mobile.png') })
})

// F2 · compras del Centro: listado con las cantidades libres, alta de líneas
// sobre una compra activa (IMEI ahora o pendientes) y cancelación con motivo.
test('F2 · compras del Centro: líneas libres, agregar líneas y cancelar', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/compras-centro')
  await expect(page.getByTestId('compras-centro')).toBeVisible()

  const marca = sufijo()
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: `E2E F2 ${marca}`, sku: `E2E-F2-${marca}`, category: 'Celulares', pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: SEED.branchId }),
  })
  expect([200, 201], JSON.stringify(producto.body)).toContain(producto.status)
  const compra = await apiPagina(page, '/api/supply/purchases', {
    method: 'POST',
    body: JSON.stringify({ supplierName: `Proveedor F2 ${marca}`, currency: 'PYG', lines: [{ productId: producto.body.id, quantity: 2 }] }),
  })
  expect([200, 201], JSON.stringify(compra.body)).toContain(compra.status)
  // El buscador de productos sale del espejo local: se recarga para incluirlo.
  await page.reload()
  await expect(page.getByTestId('compras-centro')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Actualizar' }).click()

  // La compra figura con su reposición libre (sin necesidad ni cliente).
  const fila = page.getByTestId('compra-centro-fila').filter({ hasText: compra.body.code })
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await expect(fila.getByText('2 unidad(es)')).toBeVisible()
  await expect(fila.getByText('2 libre(s)')).toBeVisible()
  await expect(fila.getByText('Comprada', { exact: true })).toBeVisible()

  // El detalle muestra la línea con sus IMEI pendientes y las libres.
  await fila.getByRole('button', { name: 'Ver líneas' }).click()
  const lineas = fila.getByTestId('compra-centro-lineas')
  await expect(lineas.getByText('0/2 IMEI')).toBeVisible()
  await expect(lineas.getByText('2 libre(s)')).toBeVisible()

  // Agregar una línea activa con un IMEI ahora.
  const base = `4901542${marca.slice(0, 7)}`
  const imei = imeiValido(base)
  await fila.getByRole('button', { name: '+ Agregar líneas' }).click()
  const modal = page.getByRole('dialog', { name: /Agregar líneas/ })
  await expect(modal).toBeVisible()
  await modal.getByRole('combobox').first().fill(producto.body.name)
  await modal.getByRole('option', { name: new RegExp(producto.body.name) }).first().click()
  await modal.getByLabel('Cantidad').fill('1')
  await modal.getByLabel('Costo unitario de la línea').fill('1600000')
  await modal.getByLabel('IMEI de la línea').fill(imei)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'compras-centro-desktop.png') })
  await modal.getByRole('button', { name: 'Agregar líneas' }).click()
  await expect(page.getByText('Líneas agregadas')).toBeVisible({ timeout: 20_000 })

  const detalle = await apiPagina(page, `/api/supply/purchases?limit=50`)
  const actualizada = (detalle.body?.compras || []).find((f) => f.id === compra.body.id)
  expect(actualizada?.lines?.length, JSON.stringify(actualizada).slice(0, 300)).toBe(2)
  const nueva = actualizada?.lines?.find((l) => (l.serials || []).some((s) => (s.serial || s) === imei))
  expect(nueva?.quantity).toBe(1)

  const filaActualizada = page.getByTestId('compra-centro-fila').filter({ hasText: compra.body.code })

  // La factura se adjunta desde la misma pantalla (queda auditada).
  const factura = `factura-${marca}.png`
  await filaActualizada.getByRole('button', { name: 'Adjuntos' }).click()
  const modalAdjuntos = page.getByRole('dialog', { name: /Adjuntos/ })
  await expect(modalAdjuntos).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'compras-centro-adjuntos-desktop.png') })
  await modalAdjuntos.locator('input[type=file]').setInputFiles({ name: factura, mimeType: 'image/png', buffer: PNG_E2E })
  await expect(modalAdjuntos.getByText(factura)).toBeVisible({ timeout: 20_000 })
  await modalAdjuntos.getByRole('button', { name: 'Cerrar' }).click()

  // Cancelar con motivo: vuelve auditado y la compra queda cancelada.
  await filaActualizada.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const modalCancelar = page.getByRole('dialog', { name: 'Cancelar compra' })
  await modalCancelar.getByLabel('Motivo').fill('El proveedor no tenía stock (e2e)')
  await modalCancelar.getByRole('button', { name: 'Cancelar compra' }).click()
  await expect(page.getByText('Compra cancelada')).toBeVisible({ timeout: 20_000 })
  const trasCancelar = await apiPagina(page, '/api/supply/purchases?limit=50')
  const cancelada = (trasCancelar.body?.compras || []).find((f) => f.id === compra.body.id)
  expect(cancelada?.status).toBe('CANCELADA')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(DIR, 'compras-centro-mobile.png') })
})

// F5 · recomponer un lote parcial: solo se pide lo que falta, el IMEI ya
// recibido no se duplica y el lote queda completo.
test('F5 · un lote parcial se completa después sin volver a pedir lo recibido', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.goto('/recepcion')
  await expect(page.getByTestId('recepcion')).toBeVisible()

  const marca = sufijo()
  const deposito = await apiPagina(page, '/api/stock-locations', {
    method: 'POST',
    body: JSON.stringify({ branchId: SEED.branchId, name: `Depósito parcial ${marca}`, code: `P${marca.slice(-4)}` }),
  })
  expect([200, 201], JSON.stringify(deposito.body)).toContain(deposito.status)
  const etiquetaDeposito = `Depósito parcial ${marca} (P${marca.slice(-4)})`

  const base = `4901542${marca.slice(0, 7)}`
  const imeiA = imeiValido(base)
  const imeiB = imeiValido(String(Number(base) + 1).padStart(14, '0'))
  const { lote } = await prepararLote(page, 2, [imeiA, imeiB])
  await page.getByRole('button', { name: 'Actualizar' }).click()

  // Primera recepción: entra A y el lote queda parcial (B faltante).
  const llegada = page.getByTestId('recepcion-llegada').filter({ hasText: lote.code })
  await llegada.getByRole('button', { name: 'Recibir' }).click()
  await expect(page.getByTestId('recepcion-activa').getByTestId('recepcion-esperado')).toHaveCount(2)
  await page.getByLabel('Código a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await page.getByLabel('Depósito destino').selectOption({ label: etiquetaDeposito })
  await page.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByTestId('recepcion-confirmada')).toBeVisible()

  // Recomposición: queda solo B por recibir y A ya no se pide.
  await page.getByRole('button', { name: 'Volver a llegadas' }).click()
  const parcial = page.getByTestId('recepcion-llegada').filter({ hasText: lote.code })
  await expect(parcial.getByText('1 de 2 por recibir')).toBeVisible({ timeout: 20_000 })
  await parcial.getByRole('button', { name: 'Recibir' }).click()
  const activa = page.getByTestId('recepcion-activa')
  await expect(activa.getByTestId('recepcion-esperado')).toHaveCount(1)

  // El IMEI ya recibido se rechaza con aviso claro.
  await page.getByLabel('Código a escanear').fill(imeiA)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(page.getByText(/ya fue recibido/)).toBeVisible()

  // B entra, se confirma y el lote queda recibido con un solo ejemplar por IMEI.
  await page.getByLabel('Código a escanear').fill(imeiB)
  await page.getByRole('button', { name: 'Registrar' }).click()
  await expect(activa.getByText('1 recibidas')).toBeVisible()
  await page.getByLabel('Depósito destino').selectOption({ label: etiquetaDeposito })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: join(DIR, 'recepcion-parcial-recompuesta-desktop.png') })
  await page.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByTestId('recepcion-confirmada')).toBeVisible()

  const lotes = await apiPagina(page, `/api/supply/shipments?purchaseId=${lote.purchaseId}`)
  expect((lotes.body?.envios || [])[0]?.status, JSON.stringify(lotes.body).slice(0, 240)).toBe('RECIBIDO')
  for (const serial of [imeiA, imeiB]) {
    const unidades = await apiPagina(page, `/api/inventory-units?q=${serial}`)
    const filas = (unidades.body?.items || unidades.body || []).filter((fila) => fila.serial === serial)
    expect(filas.length, `${serial}: ${JSON.stringify(unidades.body).slice(0, 200)}`).toBe(1)
  }
})
