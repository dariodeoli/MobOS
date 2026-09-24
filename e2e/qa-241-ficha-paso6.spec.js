// #241 paso 6 (F3) · Ficha de unidad completa v2: checklist persistido, **grado
// oficial** (el que quedó guardado, con fecha y autor) y **chips de locks
// reales** con fuente y hora (de la última consulta IMEI guardada del serial).
//
// Autosuficiente: crea su producto y su unidad con un IMEI Luhn válido, corre la
// consulta contra el adaptador simulado del arnés y limpia al terminar. Las
// capturas claro/oscuro en 390/1280 con el flag `preview v2` van a
// docs/rediseno/ (o test-results si el release no lo pide).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SHELL, auditarContraste, informar } from './helpers/contraste.js'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/rediseno'
const marca = () => `P6${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
const MINIMO_ITEM = 10

// IMEI ficticio con checksum Luhn válido (mismo criterio que imei-mock.spec.js).
function imeiValido() {
  const base = `35${String(Date.now()).slice(-11)}${Math.floor(Math.random() * 10)}`.slice(0, 14)
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
}

// Crea el producto y una unidad propia (con IMEI válido) para no depender del seed.
async function preparar(page, clave) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, branchId, clave, imei }) => {
    const pedir = async (ruta, opciones = {}) => {
      const respuesta = await fetch(`${api}/api/${ruta}`, {
        credentials: 'include',
        headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
        ...opciones,
      })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) throw new Error(`${ruta}: ${datos?.message || respuesta.status}`)
      return datos
    }
    const ubicaciones = await pedir(`stock-locations?branchId=${encodeURIComponent(branchId)}`)
    let ubicacion = (Array.isArray(ubicaciones) ? ubicaciones : []).find((item) => item.name === 'Piso de venta QA')
    if (!ubicacion) ubicacion = await pedir('stock-locations', { method: 'POST', body: JSON.stringify({ branchId, name: 'Piso de venta QA' }) })
    const producto = await pedir('products', { method: 'POST', body: JSON.stringify({ sku: `ZZ-P6-${clave}`, name: `iPhone Ficha v2 ${clave} · 256 GB`, category: 'Celulares', pricePyg: 3000000, costPyg: 2200000, stock: 0, branchId }) })
    const unidad = await pedir('inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.id, branchId, locationId: ubicacion.id, serial: imei, condition: 'USED', batteryHealth: 87 }) })
    return { productId: producto.id, unidadId: unidad.id, serial: unidad.serial }
  }, { api: API, branchId: SEED.branchId, clave, imei: imeiValido() })
}

async function limpiar(page, datos) {
  try {
    await page.evaluate(async ({ api, datos }) => {
      await fetch(`${api}/api/inventory-units`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: datos.unidadId, action: 'remove', reason: 'Limpieza del spec de QA' }) }).catch(() => {})
      await fetch(`${api}/api/products?id=${encodeURIComponent(datos.productId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }, { api: API, datos })
  } catch { /* limpieza best-effort */ }
}

// Deja una consulta IMEI real guardada del serial (adaptador simulado del arnés).
async function consultarImei(page, serial) {
  await page.goto('/inventario/unidades')
  return page.evaluate(async ({ api, serial }) => {
    const pedir = async (cuerpo) => fetch(`${api}/api/imei`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(async (r) => ({ status: r.status, datos: await r.json().catch(() => null) }))
    const precheck = await pedir({ action: 'precheck', imei: serial, servicio: 'APPLE_BASIC' })
    const chequeo = await pedir({ action: 'checks', imei: serial, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-241-p6-${Date.now()}` })
    return { precheck: precheck.status, chequeo: chequeo.status, campos: (chequeo.datos?.normalized || chequeo.datos?.campos || []).length, respuesta: chequeo.datos }
  }, { api: API, serial })
}

async function abrirFicha(page, serial) {
  await page.goto('/inventario/unidades')
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.locator('span[title^="Categoría:"]').click()
  const ficha = page.getByRole('dialog')
  await expect(ficha).toBeVisible({ timeout: 20_000 })
  await expect(ficha.getByTestId('unidad-phonecheck')).toBeVisible({ timeout: 20_000 })
  return ficha
}

async function marcarTodoBien(ficha) {
  const checklist = ficha.getByTestId('unidad-phonecheck')
  const bienes = checklist.getByRole('button', { name: 'Bien', exact: true })
  const total = await bienes.count()
  expect(total, 'el checklist tiene sus ítems').toBeGreaterThanOrEqual(MINIMO_ITEM)
  for (let i = 0; i < total; i += 1) await bienes.nth(i).click()
  return { checklist, total }
}

test('la ficha muestra el checklist persistido, el grado oficial y los locks con fuente (#241 paso 6)', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    const consulta = await consultarImei(page, datos.serial)
    expect(consulta.precheck).toBe(200)
    expect(consulta.chequeo).toBe(201)
    expect(consulta.campos, 'la consulta deja campos normalizados').toBeGreaterThan(0)

    const ficha = await abrirFicha(page, datos.serial)
    // Arranca sin inspección oficial y con el checklist pendiente.
    await expect(ficha.getByTestId('unidad-phonecheck-oficial')).toHaveCount(0)
    await expect(ficha.getByTestId('unidad-phonecheck-progreso')).toContainText('0 de')

    // Chips de locks reales con fuente y hora (última consulta guardada del serial).
    const locks = ficha.getByTestId('unidad-locks')
    await expect(locks).toBeVisible()
    const fuente = locks.getByTestId('unidad-locks-fuente')
    await expect(fuente).toContainText('Apple Basic')
    await expect(fuente).toContainText(/\d{1,2}\/\d{1,2}\/\d{2,4}/)
    await expect(fuente).toContainText('última consulta guardada del serial')
    expect(await locks.locator('span').count(), 'hay chips de locks').toBeGreaterThan(0)

    // Se completa el checklist y se guarda.
    const { checklist, total } = await marcarTodoBien(ficha)
    await expect(ficha.getByTestId('unidad-phonecheck-sin-guardar')).toBeVisible()
    await expect(ficha.getByTestId('unidad-phonecheck-progreso')).toContainText(`${total} de ${total} con resultado`)
    const listado = page.waitForResponse((respuesta) => respuesta.request().method() === 'GET' && new URL(respuesta.url()).pathname.endsWith('/api/inventory-units'), { timeout: 15_000 })
    await checklist.getByTestId('unidad-phonecheck-guardar').click()
    await expect(page.getByText('Inspección guardada.')).toBeVisible({ timeout: 15_000 })
    await listado

    // Grado oficial con su fecha y autor, y el estado de guardado.
    const oficial = ficha.getByTestId('unidad-phonecheck-oficial')
    await expect(oficial).toContainText('Grado A')
    await expect(oficial).toContainText('oficial')
    await expect(ficha.getByTestId('unidad-phonecheck-guardado')).toBeVisible()
    await expect(ficha.getByTestId('unidad-phonecheck-sin-guardar')).toHaveCount(0)
    await expect(checklist).toContainText(/\d+\/100 · guardado el \d{1,2}\/\d{1,2}\/\d{2,4}, \d{2}:\d{2} por /)

    // Al recargar y reabrir, el estado del checklist y el grado salen de lo persistido.
    const ficha2 = await abrirFicha(page, datos.serial)
    await expect(ficha2.getByTestId('unidad-phonecheck-oficial')).toContainText('Grado A')
    await expect(ficha2.getByTestId('unidad-phonecheck-guardado')).toBeVisible()
    await expect(ficha2.getByTestId('unidad-phonecheck').getByRole('button', { name: 'Bien', exact: true }).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(ficha2.getByTestId('unidad-locks-fuente')).toContainText('Apple Basic')
  } finally { await limpiar(page, datos) }
})

test('la ficha v2 cumple AA y queda capturada en claro/oscuro 1280 y 390 (#241 paso 6)', async ({ page }) => {
  const datos = await preparar(page, marca())
  try {
    await consultarImei(page, datos.serial)
    mkdirSync(SHOTS, { recursive: true })
    for (const [tema, modo] of [['claro', 'light'], ['oscuro', 'dark']]) {
      for (const [vista, ancho, alto] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
        await page.setViewportSize({ width: ancho, height: alto })
        // Flag `preview v2` + tema, por dispositivo (el default no cambia).
        await page.addInitScript(({ modo, v2 }) => {
          try { localStorage.setItem('mobos:theme', modo); localStorage.setItem('mobos:tema-v2', v2 ? '1' : '0') } catch { /* sin storage */ }
        }, { modo, v2: true })
        const ficha = await abrirFicha(page, datos.serial)
        await expect(page.locator('.tema-v2').first()).toBeVisible({ timeout: 30_000 })
        const { checklist } = await marcarTodoBien(ficha)
        const listado = page.waitForResponse((respuesta) => respuesta.request().method() === 'GET' && new URL(respuesta.url()).pathname.endsWith('/api/inventory-units'), { timeout: 15_000 })
        await checklist.getByTestId('unidad-phonecheck-guardar').click()
        await expect(page.getByText('Inspección guardada.')).toBeVisible({ timeout: 15_000 })
        await listado
        await expect(ficha.getByTestId('unidad-phonecheck-oficial')).toContainText('Grado A')
        await expect(ficha.getByTestId('unidad-locks')).toBeVisible()
        // La captura muestra el encabezado del PhoneCheck: grado oficial, fecha y autor.
        await ficha.getByTestId('unidad-phonecheck-oficial').scrollIntoViewIfNeeded()
        const medicion = await auditarContraste(page, SHELL, ['.tema-v2'])
        informar(`ficha-p6-on-${vista}-${tema}`, medicion)
        await page.screenshot({ path: `${SHOTS}/c241f3p6-ficha-on-${tema}-${vista}.png` })
        expect(medicion.bajos, `AA del shell en la ficha (${vista} ${tema})`).toEqual([])
      }
    }
  } finally { await limpiar(page, datos) }
})
