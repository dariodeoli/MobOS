import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { rutaDeVista } from '../../src/lib/rutas.js'

const output = '/tmp/mobos-nav-v2-qa'
const widths = [320, 360, 390, 430, 1440]

async function enterDemo(page, role = 'Dueño') {
  // No credential/provider/backend operations are allowed by this harness.
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Frontend-only harness"}',
        }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function noOverflow(page) {
  expect(
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toEqual({ width: page.viewportSize().width, scroll: page.viewportSize().width })
}

for (const width of widths) {
  test(`owner navigation, branch, profile and POS stack at ${width}px`, async ({ page }) => {
    await mkdir(output, { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    await enterDemo(page)
    const mobile = width < 1024
    const navigation = mobile
      ? page.getByTestId('shell-bottom-nav')
      : page
          .getByTestId('shell-lateral')
          .getByRole('navigation', { name: 'Navegación principal', exact: true })
    await expect(navigation.getByRole('button')).toHaveText([
      'Inicio',
      'Vender',
      'Ventas',
      'Stock',
      'Finanzas',
    ])
    await expect(
      page.getByTestId(mobile ? 'shell-sucursal-mobile' : 'shell-sucursal-desktop'),
    ).toContainText(/Casa Central/)
    await expect(
      page.getByTestId(mobile ? 'notificaciones-aviso-mobile' : 'notificaciones-aviso'),
    ).toBeVisible()
    await noOverflow(page)
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
    await expect(page.locator('main')).toContainText(/Vendido|Ventas|Hoy/)
    await page.screenshot({ path: `${output}/${width}-inicio.png`, fullPage: true })
    await page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil').click()
    const profile = page.getByRole('dialog', { name: 'Perfil y preferencias' })
    await expect(profile).toBeVisible()
    for (const label of [
      'Mi perfil',
      'Configuración',
      'Ayuda',
      'Atajos de teclado',
      'Bloquear pantalla',
      'Cerrar sesión',
    ])
      await expect(profile.getByRole('button', { name: label, exact: true })).toBeVisible()
    const dialogBox = await profile.boundingBox()
    expect(dialogBox.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width)
    if (mobile) await expect(navigation).toBeHidden()
    await page.screenshot({ path: `${output}/${width}-perfil.png` })
    await page.keyboard.press('Escape')
    await expect(profile).not.toBeVisible()
    await expect(page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil')).toBeFocused()
    await navigation.getByRole('button', { name: 'Stock', exact: true }).click()
    await expect(page).toHaveURL(/\/inventario\/unidades/)
    const context = page.getByTestId('shell-contexto')
    if (mobile) await expect(context.getByRole('combobox')).toBeVisible()
    await page.getByTestId('shell-subcontexto').getByRole('combobox').selectOption('productos')
    await expect(page).toHaveURL(/\/productos/)
    if (mobile) await context.getByRole('combobox').selectOption('compras')
    else await context.getByRole('button', { name: 'Compras', exact: true }).click()
    await expect(page).toHaveURL(/\/compras/)
    await noOverflow(page)
    await navigation.getByRole('button', { name: 'Vender', exact: true }).click()
    await expect(page).toHaveURL(/\/pos/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await noOverflow(page)
    const checkout = mobile
      ? page
          .getByTestId('pos-barra-accion')
          .getByRole('button', { name: /Guardar pedido|Crear pedido|Confirmar venta/ })
      : page
          .getByRole('button', { name: /Guardar pedido|Crear pedido|Confirmar venta/ })
          .filter({ visible: true })
          .first()
    await expect(checkout).toBeVisible()
    await expect(page.locator('main form').filter({ visible: true }).first()).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: `${output}/${width}-pos.png`, fullPage: true })
    if (!mobile) await checkout.evaluate(element => element.scrollIntoView({ block: 'center' }))
    if (mobile) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const checkout = document
              .querySelector('[data-testid="pos-barra-accion"] button[type="submit"]')
              ?.getBoundingClientRect()
            const checkoutBar = document
              .querySelector('[data-testid="pos-barra-accion"]')
              ?.getBoundingClientRect()
            const bottom = document
              .querySelector('[data-testid="shell-bottom-nav"]')
              ?.getBoundingClientRect()
            const header = document
              .querySelector('[data-testid="shell-mobile-header"]')
              ?.getBoundingClientRect()
            return Boolean(
              checkout?.height &&
              bottom?.height &&
              header?.height &&
              checkout.bottom <= bottom.top &&
              checkoutBar?.bottom <= bottom.top &&
              checkout.top >= header.bottom,
            )
          }),
        )
        .toBe(true)
      await page.setViewportSize({ width, height: 450 })
      const input = page.locator('main input').first()
      await input.focus()
      await expect(navigation).toBeHidden()
      await page.setViewportSize({ width, height: 900 })
    }
    await page.goto('/ventas')
    await expect(page).toHaveURL(/\/pos/)
  })
}

for (const [role, landing, labels] of [
  ['Vendedor', /\/pos/, ['Vender', 'Ventas', 'Stock']],
  ['Gerente', /\/pos/, ['Vender', 'Ventas', 'Stock']],
  ['Caja', /\/pos/, ['Vender', 'Ventas', 'Stock']],
  ['Técnico', /\/servicio/, ['Taller']],
  ['Delivery', /\/delivery\/repartos/, ['Entregas']],
]) {
  test(`${role} has only permitted primary destinations and correct landing`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await enterDemo(page, role)
    await expect(page).toHaveURL(landing)
    await expect(page.getByTestId('shell-bottom-nav').getByRole('button')).toHaveText(labels)
    await noOverflow(page)
    await expect(page.locator('main')).toContainText(/\S/)
    await page.screenshot({ path: `${output}/role-${role}.png` })
    if (role !== 'Delivery') {
      await page.getByTestId('shell-perfil-mobile').click()
      const profile = page.getByRole('dialog', { name: 'Perfil y preferencias' })
      await expect(profile.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(
        0,
      )
      await profile.getByRole('button', { name: 'Mi perfil', exact: true }).click()
      await expect(page).toHaveURL(/\/mi-cuenta/)
      await page.goto('/configuracion/organizacion')
      await expect(page).toHaveURL(landing)
    }
  })
}

test('owner profile invokes configuration, help, theme, shortcuts, lock and logout handlers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await enterDemo(page)
  const openProfile = () => page.getByTestId('shell-perfil-mobile').click()
  const profile = page.getByRole('dialog', { name: 'Perfil y preferencias' })
  await openProfile()
  await profile.getByRole('button', { name: 'Configuración', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion\//)
  await expect(page.getByTestId('config-grupos').getByRole('combobox')).toBeVisible()
  await openProfile()
  await profile.getByRole('button', { name: 'Ayuda', exact: true }).click()
  await expect(page).toHaveURL(/\/ayuda\/ayuda/)
  await openProfile()
  await profile.getByRole('button', { name: 'Atajos de teclado', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByTestId('shell-bottom-nav')
    .getByRole('button', { name: 'Vender', exact: true })
    .click()
  await expect(page.getByTestId('pos-barra-accion')).toBeVisible()
  await openProfile()
  const toggle = profile.getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector(
          '[data-testid="pos-barra-accion"] button[type="submit"]',
        )
        return button && getComputedStyle(button).backgroundColor
      }),
    )
    .toBe('rgb(242, 244, 247)')
  await page.screenshot({ path: `${output}/390-pos-dark.png`, fullPage: true })
  await openProfile()
  await profile.getByRole('button', { name: 'Cambiar a tema claro', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const button = document.querySelector(
          '[data-testid="pos-barra-accion"] button[type="submit"]',
        )
        return button && getComputedStyle(button).backgroundColor
      }),
    )
    .toBe('rgb(14, 17, 22)')
  await openProfile()
  await profile.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  const logout = page.getByRole('dialog', { name: '¿Cerrar sesión?' })
  await expect(logout).toBeVisible()
  await logout.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await openProfile()
  await profile.getByRole('button', { name: 'Bloquear pantalla', exact: true }).click()
  await expect(page.getByRole('button', { name: /Cambiar de usuario/ })).toBeVisible()
  await page.screenshot({ path: `${output}/390-bloqueo.png` })
})

test('all contextual owner destinations remain offered and subsection URLs stay reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await enterDemo(page)
  const navigation = page.getByTestId('shell-bottom-nav')
  const destinations = {
    Inicio: { resumen: ['resumen'], ops: ['ops'] },
    Ventas: {
      pedidos: ['pedidos', 'autorizaciones'],
      cotizaciones: ['cotizaciones'],
      entregas: ['repartos'],
      taller: ['servicio', 'tradein-admin'],
      clientes: ['clientes', 'promociones', 'plantillas'],
    },
    Stock: {
      inventario: ['unidades', 'productos'],
      compras: [
        'compras',
        'abastecimiento',
        'compras-centro',
        'preparacion',
        'lotes',
        'recepcion',
        'metricas',
      ],
      traslados: ['traslados'],
      precios: ['precios', 'celulares', 'comparador', 'centro-control'],
    },
    Finanzas: { finanzas: ['finanzas'], analisis: ['analisis'] },
  }
  for (const [label, groups] of Object.entries(destinations)) {
    await navigation.getByRole('button', { name: label, exact: true }).click()
    const selector = page.getByTestId('shell-contexto').getByRole('combobox')
    expect(
      await selector.locator('option').evaluateAll(options => options.map(option => option.value)),
    ).toEqual(Object.keys(groups))
    for (const [group, ids] of Object.entries(groups)) {
      if (group === 'ops') continue // standalone protected operational board requires backend
      await selector.selectOption(group)
      for (const id of ids) {
        if (ids.length > 1)
          await page.getByTestId('shell-subcontexto').getByRole('combobox').selectOption(id)
        const route =
          {
            unidades: '/inventario/unidades',
            traslados: '/inventario/traslados',
            analisis: '/analisis/reportes',
            finanzas: '/finanzas/caja',
          }[id] || rutaDeVista(id)
        await expect(page).toHaveURL(new RegExp(`${route}$`))
      }
    }
  }
  await navigation.getByRole('button', { name: 'Finanzas', exact: true }).click()
  await expect(page).toHaveURL(/\/finanzas\/caja/)
  await page
    .getByRole('combobox', { name: 'Secciones de Finanzas', exact: true })
    .selectOption('conciliacion')
  await expect(page).toHaveURL(/\/finanzas\/conciliacion/)
  await navigation.getByRole('button', { name: 'Stock', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Sección de inventario', exact: true })
    .selectOption('reservas')
  await expect(page).toHaveURL(/\/inventario\/reservas/)
  await page.getByTestId('shell-buscar-mobile').click()
  await expect(
    page.getByRole('combobox', { name: 'Buscar en toda la tienda', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await noOverflow(page)
})

// These fixtures use the app's existing private demo-cart API, not source stubs.
// Nothing is saved to production and every browser context is discarded.
async function seedDemoCart(page, amount, paid = 0) {
  await expect
    .poll(() =>
      page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length),
    )
    .toBeGreaterThan(0)
  await page.evaluate(
    async ({ amount, paid }) => {
      const storage = await import('/src/lib/storage.js')
      const cart = await import('/src/lib/posCart.js')
      const context = storage.contextoActual()
      const product = storage.getProductos().find(product => /Funda/.test(product.nombre))
      cart.guardarCarrito(context.empresaId, context.sucursalId, context.userId, {
        items: [
          {
            key: 'qa-amount',
            productoId: product.id,
            nombre: product.nombre,
            quantity: 1,
            precio: amount,
            sobrePedido: true,
          },
        ],
        customer: { name: 'Prueba frontend local' },
        pagos: paid ? [{ medioPago: 'DINERO', monto: String(paid) }] : [],
      })
    },
    { amount, paid },
  )
}

async function assertMoneyFits(locator, expected) {
  await expect(locator).toHaveText(expected)
  const proof = await locator.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const text = range.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    let contained = text.left >= box.left - 1 && text.right <= box.right + 1
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const clip = parent.getBoundingClientRect()
      if (getComputedStyle(parent).overflowX !== 'visible')
        contained &&= text.left >= clip.left - 1 && text.right <= clip.right + 1
    }
    return {
      contained,
      lines: range.getClientRects().length,
      ellipsis: style.textOverflow === 'ellipsis',
      whitespace: style.whiteSpace,
      documentFits: document.documentElement.scrollWidth <= innerWidth,
    }
  })
  expect(proof).toMatchObject({
    contained: true,
    lines: 1,
    ellipsis: false,
    whitespace: 'nowrap',
    documentFits: true,
  })
}

for (const width of widths) {
  test(`complete monetary strings in actual POS at ${width}px`, async ({ browser }) => {
    test.setTimeout(120000)
    await mkdir(output, { recursive: true })
    const format = amount => `Gs ${new Intl.NumberFormat('es-PY').format(amount)}`
    for (const amount of [0, 180000, 100000000, 1000000000, 99000000000]) {
      for (const paid of amount ? [0, amount / 2, amount] : [0]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        await enterDemo(page)
        const navigation =
          width < 1024
            ? page.getByTestId('shell-bottom-nav')
            : page
                .getByTestId('shell-lateral')
                .getByRole('navigation', { name: 'Navegación principal', exact: true })
        await seedDemoCart(page, amount, paid)
        await navigation.getByRole('button', { name: 'Vender', exact: true }).click()
        const values = [
          ['carrito-total', amount],
          ['cobro-total', amount],
          ['cobro-pagado', paid],
          ['cobro-pendiente', amount - paid],
        ]
        for (const [testId, value] of values) {
          const root = page.getByTestId(testId)
          await assertMoneyFits(
            testId.startsWith('cobro-') ? root.locator('strong') : root,
            format(value),
          )
        }
        if (paid) await assertMoneyFits(page.getByTestId('carrito-pagado'), format(paid))
        if (paid > 0 && amount > paid)
          await assertMoneyFits(page.getByTestId('carrito-pendiente'), format(amount - paid))
        if (width < 1024) {
          await assertMoneyFits(page.getByTestId('barra-total'), format(amount))
          const bar = await page.getByTestId('pos-barra-accion').boundingBox()
          const nav = await navigation.boundingBox()
          const buttons = await page.getByTestId('pos-barra-accion').getByRole('button').all()
          for (const button of buttons) {
            const box = await button.boundingBox()
            expect(box.x).toBeGreaterThanOrEqual(0)
            expect(box.x + box.width).toBeLessThanOrEqual(width)
            expect(box.y + box.height).toBeLessThanOrEqual(nav.y)
          }
          expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y)
        }
        for (const value of await page
          .locator('.pos-money-value')
          .filter({ visible: true })
          .all()) {
          await assertMoneyFits(value, await value.innerText())
        }
        await noOverflow(page)
        if (amount >= 100000000 && paid === amount / 2) {
          await page.screenshot({ path: `${output}/large-${width}-${amount}.png`, fullPage: true })
          await page
            .getByTestId('pos-bloque-carrito')
            .screenshot({ path: `${output}/large-cart-${width}-${amount}.png` })
          await page
            .getByTestId('pos-tiles-resumen')
            .screenshot({ path: `${output}/large-summary-${width}-${amount}.png` })
          if (width < 1024)
            await page
              .getByTestId('pos-barra-accion')
              .screenshot({ path: `${output}/large-checkout-${width}-${amount}.png` })
        }
        await page.close()
      }
    }
  })
}

for (const changeTenant of [false, true]) {
  test(`demo confirmed internal order ${changeTenant ? 'does not open after tenant changes during delay' : 'automatically opens its internal detail'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await enterDemo(page)
    await seedDemoCart(page, 180000)
    await page
      .getByTestId('shell-bottom-nav')
      .getByRole('button', { name: 'Vender', exact: true })
      .click()
    const submit = page
      .getByTestId('pos-barra-accion')
      .getByRole('button', { name: /Crear pedido sin pago/ })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByRole('button', { name: 'Ver pedido', exact: true })).toBeVisible()
    if (changeTenant) {
      await page.evaluate(async () => {
        const storage = await import('/src/lib/storage.js')
        await storage.setContexto({
          ...storage.contextoActual(),
          empresaId: 'qa-other-tenant',
          fuente: 'legacy',
        })
      })
      await page.waitForTimeout(1800)
      await expect(page).toHaveURL(/\/pos$/)
    } else {
      await expect(page).toHaveURL(/\/pedidos\/[^/]+$/)
      await expect(page.locator('main')).toContainText('Prueba frontend local')
    }
  })
}

// Exercise the real API-mode POS against local, intercepted contracts only.
// The server/database never starts; these tests prove client behavior, not persistence.
async function enterApiFixture(page, outcome) {
  const product = {
    id: 'qa-product',
    name: 'Accesorio local',
    pricePyg: 180000,
    costPyg: 70000,
    isActive: true,
    stock: 100,
    category: 'Accesorios',
  }
  const order = {
    id: 'qa-internal-order-id',
    orderNumber: 'PUBLIC-QA-999',
    createdAt: new Date().toISOString(),
    totalPyg: 180000,
    subtotalPyg: 180000,
    customer: { name: 'Prueba local' },
    seller: { id: 'qa-user', name: 'Usuario local' },
    items: [
      {
        productId: product.id,
        description: product.name,
        quantity: 1,
        unitPricePyg: 180000,
        totalPyg: 180000,
      },
    ],
    payments: [],
  }
  let submitted = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    let body = []
    if (path === '/api/auth/me')
      body = {
        user: {
          id: 'qa-user',
          name: 'Usuario local',
          role: 'ADMIN',
          tenantId: 'qa-tenant',
          branchId: 'qa-branch',
          branchName: 'Sucursal local',
        },
        tenant: { id: 'qa-tenant', name: 'Tienda local' },
      }
    if (path === '/api/products') body = [product]
    if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
    if (path === '/api/pricing') body = { unitPricePyg: 180000, currency: 'PYG' }
    if (path === `/api/orders/${order.id}`) body = order
    if (path === '/api/orders' && route.request().method() === 'POST') {
      submitted++
      if (outcome === 'offline') return route.abort('failed')
      if (outcome === 'rejected')
        return route.fulfill({
          status: 422,
          json: { message: 'Pedido rechazado por prueba local', code: 'QA_REJECTED' },
        })
      body = outcome === 'missing-id' ? { ...order, id: undefined } : order
    }
    await route.fulfill({ status: 200, json: body })
  })
  // Every API endpoint is intercepted above, including any configured API origin.
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() =>
    localStorage.setItem(
      'mobos:pos-cart:v1:qa-tenant:qa-branch:qa-user',
      JSON.stringify({
        items: [
          {
            key: 'qa-order',
            productoId: 'qa-product',
            nombre: 'Accesorio local',
            quantity: 1,
            precio: 180000,
            precioManual: true,
          },
        ],
        customer: { name: 'Prueba local' },
      }),
    ),
  )
  await page.goto('/pos')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('carrito-total')).toHaveText('Gs 180.000')
  return { order, submitted: () => submitted }
}

for (const outcome of ['confirmed', 'missing-id', 'rejected', 'tenant-change', 'offline']) {
  test(`API-mode order detail admission: ${outcome}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    const fixture = await enterApiFixture(page, outcome)
    const submit = page
      .getByTestId('pos-barra-accion')
      .getByRole('button', { name: /Crear pedido sin pago/ })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect.poll(fixture.submitted).toBeGreaterThan(0)
    if (outcome === 'confirmed' || outcome === 'tenant-change') {
      await expect(page.getByRole('button', { name: 'Ver pedido', exact: true })).toBeVisible()
      if (outcome === 'tenant-change') {
        await page.evaluate(async () => {
          const storage = await import('/src/lib/storage.js')
          await storage.setContexto({
            ...storage.contextoActual(),
            empresaId: 'qa-other-tenant',
            fuente: 'api',
          })
        })
        await page.waitForTimeout(1800)
        await expect(page).toHaveURL(/\/pos$/)
      } else {
        await expect(page).toHaveURL(new RegExp(`/pedidos/${fixture.order.id}$`))
        expect(page.url()).not.toContain(fixture.order.orderNumber)
      }
    } else {
      if (outcome === 'offline') {
        await expect(
          page
            .getByText(/Venta guardada sin conexión/)
            .filter({ visible: true })
            .first(),
        ).toBeVisible()
        const queue = await page.evaluate(async () =>
          (await import('/src/lib/offline/ventas.js')).listarCola(),
        )
        expect(queue).toHaveLength(1)
        expect(queue[0].estado).toBe('pendiente')
        expect(queue[0].ordenId).toBeFalsy()
        expect(queue[0].id).toMatch(/^cola-/)
      } else {
        await expect(page.locator('main')).toContainText(
          outcome === 'rejected'
            ? 'Pedido rechazado por prueba local'
            : 'El backend no devolvió una orden confirmada.',
        )
        await expect(page.getByTestId('carrito-total')).toHaveText('Gs 180.000')
      }
      await expect(page.getByRole('button', { name: 'Ver pedido', exact: true })).toHaveCount(0)
      await page.waitForTimeout(1800)
      await expect(page).toHaveURL(/\/pos$/)
    }
  })
}

// F2 uses the actual demo sources and the existing private cart harness. Catalog
// prices, records and calculations are never replaced or rewritten by these tests.
const f2Output = '/tmp/mobos-redesign-f2-qa'
for (const width of widths) {
  for (const dark of [false, true]) {
    test(`F2 Inicio and normal POS amounts at ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await mkdir(f2Output, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      if (dark) {
        await page.getByTestId(width < 1024 ? 'shell-perfil-mobile' : 'shell-perfil').click()
        await page
          .getByRole('dialog', { name: 'Perfil y preferencias' })
          .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
          .click()
        await page.keyboard.press('Escape')
        await expect(page.locator('html')).toHaveClass(/dark/)
      }
      const expected = await page.evaluate(async () => {
        const storage = await import('/src/lib/storage.js')
        const { armarResumenDia } = await import('/src/utils/reporteResumen.js')
        const { fechaClave, gs } = await import('/src/utils/calculos.js')
        const summary = armarResumenDia({
          ventas: storage.listVentas(),
          gastos: storage.listGastos(),
          prods: storage.productosById(),
          vendedoresById: Object.fromEntries(
            storage.getVendedores().map(seller => [seller.id, seller.nombre]),
          ),
          rango: { desde: fechaClave(), hasta: fechaClave() },
        })
        return ['total', 'cobrado', 'pendiente', 'ganancia'].map(key => gs(summary[key]))
      })
      const stripe = page.getByTestId('resumen-indicadores')
      for (const [index, id] of ['facturado', 'cobrado', 'por-cobrar', 'margen'].entries()) {
        const value = page.getByTestId(`indicador-${id}`).locator('.inicio-kpi-value')
        await expect(value).toHaveText(expected[index])
        const geometry = await value.evaluate(element => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const text = range.getBoundingClientRect()
          const box = element.getBoundingClientRect()
          return {
            font: parseFloat(getComputedStyle(element).fontSize),
            contained: text.right <= box.right + 1 && text.left >= box.left - 1,
            shadow: getComputedStyle(element.parentElement).boxShadow,
          }
        })
        expect(geometry.font).toBeGreaterThanOrEqual(22)
        expect(geometry.contained).toBe(true)
        expect(geometry.shadow).toBe('none')
      }
      const cells = await stripe
        .locator('.inicio-kpi')
        .evaluateAll(elements =>
          elements.map(element => ({ x: element.offsetLeft, y: element.offsetTop })),
        )
      expect(new Set(cells.map(cell => cell.y)).size).toBe(width === 1440 ? 1 : 2)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByTestId('accesos-rapidos')).toHaveCount(0)
      const details = page.getByTestId('inicio-detalles')
      await expect(details).not.toHaveAttribute('open')
      await details.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(details).toHaveAttribute('open', '')
      for (const heading of ['Evolución', 'Stock bajo', 'Rendimiento por vendedor'])
        await expect(details.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(details).toContainText('Ticket promedio')
      await details.locator('summary').click()
      await noOverflow(page)
      await page.evaluate(() => {
        document.activeElement?.blur()
        window.scrollTo(0, 0)
      })
      await page.screenshot({
        path: `${f2Output}/${width}-Inicio${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await seedDemoCart(page, 100000000, 50000000)
      const navigation =
        width < 1024
          ? page.getByTestId('shell-bottom-nav')
          : page
              .getByTestId('shell-lateral')
              .getByRole('navigation', { name: 'Navegación principal', exact: true })
      await navigation.getByRole('button', { name: 'Vender', exact: true }).click()
      for (const [id, amount, minFont] of [
        ['carrito-total', 100000000, 24],
        ['cobro-total', 100000000, 20],
        ['cobro-pagado', 50000000, 20],
        ['cobro-pendiente', 50000000, 20],
      ]) {
        const root = page.getByTestId(id)
        const value = id.startsWith('cobro-') ? root.locator('strong') : root
        await assertMoneyFits(value, `Gs ${new Intl.NumberFormat('es-PY').format(amount)}`)
        expect(
          await value.evaluate(element => parseFloat(getComputedStyle(element).fontSize)),
        ).toBeGreaterThanOrEqual(minFont)
      }
      const toolbar = page.getByTestId('barra-pos')
      const more = await toolbar.getByTestId('pos-mas').boundingBox()
      const suspend = await toolbar
        .getByRole('button', { name: 'Suspender venta', exact: true })
        .boundingBox()
      expect(more.x + more.width <= suspend.x + 1 || more.y + more.height <= suspend.y + 1).toBe(
        true,
      )
      const catalog = await page.getByTestId('pos-bloque-productos').boundingBox()
      const cart = await page.getByTestId('pos-bloque-carrito').boundingBox()
      const client = await page.getByTestId('pos-bloque-cliente').boundingBox()
      expect(client.y).toBeLessThan(cart.y)
      if (width === 1440) expect(catalog.x + catalog.width).toBeLessThanOrEqual(cart.x)
      else {
        const bar = await page.getByTestId('pos-barra-accion').boundingBox()
        const nav = await navigation.boundingBox()
        expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y)
      }
      for (const id of [
        'pos-bloque-productos',
        'pos-bloque-cliente',
        'pos-bloque-carrito',
        'pos-cobro',
      ]) {
        expect(
          await page.getByTestId(id).evaluate(element => getComputedStyle(element).boxShadow),
        ).toBe('none')
      }
      await noOverflow(page)
      await page.evaluate(() => {
        document.activeElement?.blur()
        window.scrollTo(0, 0)
      })
      await page.screenshot({
        path: `${f2Output}/${width}-POS100m${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await page
        .getByTestId('pos-tiles-resumen')
        .screenshot({ path: `${f2Output}/${width}-POS100m-summary${dark ? '-dark' : ''}.png` })
    })
  }
}

test('F2 actual catalog variant, existing customer and payment controls retain their handlers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await page
    .getByTestId('shell-lateral')
    .getByRole('button', { name: 'Vender', exact: true })
    .click()
  const catalog = page.getByTestId('pos-bloque-productos')
  const expectedCatalogCount = await page.evaluate(
    async () => (await import('/src/lib/storage.js')).getProductos().length,
  )
  await expect(catalog).toContainText(`${expectedCatalogCount} disponibles`)
  const family = catalog.locator('.pos-product-card').filter({ hasText: '2 variantes' }).first()
  await family.click()
  const options = page.getByTestId('variante-opcion')
  await expect(options).toHaveCount(2)
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('0 productos')
  await options.first().click()
  // Any serialized choice stays explicit; never synthesize a serial or bypass it.
  const imeiDialog = page.getByRole('dialog', { name: 'Elegir IMEI de esta venta' })
  if (await imeiDialog.isVisible()) {
    await expect(imeiDialog.getByRole('button', { name: 'Listo', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
  }
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')
  const client = page.getByTestId('pos-bloque-cliente')
  await client.getByPlaceholder('Buscar cliente o escribir un nombre nuevo').fill('María González')
  await expect(client.getByRole('button', { name: 'Editar datos', exact: true })).toBeVisible()
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('María González')
  const payment = page.getByTestId('pos-bloque-pagos')
  await payment.getByRole('button', { name: '+ Agregar pago', exact: true }).click()
  await expect(payment.locator('input').filter({ visible: true }).first()).toBeVisible()
  const note = page.getByTestId('pos-cobro').getByText('Agregar nota', { exact: true })
  await note.click()
  await page.locator('#observacion').fill('Prueba local sin envío')
  await expect(page.locator('#observacion')).toHaveValue('Prueba local sin envío')
  await page.getByTestId('pos-mas').click()
  await expect(
    page.getByRole('menuitem', { name: 'Ventas suspendidas', exact: true }),
  ).toBeVisible()
  // Submission/tenant/offline cases from #341 above remain unchanged and execute in the same suite.
})

const f3Output = '/tmp/mobos-redesign-f3-qa'

async function selectVentas(page, width, label) {
  const context = page.getByTestId('shell-contexto')
  if (width < 1024) await context.getByRole('combobox').selectOption(label.toLowerCase())
  else await context.getByRole('button', { name: label, exact: true }).click()
}

async function setF3Theme(page, width, dark) {
  if (!dark) return
  await page.getByTestId(width < 1024 ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page
    .getByRole('dialog', { name: 'Perfil y preferencias' })
    .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}

for (const width of [320, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`F3 rendered orders and quotes ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await mkdir(f3Output, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await setF3Theme(page, width, dark)
      await page
        .getByTestId(width < 1024 ? 'shell-bottom-nav' : 'shell-lateral')
        .getByRole('button', { name: 'Ventas', exact: true })
        .click()
      const orders = page.getByTestId('ventas-pedidos-f3')
      await expect(orders).toBeVisible()
      const all = orders.getByRole('button', { name: 'Todos', exact: true })
      await all.click()
      await expect(all).toHaveAttribute('aria-pressed', 'true')
      const expected = await page.evaluate(async () => {
        const storage = await import('/src/lib/storage.js')
        const { orderFields } = await import('/src/components/ventas/SellerOrders.jsx')
        const { gs } = await import('/src/utils/calculos.js')
        return storage
          .listVentas()
          .map(orderFields)
          .map(row => ({
            id: row.id,
            customer: row.customer,
            products: row.products,
            total: gs(row.total),
          }))
      })
      await expect(page.getByTestId('pedido-fila')).toHaveCount(expected.length)
      for (const row of expected) {
        const card = page
          .getByTestId('pedido-fila')
          .filter({ hasText: row.customer })
          .filter({ has: page.locator('.ventas-f3-order-total', { hasText: row.total }) })
          .first()
        await expect(card.locator('.ventas-f3-name')).toHaveText(row.customer)
        await assertMoneyFits(card.locator('.ventas-f3-order-total'), row.total)
      }
      const list = page.getByTestId('pedidos-tabla')
      expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await noOverflow(page)
      await page.screenshot({
        path: `${f3Output}/${width}-Pedidos${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await orders.getByRole('button', { name: 'Con saldo', exact: true }).click()
      await expect(page.getByTestId('pedido-fila')).toHaveCount(
        await page.evaluate(async () => {
          const { listVentas } = await import('/src/lib/storage.js')
          const { orderFields } = await import('/src/components/ventas/SellerOrders.jsx')
          return listVentas()
            .map(orderFields)
            .filter(row => row.pending > 0 && row.status !== 'CANCELLED').length
        }),
      )
      await all.click()
      await orders.locator('.ventas-f3-extra-filters > summary').focus()
      await page.keyboard.press('Enter')
      await orders
        .getByRole('combobox', { name: 'Más estados de pago', exact: true })
        .selectOption('parciales')
      await expect(page.getByTestId('pedido-fila')).toHaveCount(
        await page.evaluate(async () => {
          const { listVentas } = await import('/src/lib/storage.js')
          const { orderFields } = await import('/src/components/ventas/SellerOrders.jsx')
          return listVentas()
            .map(orderFields)
            .filter(
              row =>
                row.paymentStatus === 'Parcial' &&
                !(row.creditDays > 0 && row.pending > 0) &&
                row.status !== 'CANCELLED',
            ).length
        }),
      )
      await all.click()
      await orders
        .getByRole('combobox', { name: 'Ordenar pedidos', exact: true })
        .selectOption('quantity')
      await expect(
        orders.getByRole('combobox', { name: 'Ordenar pedidos', exact: true }),
      ).toHaveValue('quantity')
      const search = orders.getByRole('textbox', { name: 'Buscar pedidos', exact: true })
      await search.fill(expected[0].customer)
      await expect(page.getByTestId('pedido-fila').first().locator('.ventas-f3-name')).toHaveText(
        expected[0].customer,
      )
      const quick = page
        .getByTestId('pedido-fila')
        .first()
        .getByRole('button', { name: /Vista rápida/ })
      await quick.focus()
      await page.keyboard.press('Enter')
      const drawer = page.getByRole('dialog')
      await expect(page.getByTestId('pedido-vista-rapida')).toBeVisible()
      await expect
        .poll(() => drawer.evaluate(element => element.contains(document.activeElement)))
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
      await expect(quick).toBeFocused()
      await page.getByTestId('pedido-fila').first().focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/pedidos\/[^?]+/)
      await expect(page.getByTestId('pedido-detalle-f3')).toBeVisible()
      await page.getByRole('button', { name: /Artículos preparados/ }).click()
      await expect(page.locator('.ventas-f3-detail-item').first()).toBeVisible()
      const print = page.getByRole('button', { name: 'Imprimir comprobante', exact: true })
      await print.click()
      const receipt = page.getByRole('dialog', { name: 'Comprobante', exact: true })
      await expect(receipt).toBeVisible()
      await expect(
        receipt.getByRole('button', { name: 'Descargar PDF', exact: true }),
      ).toBeVisible()
      await expect(
        receipt.getByRole('button', { name: 'Imprimir con diálogo', exact: true }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(receipt).not.toBeVisible()
      await expect(print).toBeFocused()
      await noOverflow(page)
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({
        path: `${f3Output}/${width}-PedidoDetalle${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Volver a pedidos', exact: true }).click()
      await expect(page).toHaveURL(/\/pedidos\?filtro=todos/)
      await selectVentas(page, width, 'Cotizaciones')
      const quotes = page.getByTestId('ventas-cotizaciones-f3')
      await expect(quotes).toBeVisible()
      const quoteData = await page.evaluate(async () => {
        const { listDemoCotizaciones } = await import('/src/lib/demoCotizaciones.js')
        const { gs } = await import('/src/utils/calculos.js')
        return listDemoCotizaciones().map(row => ({
          number: row.number,
          name: row.customerName,
          total: gs(row.totalPyg),
          status: row.status,
        }))
      })
      await expect(page.getByTestId('cotizacion-fila')).toHaveCount(quoteData.length)
      for (const row of quoteData) {
        const card = page.getByTestId('cotizacion-fila').filter({ hasText: row.number })
        await expect(card.locator('.ventas-f3-name')).toHaveText(row.name)
        await assertMoneyFits(card.locator('.ventas-f3-quote-total'), row.total)
        if (['CONVERTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(row.status))
          await expect(card.getByRole('button', { name: /Convertir|Enviar|Aceptar/ })).toHaveCount(
            0,
          )
      }
      expect(
        await page
          .getByTestId('cotizaciones-tabla')
          .evaluate(element => element.scrollWidth <= element.clientWidth),
      ).toBe(true)
      await noOverflow(page)
      await page.screenshot({
        path: `${f3Output}/${width}-Cotizaciones${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await quotes.getByRole('button', { name: 'Enviadas', exact: true }).click()
      await expect(page.getByTestId('cotizacion-fila')).toHaveCount(
        quoteData.filter(row => row.status === 'SENT').length,
      )
      await quotes.getByRole('button', { name: 'Todas', exact: true }).click()
      await quotes
        .getByRole('combobox', { name: 'Más estados de cotización', exact: true })
        .selectOption('DRAFT')
      await expect(page.getByTestId('cotizacion-fila')).toHaveCount(
        quoteData.filter(row => row.status === 'DRAFT').length,
      )
      await quotes.getByRole('button', { name: 'Todas', exact: true }).click()
      await quotes.getByRole('textbox', { name: 'Buscar cotizaciones', exact: true }).fill('iPhone')
      for (const card of await page.getByTestId('cotizacion-fila').all())
        await expect(card.locator('.ventas-f3-description')).toContainText(/iPhone/i)
      await quotes
        .getByRole('textbox', { name: 'Buscar cotizaciones', exact: true })
        .fill('ZZ-no-existing-quote')
      await expect(quotes).toContainText('No hay cotizaciones en esta vista.')
      await quotes.getByRole('textbox', { name: 'Buscar cotizaciones', exact: true }).fill('')
      const create = quotes.getByRole('button', { name: '+ Nueva cotización', exact: true })
      await create.focus()
      await page.keyboard.press('Enter')
      const modal = page.getByRole('dialog', { name: 'Nueva cotización', exact: true })
      await expect(modal).toBeVisible()
      await expect
        .poll(() => modal.evaluate(element => element.contains(document.activeElement)))
        .toBe(true)
      await page.keyboard.press('Tab')
      await expect
        .poll(() => modal.evaluate(element => element.contains(document.activeElement)))
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(modal).not.toBeVisible()
      await expect(create).toBeFocused()
    })
  }
}

test('F3 quote primary and secondary handlers, keyboard menu and dialogs remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await enterDemo(page)
  await page.goto('/cotizaciones')
  const draft = page.getByTestId('cotizacion-fila').filter({ hasText: 'COT-#0019' })
  const more = draft.getByRole('button', { name: 'Más', exact: true })
  await more.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: 'Acciones de COT-#0019' })
  await expect(menu.getByRole('menuitem', { name: 'Enlace/QR', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await more.click()
  await menu.getByRole('menuitem', { name: 'Historial', exact: true }).click()
  const history = page.getByRole('dialog', { name: 'Historial de COT-#0019' })
  await expect(history).toBeVisible()
  await expect
    .poll(() => history.evaluate(element => element.contains(document.activeElement)))
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(history).not.toBeVisible()
  await expect(more).toBeFocused()
  // Reopen with the keyboard and close with the dialog button: same persistent trigger.
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Enlace/QR', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Historial', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(history).toBeVisible()
  await history.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(history).not.toBeVisible()
  await expect(more).toBeFocused()
  await draft.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(draft).toHaveAttribute('data-estado', 'SENT')
  await expect(draft.getByRole('button', { name: 'Enviar', exact: true })).toHaveCount(0)
  await draft.getByRole('button', { name: 'Enlace/QR', exact: true }).click()
  const link = page.getByRole('dialog', { name: 'Enlace de COT-#0019' })
  await expect(link).toBeVisible()
  for (const label of ['Copiar enlace', 'Imprimir', 'Proforma', 'Enviar por WhatsApp'])
    await expect(link.getByRole('button', { name: label, exact: true })).toBeVisible()
  await expect(link.getByTestId('compartir-pdf')).toBeVisible()
  await expect(link.getByTestId('descargar-pdf')).toBeVisible()
  await link.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Vista previa de la cotización' })
  await expect(preview).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
  await page.keyboard.press('Escape')
  await expect(link).not.toBeVisible()
  await draft.getByRole('button', { name: 'Más', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Aceptar', exact: true }).click()
  await expect(draft).toHaveAttribute('data-estado', 'ACCEPTED')
  await draft.getByRole('button', { name: 'Convertir', exact: true }).click()
  await expect(draft).toHaveAttribute('data-estado', 'CONVERTED')
  await expect(draft.getByRole('button', { name: 'Convertir', exact: true })).toHaveCount(0)
  await draft.getByRole('button', { name: 'Más', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Cancelar', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const sent = page.getByTestId('cotizacion-fila').filter({ hasText: 'COT-#0018' })
  await sent.getByRole('button', { name: 'Más', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Cancelar', exact: true }).click()
  await expect(sent).toHaveAttribute('data-estado', 'CANCELLED')
  await noOverflow(page)
})

for (const width of [320, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`F3 isolated 100m orders and quotes ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await mkdir(f3Output, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await setF3Theme(page, width, dark)
      // Ephemeral browser-only override of existing demo rows. No source/seed or server changes.
      const fixture = await page.evaluate(async () => {
        const storage = await import('/src/lib/storage.js')
        const quotes = await import('/src/lib/demoCotizaciones.js')
        const order = storage.listVentas().find(row => row.status !== 'CANCELLED')
        const customer = 'Cliente de prueba con nombre completo para importes grandes'
        const description = 'iPhone 15 Pro Max 512GB Titanio natural'
        storage.updateVenta(order.id, {
          cliente: customer,
          customer: { name: customer },
          totalPyg: 100000000,
          subtotalPyg: 100000000,
          pagos: [],
          payments: [
            { id: 'qa-f3-payment', status: 'CONFIRMED', amountPyg: 50000000, method: 'CASH' },
          ],
          items: [
            {
              id: 'qa-f3-item',
              description,
              quantity: 1,
              totalPyg: 100000000,
              unitPricePyg: 100000000,
            },
          ],
        })
        const quote = quotes.listDemoCotizaciones().find(row => row.status === 'DRAFT')
        quotes.actualizarDemoCotizacion(quote.id, {
          customerName: customer,
          totalPyg: 100000000,
          subtotalPyg: 100000000,
          items: [{ description, quantity: 1, totalPyg: 100000000, unitPricePyg: 100000000 }],
        })
        return { id: order.id, quoteNumber: quote.number, customer, description }
      })
      await page
        .getByTestId(width < 1024 ? 'shell-bottom-nav' : 'shell-lateral')
        .getByRole('button', { name: 'Ventas', exact: true })
        .click()
      await page.getByRole('button', { name: 'Todos', exact: true }).click()
      const order = page.getByTestId('pedido-fila').filter({ hasText: fixture.customer })
      await assertMoneyFits(order.locator('.ventas-f3-order-total'), 'Gs 100.000.000')
      await expect(order.locator('.ventas-f3-description')).toContainText(fixture.description)
      await order.getByRole('button', { name: /Vista rápida/ }).click()
      const quick = page.getByTestId('pedido-vista-rapida')
      await expect(quick).toBeVisible()
      const quickTotal = quick.locator('dd').filter({ hasText: /^Gs 100\.000\.000$/ })
      await expect(quickTotal).toHaveText('Gs 100.000.000')
      expect(await quickTotal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
      await page.keyboard.press('Escape')
      await order.click()
      await expect(page).toHaveURL(new RegExp(`/pedidos/${fixture.id}`))
      for (const [index, value] of ['Gs 100.000.000', 'Gs 50.000.000', 'Gs 50.000.000'].entries())
        await assertMoneyFits(page.getByTestId('pedido-totales-f3').locator('dd').nth(index), value)
      await page.getByRole('button', { name: /Artículos preparados/ }).click()
      await expect(page.locator('.ventas-f3-detail-item')).toContainText(fixture.description)
      await page.getByRole('button', { name: /Información de pago/ }).click()
      for (const close of await page
        .getByRole('button', { name: 'Cerrar aviso', exact: true })
        .all())
        await close.click()
      await page.evaluate(() => scrollTo(0, 0))
      await expect(page.getByTestId('pedido-totales-f3')).toBeInViewport()
      await page
        .getByTestId('pedido-totales-f3')
        .screenshot({ path: `${f3Output}/${width}-Pedido100m-totals${dark ? '-dark' : ''}.png` })
      await page.evaluate(() => scrollTo(0, 0))
      await noOverflow(page)
      await page.screenshot({
        path: `${f3Output}/${width}-Pedido100m${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
      await selectVentas(page, width, 'Cotizaciones')
      const quote = page.getByTestId('cotizacion-fila').filter({ hasText: fixture.quoteNumber })
      await assertMoneyFits(quote.locator('.ventas-f3-quote-total'), 'Gs 100.000.000')
      await expect(quote.locator('.ventas-f3-name')).toHaveText(fixture.customer)
      await noOverflow(page)
      await page.screenshot({
        path: `${f3Output}/${width}-Cotizacion100m${dark ? '-dark' : ''}.png`,
        fullPage: true,
      })
    })
  }
}
