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


for (const dark of [false, true]) for (const width of [360, 390, 768, 1280]) {
  test(`#396 compras: controles y contenido a ${width}px ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
    await entrar(page, { width, height: 900 })
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
    for (const destino of ['Por comprar', 'Preparar compra', 'Compras del Centro', 'Recepción']) {
      await openShellDestination(page, destino)
      const fila = { 'Por comprar': 'por-comprar-fila', 'Preparar compra': 'preparar-compra-fila', 'Compras del Centro': 'compra-centro-fila', 'Recepción': 'recepcion-llegada' }[destino]
      await expect(page.getByTestId(fila).first()).toBeVisible()
      expect(await sinScrollHorizontal(page), destino).toBe(true)
      const recorrido = page.getByTestId('recorrido-abastecimiento')
      if (await recorrido.count()) {
        await expect.poll(() => recorrido.evaluate(nav => {
          const activo = nav.querySelector('[aria-current="step"]').getBoundingClientRect()
          const marco = nav.getBoundingClientRect()
          return activo.left >= marco.left - 1 && activo.right <= marco.right + 1
        }), { message: `${destino}: paso actual visible` }).toBe(true)
      }
      const medidas = await page.locator('main').last().evaluate(main => {
        const controles = [...main.querySelectorAll('button,input,select')].filter(el => el.getClientRects().length && !el.disabled)
        return controles.flatMap(el => {
          const target = el.type === 'checkbox' || el.type === 'radio' ? el.closest('label') || el : el
          const rect = target.getBoundingClientRect()
          return rect.width < 43.5 || rect.height < 43.5 ? [{ control: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30), width: rect.width, height: rect.height }] : []
        })
      })
      expect(medidas, `${destino}: objetivos táctiles44px`).toEqual([])
    }
  })
}

test('#396 Por comprar: filtros móviles en hoja, conserva selección y cierra con Esc', async ({ page }) => {
  await entrar(page, { width: 360, height: 800 })
  await openShellDestination(page, 'Por comprar')
  await expect(page.getByTestId('por-comprar-fila').first()).toBeVisible()
  await expect(page.getByLabel('Prioridad', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const hoja = page.getByRole('dialog', { name: 'Filtros de compras' })
  await hoja.getByLabel('Prioridad', { exact: true }).selectOption('ALTA')
  await page.keyboard.press('Escape')
  await expect(hoja).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Filtros/ })).toContainText('1')
  await page.getByRole('button', { name: /^Filtros/ }).click()
  await expect(hoja.getByLabel('Prioridad', { exact: true })).toHaveValue('ALTA')
})


test('#450 cámara continua: QR de prueba rechazado y siguiente IMEI visible sin reabrir cámara', async ({ page }) => {
  await entrar(page)
  await openShellDestination(page, 'Preparar compra')
  const compra = page.getByTestId('preparar-compra-fila').filter({ hasText: 'CMP-AUR-0001' })
  await compra.getByRole('button', { name: 'Preparar IMEI' }).click()
  await page.evaluate(() => {
    window.lecturasCamaraQA = []
    window.iniciosCamaraQA = 0
    window.BarcodeDetector = class { async detect() { const rawValue = window.lecturasCamaraQA.shift(); return rawValue ? [{ rawValue }] : [] } }
    navigator.mediaDevices.getUserMedia = async () => { window.iniciosCamaraQA++; return new MediaStream() }
    HTMLMediaElement.prototype.play = async () => {}
  })
  const antes = await page.getByTestId('escaneo-serial').count()
  await page.getByTestId('preparar-compra-camara').click()
  await expect(page.getByText('Escaneá cada equipo, uno tras otro. Se registran solos.')).toBeVisible()
  const inicios = await page.evaluate(() => window.iniciosCamaraQA)
  expect(inicios).toBeGreaterThan(0)
  await page.evaluate(valor => window.lecturasCamaraQA.push(valor), PRUEBA)
  await expect(page.getByTestId('preparar-compra-estado-texto')).toContainText('hoja de prueba de la impresora')
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes)
  const imei = imeiDemo(751)
  await page.evaluate(valor => window.lecturasCamaraQA.push(valor), imei)
  await expect(page.getByTestId('preparar-compra-estado-texto')).toContainText(`IMEI ${imei} agregado`)
  await expect(page.getByTestId('escaneo-serial').filter({ hasText: imei })).toBeVisible()
  await expect(page.getByTestId('escaneo-serial')).toHaveCount(antes + 1)
  expect(await page.evaluate(() => window.iniciosCamaraQA)).toBe(inicios)
})
