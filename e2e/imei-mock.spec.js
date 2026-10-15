// Consulta de IMEI (#193) — FASE 1 con mocks: precheck sin cargo, confirmación
// explícita, idempotencia por requestId y estados honestos. Sin llamadas pagas.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'
import { imeiValido } from './helpers/imei.js'

const API = SEED.api
// Capturas del QA: viven en test-results para no ensuciar el árbol del release.
const SALIDA = 'test-results/imei-conciliacion'

// IMEI ficticio con checksum Luhn válido, único por corrida: las aserciones no
// dependen de registros que hayan dejado corridas anteriores.

async function api(page, ruta, opciones) {
  return page.evaluate(async ({ api, ruta, opciones }) => {
    const respuesta = await fetch(`${api}/api/${ruta}`, { credentials: 'include', headers: opciones?.body ? { 'Content-Type': 'application/json' } : undefined, ...opciones })
    return { status: respuesta.status, datos: await respuesta.json().catch(() => null) }
  }, { api: API, ruta, opciones })
}

test('el IMEI se valida antes de consultar y el precheck no cobra', async ({ page }) => {
  const IMEI = imeiValido()
  await page.goto('/inventario/unidades')
  const invalido = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'precheck', imei: '123', servicio: 'APPLE_BASIC' }) })
  expect(invalido.status).toBe(400)
  expect(String(invalido.datos?.message)).toMatch(/15 dígitos/)

  const precheck = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'precheck', imei: IMEI, servicio: 'APPLE_BASIC' }) })
  expect(precheck.status).toBe(200)
  expect(precheck.datos.imei).not.toContain(IMEI)
  expect(precheck.datos.creditosRequeridos).toBe(1)
  expect(precheck.datos.saldo).toBeGreaterThan(0)
  expect(precheck.datos.servicio.precioUsd, 'la app no expone precios').toBeUndefined()
  expect(precheck.datos.requiereConfirmacion).toBe(true)
  expect(precheck.datos.modo).toBe('simulado', 'sin LIVE el modo visible es simulado')
  expect(precheck.datos.simulado).toBe(true)
  expect(precheck.datos.costoEstimadoUsd).toBeUndefined()
  // El precheck no deja registro (no hubo consulta).
  const historial = await api(page, `imei?imei=${IMEI}`, { method: 'GET' })
  expect(historial.datos.consultas).toEqual([])
})

// Matriz del brief (#193): sin confirmación no se ejecuta, el mismo requestId
// no cobra dos veces y el listado siempre va enmascarado.
test('sin confirmación explícita no se ejecuta y con requestId no se cobra dos veces', async ({ page }) => {
  const IMEI = imeiValido()
  await page.goto('/inventario/unidades')
  const sinConfirmar = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI, servicio: 'APPLE_BASIC', requestId: `qa-193-a-${Date.now()}` }) })
  expect(sinConfirmar.status).toBe(409)
  expect(sinConfirmar.datos?.details?.requiereConfirmacion).toBe(true)

  const requestId = `qa-193-${Date.now()}`
  const primera = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI, servicio: 'APPLE_BASIC', confirm: true, requestId }) })
  expect(primera.status).toBe(201)
  expect(primera.datos.esMock).toBe(true)
  expect(primera.datos.etiqueta).toBe('Verificado')
  expect(primera.datos).not.toHaveProperty('costUsd')
  expect(primera.datos.campos ?? primera.datos.normalized).toBeTruthy()

  // Mismo requestId (clic repetido / reintento): devuelve el registro, sin otro cargo.
  const repetida = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI, servicio: 'APPLE_BASIC', confirm: true, requestId }) })
  expect(repetida.status).toBe(200)
  expect(repetida.datos.id).toBe(primera.datos.id)

  const historial = await api(page, `imei?imei=${IMEI}`, { method: 'GET' })
  const propias = historial.datos.consultas.filter(fila => fila.id === primera.datos.id)
  expect(propias.length).toBe(1)
  // El listado va enmascarado y sin la respuesta cruda para roles sin permiso (acá admin sí la ve).
  expect(propias[0].imei).not.toContain(IMEI)
})

// UI mínima (#193/#200): en la ficha de la unidad el costo se ve ANTES de
// confirmar, la confirmación es explícita y el resultado muestra fuente y hora.
// Corre contra los mocks de la fase 1: sin llamadas pagas.
test('la ficha de la unidad muestra el costo, pide confirmación y deja el resultado auditado', async ({ page }) => {
  await page.goto('/inventario/unidades')
  const imei = imeiValido()
  const marca = `UI${Date.now().toString(36)}`.toUpperCase()
  const creado = await page.evaluate(async ({ api, branchId, imei, marca }) => {
    const pedir = async (ruta, body) => {
      const respuesta = await fetch(`${api}/api/${ruta}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`${ruta}: ${datos?.message || respuesta.status}`)
      return datos
    }
    const producto = await pedir('products', { sku: `ZZ-IMEI-${marca}`, name: `iPhone IMEI ${marca}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId })
    const unidad = await pedir('inventory-units', { productId: producto.id, branchId, serial: imei })
    return { productId: producto.id, unidadId: unidad.id }
  }, { api: API, branchId: SEED.branchId, imei, marca })
  try {
    const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
    await campo.fill(imei)
    await campo.press('Enter')
    await page.getByTestId('inventario-fila').filter({ hasText: imei }).first().click()
    const bloque = page.getByTestId('detalle-unidad-imei')
    await expect(bloque).toBeVisible()
    await bloque.getByTestId('imei-precheck').click()
    await expect(bloque).toContainText('Apple Basic')
    await expect(bloque).toContainText('SIMULADO')
    await expect(bloque).toContainText('Sin cobro')
    await expect(bloque.getByTestId('imei-confirmar')).toContainText('simulada')
    await bloque.getByTestId('imei-confirmar').click()
    // Resultado con estado explícito, fuente del proveedor y campos normalizados.
    await expect(bloque).toContainText('Verificado')
    // Sin IMEICHECK_LIVE la respuesta es simulada: se marca para no confundirla
    // con una verificación real ni con un cobro.
    await expect(bloque).toContainText('SIMULADO')
    await expect(bloque).toContainText('imeicheck.net')
    await expect(bloque).toContainText('Blacklist actual')
  } finally {
    await page.evaluate(async ({ api, creado }) => {
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: creado.unidadId, action: 'remove', reason: 'Limpieza del spec de IMEI UI' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(creado.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, creado })
  }
})

// Matriz de mocks del brief (#193): parcial, pendiente, timeout, sin saldo y no
// autorizado se registran con su estado honesto y sin cobro. `escenario` solo se
// acepta sin IMEICHECK_LIVE=1 (en vivo se ignora): nunca se llama al proveedor.
test('los estados del proveedor se registran sin cobro y sin llamar al proveedor', async ({ page }) => {
  const IMEI = imeiValido()
  await page.goto('/inventario/unidades')
  const casos = [
    { escenario: 'parcial', etiqueta: 'Parcial' },
    { escenario: 'pendiente', etiqueta: 'No verificado' },
    { escenario: 'timeout', etiqueta: 'A conciliar' },
    { escenario: 'sin-saldo', etiqueta: 'No verificado' },
    { escenario: 'no-autorizado', etiqueta: 'No verificado' },
  ]
  for (const caso of casos) {
    const respuesta = await api(page, 'imei', {
      method: 'POST',
      body: JSON.stringify({ action: 'checks', imei: IMEI, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-193-${caso.escenario}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, escenario: caso.escenario }),
    })
    expect(respuesta.status).toBe(201)
    expect(respuesta.datos.esMock).toBe(true)
    expect(respuesta.datos.etiqueta).toBe(caso.etiqueta)
    expect(respuesta.datos).not.toHaveProperty('costUsd')
  }
})

// Aislamiento por tienda (#193): el mismo IMEI consultado en dos tiendas no se
// mezcla; cada una ve su historial y la advertencia de "consulta reciente" no
// cruza de tenant. La segunda tienda se da de alta solo la primera vez.
test('el mismo IMEI en dos tiendas queda aislado por tienda', async ({ page, browser }) => {
  const IMEI_COMPARTIDO = imeiValido()
  const tiendaB = { name: 'Tienda E2E IMEI Dos', email: 'tienda-imei-dos@test.local', password: 'E2e-imei-password-123', deviceId: 'e2e-imei-dos', pin: '4321' }
  await page.goto('/inventario/unidades')

  // Tienda A (seed): su consulta y su historial.
  const consultaA = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI_COMPARTIDO, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-193-tienda-a-${Date.now()}` }) })
  expect(consultaA.status).toBe(201)
  const historialA1 = await api(page, `imei?imei=${IMEI_COMPARTIDO}`, { method: 'GET' })
  expect(historialA1.datos.consultas.length).toBe(1)

  // Tienda B: alta idempotente (register → onboarding → PIN) en su propio contexto.
  const contexto = await browser.newContext()
  try {
    const apiB = contexto.request
    const leerTokenEmpresa = (headers) => String(headers['set-cookie'] || '').match(/mobos_company_session=([^;,\n]*)/)?.[1] || ''
    let sesion = null
    let tokenEmpresa = ''
    const registro = await apiB.post(`${API}/api/auth/register`, { data: { companyName: tiendaB.name, email: tiendaB.email, password: tiendaB.password, deviceId: tiendaB.deviceId } })
    if (registro.ok()) {
      sesion = await registro.json()
      tokenEmpresa = leerTokenEmpresa(registro.headers())
    } else if (registro.status() === 409) {
      const login = await apiB.post(`${API}/api/auth/login`, { data: { email: tiendaB.email, password: tiendaB.password, deviceId: tiendaB.deviceId } })
      expect(login.ok()).toBe(true)
      sesion = await login.json()
      tokenEmpresa = leerTokenEmpresa(login.headers())
    } else {
      throw new Error(`registro tienda B: HTTP ${registro.status()}`)
    }
    expect(tokenEmpresa).toBeTruthy()
    const adminB = (sesion?.sellers || [])[0]
    expect(adminB?.id).toBeTruthy()
    const onboarding = await apiB.post(`${API}/api/auth/onboarding`, { headers: { Authorization: `Bearer ${tokenEmpresa}` }, data: { pin: tiendaB.pin } })
    expect([200, 201, 204, 409]).toContain(onboarding.status())
    const pin = await apiB.post(`${API}/api/auth/pin`, { headers: { Authorization: `Bearer ${tokenEmpresa}` }, data: { sellerId: adminB.id, pin: tiendaB.pin } })
    expect(pin.ok()).toBe(true)
    // Fuera del navegador no hay same-origin: se usa el Bearer del vendedor.
    const tokenVendedor = String(pin.headers()['set-cookie'] || '').match(/mobos_seller_session=([^;,\n]*)/)?.[1] || ''
    expect(tokenVendedor).toBeTruthy()
    const cabecerasB = { Authorization: `Bearer ${tokenVendedor}` }

    // Precheck en B: no ve la consulta reciente de A (aislamiento por tenant).
    const precheckB = await apiB.post(`${API}/api/imei`, { headers: cabecerasB, data: { action: 'precheck', imei: IMEI_COMPARTIDO, servicio: 'APPLE_BASIC' } })
    expect(precheckB.status()).toBe(200)
    const precheckDatos = await precheckB.json()
    expect(precheckDatos.advertencia).toBeNull()
    expect(precheckDatos.costoEstimadoUsd).toBeUndefined()
    expect(precheckDatos.creditosRequeridos).toBe(1)

    // Consulta propia de B: queda solo en su historial.
    const consultaB = await apiB.post(`${API}/api/imei`, { headers: cabecerasB, data: { action: 'checks', imei: IMEI_COMPARTIDO, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-193-tienda-b-${Date.now()}` } })
    expect(consultaB.status()).toBe(201)
    const datosB = await consultaB.json()
    const historialB = await (await apiB.get(`${API}/api/imei?imei=${IMEI_COMPARTIDO}`, { headers: cabecerasB })).json()
    expect(historialB.consultas.length).toBe(1)
    expect(historialB.consultas[0].id).toBe(datosB.id)

    // A sigue viendo solo lo suyo.
    const historialA2 = await api(page, `imei?imei=${IMEI_COMPARTIDO}`, { method: 'GET' })
    expect(historialA2.datos.consultas.length).toBe(1)
    expect(historialA2.datos.consultas[0].id).toBe(consultaA.datos.id)
  } finally {
    await contexto.close()
  }
})

// #233: una consulta ambigua (timeout) queda «A conciliar». La empresa NO concilia
// ni cambia estado/costo: solo reporta el problema; la plataforma decide.
test('el timeout queda a conciliar y la empresa solo puede reportar el problema', async ({ page }) => {
  await page.goto('/inventario/unidades')
  const IMEI_TIMEOUT = imeiValido()
  const requestId = `qa-233-${Date.now()}`
  const creada = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI_TIMEOUT, servicio: 'APPLE_BASIC', confirm: true, requestId, escenario: 'timeout' }) })
  expect(creada.status).toBe(201)
  expect(creada.datos.etiqueta).toBe('A conciliar')
  expect(creada.datos).not.toHaveProperty('costUsd')

  const conciliada = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'conciliar', requestId, status: 'fallido', costUsd: 0 }) })
  expect(conciliada.status).toBe(400)
  const reporte = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'reportar', requestId, note: 'No llegó respuesta del proveedor.' }) })
  expect(reporte.status).toBe(200)
  expect(reporte.datos.status).toBe('conciliar')

  const historial = await api(page, `imei?imei=${IMEI_TIMEOUT}`, { method: 'GET' })
  const fila = historial.datos.consultas.find(item => item.id === creada.datos.id)
  expect(fila.etiqueta).toBe('A conciliar')
  expect(fila).not.toHaveProperty('costUsd')
})

// Reportar problema desde la UI: botón en el registro, modal simple y auditoría.
test('la ficha permite reportar un problema de una consulta y deja la auditoría', async ({ page }) => {
  const IMEI_UI = imeiValido()
  await page.goto('/inventario/unidades')
  const requestId = `qa-233ui-${Date.now()}`
  const creada = await api(page, 'imei', { method: 'POST', body: JSON.stringify({ action: 'checks', imei: IMEI_UI, servicio: 'APPLE_BASIC', confirm: true, requestId, escenario: 'timeout' }) })
  expect(creada.status).toBe(201)
  // La lista de Stock es unificada (productos + unidades): la ficha con consultas IMEI es la de una unidad.
  const filaUnidad = page.locator('[data-testid="inventario-fila"][data-kind="unit"]').first()
  await filaUnidad.waitFor({ timeout: 15_000 })
  await filaUnidad.click()
  await page.getByTestId('imei-consultas-abrir').click()
  await page.getByLabel('IMEI a consultar').fill(IMEI_UI)
  await page.getByTestId('imei-consultas-buscar').click()
  await expect(page.getByTestId('imei-consultas-lista')).not.toContainText('US$')
  await page.getByTestId(`imei-conciliar-${creada.datos.id}`).click()

  const modal = page.getByRole('dialog', { name: 'Reportar problema de la consulta' })
  await expect(modal).toBeVisible()
  await expect(modal.getByLabel('Costo real USD')).toHaveCount(0)
  await modal.getByLabel('Qué pasó').fill('El proveedor no respondió.')
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/01-modal-conciliar.png`, fullPage: true })
  await page.getByTestId('imei-conciliar-guardar').click()
  await expect(page.getByText('Problema reportado.', { exact: false })).toBeVisible({ timeout: 15_000 })

  const historial = await api(page, `imei?imei=${IMEI_UI}`, { method: 'GET' })
  const fila = historial.datos.consultas.find(item => item.id === creada.datos.id)
  expect(fila.etiqueta).toBe('A conciliar')

  const auditoria = await api(page, 'audit?action=IMEI_QUERY_REPORTED&entity=ImeiCheckQuery&limit=50', { method: 'GET' })
  expect(auditoria.status).toBe(200)
  const entradas = Array.isArray(auditoria.datos) ? auditoria.datos : (auditoria.datos?.entradas || [])
  expect(entradas.some(entrada => entrada.entityId === creada.datos.id)).toBe(true)
})
