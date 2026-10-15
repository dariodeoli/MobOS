import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { imeiDemo } from '../../src/lib/demo/iphones.js'

// #450: el circuito de compras en la demo (frontend-only, sin backend).
// Escanear un IMEI da confirmación visible, el QR de la hoja de prueba no es un
// IMEI, la lista se puede corregir, el detalle de la compra muestra los IMEI con
// su estado y Recepción lleva a Preparar compra con las mismas unidades.
const PRUEBA = 'https://app.moboss.online/prueba?d=CUPS:ZKP8008&v=6671&f=2026-10-14'
const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

async function entrar(page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport)
  await page.route('**/api/**', (route) =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, (route) => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function escanear(page, valor) {
  const campo = page.getByLabel('IMEI a escanear')
  await campo.fill(valor)
  await campo.press('Enter')
}

test('Preparar compra: cada lectura se confirma, el QR ajeno se explica y la lista se corrige', async ({ page }) => {
  await entrar(page)
  await openShellDestination(page, 'Preparar compra')
  await expect(page.getByTestId('preparar-compra')).toBeVisible()

  // Descripción de una línea + «?» con antes/después/ejemplo + recorrido.
  await expect(page.getByTestId('flujo-linea')).toContainText('Cargá el IMEI de cada equipo comprado')
  await expect(page.getByTestId('recorrido-abastecimiento')).toContainText('Recepción')
  await page.getByTestId('flujo-ayuda').click()
  await expect(page.getByTestId('flujo-detalle')).toContainText('Ejemplo')
  await page.keyboard.press('Escape')

  // La demo trae compras en curso, con IMEI cargados y pendientes.
  const fila = page.getByTestId('preparar-compra-fila').filter({ hasText: 'CMP-AUR-0001' })
  await expect(fila).toBeVisible()
  await fila.getByRole('button', { name: 'Preparar IMEI' }).click()
  const antes = await page.getByTestId('escaneo-serial').count()
  expect(antes).toBeGreaterThanOrEqual(3)

  // IMEI nuevo: franja de estado, fila resaltada y contador.
  const imei = imeiDemo(701)
  await escanear(page, imei)
  const estado = page.getByTestId('preparar-compra-estado-texto')
  await expect(estado).toContainText(`IMEI ${imei} agregado (${antes + 1}/8)`)
  await expect(page.getByTestId('escaneo-serial').filter({ hasText: imei })).toBeVisible()
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)

  // Repetido: «ya cargado», sin sumar otra vez.
  await escanear(page, imei)
  await expect(estado).toContainText(`IMEI ${imei} ya cargado`)
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)

  // El QR de la hoja de prueba de la impresora no es un IMEI.
  await escanear(page, PRUEBA)
  await expect(estado).toContainText('hoja de prueba de la impresora')
  await escanear(page, 'https://example.com/promo?x=1')
  await expect(estado).toContainText('Ese código no es un IMEI ni un producto')
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)

  // Luhn inválido: avisa y permite cargarlo igual.
  const base = imeiDemo(702)
  const roto = `${base.slice(0, 14)}${(Number(base[14]) + 1) % 10}`
  await escanear(page, roto)
  await expect(estado).toContainText('dígito verificador')
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)
  await page.getByRole('button', { name: 'Cargar igual' }).click()
  await expect(estado).toContainText(`IMEI ${roto} agregado`)
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 2)

  // Serial manual corto: la validación de mínimo 4 sigue para lo escrito a mano.
  await escanear(page, 'AB')
  await expect(estado).toContainText('Formato inválido (mínimo 4')

  // Quitar uno desde la lista.
  await page.getByRole('button', { name: `Quitar ${roto}` }).click()
  await expect(estado).toContainText(`IMEI ${roto} quitado`)
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)
})

test('Compras del Centro muestra los IMEI de cada línea con su estado y buscador', async ({ page }) => {
  await entrar(page)
  await openShellDestination(page, 'Compras del Centro')
  await expect(page.getByTestId('flujo-linea')).toContainText('Todo lo comprado')
  const compra = page.getByTestId('compra-centro-fila').filter({ hasText: 'CMP-AUR-0004' })
  await compra.getByRole('button', { name: 'Ver líneas' }).click()
  const seriales = compra.getByTestId('serial-compra')
  await expect(seriales).toHaveCount(2)
  await expect(compra.getByText('Verificado')).toBeVisible()
  await expect(compra.getByText('Pendiente').first()).toBeVisible()
  const primero = (await seriales.first().locator('span').first().innerText()).trim()
  await compra.getByLabel('Buscar IMEI en esta línea').fill(primero.slice(-6))
  await expect(seriales).toHaveCount(1)
  await expect(compra.getByRole('button', { name: 'Cargar IMEI pendientes' })).toBeVisible()
})

test('Recepción: el aviso de IMEI por completar lleva a Preparar compra con esas mismas unidades', async ({ page }) => {
  await entrar(page)
  await openShellDestination(page, 'Recepción')
  const llegada = page.getByTestId('recepcion-llegada').filter({ hasText: 'LOTE-AUR-0002' })
  await llegada.getByRole('button', { name: /Recibir|Retomar/ }).click()
  const aviso = page.getByText(/unidad\(es\) con IMEI por completar: para recibir todo el lote/)
  await expect(aviso).toBeVisible()
  const pendientes = Number((await aviso.innerText()).match(/(\d+) unidad/)[1])
  expect(pendientes).toBeGreaterThan(0)

  await page.getByTestId('recepcion-ir-preparar').click()
  await expect(page.getByTestId('preparar-compra-filtro')).toContainText('CMP-AUR-0001')
  const fila = page.getByTestId('preparar-compra-fila')
  await expect(fila).toHaveCount(1)
  await expect(fila).toContainText(`${pendientes} IMEI pendiente`)
  // Escanear ahí baja el contador que muestra Recepción (misma fuente).
  await escanear(page, imeiDemo(703))
  await expect(fila).toContainText(`${pendientes - 1} IMEI pendiente`)
})

test('mobile 390: Preparar compra sin scroll horizontal y con objetivos de 44 px', async ({ page }) => {
  await entrar(page, { width: 390, height: 844 })
  await openShellDestination(page, 'Preparar compra')
  const fila = page.getByTestId('preparar-compra-fila').first()
  await fila.getByRole('button', { name: 'Preparar IMEI' }).click()
  await expect(page.getByTestId('preparar-compra-panel')).toBeVisible()
  expect(await sinScrollHorizontal(page)).toBe(true)
  for (const nombre of ['Cargar', 'Cámara', 'Pegar varios']) {
    const caja = await page.getByTestId('preparar-compra-panel').getByRole('button', { name: nombre, exact: true }).boundingBox()
    expect(caja.height, nombre).toBeGreaterThanOrEqual(43.5)
  }
  const campo = await page.getByLabel('IMEI a escanear').boundingBox()
  expect(campo.height).toBeGreaterThanOrEqual(43.5)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByTestId('preparar-compra-estado')).toBeVisible()
  expect(await sinScrollHorizontal(page)).toBe(true)
})
