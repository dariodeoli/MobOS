import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { ensureCobro } from '../helpers/ensure-cobro.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'

// POS redesign (owner feedback): sin solapes, teléfono en una fila, catálogo
// denso y sin scroll horizontal. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-layout-qa'

async function enterPos(page, width, height = 900, dark = false, conCarrito = false, inflar = 0, abrirCobro = true) {
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
  if (conCarrito && abrirCobro && width >= 1024) await ensureCobro(page)
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
      entrega: await caja(page.locator('#entrega')),
      monto: await caja(page.locator('#monto-entrega')),
      pagos: await caja(page.getByTestId('pos-bloque-pagos')),
      agregar: await caja(page.getByRole('button', { name: '+ Agregar pago' })),
      gift: await caja(page.getByRole('button', { name: 'Gift card', exact: true })),
      total: await page.getByTestId('carrito-total').boundingBox(),
      tiles: await caja(page.getByTestId('pos-tiles-resumen')),
    }
    const col = boxes['pos-columna-venta']
    if (col && (await page.viewportSize()).width >= 1024) {
      for (const id of ['pos-bloque-productos'])
        expect(inter(col, boxes[id]), `${label} scroll ${scrollY}: la columna de venta solapa ${id}`).toBe(false)
      // El cliente pertenece a la columna; sus límites quedan dentro de ella.
      const cliente = boxes['pos-bloque-cliente']
      expect(cliente.x).toBeGreaterThanOrEqual(col.x - 1)
      expect(cliente.x + cliente.width).toBeLessThanOrEqual(col.x + col.width + 1)
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

for (const width of [1280, 1440, 1920]) {
  test(`POS sin solapes ni scroll horizontal a ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, 900, false, true, 0, false)
    await assertNoOverlap(page, `${width}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    // Los importes completos no se cortan.
    const total = page.getByTestId('carrito-total')
    expect(await total.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(total).toContainText('Gs 180.000')
  })
}

for (const width of [1280, 1440, 1920]) {
  test(`escritorio ${width}: catálogo a la izquierda, ticket fijo a la derecha, Cobrar sin deslizar y un solo Total`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, 900, false, true, 0, false)
    const cliente = await page.getByTestId('pos-bloque-cliente').boundingBox()
    const productos = await page.getByTestId('pos-bloque-productos').boundingBox()
    const columna = await page.getByTestId('pos-columna-venta').boundingBox()
    const carrito = await page.getByTestId('pos-bloque-carrito').boundingBox()
    // Catálogo a la izquierda; cliente y carrito en el ticket (rediseño del POS).
    expect(productos.x + productos.width).toBeLessThanOrEqual(columna.x + 1)
    expect(Math.abs(cliente.x - carrito.x)).toBeLessThan(2)
    expect(cliente.y + cliente.height).toBeLessThanOrEqual(carrito.y + 1)
    // Ticket de ancho fijo: 410 px desde 1280, algo menos en pantallas más chicas.
    if (width >= 1280) expect(Math.abs(columna.width - 410)).toBeLessThanOrEqual(2)
    // Scroll de PÁGINA (sin scroll interno): ni el catálogo ni el ticket encierran su contenido
    // en una ventana propia, y el ticket queda pegado arriba mientras se desliza el catálogo.
    const interno = await page.evaluate(() => ['pos-bloque-productos', 'pos-columna-venta', 'pos-carrito-cuerpo'].map(id => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      return [id, getComputedStyle(el).overflowY, el.scrollHeight - el.clientHeight]
    }))
    for (const [id, overflowY] of interno) expect(['auto', 'scroll'], `${id} sin scroll interno`).not.toContain(overflowY)
    expect(interno.every(([, , sobra]) => sobra <= 1)).toBe(true)
    expect(await page.getByTestId('pos-columna-venta').evaluate(el => getComputedStyle(el).position)).toBe('sticky')
    // Sin espacio muerto: el POS llega al borde inferior de la pantalla (900) como mínimo.
    expect(columna.y + columna.height, 'el ticket llega abajo').toBeGreaterThanOrEqual(900 - 80)
    expect(productos.y + productos.height, 'el catálogo llega abajo').toBeGreaterThanOrEqual(900 - 80)
    // «Cobrar» (abre el cobro) alcanzable sin deslizar la página.
    const cobrar = page.getByTestId('carrito-listo')
    const b = await cobrar.boundingBox()
    expect(b.y + b.height, 'Cobrar dentro de la pantalla').toBeLessThanOrEqual(900)
    expect(b.height).toBeGreaterThanOrEqual(44)
    await expect(cobrar).toContainText('Cobrar')
    // Un solo Total visible: en el pie del ticket.
    await expect(page.getByTestId('carrito-total')).toHaveCount(1)
    await expect(page.getByTestId('cobro-total')).toHaveCount(1)
    // El cobro es una pantalla propia: «Falta cobrar» y Confirmar sin deslizar.
    await cobrar.click()
    const cobro = page.getByTestId('pos-cobro')
    await expect(cobro).toBeVisible()
    await expect(page.getByTestId('pos-falta-hero')).toContainText('Falta cobrar')
    await expect(cobro.getByTestId('carrito-total')).toHaveCount(0)
    await expect(page.getByTestId('pos-tiles-resumen')).not.toContainText('Total')
    const guardar = await cobro.locator('button[type="submit"]').first().boundingBox()
    expect(guardar.y + guardar.height, 'Confirmar dentro de la pantalla').toBeLessThanOrEqual(900)
    expect(guardar.height).toBeGreaterThanOrEqual(44)
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

test('teléfono: código y número en una sola fila, RUC aparte y por contenido (#389)', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await page.getByTestId('pos-bloque-cliente').getByText('Datos de contacto, RUC/CI y direcciones').click()
  await expect(page.getByRole('dialog', { name: 'Datos del cliente' })).toBeVisible()
  await expect(page.getByLabel('Teléfono del cliente')).toBeVisible()
  await esperarAnimaciones(page)
  const code = await page.getByRole('combobox', { name: 'Código de país' }).or(page.getByRole('button', { name: /Código de país/ })).first().boundingBox()
  const num = await page.getByLabel('Teléfono del cliente').boundingBox()
  expect(Math.abs((code.y + code.height / 2) - (num.y + num.height / 2))).toBeLessThan(6)
  expect(num.x).toBeGreaterThanOrEqual(code.x + code.width - 1)
  // #389: los datos cortos ya no ocupan todo el ancho (docs/CAMPOS.md §2.1):
  // el teléfono con su código mide <= 20rem y el CI/RUC <= 16rem; al ser cortos comparten fila.
  expect(num.x + num.width - code.x).toBeLessThanOrEqual(320 + 1.5)
  const ruc = await page.getByLabel('CI o RUC del cliente', { exact: true }).boundingBox()
  expect(ruc.width).toBeLessThanOrEqual(256 + 1.5)
  // CI/RUC y teléfono van en la misma fila (cortos juntos) o el RUC arriba; nunca se pisan.
  expect(ruc.x + ruc.width <= code.x + 1 || ruc.y + ruc.height <= code.y).toBe(true)
  await page.screenshot({ path: `${out}/1440-cliente.png` })
})

test('POS oscuro a 1440 sin solapes', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, true, true, 0, false)
  await assertNoOverlap(page, 'dark')
  await ensureCobro(page)
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

test('escritorio 1440: catálogo flexible, ticket de 410 px y primer contenido arriba', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, false, true, 0, false)
  const izq = await page.getByTestId('pos-bloque-productos').boundingBox()
  const der = await page.getByTestId('pos-columna-venta').boundingBox()
  expect(Math.abs(der.width - 410), `ticket ${der.width}`).toBeLessThanOrEqual(2)
  expect(izq.width).toBeGreaterThan(der.width)
  expect(Math.min(izq.y, der.y)).toBeLessThanOrEqual(132)
  const columnas = await page.locator('.pos-product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columnas).toBeGreaterThanOrEqual(3)
  // 1024-1280: el ticket cede ancho (360 px) y Productos lleva más.
  await page.setViewportSize({ width: 1100, height: 900 })
  const p2 = await page.getByTestId('pos-bloque-productos').boundingBox()
  const c2 = await page.getByTestId('pos-bloque-carrito').boundingBox()
  expect(p2.width).toBeGreaterThan(c2.width)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: `${out}/after-1440.png` })
})

test('celular 390: resumen del carrito y acción «Cobrar» siempre a mano (hoja del carrito, #429)', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 390, 800, false, true)
  // <768 px el POS es el de celular: barra del carrito sobre la navegación con el total completo.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const barra = page.getByTestId('pos-barra-carrito')
  await expect(barra).toBeVisible()
  await expect(barra.getByTestId('barra-total')).toContainText('Gs 180.000')
  const caja = await barra.boundingBox()
  expect(caja.y + caja.height).toBeLessThanOrEqual(800)
  expect(caja.height).toBeGreaterThanOrEqual(44)
  await barra.getByTestId('pos-barra-carrito-abrir').click()
  const cobrar = page.getByTestId('carrito-cobrar')
  await expect(cobrar).toBeVisible()
  await page.waitForTimeout(450) // la hoja entra deslizándose
  const b = await cobrar.boundingBox()
  expect(b.y + b.height).toBeLessThanOrEqual(800)
  expect(b.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('carrito-total')).toContainText('Gs 180.000')
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
  await ensureCobro(page)
  const cobro = page.getByTestId('pos-cobro')
  await cobro.getByRole('button', { name: '+ Agregar pago' }).click()
  const fila = page.getByTestId('pago-fila-0')
  await fila.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option').first().click()
  await expect(fila.getByTestId('cuenta-capsula')).toBeVisible()
  await expect(fila.getByText(/^Equivalente/)).toHaveCount(0)
  await expect(fila.getByRole('button', { name: 'Más acciones del pago 1' })).toBeVisible()
  // Con un pago cargado, «Paga al recibir» pide confirmación antes de descartarlo.
  await cobro.getByTestId('pos-paga-al-recibir').click()
  const dialogo = page.getByRole('alertdialog', { name: /Descartar los pagos cargados/ })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('pago-fila-0')).toBeVisible()
  await cobro.getByTestId('pos-paga-al-recibir').click()
  await page.getByRole('alertdialog', { name: /Descartar los pagos cargados/ }).getByRole('button', { name: 'Descartar pagos' }).click()
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
    const conFoto = page.locator('.pos-product-card:has([data-testid="foto-producto"] img)')
    await expect.poll(() => conFoto.count()).toBeGreaterThan(0)
    const medidas = await page.locator('.pos-product-card').evaluateAll(tarjetas => tarjetas.map(tarjeta => {
      const foto = tarjeta.querySelector('[data-testid="foto-producto"]')
      return { foto: Boolean(foto?.querySelector('img')), alto: tarjeta.getBoundingClientRect().height, lado: foto ? Math.round(foto.getBoundingClientRect().width) : 0 }
    }))
    const actuales = medidas.filter(m => !m.foto).map(m => m.alto)
    expect(actuales.length).toBeGreaterThan(0)
    const tope = Math.max(...actuales) + 8
    for (const m of medidas.filter(item => item.foto)) {
      expect(m.lado).toBeGreaterThanOrEqual(40)
      // Desde 1280 la «venta rápida» usa foto de 64 px (posCobro.css); debajo, 40-48.
      expect(m.lado).toBeLessThanOrEqual(ancho >= 1280 ? 64 : 48)
      expect(m.alto, `con foto ${m.alto}, tope ${tope}`).toBeLessThanOrEqual(tope)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho)
    await page.screenshot({ path: `${out}/${ancho}-pos-miniaturas.png` })
  })
}

// #492: Vender conserva un icono de categoría cuando el producto no tiene foto.
for (const width of [320, 390, 1440]) for (const dark of [false, true]) {
  test(`#492 iconos de productos ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await enterPos(page, width, 900, dark)
    const cards = page.locator('.pos-product-card')
    await expect(cards.first()).toBeVisible()
    const sinFoto = cards.filter({ hasNot: page.locator('img') })
    expect(await sinFoto.count()).toBeGreaterThan(0)
    for (const card of await sinFoto.all()) {
      const icono = card.getByTestId('foto-producto').locator('svg')
      await expect(icono).toBeVisible()
      const box = await icono.boundingBox()
      expect(box.width).toBeGreaterThan(0)
      expect(box.height).toBeGreaterThan(0)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    for (const card of await cards.all()) {
      const medida = await card.evaluate(el => ({ ok: el.scrollWidth <= el.clientWidth + 1, texto: el.innerText, ancho: el.clientWidth, contenido: el.scrollWidth, hijos: [...el.querySelectorAll('strong, b, span')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => ({ texto: n.textContent, ancho: n.clientWidth, contenido: n.scrollWidth, clase: n.className })) }))
      expect(medida.ok, `tarjeta sin recorte: ${JSON.stringify(medida)}`).toBe(true)
    }
  })
}

// ── POS con espacio (22-10-2026): catálogo a todo el alto, lista/cuadrícula, «Nuevo producto» en
// la cabecera con X roja, nada suelto en una fila y Paso 2 con «Volver» y «Nueva venta».
test('vista Lista/Cuadrícula del catálogo: filas compactas, persiste y «Nuevo producto» va en la cabecera', async ({ page }) => {
  await enterPos(page, 1440, 900)
  const bloque = page.getByTestId('pos-bloque-productos')
  const nuevo = bloque.getByTestId('pos-nuevo-producto')
  await expect(nuevo).toBeVisible()
  const titulo = await bloque.getByRole('heading', { name: 'Productos', exact: true }).boundingBox()
  const nb = await nuevo.boundingBox()
  expect(Math.abs((nb.y + nb.height / 2) - (titulo.y + titulo.height / 2)), 'Nuevo producto en la fila del título').toBeLessThan(30)
  // El selector de vista comparte fila con los chips: ningún control solo.
  const vista = await page.getByTestId('pos-vista-catalogo').boundingBox()
  const chips = await page.getByTestId('pos-chips-accesorio').boundingBox()
  expect(Math.abs((vista.y + vista.height / 2) - (chips.y + chips.height / 2))).toBeLessThan(8)

  await page.getByTestId('pos-vista-lista').click()
  await expect(page.getByTestId('pos-vista-lista')).toHaveAttribute('aria-pressed', 'true')
  const filas = page.locator('.pos-product-fila')
  await expect.poll(() => filas.count()).toBeGreaterThan(8)
  const altos = await filas.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
  for (const alto of altos) { expect(alto).toBeGreaterThanOrEqual(44); expect(alto).toBeLessThanOrEqual(96) }
  await expect(filas.first().getByTestId('pos-precio-aplicable')).toContainText('Gs')
  await expect(filas.first().getByTestId('pos-stock-condicion')).toContainText('Nuevo')
  // Sin lista de precios ni «elegí variante» en las tarjetas.
  await expect(page.locator('.pos-product-card').filter({ hasText: /elegí variante|Lista Mayorista|Minorista/ })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('mobos:pos-catalogo-vista'))).toBe('lista')
  await page.reload()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
  await expect(page.getByTestId('pos-vista-lista')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('pos-vista-cuadricula').click()
  await expect(page.locator('.pos-product-fila')).toHaveCount(0)
})

test('Nuevo producto abre un popup con X roja arriba y Esc lo cierra', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await page.getByTestId('pos-nuevo-producto').click()
  const popup = page.getByRole('dialog', { name: 'Nuevo producto' })
  await expect(popup).toBeVisible()
  await esperarAnimaciones(page)
  const x = popup.getByRole('button', { name: 'Cerrar', exact: true })
  const caja = await popup.boundingBox()
  const xb = await x.boundingBox()
  expect(xb.y - caja.y).toBeLessThan(60)
  expect(caja.x + caja.width - (xb.x + xb.width)).toBeLessThan(40)
  expect(xb.width).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
})

for (const [w, h] of [[1440, 900], [1280, 800]]) {
  test(`sin espacio muerto bajo el POS a ${w}×${h}`, async ({ page }) => {
    await enterPos(page, w, h)
    await esperarAnimaciones(page)
    const m = await page.evaluate(() => {
      const bajo = id => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().bottom
      return { prod: bajo('pos-bloque-productos'), col: bajo('pos-columna-venta') }
    })
    expect(m.prod, `${w}x${h}: el catálogo llega al borde inferior`).toBeGreaterThanOrEqual(h - 70)
    expect(m.col, `${w}x${h}: el ticket llega al borde inferior`).toBeGreaterThanOrEqual(h - 70)
    await expect(page.getByText('Detalles de la venta y del día')).toHaveCount(0)
  })
}

test('Paso 2: «Volver a productos» y «Nueva venta» en la cabecera; Esc vuelve; Nueva venta confirma', async ({ page }) => {
  await enterPos(page, 1440, 900, false, true, 0, true)
  const cab = page.getByTestId('pos-cobro-header')
  await expect(cab).toBeVisible()
  const volver = cab.getByRole('button', { name: /Volver a productos/ })
  const nueva = cab.getByRole('button', { name: 'Nueva venta' })
  const vb = await volver.boundingBox(), nb = await nueva.boundingBox(), cb = await cab.boundingBox()
  expect(vb.x - cb.x).toBeLessThan(20)
  expect(cb.x + cb.width - (nb.x + nb.width)).toBeLessThan(20)
  expect(Math.abs(vb.y - nb.y)).toBeLessThan(6)
  // «Editar productos» vive en la cabecera «Productos de esta venta», no solo en una fila.
  const car = await page.getByTestId('pos-bloque-carrito').boundingBox()
  const ed = await page.getByTestId('carrito-editar').boundingBox()
  expect(ed.y - car.y).toBeLessThan(70)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pos-cobro')).toBeHidden()
  await expect(page.getByTestId('carrito-listo')).toBeVisible()
  await page.getByTestId('carrito-listo').click()
  await page.getByTestId('pos-cobro-header').getByRole('button', { name: 'Nueva venta' }).click()
  const alerta = page.getByRole('alertdialog')
  await expect(alerta).toBeVisible()
  await alerta.getByRole('button', { name: 'Vaciar y empezar' }).click()
  await expect(page.getByTestId('pos-cobro')).toHaveCount(0)
  await expect(page.getByTestId('carrito-total')).toContainText('Gs 0')
})
