import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #400 (unidad I): la ficha de unidad se arma como una página de detalle tipo
// Shopify: encabezado compacto (chips + IMEI con copiar), columna principal con
// tarjetas y columna derecha (≤340 px) con Ubicación, Proveedor, Garantía e
// Interno. En celular, una sola columna. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-ficha'
const REPORT = process.env.MOBOS_QA_REPORT === '1'

async function abrirFicha(page, { role, width, height = 900 }) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.setViewportSize({ width, height })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Unidades')
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  const filas = page.getByTestId(width < 768 ? 'inventario-tarjeta-movil' : 'inventario-fila')
  await filas.first().click()
  const ficha = page.getByTestId('unidad-ficha')
  await expect(ficha).toBeVisible()
  return { dialog: page.getByRole('dialog').first(), ficha }
}

const caja = locator => locator.evaluate(el => el.getBoundingClientRect().toJSON())

test.describe('ficha de unidad (#400)', () => {
  test('1440: dos columnas, encabezado con IMEI y copiar, código interno solo en «Interno»', async ({ page }) => {
    const { dialog, ficha } = await abrirFicha(page, { role: 'Dueño', width: 1440 })
    const principal = await caja(ficha.getByTestId('unidad-principal'))
    const lateral = await caja(ficha.getByTestId('unidad-lateral'))
    expect(lateral.left, 'la columna derecha va a la derecha').toBeGreaterThan(principal.right - 1)
    expect(lateral.width, 'columna derecha ≤340px').toBeLessThanOrEqual(341)
    expect(Math.abs(lateral.top - principal.top), 'ambas columnas arrancan a la misma altura').toBeLessThanOrEqual(2)

    // Encabezado: chips de condición, estado y ubicación (sigla) + IMEI con copiar.
    const encabezado = ficha.getByTestId('unidad-encabezado')
    await expect(encabezado.getByTestId('unidad-condicion')).toBeVisible()
    await expect(encabezado.getByTestId('unidad-estado')).toBeVisible()
    await expect(encabezado.getByTestId('unidad-ubicacion-chip')).toBeVisible()
    const imei = (await encabezado.getByTestId('unidad-imei').innerText()).trim()
    expect(imei.length).toBeGreaterThan(6)
    await expect(encabezado.getByRole('button', { name: 'Copiar IMEI/serial' })).toBeVisible()
    // El título de la ventana es el modelo, no el código del equipo.
    await expect(dialog.getByRole('heading').first()).not.toHaveText(imei)

    // El código interno (MOV-0001) vive solo en el bloque Interno.
    const interno = ficha.getByTestId('unidad-interno')
    await expect(interno.getByTestId('unidad-codigo-interno')).toHaveText(/^MOV-\d{4,}$/)
    await expect(ficha.getByText(/MOV-\d{4,}/)).toHaveCount(1)
    await expect(encabezado.getByText(/MOV-\d{4,}/)).toHaveCount(0)
    // «Interno» queda al pie de la columna derecha.
    const cajaInterno = await caja(interno)
    const cajasLaterales = await ficha.getByTestId('unidad-lateral').locator('> section').evaluateAll(es => es.map(e => e.getBoundingClientRect().bottom))
    expect(cajaInterno.bottom).toBeGreaterThanOrEqual(Math.max(...cajasLaterales) - 1)

    // Consignación de terceros plegada por defecto.
    await expect(ficha.getByTestId('unidad-consignacion')).not.toHaveAttribute('open', '')
    // Sin scroll horizontal dentro de la ventana.
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false)
    if (REPORT) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/ficha-1440.png` }) }
  })

  test('390: una sola columna, sin scroll horizontal y con acciones de 44px', async ({ page }) => {
    const { dialog, ficha } = await abrirFicha(page, { role: 'Dueño', width: 390, height: 844 })
    const principal = await caja(ficha.getByTestId('unidad-principal'))
    const lateral = await caja(ficha.getByTestId('unidad-lateral'))
    expect(lateral.top, 'la columna derecha baja debajo de la principal').toBeGreaterThanOrEqual(principal.bottom - 1)
    expect(Math.abs(lateral.left - principal.left)).toBeLessThanOrEqual(2)
    await expect(ficha.getByTestId('unidad-imei-copiar')).toBeVisible()
    const copiar = await caja(ficha.getByTestId('unidad-imei-copiar'))
    expect(copiar.right, 'el botón de copiar entra en la pantalla').toBeLessThanOrEqual(390)
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), 'scroll horizontal').toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'scroll horizontal de página').toBe(false)
    if (REPORT) { await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/ficha-390.png` }) }
  })

  test('el dueño ve la sigla y también el nombre completo del proveedor', async ({ page }) => {
    const { ficha } = await abrirFicha(page, { role: 'Dueño', width: 1440 })
    const proveedor = ficha.getByTestId('unidad-proveedor')
    await expect(proveedor.getByTestId('proveedor-insignia')).toBeVisible()
    await expect(proveedor.getByTestId('unidad-proveedor-nombre')).toHaveText(/\S/)
  })

  test('edición en línea: el lápiz abre el editor del campo y cancelar lo cierra', async ({ page }) => {
    const { ficha } = await abrirFicha(page, { role: 'Dueño', width: 1440 })
    const garantia = ficha.getByTestId('unidad-garantia')
    await garantia.getByRole('button', { name: 'Editar vence' }).click()
    await expect(garantia.getByLabel('Mes de vencimiento de la garantía')).toBeVisible()
    await garantia.getByRole('button', { name: /Cancelar edición/ }).click()
    await expect(garantia.getByLabel('Mes de vencimiento de la garantía')).toHaveCount(0)
    // Consignación: se despliega a pedido.
    await ficha.getByTestId('unidad-consignacion').locator('summary').click()
    await expect(ficha.getByLabel('Consignador', { exact: true })).toBeVisible()
  })

  test('ficha del proveedor: ícono, color y «Cómo se muestra» se eligen y se ven en la lista', async ({ page }) => {
    await abrirFicha(page, { role: 'Dueño', width: 1440 })
    await page.keyboard.press('Escape')
    await openShellDestination(page, 'Compras')
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Proveedores', exact: true }).click()
    const lista = page.getByTestId('proveedores-tabla')
    await expect(lista.getByTestId('proveedor-fila').first()).toBeVisible()
    await lista.getByTestId('proveedor-fila').first().getByRole('button', { name: /^Editar / }).click()
    const identidad = page.getByTestId('proveedor-identidad')
    await expect(identidad).toBeVisible()
    await identidad.getByRole('radio', { name: 'Ícono truck' }).click()
    await identidad.getByRole('radio', { name: 'Color #c2410c' }).click()
    await identidad.getByRole('button', { name: 'Completo', exact: true }).click()
    await expect(identidad.getByRole('radio', { name: 'Ícono truck' })).toHaveAttribute('aria-checked', 'true')
    await expect(identidad.getByTestId('proveedor-insignia')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar proveedor' }).click()
    await expect(lista.getByTestId('proveedor-fila').first().getByTestId('proveedor-insignia')).toBeVisible()
  })
})


for (const width of [375, 390, 768, 1280, 1440]) {
  test(`#396 ubicación de la ficha tiene un rótulo y editor legible ${width}px`, async ({ page }) => {
    const { dialog, ficha } = await abrirFicha(page, { role: 'Dueño', width })
    await expect(ficha.getByRole('heading', { name: 'Ubicación', exact: true })).toHaveCount(1)
    const campo = ficha.getByTestId('unidad-ubicacion')
    await campo.getByRole('button', { name: 'Editar depósito', exact: true }).click()
    const editor = campo.getByRole('combobox', { name: 'Ubicación de la unidad', exact: true })
    const medidas = await editor.evaluate(el => {
      const canvas = document.createElement('canvas')
      const contexto = canvas.getContext('2d')
      contexto.font = getComputedStyle(el).font
      return { ancho: el.clientWidth, texto: contexto.measureText(el.selectedOptions[0].textContent).width, derecho: el.getBoundingClientRect().right }
    })
    expect(medidas.ancho, 'el nombre del depósito entra junto a la flecha').toBeGreaterThan(medidas.texto + 40)
    expect(medidas.derecho).toBeLessThanOrEqual(width)
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false)
    await campo.getByRole('button', { name: 'Cancelar edición de depósito', exact: true }).click()
    await expect(editor).toHaveCount(0)
  })
}
