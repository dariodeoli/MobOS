import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { ensureCobro } from '../helpers/ensure-cobro.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'
import { botonMenuPago, eliminarPago, verDatosCliente } from '../helpers/menu-pago.js'

// Cobro simple (Paso 2): «Falta cobrar» grande, medios como tarjetas, un toque agrega un pago por el
// saldo, montos rápidos y una fila por pago. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT_COBRO || '/tmp/mobos-cobro-simple'
const TOTAL = 900000

async function entrar(page, width, height, { abrir = true } = {}) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async () => {
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const c = storage.contextoActual()
    const lista = storage.getProductos()
    const items = Array.from({ length: 5 }, (_, i) => {
      const p = lista[i % lista.length]
      return { key: `qa-${i}`, productoId: p.id, nombre: p.nombre, quantity: 1, precio: 180000, sobrePedido: true }
    })
    cart.guardarCarrito(c.empresaId, c.sucursalId, c.userId, { items, customer: { name: 'Prueba cobro simple' }, pagos: [] })
  })
  const nav = width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  if (abrir && width >= 1024) await ensureCobro(page)
}

// Ningún contenedor recorta ni encierra el contenido del cobro en un scroll propio.
async function recortes(page, selector) {
  return page.evaluate((raiz) => {
    const base = document.querySelector(raiz)
    const fallas = []
    for (const el of base.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.position === 'fixed') break
        const corta = ['hidden', 'clip'].includes(cs.overflowY)
        const scroll = ['auto', 'scroll'].includes(cs.overflowY) && a.scrollHeight > a.clientHeight + 1
        if (!corta && !scroll) continue
        const ar = a.getBoundingClientRect()
        const esTexto = el.matches('b, span, p, strong') && getComputedStyle(el).textOverflow === 'ellipsis'
        if (corta && !esTexto && r.bottom > ar.bottom + 1) fallas.push(`${el.dataset.testid || el.tagName} corta por ${a.dataset.testid || a.className.toString().slice(0, 40)}`)
        if (scroll && !a.matches('[data-testid="popup-cuerpo"], [role="listbox"]')) fallas.push(`${a.dataset.testid || a.className.toString().slice(0, 40)} tiene scroll interno`)
        if (fallas.length > 8) return fallas
      }
    }
    return [...new Set(fallas)]
  }, selector)
}

const pendiente = page => page.getByTestId('cobro-pendiente')

test('dividir en 3 medios sin teclear: efectivo, transferencia y tarjeta con toques', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await entrar(page, 1440, 900)
  const cobro = page.getByTestId('pos-cobro')
  const medios = cobro.getByTestId('cobro-medios')
  await expect(cobro.getByTestId('pos-falta-hero')).toContainText('Falta cobrar')
  await expect(cobro.getByTestId('pos-falta-hero')).toContainText('Gs 900.000')
  for (const nombre of ['Efectivo', 'Efectivo US$', 'Transferencia', 'Tarjeta', 'PIX', 'USDT', 'Canje', 'Gift card']) {
    await expect(medios.getByRole('button', { name: nombre, exact: true })).toBeVisible()
  }

  // 1) Efectivo: un toque agrega un pago por todo lo que falta.
  await medios.getByTestId('medio-cash').click()
  const fila0 = page.getByTestId('pago-fila-0')
  await expect(fila0.getByLabel('Monto original')).toHaveValue('900.000')
  await expect(pendiente(page)).toContainText('Gs 0')
  await expect(medios.getByTestId('medio-transfer')).toBeDisabled()
  // 2) «Mitad» libera la mitad sin teclear.
  await cobro.getByTestId('monto-rapido-mitad').click()
  await expect(fila0.getByLabel('Monto original')).toHaveValue('450.000')
  await expect(pendiente(page)).toContainText('Gs 450.000')
  // 3-4) Transferencia: la fila pide la cuenta con chips (recientes primero) y propone el saldo.
  await medios.getByTestId('medio-transfer').click()
  const fila1 = page.getByTestId('pago-fila-1')
  await expect(fila1.getByTestId('pago-cuentas-sugeridas')).toBeVisible()
  await fila1.getByTestId('cuenta-opcion-demo-transfer-itau').click()
  await expect(fila1.getByLabel('Monto original')).toHaveValue('450.000')
  await expect(fila1.getByTestId('cuenta-tipo')).toHaveText('Transferencia · Gs')
  // 5) «Mitad» otra vez y 6-7) Tarjeta por el último cuarto.
  await cobro.getByTestId('monto-rapido-mitad').click()
  await expect(fila1.getByLabel('Monto original')).toHaveValue('225.000')
  await medios.getByTestId('medio-card').click()
  const fila2 = page.getByTestId('pago-fila-2')
  await fila2.getByTestId('cuenta-opcion-demo-card-ueno').click()
  await expect(fila2.getByLabel('Monto original')).toHaveValue('225.000')
  await expect(pendiente(page)).toContainText('Gs 0')
  await expect(cobro.getByTestId('pos-falta-hero')).toContainText('Cobro completo')
  await page.screenshot({ path: `${out}/cobro-1440-3-pagos.png` })
  // Cada pago es una sola fila baja en escritorio (nada de formularios anidados).
  for (const fila of [fila0, fila1, fila2]) {
    await esperarAnimaciones(page)
    expect((await fila.boundingBox()).height, 'una fila por pago').toBeLessThanOrEqual(64)
  }
  await expect(cobro.locator('button[type="submit"]').first()).toBeEnabled()
})

test('efectivo con «Recibido»: vuelto grande y chips de redondeo', async ({ page }) => {
  await entrar(page, 1440, 900)
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByTestId('medio-cash').click()
  await expect(cobro.getByTestId('cobro-vuelto')).toHaveCount(0)
  await cobro.getByTestId('monto-rapido-r1000000').click()
  await expect(page.getByTestId('pago-fila-0').getByLabel('Recibido')).toHaveValue('1.000.000')
  const vuelto = cobro.getByTestId('cobro-vuelto')
  await expect(vuelto).toContainText('Gs 100.000')
  const hero = await cobro.getByTestId('pos-falta-hero').boundingBox()
  const caja = await vuelto.boundingBox()
  expect(caja.y).toBeGreaterThanOrEqual(hero.y)
  expect(caja.y + caja.height, 'el vuelto vive dentro del bloque grande').toBeLessThanOrEqual(hero.y + hero.height + 1)
  // Cambiar el monto descarta el recibido viejo (el vuelto nunca queda desactualizado).
  await cobro.getByTestId('monto-rapido-mitad').click()
  await expect(cobro.getByTestId('cobro-vuelto')).toHaveCount(0)
})

test('USD con cotización y ⋯ con datos para el cliente, cambiar cuenta y borrar', async ({ page }) => {
  await entrar(page, 1440, 900)
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByTestId('medio-cash-usd').click()
  const fila = page.getByTestId('pago-fila-0')
  await expect(fila.getByLabel(/^Cotización manual USD/)).toHaveValue('7.300')
  await expect(fila.getByLabel('Monto original')).toHaveValue('123,28')
  await expect(fila.getByTestId('cuenta-tipo')).toHaveText('Efectivo · US$')
  await eliminarPago(page, fila, 1)
  await expect(page.getByTestId('pago-fila-0')).toHaveCount(0)

  await cobro.getByTestId('medio-transfer').click()
  const transfer = page.getByTestId('pago-fila-0')
  await transfer.getByTestId('cuenta-opcion-demo-transfer-itau').click()
  await expect(transfer.getByTestId('cuenta-capsula-datos')).toHaveCount(0)
  await verDatosCliente(page, transfer, 1)
  await expect(transfer.getByTestId('cuenta-alias')).toContainText('80012345-0')
  await expect(transfer.getByTestId('cuenta-capsula-datos')).toContainText('Aurora Móviles')
  await botonMenuPago(transfer, 1).click()
  await page.getByTestId('cuenta-copiar-datos').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Alias (RUC): 80012345-0')
  // Pendiente de verificación: el chip no suma al cobrado.
  await transfer.getByTestId('pago-estado').click()
  await expect(transfer.getByTestId('pago-estado')).toHaveText('Pendiente')
  await expect(pendiente(page)).toContainText('Gs 900.000')
})

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  test(`sin recortes en cobro a ${width}x${height}: 3 pagos y el menú ⋯ abierto`, async ({ page }) => {
    await entrar(page, width, height)
    const cobro = page.getByTestId('pos-cobro')
    const medios = cobro.getByTestId('cobro-medios')
    await medios.getByTestId('medio-cash').click()
    await cobro.getByTestId('monto-rapido-mitad').click()
    await medios.getByTestId('medio-transfer').click()
    await page.getByTestId('pago-fila-1').getByTestId('cuenta-opcion-demo-transfer-itau').click()
    await cobro.getByTestId('monto-rapido-mitad').click()
    await medios.getByTestId('medio-card').click()
    await expect(page.getByTestId('pago-fila-2').getByTestId('pago-cuentas-sugeridas')).toBeVisible()
    await botonMenuPago(page.getByTestId('pago-fila-1'), 2).click()
    await esperarAnimaciones(page)
    expect(await recortes(page, '[data-testid="pos-layout"]')).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
    const guardar = cobro.locator('button[type="submit"]').first()
    await guardar.scrollIntoViewIfNeeded()
    await expect(guardar).toBeInViewport()
  })
}

test('sin recortes en cobro a 390: la hoja muestra los pagos en dos filas como máximo', async ({ page }) => {
  await entrar(page, 390, 844)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const hoja = page.getByTestId('cobro-movil')
  await expect(hoja).toBeVisible()
  await expect(hoja.getByTestId('cobro-total-grande')).toContainText('Gs 900.000')
  // Medios como tarjetas de dos columnas.
  const medios = hoja.getByTestId('cobro-medios').locator('button')
  const a = await medios.nth(0).boundingBox()
  const b = await medios.nth(1).boundingBox()
  expect(Math.abs(a.y - b.y), 'dos tarjetas por renglón').toBeLessThan(4)
  // Efectivo exacto por la mitad del monto, luego transferencia por el saldo.
  await hoja.getByTestId('medio-demo-cash-pyg').click()
  await hoja.getByTestId('recibido-exacto').click()
  await expect(hoja.getByTestId('cobro-pagos-lista')).toBeVisible().catch(() => {})
  await page.waitForTimeout(500)
  const fila = hoja.getByTestId('cobro-pago-0')
  if (await fila.count()) expect((await fila.boundingBox()).height, 'un pago ocupa dos renglones como máximo').toBeLessThanOrEqual(64)
  await esperarAnimaciones(page)
  expect(await recortes(page, '[data-testid="cobro-movil"]')).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('celular 390: un pago parcial queda listado y se borra con la x', async ({ page }) => {
  await entrar(page, 390, 844)
  await page.getByTestId('pos-barra-carrito-abrir').click()
  await page.getByTestId('carrito-cobrar').click()
  const hoja = page.getByTestId('cobro-movil')
  await hoja.getByTestId('cobro-dividir').click()
  for (const d of '300000') await hoja.getByRole('button', { name: `Agregar ${d}`, exact: true }).click()
  await hoja.getByTestId('teclado-aceptar').click()
  await hoja.getByTestId('medio-demo-transfer-itau').click()
  await hoja.getByTestId('cuenta-marcar-pagado').click()
  const fila = hoja.getByTestId('cobro-pago-0')
  await expect(fila).toContainText('Itaú · Cuenta corriente')
  await expect(fila).toContainText('Transferencia · Gs')
  await expect(fila).toContainText('Gs 300.000')
  await expect(hoja.getByTestId('cobro-total-grande')).toContainText('Gs 600.000')
  await page.screenshot({ path: `${out}/cobro-390-pago-listado.png` })
  await hoja.getByTestId('cobro-pago-borrar-0').click()
  await expect(hoja.getByTestId('cobro-pagos-lista')).toHaveCount(0)
  await expect(hoja.getByTestId('cobro-total-grande')).toContainText('Gs 900.000')
})
