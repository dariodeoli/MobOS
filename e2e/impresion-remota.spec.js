// Impresión remota: el backend es la autoridad de impresoras y puentes;
// localStorage es solo caché de lectura. La cola remota se prueba de punta a
// punta con un puente falso (claim + result), sin impresora real.

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { SEED } from './helpers/seed-data.js'
import { crearPuenteFalso, parearPuente } from './helpers/fake-bridge.mjs'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const NOMBRE = 'Térmica E2E remota'
const DESTINO = 'lan:10.99.99.10:9100'
const NOMBRE_VIEJO = 'Impresora vieja de caché'
const NOMBRE_REMOTO = 'Térmica puente E2E'
const DESTINO_REMOTO = 'lan:10.99.99.20:9100'
const NOMBRE_REVOCADO = 'Térmica puente revocado E2E'
const DESTINO_REVOCADO = 'lan:10.99.99.21:9100'
const NOMBRE_COMPARATIVA_A = 'Térmica E2E comparativa A'
const DESTINO_COMPARATIVA_A = 'lan:10.99.99.30:9100'
const NOMBRE_COMPARATIVA_B = 'Térmica E2E comparativa B'
const DESTINO_COMPARATIVA_B = 'lan:10.99.99.31:9100'
const NOMBRE_SUCURSAL_A = 'Térmica E2E sucursal A'
const DESTINO_SUCURSAL_A = 'lan:10.99.99.40:9100'
const NOMBRE_SUCURSAL_B = 'Térmica E2E sucursal B'
const DESTINO_SUCURSAL_B = 'lan:10.99.99.41:9100'

// Venta sintética en la segunda sucursal: el arnés no tiene forma de vender
// desde otra sucursal (el pedido toma la del vendedor), así que la alerta de
// "sucursal con ventas sin puente" se sembraría con una fila directa. Es
// idempotente y solo toca la base temporal del e2e.
function sembrarVentaSucursalDos() {
  // El snapshot de la base e2e puede ser viejo y no traer las sucursales fijas
  // del seed: se aseguran acá antes de sembrar la venta (idempotente).
  execFileSync('/opt/homebrew/bin/psql', [
    '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
    '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO "Branch" ("id", "tenantId", "name", "updatedAt")
     SELECT branch."id", t."id", branch."name", CURRENT_TIMESTAMP
     FROM "Tenant" t
     CROSS JOIN (VALUES ('${SEED.branchId}', '${SEED.branchName}'), ('${SEED.branch2Id}', '${SEED.branch2Name}')) AS branch("id", "name")
     WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name";`,
  ], { stdio: 'ignore' })
  execFileSync('/opt/homebrew/bin/psql', [
    '-h', '127.0.0.1', '-p', process.env.MOBOS_E2E_PGPORT || '5439', '-U', 'postgres', '-d', process.env.MOBOS_E2E_DB || 'mobos_e2e',
    '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO "Order" ("id", "tenantId", "branchId", "sellerId", "orderNumber", "publicToken", "subtotalPyg", "totalPyg", "createdAt", "updatedAt")
     SELECT 'e2e-order-branch2-95', t."id", '${SEED.branch2Id}', (SELECT u."id" FROM "User" u WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN' LIMIT 1), 'E2E-BRANCH2-95', md5(random()::text || clock_timestamp()::text), 1000, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM "Tenant" t WHERE t."email" = '${SEED.company.email}'
     ON CONFLICT DO NOTHING;`,
  ], { stdio: 'ignore' })
}

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

// Impresora suelta (sin puente), idempotente entre corridas: es la que usa la
// comparativa para demostrar que sin puente falta un paso.
async function asegurarImpresoraSuelta(page, { nombre, destino }) {
  const lista = await apiImpresion(page, '/api/print/printers')
  const existente = (lista.datos?.printers || []).find((impresora) => impresora.destination === destino)
  if (existente) return existente
  const creada = await apiImpresion(page, '/api/print/printers', {
    method: 'POST',
    body: JSON.stringify({
      name: nombre,
      brand: 'E2E',
      model: 'Comparativa',
      connection: 'lan',
      destination: destino,
      width: 80,
      copies: 1,
      cut: true,
      density: 3,
      characters: true,
      isDefault: false,
      isActive: true,
    }),
  })
  if (creada.status !== 201) throw new Error(`no se pudo crear la impresora comparativa E2E: HTTP ${creada.status}`)
  return creada.datos
}

function leerCache(page) {
  return page.evaluate(() => {
    const clave = Object.keys(localStorage).find((k) => k.startsWith('mobos:impresoras:v1:'))
    return clave ? { clave, store: JSON.parse(localStorage.getItem(clave)) } : null
  })
}

// Crea el puente desde la UI (así se cubre el código visible para ADMIN) y
// devuelve el código de vinculación que se usa para parear el puente falso.
async function crearPuentePorUi(page, nombre) {
  await page.goto('/configuracion/impresoras')
  // El tope de puentes por empresa es 20: si la base se reutiliza entre
  // corridas, los E2E viejos lo agotan y el código de vinculación no aparece.
  const puentes = await apiImpresion(page, '/api/print/bridges')
  for (const puente of puentes.datos?.bridges || []) {
    if (/^Puente .*E2E/.test(String(puente.name || ''))) await apiImpresion(page, `/api/print/bridges/${puente.id}`, { method: 'DELETE' })
  }
  await page.getByRole('button', { name: /Gestionar puentes/ }).click()
  await page.getByRole('button', { name: 'Agregar puente' }).click()
  await page.getByLabel('Nombre del puente').fill(nombre)
  await page.getByRole('button', { name: 'Crear y vincular' }).click()
  const codigo = page.locator('p.font-mono.text-2xl')
  await expect(codigo).toBeVisible({ timeout: 20_000 })
  const valor = (await codigo.innerText()).trim()
  await page.keyboard.press('Escape')
  return valor
}

// Impresora asignada a un puente (la crea o le actualiza el puente si ya
// existía de una corrida anterior). `branchId` permite probar la resolución
// por sucursal sin puente explícito.
async function asegurarImpresoraRemota(page, { nombre, destino, bridgeId, branchId = null }) {
  const lista = await apiImpresion(page, '/api/print/printers')
  const existente = (lista.datos?.printers || []).find((impresora) => impresora.destination === destino)
  if (existente) {
    if (existente.bridgeId === bridgeId && (existente.branchId || null) === branchId) return existente
    const actualizada = await apiImpresion(page, `/api/print/printers/${existente.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bridgeId, branchId }),
    })
    if (actualizada.status !== 200) throw new Error(`no se pudo asignar la impresora al puente: HTTP ${actualizada.status}`)
    return actualizada.datos
  }
  const creada = await apiImpresion(page, '/api/print/printers', {
    method: 'POST',
    body: JSON.stringify({
      name: nombre,
      brand: 'E2E',
      model: 'Puente',
      location: SEED.branchName,
      connection: 'lan',
      destination: destino,
      width: 80,
      copies: 1,
      cut: true,
      density: 3,
      characters: true,
      isDefault: false,
      isActive: true,
      bridgeId,
      branchId,
    }),
  })
  if (creada.status !== 201) throw new Error(`no se pudo crear la impresora remota E2E: HTTP ${creada.status}`)
  return creada.datos
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
    // syncedAt estable = no hay refresco en curso que pueda pisar la captura.
    const esperarSyncedAtQuieto = async () => {
      let anterior = Symbol('sin-leer')
      await expect.poll(async () => {
        const actual = (await leerCache(page))?.store?.syncedAt || ''
        const quieto = actual !== '' && actual === anterior
        anterior = actual
        return quieto
      }, { timeout: 15_000, intervals: [250, 250, 250, 250] }).toBe(true)
    }

    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })

    // El backend se corta ANTES de capturar: el refresco automático de 20 s no
    // puede pisar syncedAt entre la captura y el reload (carrera del slice 4).
    await page.route('**/api/print/**', (ruta) => ruta.abort())
    await esperarSyncedAtQuieto()

    // Marca testigo: si la UI escribiera la caché, desaparecería.
    const antes = await page.evaluate(() => {
      const clave = Object.keys(localStorage).find((k) => k.startsWith('mobos:impresoras:v1:'))
      const store = JSON.parse(localStorage.getItem(clave))
      store.marcaDePrueba = 'no-tocar'
      localStorage.setItem(clave, JSON.stringify(store))
      return { syncedAt: store.syncedAt }
    })

    await page.reload()
    await expect(page.getByText(NOMBRE).first()).toBeVisible({ timeout: 20_000 })

    const despues = await leerCache(page)
    expect(despues?.store?.marcaDePrueba).toBe('no-tocar')
    expect(despues?.store?.syncedAt).toBe(antes.syncedAt)
    expect((despues?.store?.impresoras || []).some((impresora) => impresora.destino === DESTINO)).toBe(true)
  })

  test('editar una impresora por UI actualiza el backend y la caché', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()
    const tarjeta = tarjetaDe(page, NOMBRE)
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })
    await tarjeta.getByRole('button', { name: 'Editar' }).click()

    const nombreNuevo = `${NOMBRE} ${Date.now()}`
    await page.getByLabel('Nombre visible').fill(nombreNuevo)
    await page.getByRole('button', { name: 'Guardar impresora' }).click()
    await expect(page.getByText(nombreNuevo).first()).toBeVisible({ timeout: 15_000 })

    const lista = await apiImpresion(page, '/api/print/printers')
    expect((lista.datos?.printers || []).some((impresora) => impresora.name === nombreNuevo)).toBe(true)
    await expect.poll(async () => {
      const cache = await leerCache(page)
      return (cache?.store?.impresoras || []).some((impresora) => impresora.nombre === nombreNuevo)
    }, { timeout: 10_000 }).toBe(true)
  })

  test('la comparativa lista dos impresoras y avisa que falta vincular el puente', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    await asegurarImpresoraSuelta(page, { nombre: NOMBRE_COMPARATIVA_A, destino: DESTINO_COMPARATIVA_A })
    await asegurarImpresoraSuelta(page, { nombre: NOMBRE_COMPARATIVA_B, destino: DESTINO_COMPARATIVA_B })
    await page.reload()

    const panel = page.getByTestId('comparativa-impresoras')
    await expect(panel).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByText(NOMBRE_COMPARATIVA_A, { exact: false }).first()).toBeVisible()
    await expect(panel.getByText(NOMBRE_COMPARATIVA_B, { exact: false }).first()).toBeVisible()

    await panel.getByLabel(`Comparar ${NOMBRE_COMPARATIVA_A}`, { exact: true }).check()
    await panel.getByLabel(`Comparar ${NOMBRE_COMPARATIVA_B}`, { exact: true }).check()

    // Ninguna tiene puente: la comparativa explica el paso que falta y no deja
    // disparar la prueba.
    await expect(panel.getByText(/vincular la computadora puente/i)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Enviar prueba a todas' })).toBeDisabled()
  })
})

// Tarjeta de impresora: el grid de tarjetas es el único con lg:grid-cols-2
// (el resumen del sistema usa lg:grid-cols-4 y también muestra nombres).
const tarjetaDe = (page, texto) => page.locator('xpath=//div[contains(@class, "lg:grid-cols-2")]/div').filter({ hasText: texto })

test.describe('impresión remota: cola con puente falso', () => {
  test('ADMIN vincula el puente y la prueba remota se confirma con el sufijo del papel', async ({ page }) => {
    const codigo = await crearPuentePorUi(page, `Puente E2E ${Date.now()}`)
    const { token, bridgeId } = await parearPuente({ api: API, code: codigo })
    const puente = crearPuenteFalso({ api: API, token })
    puente.iniciar()
    try {
      await asegurarImpresoraRemota(page, { nombre: NOMBRE_REMOTO, destino: DESTINO_REMOTO, bridgeId })
      await page.reload()
      const tarjeta = tarjetaDe(page, NOMBRE_REMOTO)
      await expect(tarjeta).toBeVisible({ timeout: 20_000 })
      await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Imprimir prueba' }).click()

      // El puente falso reclama, "imprime" y reporta; el sufijo sale del ticket.
      const trabajo = await puente.esperarTrabajo((item) => item.destination === DESTINO_REMOTO)
      expect(trabajo.sufijo).toMatch(/^\d$/)

      const detalle = await apiImpresion(page, `/api/print/jobs/${trabajo.id}`)
      expect(detalle.datos?.job?.path).toBe('REMOTO')
      expect(detalle.datos?.job?.state).toBe('ACEPTADO')

      await page.reload()
      const fila = page.getByRole('row').filter({ hasText: trabajo.validation })
      await expect(fila.getByText('aceptado')).toBeVisible({ timeout: 20_000 })

      const incorrecto = String((Number(trabajo.sufijo) + 1) % 10)
      // #138: con el código incorrecto la validación automática avisa claro.
      await fila.getByLabel(`Número secreto de la validación ${trabajo.validation}`).fill(incorrecto)
      await expect(page.getByText('No coincide', { exact: true })).toBeVisible({ timeout: 10_000 })

      // El botón Confirmar sigue como respaldo (mismo aviso al reintentar).
      await fila.getByRole('button', { name: 'Confirmar' }).click()
      await expect(page.getByText('No coincide', { exact: true })).toBeVisible({ timeout: 10_000 })

      // Al escribir el dígito correcto valida solo, sin apretar nada.
      await fila.getByLabel(`Número secreto de la validación ${trabajo.validation}`).fill(trabajo.sufijo)
      await expect(page.getByText('Confirmado en papel')).toBeVisible({ timeout: 10_000 })
      await expect(fila.getByText('✓ en papel')).toBeVisible({ timeout: 20_000 })
    } finally {
      puente.detener()
    }
  })

  test('un sufijo de varios dígitos se valida solo al completar el largo (#138)', async ({ page }) => {
    const codigo = await crearPuentePorUi(page, `Puente sufijo largo E2E ${Date.now()}`)
    const { token, bridgeId } = await parearPuente({ api: API, code: codigo })
    const impresora = await asegurarImpresoraRemota(page, { nombre: NOMBRE_REMOTO, destino: DESTINO_REMOTO, bridgeId })
    const sufijo = '1234'
    const validacion = String(Date.now()).slice(-4)
    const encolado = await apiImpresion(page, '/api/print/jobs', {
      method: 'POST',
      body: JSON.stringify({
        destination: DESTINO_REMOTO,
        printerId: impresora.id,
        payload: Buffer.from('TICKET-SUFIJO-LARGO').toString('base64'),
        kind: 'comprobante',
        reference: `E2E-SUFIJO-${Date.now()}`,
        validation: validacion,
        suffix: sufijo,
      }),
    })
    expect(encolado.status).toBe(201)
    const jobId = encolado.datos.job.id
    // El listado publica el LARGO del sufijo, nunca el valor (#138).
    expect(encolado.datos.job.suffixLength).toBe(4)
    expect(JSON.stringify(encolado.datos.job)).not.toContain(sufijo)
    // El puente reclama y reporta ACEPTADO: el trabajo queda confirmable.
    const claim = await page.request.post(`${API}/api/print/bridge/claim`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    })
    const reclamado = (await claim.json()).jobs?.find((job) => job.id === jobId)
    expect(reclamado).toBeTruthy()
    const reporte = await page.request.post(`${API}/api/print/bridge/jobs/${jobId}/result`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { leaseId: reclamado.leaseId, state: 'ACEPTADO', transport: 'directo' },
    })
    expect(reporte.ok()).toBeTruthy()

    await page.goto('/configuracion/impresoras')
    const fila = page.getByRole('row').filter({ hasText: validacion })
    await expect(fila).toBeVisible({ timeout: 20_000 })
    const entrada = fila.getByLabel(`Número secreto de la validación ${validacion}`)
    // Con el código incompleto no confirma: se espera más que el debounce.
    await entrada.fill(sufijo.slice(0, 3))
    await page.waitForTimeout(700)
    const sinConfirmar = await apiImpresion(page, `/api/print/jobs/${jobId}`)
    expect(sinConfirmar.datos?.job?.state).toBe('ACEPTADO')
    await expect(entrada).toHaveValue(sufijo.slice(0, 3))
    // Al completar el cuarto dígito valida solo y la fila pasa a confirmada
    // (el input desaparece con el código limpio).
    await entrada.fill(sufijo)
    await expect(fila.getByText('✓ en papel')).toBeVisible({ timeout: 10_000 })
    await expect(entrada).toHaveCount(0)
    const confirmado = await apiImpresion(page, `/api/print/jobs/${jobId}`)
    expect(confirmado.datos?.job?.state).toBe('CONFIRMADO')
  })

  test('sin agente local, el comprobante de un pedido se encola al puente', async ({ page }) => {
    // La máquina de turno puede tener agente instalado: se corta 127.0.0.1
    // para que el documento tenga que salir por el camino remoto.
    await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
    // El respaldo HTML llama a window.print(): se cuenta para exigir que el
    // envío remoto NO abra el diálogo solo (duplicaría el ticket).
    await page.addInitScript(() => {
      window.top.__dialogosImpresion = 0
      window.print = () => { window.top.__dialogosImpresion = Number(window.top.__dialogosImpresion || 0) + 1 }
    })
    const codigo = await crearPuentePorUi(page, `Puente comprobante E2E ${Date.now()}`)
    const { token, bridgeId } = await parearPuente({ api: API, code: codigo })
    const puente = crearPuenteFalso({ api: API, token })
    puente.iniciar()
    try {
      const impresora = await asegurarImpresoraRemota(page, { nombre: NOMBRE_REMOTO, destino: DESTINO_REMOTO, bridgeId })
      // La predeterminada de la empresa define el destino del comprobante.
      const predeterminada = await apiImpresion(page, `/api/print/printers/${impresora.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      })
      expect(predeterminada.status).toBe(200)
      await page.reload()

      await page.goto('/pedidos')
      await page.getByTestId('pedido-fila').first().click()
      await expect(page.getByText('Artículos preparados')).toBeVisible()
      await page.getByRole('button', { name: 'Imprimir comprobante' }).click()
      await page.getByRole('button', { name: 'Impresión directa' }).click()

      // El puente falso lo reclama y reporta: el trabajo queda en la cola
      // remota con su tipo, sin abrir el diálogo del navegador.
      const trabajo = await puente.esperarTrabajo((item) => item.destination === DESTINO_REMOTO)
      const detalle = await apiImpresion(page, `/api/print/jobs/${trabajo.id}`)
      expect(detalle.datos?.job?.kind).toBe('comprobante')
      expect(detalle.datos?.job?.path).toBe('REMOTO')
      expect(detalle.datos?.job?.state).toBe('ACEPTADO')
      await expect(page.getByText('Comprobante encolado al puente')).toBeVisible({ timeout: 10_000 })
      expect(await page.evaluate(() => window.__dialogosImpresion)).toBe(0)
    } finally {
      puente.detener()
    }
  })

  test('la cola del monitor cancela un pendiente y el puente no lo recibe', async ({ page }) => {
    const codigo = await crearPuentePorUi(page, `Puente cancelar E2E ${Date.now()}`)
    const { token, bridgeId } = await parearPuente({ api: API, code: codigo })
    const impresora = await asegurarImpresoraRemota(page, { nombre: NOMBRE_REMOTO, destino: DESTINO_REMOTO, bridgeId })
    const referencia = `E2E-CANCELA-${Date.now()}`
    // El puente está apagado: nadie reclama el trabajo que se encola.
    const encolado = await apiImpresion(page, '/api/print/jobs', {
      method: 'POST',
      body: JSON.stringify({
        destination: DESTINO_REMOTO,
        printerId: impresora.id,
        payload: Buffer.from('TICKET-CANCELA').toString('base64'),
        kind: 'comprobante',
        reference: referencia,
        requestedByName: 'Cancelación E2E',
      }),
    })
    expect(encolado.status).toBe(201)
    const jobId = encolado.datos.job.id
    expect(encolado.datos.job.state).toBe('PENDIENTE')

    // El monitor lo lista con tipo, referencia, usuario e impresora.
    await page.goto('/configuracion/sistema')
    const fila = page.getByRole('listitem').filter({ hasText: referencia })
    await expect(fila).toBeVisible({ timeout: 20_000 })
    await expect(fila.getByText('Comprobante', { exact: true })).toBeVisible()
    await expect(fila.getByText('Cancelación E2E')).toBeVisible()
    await expect(fila.getByText('Pendiente', { exact: true })).toBeVisible()

    // Cancelar pide confirmación y deja el trabajo cancelado en la API.
    await fila.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar trabajos' }).click()
    await expect(page.getByText(/trabajos? cancelado/i).first()).toBeVisible({ timeout: 10_000 })
    const detalle = await apiImpresion(page, `/api/print/jobs/${jobId}`)
    expect(detalle.datos?.job?.state).toBe('CANCELADO')

    // Al reconectar, el puente no recibe el trabajo cancelado.
    const claim = await page.request.post(`${API}/api/print/bridge/claim`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    })
    expect(claim.ok()).toBeTruthy()
    const claimDatos = await claim.json()
    expect((claimDatos.jobs || []).some((job) => job.id === jobId)).toBe(false)
  })

  test('el puente aparece en línea en la UI después del latido', async ({ page }) => {
    const codigo = await crearPuentePorUi(page, `Puente latido E2E ${Date.now()}`)
    const { token } = await parearPuente({ api: API, code: codigo })

    const latido = await fetch(`${API}/api/print/bridge/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ version: '1.6.0', platform: 'e2e' }),
    })
    expect(latido.ok).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: /Gestionar puentes/ }).click()
    await expect(page.getByText(/en línea/).first()).toBeVisible({ timeout: 15_000 })
  })

  test('revocar el puente corta el claim', async ({ page }) => {
    const codigo = await crearPuentePorUi(page, `Puente revocado E2E ${Date.now()}`)
    const { token, bridgeId } = await parearPuente({ api: API, code: codigo })
    const puente = crearPuenteFalso({ api: API, token })
    puente.iniciar()
    try {
      const impresora = await asegurarImpresoraRemota(page, { nombre: NOMBRE_REVOCADO, destino: DESTINO_REVOCADO, bridgeId })
      const baja = await apiImpresion(page, `/api/print/bridges/${bridgeId}`, { method: 'DELETE' })
      expect(baja.status).toBe(200)
      await expect.poll(() => puente.estado().estadoHttp, { timeout: 10_000 }).toBe(401)

      // Trabajo nuevo para el puente revocado: queda pendiente, nadie lo reclama.
      const encolado = await apiImpresion(page, '/api/print/jobs', {
        method: 'POST',
        body: JSON.stringify({ destination: DESTINO_REVOCADO, printerId: impresora.id, payload: 'TU9CT1M=', kind: 'prueba' }),
      })
      expect(encolado.status).toBe(201)
      await page.waitForTimeout(1500)
      const detalle = await apiImpresion(page, `/api/print/jobs/${encolado.datos.job.id}`)
      expect(detalle.datos?.job?.state).toBe('PENDIENTE')
      expect(puente.trabajos()).toHaveLength(0)
    } finally {
      puente.detener()
    }
  })

  test('dos sucursales: cada trabajo sale por el puente de su sucursal', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
    sembrarVentaSucursalDos()
    // Los E2E de impresión reusan la base: los puentes de esta prueba se
    // revocan antes de crear los nuevos para no agotar el tope de 20.
    const puentesViejos = await apiImpresion(page, '/api/print/bridges')
    for (const puente of puentesViejos.datos?.bridges || []) {
      if (/^Puente sucursal (A|B) E2E/.test(String(puente.name || ''))) await apiImpresion(page, `/api/print/bridges/${puente.id}`, { method: 'DELETE' })
    }

    const puenteA = await apiImpresion(page, '/api/print/bridges', {
      method: 'POST',
      body: JSON.stringify({ name: `Puente sucursal A E2E ${Date.now()}`, branchId: SEED.branchId }),
    })
    expect(puenteA.status).toBe(201)
    const puenteB = await apiImpresion(page, '/api/print/bridges', {
      method: 'POST',
      body: JSON.stringify({ name: `Puente sucursal B E2E ${Date.now()}`, branchId: SEED.branch2Id }),
    })
    expect(puenteB.status).toBe(201)
    expect(puenteA.datos.bridge.branchId).toBe(SEED.branchId)
    expect(puenteB.datos.bridge.branchId).toBe(SEED.branch2Id)

    const { token: tokenA } = await parearPuente({ api: API, code: puenteA.datos.pairingCode })
    const { token: tokenB } = await parearPuente({ api: API, code: puenteB.datos.pairingCode })
    const puenteFalsoA = crearPuenteFalso({ api: API, token: tokenA })
    const puenteFalsoB = crearPuenteFalso({ api: API, token: tokenB })
    puenteFalsoA.iniciar()
    puenteFalsoB.iniciar()
    let impresoraA = null
    let impresoraB = null
    try {
      // Impresoras de cada sucursal SIN puente explícito: el backend resuelve
      // el puente por la sucursal del trabajo.
      impresoraA = await asegurarImpresoraRemota(page, { nombre: NOMBRE_SUCURSAL_A, destino: DESTINO_SUCURSAL_A, bridgeId: null, branchId: SEED.branchId })
      impresoraB = await asegurarImpresoraRemota(page, { nombre: NOMBRE_SUCURSAL_B, destino: DESTINO_SUCURSAL_B, bridgeId: null, branchId: SEED.branch2Id })

      const encoladoA = await apiImpresion(page, '/api/print/jobs', {
        method: 'POST',
        body: JSON.stringify({ destination: DESTINO_SUCURSAL_A, printerId: impresoraA.id, branchId: SEED.branchId, payload: 'TU9CT1M=', kind: 'prueba', validation: '7001' }),
      })
      const encoladoB = await apiImpresion(page, '/api/print/jobs', {
        method: 'POST',
        body: JSON.stringify({ destination: DESTINO_SUCURSAL_B, printerId: impresoraB.id, branchId: SEED.branch2Id, payload: 'TU9CT1M=', kind: 'prueba', validation: '7002' }),
      })
      expect(encoladoA.status).toBe(201)
      expect(encoladoB.status).toBe(201)
      expect(encoladoA.datos.job.bridgeId).toBe(puenteA.datos.bridge.id)
      expect(encoladoB.datos.job.bridgeId).toBe(puenteB.datos.bridge.id)

      const trabajoA = await puenteFalsoA.esperarTrabajo((item) => item.id === encoladoA.datos.job.id)
      const trabajoB = await puenteFalsoB.esperarTrabajo((item) => item.id === encoladoB.datos.job.id)
      expect(trabajoA.printerId).toBe(impresoraA.id)
      expect(trabajoB.printerId).toBe(impresoraB.id)
      expect(puenteFalsoA.trabajos().some((item) => item.id === encoladoB.datos.job.id)).toBe(false)
      expect(puenteFalsoB.trabajos().some((item) => item.id === encoladoA.datos.job.id)).toBe(false)

      // Panel: cobertura por sucursal con ambos puentes en línea.
      for (const token of [tokenA, tokenB]) {
        const latido = await fetch(`${API}/api/print/bridge/heartbeat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ version: '1.6.0', platform: 'e2e' }),
        })
        expect(latido.ok).toBe(true)
      }
      await page.goto('/configuracion/impresoras')
      const cobertura = page.getByTestId('cobertura-sucursales')
      await expect(cobertura).toBeVisible({ timeout: 20_000 })
      await expect(cobertura.getByText(SEED.branchName, { exact: true })).toBeVisible()
      await expect(cobertura.getByText(SEED.branch2Name, { exact: true })).toBeVisible()
      await expect(cobertura.getByText('Puente en línea').first()).toBeVisible()

      // Alerta: la sucursal B tiene ventas y queda sin puente activo.
      const bajaB = await apiImpresion(page, `/api/print/bridges/${puenteB.datos.bridge.id}`, { method: 'DELETE' })
      expect(bajaB.status).toBe(200)
      await page.goto('/configuracion/impresoras')
      const alerta = page.getByTestId('alerta-sucursal-sin-puente')
      await expect(alerta).toBeVisible({ timeout: 20_000 })
      await expect(alerta).toContainText(SEED.branch2Name)
    } finally {
      puenteFalsoA.detener()
      puenteFalsoB.detener()
      // Limpieza para las corridas siguientes (la base e2e se reutiliza): las
      // impresoras de la prueba dejan de preferirse por sucursal y el puente A
      // se revoca (el B ya se revocó en el caso de la alerta).
      for (const impresora of [impresoraA, impresoraB]) {
        if (impresora) await apiImpresion(page, `/api/print/printers/${impresora.id}`, { method: 'PATCH', body: JSON.stringify({ branchId: null, bridgeId: null }) })
      }
      await apiImpresion(page, `/api/print/bridges/${puenteA.datos.bridge.id}`, { method: 'DELETE' })
    }
  })

  test('con el agente local disponible la prueba no pasa por el backend', async ({ page }) => {    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()

    let locales = 0
    let remotos = 0
    page.on('request', (peticion) => {
      if (peticion.method() === 'POST' && peticion.url().includes('/api/print/jobs')) remotos += 1
    })
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,x-mobos-print-token',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    }
    // Agente local simulado: sin round-trip por el backend.
    await page.route('http://127.0.0.1:17890/**', (ruta) => {
      const peticion = ruta.request()
      if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cors })
      if (peticion.url().includes('/health')) {
        return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.6.0', equipo: 'e2e' }) })
      }
      locales += 1
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    })

    const tarjeta = tarjetaDe(page, NOMBRE)
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })
    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Imprimir prueba' }).click()
    await expect(page.getByText('Prueba enviada por TCP')).toBeVisible({ timeout: 15_000 })
    expect(locales).toBeGreaterThan(0)
    expect(remotos).toBe(0)
  })
})

test.describe('estado vivo y popup de prueba', () => {
  test('sin agente local la impresora queda Sin verificar y el popup no pide copias', async ({ page }) => {
    // La e2e corre sin agente: se corta 127.0.0.1 para que ni una instalación
    // local de la máquina de turno pueda responder y falsear el estado.
    await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
    await page.goto('/configuracion/impresoras')
    await asegurarImpresora(page)
    await page.reload()

    const tarjeta = tarjetaDe(page, NOMBRE)
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })
    // Sin agente local no se inventa estado: el badge es Sin verificar.
    await expect(tarjeta.getByText('Sin verificar').first()).toBeVisible({ timeout: 20_000 })
    await expect(tarjeta.getByText(/Se verifica en la computadora puente|Sin agente local en esta computadora/)).toBeVisible()

    await tarjeta.getByRole('button', { name: 'Imprimir prueba' }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    // La prueba sale siempre con 1 copia: no hay campo Copias.
    await expect(dialogo.getByLabel('Copias')).toHaveCount(0)
    await expect(dialogo.getByText('Sale 1 copia', { exact: false })).toBeVisible()
    // La vista previa arranca colapsada; el toggle la muestra y la vuelve a ocultar.
    await expect(dialogo.locator('pre')).toHaveCount(0)
    await dialogo.getByRole('button', { name: 'Ver vista previa' }).click()
    await expect(dialogo.locator('pre')).toBeVisible()
    await dialogo.getByRole('button', { name: 'Ocultar vista previa' }).click()
    await expect(dialogo.locator('pre')).toHaveCount(0)
  })
})
