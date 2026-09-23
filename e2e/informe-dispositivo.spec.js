// Informe de dispositivo imprimible (#240, épica PhoneCheck): desde la ficha de
// la unidad sale DIRECTO por el agente (sin diálogo) un informe con el equipo,
// la verificación IMEI (INV), la inspección física, la garantía de la tienda y
// el QR al informe público (`/u/<serial>`). El respaldo (sin agente) abre el
// mismo informe en 80 mm o A4 para «Guardar como PDF».
//
// El agente local se simula (como en el resto de los e2e de impresión):
// /health dice presente y /print guarda el cuerpo que mandó la app.

import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const SALIDA = 'test-results/qa-240-informe-dispositivo'
mkdirSync(SALIDA, { recursive: true })

// IMEI ficticio con checksum Luhn válido, único por corrida (misma receta que
// imei-mock.spec.js): el informe lo usa como serial de la unidad.
function imeiValido() {
  const base = `35${String(Date.now()).slice(-11)}${Math.floor(Math.random() * 10)}`.slice(0, 14)
  let suma = 0
  for (let i = 0; i < 14; i += 1) { let digito = Number(base[13 - i]); if (i % 2 === 0) { digito *= 2; if (digito > 9) digito -= 9 } suma += digito }
  return base + String((10 - (suma % 10)) % 10)
}

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
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.7.2', equipo: 'e2e' }) })
    }
    if (peticion.method() === 'POST' && peticion.url().endsWith('/print')) {
      capturados.push(JSON.parse(peticion.postData() || '{}'))
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    }
    return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
  })
}

const textoDelTicket = (capturado) => Buffer.from(String(capturado?.data || ''), 'base64').toString('latin1')

// Producto + unidad con el IMEI como serial; la consulta de IMEI (mock) queda
// registrada y el informe la toma como la verificación vigente (#193 · INV).
async function sembrarUnidadConConsulta(page, { marca, imei, branchId = 'e2e-branch-1' }) {
  const consulta = await apiPagina(page, '/api/imei', {
    method: 'POST',
    body: JSON.stringify({ action: 'checks', imei, servicio: 'APPLE_BASIC', confirm: true, requestId: `qa-240-${marca}` }),
  })
  expect(consulta.status, JSON.stringify(consulta.datos)).toBe(201)
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `E2E-INF-${marca}`, name: `Equipo informe ${marca}`, model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio', pricePyg: 100000, stock: 0, branchId }),
  })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  const unidad = await apiPagina(page, '/api/inventory-units', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.datos.id, branchId, serial: imei }),
  })
  expect(unidad.status, JSON.stringify(unidad.datos)).toBe(201)
}

async function abrirDocumento(page, imei, { titulo = 'Informe del dispositivo', boton = 'Informe' } = {}) {
  await page.reload()
  await page.getByLabel('Buscar en inventario').fill(imei)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: imei }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  await fila.click()
  await page.getByRole('dialog').getByRole('button', { name: boton, exact: true }).click()
  const modal = page.getByRole('dialog').filter({ hasText: titulo })
  return { fila, modal }
}

const abrirInforme = (page, imei) => abrirDocumento(page, imei)

test('el informe de la unidad sale directo por el agente con el QR al informe público', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const imei = imeiValido()
  await page.goto('/inventario/unidades')
  await sembrarUnidadConConsulta(page, { marca, imei })

  const { modal } = await abrirInforme(page, imei)
  // La vista previa (80 mm por defecto) trae el IMEI enmascarado y el QR.
  const vista = page.frameLocator('iframe[title="Vista previa del documento"]')
  await expect(vista.locator('h1')).toHaveText('Informe de dispositivo', { timeout: 15_000 })
  const filaImei = vista.locator('.fila-informe').filter({ hasText: 'IMEI' }).first()
  await expect(filaImei).toContainText(imei.slice(-4))
  await expect(filaImei).not.toContainText(imei)
  await expect(vista.locator('img.qr')).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/01-vista-previa-80.jpg` })

  await modal.getByRole('button', { name: 'Impresión directa' }).click()
  await expect(page.getByText('Informe enviado a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('informe-dispositivo')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('INFORME DE DISPOSITIVO')
  expect(texto).toContain('Equipo')
  expect(texto).toContain('iPhone 15 Pro')
  // La fila del IMEI va enmascarada (solo los últimos 4).
  const lineaDelImei = texto.split('\n').find((linea) => linea.trim().startsWith('IMEI')) || ''
  expect(lineaDelImei.trim()).not.toContain(imei)
  expect(lineaDelImei).toContain(imei.slice(-4))
  // Verificación IMEI (mock #193) e inspección física (INV: sin grado todavía).
  expect(texto).toContain('Blacklist actual')
  expect(texto).toContain('Sin reportes actuales')
  expect(texto).toContain('Sin grado asignado')
  expect(texto).toContain('Garant')
  // El QR y el enlace al informe público de la unidad.
  expect(texto).toContain('INFORME DEL DISPOSITIVO')
  expect(texto).toContain(`/u/${imei}`)
  expect(texto).toContain('Documento informativo')
  // Sin diálogo: la impresión directa no crea el iframe del respaldo.
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
  await page.screenshot({ path: `${SALIDA}/02-impreso-directo.jpg` })
})

test('sin agente, el informe A4 queda listo para «Guardar como PDF»', async ({ page }) => {
  await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
  await page.route('**/api/print/printers', (ruta) => ruta.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ printers: [], bridges: [], remoteEnabled: true }),
  }))
  const marca = Date.now()
  const imei = imeiValido()
  await page.goto('/inventario/unidades')
  await sembrarUnidadConConsulta(page, { marca, imei })

  const { modal } = await abrirInforme(page, imei)
  await modal.getByLabel('Formato del documento').selectOption('a4')
  const vista = page.frameLocator('iframe[title="Vista previa del documento"]')
  await expect(vista.locator('h1')).toHaveText('Informe de dispositivo', { timeout: 15_000 })
  await expect(vista.locator('body')).toContainText('Verificación IMEI')
  await expect(vista.locator('body')).toContainText('Blacklist actual')
  await expect(vista.locator('img.qr')).toBeVisible()

  await modal.getByRole('button', { name: 'Descargar PDF' }).click()
  // El respaldo abre el HTML imprimible en un iframe oculto (sin ventanas).
  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 10_000 })
  const contenido = marco.contentFrame()
  await expect(contenido.locator('h1')).toHaveText('Informe de dispositivo')
  const filaImei = contenido.locator('.fila-informe').filter({ hasText: 'IMEI' }).first()
  await expect(filaImei).toContainText(imei.slice(-4))
  await expect(filaImei).not.toContainText(imei)
  await page.screenshot({ path: `${SALIDA}/03-respaldo-iframe.jpg` })

  // Mismo HTML que la app manda a «Guardar como PDF», en A4 y en 80 mm.
  const html = await contenido.locator('html').evaluate((el) => el.outerHTML)
  const hoja = await page.context().newPage()
  await hoja.emulateMedia({ media: 'print' })
  await hoja.setContent(html, { waitUntil: 'load' })
  await hoja.waitForTimeout(250)
  await hoja.pdf({ path: `${SALIDA}/informe-a4.pdf`, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
  await hoja.screenshot({ path: `${SALIDA}/04-informe-a4.jpg`, type: 'jpeg', quality: 75, fullPage: true })
  await hoja.close()
})

// El certificado de inspección (#240) sale por el mismo camino que el informe:
// directo por el agente y con el QR al informe público. Sin inspección guardada
// (la base del arnés todavía no tiene la columna de INV) sale «pendiente» y
// honesto en vez de inventar un grado.
test('el certificado de inspección sale directo y sin inventar la inspección', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const imei = imeiValido()
  await page.goto('/inventario/unidades')
  await sembrarUnidadConConsulta(page, { marca, imei })

  const { modal } = await abrirDocumento(page, imei, { titulo: 'Certificado de inspección', boton: 'Certificado' })
  const vista = page.frameLocator('iframe[title="Vista previa del documento"]')
  await expect(vista.locator('h1')).toHaveText('Certificado de inspección', { timeout: 15_000 })
  await expect(vista.locator('body')).toContainText('Pendiente de inspección')
  await expect(vista.locator('body')).toContainText('iCloud/US Block clean no equivalen a blacklist mundial.')
  const serialVisible = vista.locator('.fila-informe').filter({ hasText: 'Serial' }).first()
  await expect(serialVisible).toContainText(imei.slice(-4))
  await expect(serialVisible).not.toContainText(imei)
  await page.screenshot({ path: `${SALIDA}/05-certificado-preview.jpg` })

  await modal.getByRole('button', { name: 'Impresión directa' }).click()
  await expect(page.getByText('Certificado enviado a la impresora.')).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('certificado-phonecheck')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('CERTIFICADO DE INSPECCI')
  expect(texto).toContain('Pendiente de inspecci')
  // El QR y el código de barras llevan al informe público de la unidad.
  expect(texto).toContain(`/u/${imei}`)
  // Los rótulos del QR y del código interno viajan en CP850 (sin acentos al comparar).
  expect(texto).toContain('INFORME P')
  expect(texto).toContain('DIGO INTERNO')
  expect(texto).toContain('CERT|')
  const lineaSerial = texto.split('\n').find((linea) => linea.trim().startsWith('Serial')) || ''
  expect(lineaSerial).not.toContain(imei)
  expect(lineaSerial).toContain(imei.slice(-4))
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
  await page.screenshot({ path: `${SALIDA}/06-certificado-impreso.jpg` })
})

// Hoja de estación en serie (#240 §4): desde el taller, «Imprimir en serie» →
// «Hoja de estación» deja la lista A4 del carril (el HTML imprimible, con los
// equipos y la firma/control). En el demo la impresión se bloquea con un aviso
// honesto; acá se verifica el camino real en el arnés.
test('la hoja de estación sale del taller con los equipos del carril', async ({ page }) => {
  const marca = Date.now()
  const imei = imeiValido()
  await page.goto('/inventario/unidades')
  await sembrarUnidadConConsulta(page, { marca, imei })

  await page.goto('/inventario/taller', { waitUntil: 'domcontentloaded' })
  const equipo = page.getByTestId('rack-equipo').filter({ hasText: imei })
  await expect(equipo).toBeVisible({ timeout: 20_000 })
  await page.getByLabel(`Seleccionar ${imei}`).check()
  await page.getByTestId('rack-imprimir-serie').click()
  await page.getByTestId('rack-hoja-estacion').click()

  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 10_000 })
  const contenido = marco.contentFrame()
  await expect(contenido.locator('h1')).toHaveText('Equipos en preparación')
  const texto = await contenido.locator('body').innerText()
  expect(texto).toContain('Hoja de estación')
  expect(texto).toContain(imei)
  expect(texto).toContain('Firma / control')
  expect(texto).toContain('Marcá cada uno al verificarlo')
  await page.screenshot({ path: `${SALIDA}/07-hoja-estacion.jpg`, type: 'jpeg', quality: 75 })

  // Impresión A4: el mismo HTML que manda la app, en una hoja y sin cortes.
  const html = await contenido.locator('html').evaluate((el) => el.outerHTML)
  const hoja = await page.context().newPage()
  await hoja.emulateMedia({ media: 'print' })
  await hoja.setContent(html, { waitUntil: 'load' })
  await hoja.waitForTimeout(250)
  const ruta = `${SALIDA}/hoja-estacion-a4.pdf`
  await hoja.pdf({ path: ruta, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } })
  await hoja.screenshot({ path: `${SALIDA}/08-hoja-estacion-a4.jpg`, type: 'jpeg', quality: 75, fullPage: true })
  await hoja.close()
  const pdf = readFileSync(ruta).toString('latin1')
  expect(pdf.split('/Type /Page').length - pdf.split('/Type /Pages').length).toBe(1)
  expect(pdf.length).toBeGreaterThan(1000)
})
