import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// POS redesign (owner feedback): sin solapes, teléfono en una fila, catálogo
// denso y sin scroll horizontal. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-layout-qa'

async function enterPos(page, width, height = 900, dark = false, conCarrito = false, inflar = 0) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  if (conCarrito) await seedCart(page)
  if (inflar) await inflarCatalogo(page, inflar)
  const nav = width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

// Catálogo grande: clona productos del demo con nombres propios (inventario real).
async function inflarCatalogo(page, cantidad) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async n => {
    const { getProductos } = await import('/src/lib/storage.js')
    const lista = getProductos()
    const base = lista[0]
    for (let i = 0; i < n; i++) lista.push({ ...base, id: `qa-extra-${i}`, sku: `QA-EXTRA-${i}`, nombre: `Zeta Extra ${String(i).padStart(3, '0')}`, stock: i % 3 === 0 ? 0 : 5, activo: true })
  }, cantidad)
}

async function seedCart(page) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async () => {
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const c = storage.contextoActual()
    const product = storage.getProductos().find(p => /Funda/.test(p.nombre)) || storage.getProductos()[0]
    cart.guardarCarrito(c.empresaId, c.sucursalId, c.userId, {
      items: [{ key: 'qa-1', productoId: product.id, nombre: product.nombre, quantity: 1, precio: 180000, sobrePedido: true }],
      customer: { name: 'Prueba frontend local' },
      pagos: [],
    })
  })
}

const inter = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1

const caja = async loc => ((await loc.count()) ? loc.boundingBox() : null)

async function assertNoOverlap(page, label) {
  const ids = ['pos-bloque-carrito', 'pos-cobro', 'pos-columna-venta', 'pos-bloque-cliente', 'pos-bloque-productos']
  for (const scrollY of [0, 300, 700]) {
    await page.evaluate(y => window.scrollTo(0, y), scrollY)
    await page.waitForTimeout(100)
    const boxes = {}
    for (const id of ids) boxes[id] = await page.getByTestId(id).boundingBox()
    const probes = {
      cart: boxes['pos-bloque-carrito'],
      cobro: boxes['pos-cobro'],
      cliente: boxes['pos-bloque-cliente'],
      productos: boxes['pos-bloque-productos'],
      entrega: await page.locator('#entrega').boundingBox(),
      monto: await caja(page.locator('#monto-entrega')),
      pagos: await page.getByTestId('pos-bloque-pagos').boundingBox(),
      agregar: await page.getByRole('button', { name: '+ Agregar pago' }).boundingBox(),
      gift: await page.getByRole('button', { name: '+ Canjear gift card' }).boundingBox(),
      total: await page.getByTestId('carrito-total').boundingBox(),
      tiles: await page.getByTestId('pos-tiles-resumen').boundingBox(),
    }
    const col = boxes['pos-columna-venta']
    if (col && (await page.viewportSize()).width >= 1024) {
      for (const id of ['pos-bloque-cliente', 'pos-bloque-productos'])
        expect(inter(col, boxes[id]), `${label} scroll ${scrollY}: la columna de venta solapa ${id}`).toBe(false)
      // Pegada: su borde superior queda en pantalla mientras haya fila donde
      // seguir al catálogo; al llegar al final de la fila queda apoyada ahí.
      const grid = await page.locator('.pos-layout').boundingBox()
      const alFinal = Math.abs(col.y + col.height - (grid.y + grid.height)) <= 2
      expect(col.y >= -1 || alFinal, `${label} scroll ${scrollY}: columna pegada (y=${col.y})`).toBe(true)
      expect(col.y, `${label} scroll ${scrollY}: columna no se despega hacia abajo`).toBeLessThan(200)
    }
    for (const k of Object.keys(probes)) if (!probes[k]) delete probes[k]
    const names = Object.keys(probes)
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = probes[names[i]], b = probes[names[j]]
      const nested = (x, y) => x.x >= y.x - 1 && x.y >= y.y - 1 && x.x + x.width <= y.x + y.width + 1 && x.y + x.height <= y.y + y.height + 1
      if (nested(a, b) || nested(b, a)) continue
      expect(inter(a, b), `${label} scroll ${scrollY}: ${names[i]} solapa ${names[j]} ${JSON.stringify([a, b])}`).toBe(false)
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

for (const width of [1280, 1440, 1920, 390]) {
  test(`POS sin solapes ni scroll horizontal a ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, 900, false, true)
    await assertNoOverlap(page, `${width}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    // Los importes completos no se cortan.
    const total = page.getByTestId('carrito-total')
    expect(await total.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(total).toContainText('Gs 180.000')
  })
}

for (const width of [1280, 1440, 1920]) {
  test(`escritorio ${width}: cliente arriba del catálogo, carrito + cobro a la derecha, Cobrar sin deslizar y un solo Total`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, 900, false, true)
    const cliente = await page.getByTestId('pos-bloque-cliente').boundingBox()
    const productos = await page.getByTestId('pos-bloque-productos').boundingBox()
    const columna = await page.getByTestId('pos-columna-venta').boundingBox()
    const carrito = await page.getByTestId('pos-bloque-carrito').boundingBox()
    const cobro = await page.getByTestId('pos-cobro').boundingBox()
    // Izquierda: cliente → productos (mismo ancho y misma x); derecha: carrito → cobro.
    expect(Math.abs(cliente.x - productos.x)).toBeLessThan(2)
    expect(Math.abs(cliente.width - productos.width)).toBeLessThan(2)
    expect(cliente.y + cliente.height).toBeLessThanOrEqual(productos.y + 1)
    expect(cliente.x + cliente.width).toBeLessThanOrEqual(columna.x + 1)
    expect(productos.x + productos.width).toBeLessThanOrEqual(columna.x + 1)
    expect(carrito.y + carrito.height).toBeLessThanOrEqual(cobro.y + 1)
    expect(Math.abs(carrito.y - cliente.y)).toBeLessThan(40)
    // «Cobrar» (submit) alcanzable sin deslizar la página.
    const cobrar = page.getByTestId('pos-cobro').locator('button[type="submit"]').first()
    const b = await cobrar.boundingBox()
    expect(b.y + b.height, 'Cobrar dentro de la pantalla').toBeLessThanOrEqual(900)
    expect(b.height).toBeGreaterThanOrEqual(44)
    // Un solo Total visible: en el pie del carrito, no repetido en el cobro.
    await expect(page.getByTestId('carrito-total')).toHaveCount(1)
    await expect(page.getByTestId('cobro-total')).toHaveCount(1)
    await expect(page.getByTestId('pos-cobro').getByTestId('carrito-total')).toHaveCount(0)
    await expect(page.getByTestId('pos-tiles-resumen')).not.toContainText('Total')
    if (width === 1440) await page.screenshot({ path: `${out}/pos-layout-1440.png` })
  })
}

test('POS 375px sin scroll horizontal', async ({ page }) => {
  await enterPos(page, 375, 900, false, true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('catálogo denso: ≥12 productos sobre el pliegue a 1440x900 y una sola franja de acciones', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900)
  const cards = page.locator('.pos-product-card')
  await expect.poll(() => cards.count()).toBeGreaterThan(11)
  const boxes = await cards.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { y: r.y, b: r.bottom, h: r.height, w: r.width } }))
  expect(boxes.filter(b => b.b <= 900).length).toBeGreaterThanOrEqual(12)
  for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44)
  // Las acciones (Ventas suspendidas · Gift cards) viven en el encabezado de Productos, no en una franja aparte.
  const head = await page.getByTestId('pos-bloque-productos').boundingBox()
  const mas = await page.getByTestId('pos-suspendidas').boundingBox()
  expect(mas.y).toBeGreaterThanOrEqual(head.y)
  expect(mas.y + mas.height).toBeLessThanOrEqual(head.y + 70)
  await page.screenshot({ path: `${out}/1440-pos-light.png` })
})

test('teléfono: código y número en una sola fila, RUC aparte y a ancho completo', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await page.getByTestId('pos-bloque-cliente').getByText('Datos de contacto, RUC/CI y direcciones').click()
  const code = await page.getByRole('combobox', { name: 'Código de país' }).or(page.getByRole('button', { name: /Código de país/ })).first().boundingBox()
  const num = await page.getByLabel('Teléfono del cliente').boundingBox()
  expect(Math.abs((code.y + code.height / 2) - (num.y + num.height / 2))).toBeLessThan(6)
  expect(num.x).toBeGreaterThanOrEqual(code.x + code.width - 1)
  const panel = await page.getByTestId('pos-bloque-cliente').boundingBox()
  expect(num.x + num.width).toBeGreaterThan(panel.x + panel.width * 0.8)
  const ruc = await page.getByLabel('CI o RUC del cliente').last().boundingBox()
  expect(ruc.width).toBeGreaterThan(panel.width * 0.7)
  await page.screenshot({ path: `${out}/1440-cliente.png` })
})

test('POS oscuro a 1440 sin solapes', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, true, true)
  await assertNoOverlap(page, 'dark')
  await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/1440-pos-cobro.png` })
})

test('catálogo paginado: 4 filas al abrir, «Ver más productos» agrega, la búsqueda recorre todo el catálogo', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, false, false, 100)
  const cards = page.locator('.pos-product-card')
  const contador = page.getByTestId('pos-catalogo-contador')
  await expect.poll(() => cards.count()).toBeGreaterThan(0)
  const filas = async () => new Set(await cards.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)))).size
  const columnas = await page.locator('.pos-product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(await filas()).toBeLessThanOrEqual(4)
  expect(await cards.count()).toBeLessThanOrEqual(columnas * 4)
  // Sin carrito, la página no se alarga con el inventario.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900 * 1.5)
  const total = Number((await contador.innerText()).match(/de (\d+)/)[1])
  const antes = await cards.count()
  expect(await contador.innerText()).toBe(`Mostrando ${antes} de ${total}`)
  const verMas = page.getByTestId('pos-catalogo-ver-mas')
  expect(total).toBeGreaterThan(antes)
  {
    expect((await verMas.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await verMas.click()
    await expect.poll(() => cards.count()).toBeGreaterThan(antes)
    const despues = await cards.count()
    await expect(contador).toHaveText(`Mostrando ${despues} de ${total}`)
  }
  // Búsqueda: un producto que no está en la primera página aparece igual.
  const visibles = await page.locator('.pos-product-name').allInnerTexts()
  const fuera = await page.evaluate(async (vistos) => {
    const { getProductos } = await import('/src/lib/storage.js')
    const { agruparProductos } = await import('/src/utils/colores.js')
    return agruparProductos(getProductos().filter(p => p.activo)).map(f => f.base).filter(b => !vistos.includes(b)).pop() || null
  }, visibles)
  expect(fuera).not.toBeNull()
  {
    await page.getByPlaceholder('Buscar producto…').fill(fuera)
    await expect(page.locator('.pos-product-name', { hasText: fuera }).first()).toBeVisible()
  }
  await page.screenshot({ path: `${out}/1440-pos-paginado.png` })
})

test('catálogo paginado a 375px: 8 productos, sin scroll horizontal y botón de 44px', async ({ page }) => {
  await enterPos(page, 375, 800, false, false, 100)
  const cards = page.locator('.pos-product-card')
  await expect.poll(() => cards.count()).toBeGreaterThan(0)
  expect(await cards.count()).toBeLessThanOrEqual(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  const verMas = page.getByTestId('pos-catalogo-ver-mas')
  expect((await verMas.boundingBox()).height).toBeGreaterThanOrEqual(44)
})

async function elegirClienteDemo(page, texto = 'Luc') {
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(texto)
  const opcion = page.getByTestId('pos-bloque-cliente').locator('button.block').first()
  await opcion.click()
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
}

test('escritorio 1440: columnas 50/50, catálogo de 3 columnas y primer contenido arriba', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, false, true)
  const izq = await page.getByTestId('pos-bloque-productos').boundingBox()
  const der = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(Math.abs(izq.width - der.width), `izq ${izq.width} der ${der.width}`).toBeLessThanOrEqual(24)
  expect(Math.min(izq.y, der.y)).toBeLessThanOrEqual(132)
  const columnas = await page.locator('.pos-product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columnas).toBe(3)
  // 1024-1280: Productos lleva más ancho que el carrito (55/45).
  await page.setViewportSize({ width: 1100, height: 900 })
  const p2 = await page.getByTestId('pos-bloque-productos').boundingBox()
  const c2 = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(p2.width).toBeGreaterThan(c2.width)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: `${out}/after-1440.png` })
})

test('celular 390: resumen del carrito y «Crear pedido» siempre visibles en la barra inferior', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 390, 800, false, true)
  const barra = page.getByTestId('pos-barra-accion')
  await expect(barra).toBeVisible()
  await expect(barra.getByTestId('barra-total')).toContainText('Gs 180.000')
  const boton = barra.locator('button[type="submit"]')
  await expect(boton).toBeVisible()
  const b = await boton.boundingBox()
  expect(b.y + b.height).toBeLessThanOrEqual(800)
  expect(b.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `${out}/after-390.png` })
})

test('cliente elegido: la tarjeta reemplaza al buscador y quitarlo devuelve el buscador con foco', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await elegirClienteDemo(page)
  const caja = page.getByTestId('pos-bloque-cliente')
  await expect(caja.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toHaveCount(0)
  await expect(caja.getByText('Cliente seleccionado')).toHaveCount(0)
  await expect(caja.getByTestId('cliente-chips')).toContainText(/Mayorista|Cliente final/)
  await caja.getByRole('button', { name: 'Ver ficha del cliente' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await caja.getByRole('button', { name: 'Quitar cliente' }).click()
  await expect(caja.getByLabel('Nombre, teléfono, CI o RUC del cliente')).toBeFocused()
})

test('entrega: el monto solo aparece con Delivery o encomienda y no hay texto de retiro', async ({ page }) => {
  await enterPos(page, 1440, 900, false, true)
  const cobro = page.getByTestId('pos-cobro')
  await expect(page.locator('#entrega')).toHaveValue('Retiro en tienda')
  await expect(page.locator('#monto-entrega')).toHaveCount(0)
  await expect(cobro).not.toContainText('Monto del delivery')
  await expect(cobro).not.toContainText('si retira en tienda')
  await page.locator('#entrega').selectOption('Delivery')
  await expect(page.locator('#monto-entrega')).toBeVisible()
  await page.locator('#entrega').selectOption('Retiro en tienda')
  await expect(page.locator('#monto-entrega')).toHaveCount(0)
})

test('pagos: sin «Equivalente» en cuentas en guaraníes y «Paga al recibir» oculta los pagos', async ({ page }) => {
  await enterPos(page, 1440, 900, false, true)
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option').first().click()
  await expect(fila.getByTestId('cuenta-capsula')).toBeVisible()
  await expect(fila.getByText(/^Equivalente/)).toHaveCount(0)
  await expect(fila.getByTestId('cuenta-cambiar')).toBeVisible()
  // Con un pago cargado, «Paga al recibir» pide confirmación antes de descartarlo.
  await cobro.getByTestId('pos-paga-al-recibir').click()
  const dialogo = page.getByRole('dialog', { name: /Descartar los pagos cargados/ })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('pago-fila-0')).toBeVisible()
  await cobro.getByTestId('pos-paga-al-recibir').click()
  await page.getByRole('dialog', { name: /Descartar los pagos cargados/ }).getByRole('button', { name: 'Descartar pagos' }).click()
  await expect(page.getByTestId('pago-fila-0')).toHaveCount(0)
  await expect(cobro.getByRole('button', { name: '+ Agregar pago' })).toBeHidden()
  await expect(cobro.locator('button[type="submit"]').first()).toContainText('paga al recibir')
})

// #404: la miniatura (40 px) no hace crecer la tarjeta del catálogo: ninguna con
// foto supera en más de 8 px la más alta de las tarjetas actuales (sin foto).
for (const ancho of [375, 1440]) {
  test(`miniaturas de producto: la tarjeta no crece más de 8 px (${ancho}px)`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, ancho, 900)
    const conFoto = page.locator('.pos-product-card:has([data-testid="foto-producto"])')
    await expect.poll(() => conFoto.count()).toBeGreaterThan(0)
    const medidas = await page.locator('.pos-product-card').evaluateAll(tarjetas => tarjetas.map(tarjeta => {
      const foto = tarjeta.querySelector('[data-testid="foto-producto"]')
      return { foto: Boolean(foto), alto: tarjeta.getBoundingClientRect().height, lado: foto ? Math.round(foto.getBoundingClientRect().width) : 0 }
    }))
    const actuales = medidas.filter(m => !m.foto).map(m => m.alto)
    expect(actuales.length).toBeGreaterThan(0)
    const tope = Math.max(...actuales) + 8
    for (const m of medidas.filter(item => item.foto)) {
      expect(m.lado).toBeGreaterThanOrEqual(40)
      expect(m.lado).toBeLessThanOrEqual(48)
      expect(m.alto, `con foto ${m.alto}, tope ${tope}`).toBeLessThanOrEqual(tope)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho)
    await page.screenshot({ path: `${out}/${ancho}-pos-miniaturas.png` })
  })
}
