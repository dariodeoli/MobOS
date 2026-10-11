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
