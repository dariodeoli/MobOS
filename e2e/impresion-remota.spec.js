// Impresión remota: el backend es la autoridad de impresoras y puentes;
// localStorage es solo caché de lectura. La cola remota se prueba de punta a
// punta con un puente falso (claim + result), sin impresora real.

import { test, expect } from '@playwright/test'
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
// existía de una corrida anterior).
async function asegurarImpresoraRemota(page, { nombre, destino, bridgeId }) {
  const lista = await apiImpresion(page, '/api/print/printers')
  const existente = (lista.datos?.printers || []).find((impresora) => impresora.destination === destino)
  if (existente) {
    if (existente.bridgeId === bridgeId) return existente
    const actualizada = await apiImpresion(page, `/api/print/printers/${existente.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bridgeId }),
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
      await fila.getByLabel(`Número secreto de la validación ${trabajo.validation}`).fill(incorrecto)
      await fila.getByRole('button', { name: 'Confirmar' }).click()
      await expect(page.getByText('No coincide', { exact: true })).toBeVisible({ timeout: 10_000 })

      await fila.getByLabel(`Número secreto de la validación ${trabajo.validation}`).fill(trabajo.sufijo)
      await fila.getByRole('button', { name: 'Confirmar' }).click()
      await expect(page.getByText('Confirmado en papel')).toBeVisible({ timeout: 10_000 })
      await expect(fila.getByText('✓ en papel')).toBeVisible({ timeout: 20_000 })
    } finally {
      puente.detener()
    }
  })

  test('sin agente local, el comprobante de un pedido se encola al puente', async ({ page }) => {
    // La máquina de turno puede tener agente instalado: se corta 127.0.0.1
    // para que el documento tenga que salir por el camino remoto.
    await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
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

      await page.goto('/pos/pedidos')
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
    } finally {
      puente.detener()
    }
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

  test('con el agente local disponible la prueba no pasa por el backend', async ({ page }) => {
    await page.goto('/configuracion/impresoras')
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
