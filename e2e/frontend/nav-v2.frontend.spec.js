import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { rutaDeVista } from '../../src/lib/rutas.js'
import {
  clickShellTab,
  openShellDestination,
  selectFinanceSection,
  selectInventorySection,
} from '../helpers/shell-navigation.js'

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
    await expect(navigation.getByRole('button')).toHaveText(
      mobile
        ? ['Inicio', 'Vender', 'Ventas', 'Stock', 'Más']
        : [
            'Inicio',
            'Vender',
            'Ventas',
            'Clientes',
            'Taller',
            'Stock',
            'Compras',
            'Finanzas',
            'Análisis',
            'Configuración',
          ],
    )
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
    await expect(page).toHaveURL(/\/stock\/unidades/)
    const context = page.getByTestId('shell-contexto')
    // Tabs, never a native dropdown: Unidades · Productos · Traslados · Precios.
    await expect(context.getByRole('combobox')).toHaveCount(0)
    await expect(context.locator('[data-tab-id="unidades"]')).toHaveAttribute('aria-current', 'page')
    await clickShellTab(page, 'shell-contexto', 'productos')
    await expect(page).toHaveURL(/\/productos/)
    await openShellDestination(page, 'Compras')
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
  ['Vendedor', /\/pos/, ['Vender', 'Ventas', 'Clientes', 'Stock']],
  ['Gerente', /\/pos/, ['Vender', 'Ventas', 'Clientes', 'Stock']],
  ['Caja', /\/pos/, ['Vender', 'Ventas', 'Clientes', 'Stock']],
  // A single section needs no bottom bar.
  ['Técnico', /\/servicio/, null],
  ['Delivery', /\/delivery\/repartos/, null],
]) {
  test(`${role} has only permitted primary destinations and correct landing`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await enterDemo(page, role)
    await expect(page).toHaveURL(landing)
    if (labels) await expect(page.getByTestId('shell-bottom-nav').getByRole('button')).toHaveText(labels)
    else await expect(page.getByTestId('shell-bottom-nav')).toHaveCount(0)
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
  await expect(page.getByTestId('config-grupos')).toBeVisible()
  await expect(page.getByTestId('config-grupos').getByRole('combobox')).toHaveCount(0)
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
  // Section → level 1 tab → catalog ids it renders (level 2 when several).
  const destinations = {
    Inicio: { resumen: ['resumen'], ops: ['ops'] },
    Ventas: {
      pedidos: ['pedidos'],
      cotizaciones: ['cotizaciones'],
      repartos: ['repartos'],
      autorizaciones: ['autorizaciones'],
    },
    Clientes: {
      clientes: ['clientes'],
      promociones: ['promociones'],
      plantillas: ['plantillas'],
    },
    Taller: { servicio: ['servicio'], 'tradein-admin': ['tradein-admin'] },
    Stock: {
      unidades: ['unidades'],
      productos: ['productos'],
      traslados: ['traslados'],
      control: ['control'],
      precios: ['precios', 'celulares', 'comparador', 'centro-control'],
    },
    Compras: {
      compras: ['compras'],
      abastecimiento: ['abastecimiento'],
      'compras-centro': ['compras-centro'],
      preparacion: ['preparacion'],
      lotes: ['lotes'],
      recepcion: ['recepcion'],
      metricas: ['metricas'],
    },
    Finanzas: {},
    Análisis: {},
  }
  const enter = async label => {
    const direct = navigation.getByRole('button', { name: label, exact: true })
    if (await direct.count()) await direct.click()
    else {
      await page.getByTestId('shell-mas').click()
      await page
        .getByTestId('shell-mas-hoja')
        .getByRole('button', { name: label, exact: true })
        .click()
    }
  }
  const routes = {
    unidades: '/stock/unidades',
    traslados: '/stock/traslados',
    control: '/stock/conteos',
    'tradein-admin': '/trade-in',
  }
  for (const [label, groups] of Object.entries(destinations)) {
    await enter(label)
    const context = page.getByTestId('shell-contexto')
    if (!Object.keys(groups).length) {
      // One destination: no level 1 row; the page tabs stay on the page header.
      await expect(context).toHaveCount(0)
      continue
    }
    expect(
      await context.locator('[data-tab-id]').evaluateAll(tabs => tabs.map(tab => tab.dataset.tabId)),
    ).toEqual(Object.keys(groups))
    await expect(context.locator('[aria-current="page"]')).toHaveCount(1)
    for (const [group, ids] of Object.entries(groups)) {
      if (group === 'ops') continue // standalone protected operational board requires backend
      await clickShellTab(page, 'shell-contexto', group)
      for (const id of ids) {
        if (ids.length > 1) await clickShellTab(page, 'shell-subcontexto', id)
        const route = routes[id] || rutaDeVista(id)
        await expect(page).toHaveURL(new RegExp(`${route}$`))
        // aria-current marks the active tab on both levels.
        await expect(
          page.getByTestId('shell-contexto').locator(`[data-tab-id="${group}"]`),
        ).toHaveAttribute('aria-current', 'page')
        if (ids.length > 1)
          await expect(
            page.getByTestId('shell-subcontexto').locator(`[data-tab-id="${id}"]`),
          ).toHaveAttribute('aria-current', 'page')
      }
    }
  }
  await enter('Finanzas')
  await expect(page).toHaveURL(/\/finanzas\/caja/)
  await selectFinanceSection(page, 'Conciliación')
  await expect(page).toHaveURL(/\/finanzas\/conciliacion/)
  await navigation.getByRole('button', { name: 'Stock', exact: true }).click()
  // Reservas es una vista de Control (segundo nivel de la pestaña del shell).
  await selectInventorySection(page, 'reservas')
  await expect(page).toHaveURL(/\/stock\/reservas/)
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
        expect(geometry.font).toBeGreaterThanOrEqual(20)
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
      // Cliente arriba del catálogo (columna izquierda) y carrito al costado.
      if (width >= 1024) {
        expect(client.y + client.height).toBeLessThanOrEqual(catalog.y + 1)
        expect(client.x + client.width).toBeLessThanOrEqual(cart.x + 1)
      } else expect(client.y).toBeLessThan(cart.y)
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
  await context.locator(`[data-tab-id="${label.toLowerCase()}"]`).click()
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
      // «Más estados» despliega los chips de pago poco frecuentes (sin select nativo).
      await orders.getByRole('button', { name: 'Más estados', exact: true }).click()
      await orders.getByRole('button', { name: 'Parciales', exact: true }).click()
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
      // El orden vive en el menú «Ordenar» (reemplaza al select nativo).
      await orders.getByRole('button', { name: 'Ordenar', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Cantidad', exact: true }).click()
      await expect(orders.getByTestId('pedidos-orden')).toHaveAttribute('data-orden', 'quantity')
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
      await quotes.getByRole('button', { name: 'Más estados', exact: true }).click()
      await quotes.getByRole('button', { name: 'Borradores', exact: true }).click()
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

// Bounded store Entregas checks. Existing 48 cases above are retained verbatim.
const deliveryOutput = '/tmp/mobos-redesign-delivery-qa'

for (const width of [320, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`F3 rendered Entregas ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      await mkdir(deliveryOutput, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await setF3Theme(page, width, dark)
      await page.goto('/delivery')
      // The root is a labelled group; selectors stay scoped to the actual store screen.
      const root = page.locator('[aria-label="Asignación de repartos"]')
      const cards = root.getByTestId('reparto-admin-pedido')
      await expect(cards).toHaveCount(2)
      await expect(cards.first()).toContainText('Lucía Franco')
      await expect(cards.first()).toContainText('Calle Lucía 145, Asunción, Capital')
      await expect(cards.first()).toContainText('AirPods Pro 2 USB-C')
      await expect(cards.first().getByTestId('asignar-reparto')).toBeDisabled()
      await root.getByRole('button', { name: 'Asignados', exact: true }).click()
      await expect(root.getByRole('button', { name: 'Asignados', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(cards).toHaveCount(2)
      await expect(cards.first()).toContainText('Juan Pereira')
      await expect(cards.first()).toContainText('Av. Mcal. López 1234, Asunción, Capital')
      await expect(cards.nth(1)).toContainText('Pre-pagado sin verificar')
      await expect(cards.nth(1)).toContainText('Cobrado en la calle sin rendir')
      await expect(cards.first().getByRole('button', { name: 'Reasignar' })).toBeVisible()
      await expect(cards.first().getByRole('button', { name: 'Liberar' })).toBeVisible()
      await root.getByRole('button', { name: 'Todos', exact: true }).click()
      await expect(cards).toHaveCount(4)
      const columns = await root
        .locator('.entregas-f3-grid')
        .evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width === 1440 ? 2 : 1)
      await noOverflow(page)
      for (const control of await root
        .locator('button, select, summary, .entregas-f3-consent')
        .all()) {
        if (!(await control.isVisible())) continue
        const box = await control.boundingBox()
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      const summary = cards.first().locator('summary')
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(
        cards.first().getByRole('checkbox', { name: 'Autorizar entrega con saldo' }),
      ).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(cards.first().getByRole('checkbox')).toBeFocused()
      await page.keyboard.press('Space')
      await expect(cards.first().getByRole('checkbox')).toBeChecked()
      await page.keyboard.press('Escape')
      await expect(summary).toBeFocused()
      await expect(cards.first().getByRole('checkbox')).toBeHidden()
      await noOverflow(page)
      await page.screenshot({
        path: `${deliveryOutput}/${width}-${dark ? 'dark' : 'light'}-entregas.png`,
        fullPage: true,
      })
      // Isolated browser-only stress values on the existing demo row, not business fixture edits.
      await page.evaluate(async () => {
        const { leerDemo, guardarDemo } = await import('/src/lib/demoStorage.js')
        const state = JSON.parse(leerDemo('mobos:demo-delivery:v1'))
        const row = state.orders.find(order => !order.assignedToId)
        row.totalPyg = 100000000
        row.delivery.pendingPyg = 100000000
        row.customer.name = 'Nombre completo de prueba aislada para verificar lectura sin elipsis'
        guardarDemo('mobos:demo-delivery:v1', JSON.stringify(state))
      })
      await root.getByRole('button', { name: 'Sin asignar', exact: true }).click()
      await expect(cards.first()).toContainText(
        'Nombre completo de prueba aislada para verificar lectura sin elipsis',
      )
      const amounts = cards.first().locator('.entregas-f3-amounts strong')
      await expect(amounts).toHaveText(['Gs 100.000.000', 'Gs 100.000.000'])
      for (const amount of await amounts.all()) {
        expect(
          await amount.evaluate(el => ({
            fits: el.scrollWidth <= el.clientWidth,
            font: parseFloat(getComputedStyle(el).fontSize),
            ellipsis: getComputedStyle(el).textOverflow,
          })),
        ).toEqual({ fits: true, font: 16, ellipsis: 'clip' })
      }
      await noOverflow(page)
      await page.screenshot({
        path: `${deliveryOutput}/${width}-${dark ? 'dark' : 'light'}-100m.png`,
        fullPage: true,
      })
      // Settlement entry and controls remain available; this is not a settlement redesign.
      await page.getByRole('button', { name: 'Rendiciones', exact: true }).click()
      await expect(page.getByTestId('rendicion-admin')).toHaveCount(1)
      await expect(page.getByTestId('rendicion-verificar')).toBeVisible()
      await expect(
        page.getByTestId('rendicion-admin').getByRole('button', { name: 'Rechazar' }),
      ).toBeVisible()
      await noOverflow(page)
    })
  }
}

test('F3 Entregas demo assignment and release preserve existing workflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await enterDemo(page)
  await page.goto('/delivery')
  const root = page.locator('[aria-label="Asignación de repartos"]')
  const first = root.getByTestId('reparto-admin-pedido').first()
  await first.getByRole('combobox').selectOption('demo-user-repartidor')
  await expect(first.getByTestId('asignar-reparto')).toBeEnabled()
  await first.getByTestId('asignar-reparto').click()
  await expect(root.getByTestId('reparto-admin-pedido')).toHaveCount(1)
  await root.getByRole('button', { name: 'Asignados', exact: true }).click()
  const assigned = root.getByTestId('reparto-admin-pedido').filter({ hasText: 'Lucía Franco' })
  await assigned.getByRole('button', { name: 'Reasignar' }).click()
  await expect(assigned).toBeVisible()
  await assigned.getByRole('button', { name: 'Liberar' }).click()
  await expect(assigned).toHaveCount(0)
  await root.getByRole('button', { name: 'Sin asignar', exact: true }).click()
  await expect(root.getByTestId('reparto-admin-pedido')).toHaveCount(2)
})

for (const denied of [false, true]) {
  test(`F3 Entregas API handler contract mocks ${denied ? 'denied' : 'accepted'} (no persistence proof)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    const requests = []
    const verificationRequests = []
    let settlementState = 'PENDING'
    // Explicit in-browser contract mocks only; no credentials, server or production records.
    let assignedToId = null
    const row = {
      id: 'qa-delivery',
      orderNumber: 'QA-DELIVERY',
      totalPyg: 100000000,
      customer: {
        name: 'Cliente de contrato aislado',
        addresses: [{ address: 'Dirección de contrato aislado' }],
      },
      items: [{ quantity: 1, description: 'Artículo de contrato aislado' }],
      fulfillmentStatus: 'PROCESSING',
      delivery: { pendingPyg: 100000000 },
      payments: [],
    }
    await page.route(/https:\/\//, route => route.abort())
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (!url.pathname.startsWith('/api/')) return route.continue()
      const path = url.pathname
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
      if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
      if (path === '/api/delivery/settlements')
        body =
          settlementState === url.searchParams.get('estado')
            ? [
                {
                  id: 'qa-settlement',
                  status: settlementState,
                  totalPyg: 50000000,
                  pendingPyg: 0,
                  ordersCount: 1,
                  deliveryUser: { name: 'Repartidor A' },
                  createdAt: '2026-10-11T10:00:00Z',
                  payments: [
                    {
                      id: 'qa-pending-payment',
                      amountPyg: 50000000,
                      status: 'PENDING',
                      method: 'CASH',
                      order: { orderNumber: 'QA-DELIVERY' },
                    },
                  ],
                },
              ]
            : []
      if (path === '/api/delivery/settlements/qa-settlement/verify') {
        const payload = route.request().postDataJSON()
        verificationRequests.push(payload)
        settlementState = payload.state
        body = { status: settlementState }
      }
      if (path === '/api/delivery/team')
        body = [
          { id: 'qa-driver-a', name: 'Repartidor A' },
          { id: 'qa-driver-b', name: 'Repartidor B' },
        ]
      if (path === '/api/delivery/orders') {
        const filter = url.searchParams.get('asignado')
        body =
          (filter === 'sin-asignar' && assignedToId) || (filter === 'asignados' && !assignedToId)
            ? []
            : [
                {
                  ...row,
                  assignedToId,
                  assignedTo: assignedToId
                    ? {
                        id: assignedToId,
                        name: assignedToId === 'qa-driver-a' ? 'Repartidor A' : 'Repartidor B',
                      }
                    : null,
                },
              ]
      }
      if (path === '/api/orders/qa-delivery/assignment' && route.request().method() === 'POST') {
        const payload = route.request().postDataJSON()
        requests.push(payload)
        if (denied)
          return route.fulfill({
            status: 403,
            json: { message: 'Autorización denegada por contrato aislado' },
          })
        assignedToId = payload.assignedToId
        body = { ...row, assignedToId }
      }
      await route.fulfill({ status: 200, json: body })
    })
    await page.goto('/delivery')
    const root = page.locator('[aria-label="Asignación de repartos"]')
    const card = root.getByTestId('reparto-admin-pedido')
    await expect(card).toHaveCount(1)
    await card.getByRole('combobox').selectOption('qa-driver-a')
    await card.locator('summary').click()
    await card.getByRole('checkbox', { name: 'Autorizar entrega con saldo' }).check()
    await card.getByTestId('asignar-reparto').click()
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]).toEqual({ assignedToId: 'qa-driver-a', allowUnpaidDelivery: true })
    if (denied) {
      await expect(page.getByText('Autorización denegada por contrato aislado')).toBeVisible()
      await expect(card).toHaveCount(1)
      await expect(card.getByTestId('asignar-reparto')).toBeEnabled()
    } else {
      await expect(card).toHaveCount(0)
      await root.getByRole('button', { name: 'Asignados', exact: true }).click()
      await expect(card).toHaveCount(1)
      await card.getByRole('combobox').selectOption('qa-driver-b')
      await card.getByRole('button', { name: 'Reasignar' }).click()
      await expect.poll(() => requests.length).toBe(2)
      expect(requests[1]).toEqual({ assignedToId: 'qa-driver-b', allowUnpaidDelivery: true })
      await expect(card).toContainText('Repartidor B')
      await card.getByRole('button', { name: 'Liberar' }).click()
      await expect.poll(() => requests.length).toBe(3)
      expect(requests[2]).toEqual({ assignedToId: null })
      await expect(card).toHaveCount(0)
      await root.getByRole('button', { name: 'Sin asignar', exact: true }).click()
      await expect(card).toHaveCount(1)
      // Remounting resets the UI checkbox, so an unchecked assignment omits the flag.
      await page.reload()
      await expect(card).toHaveCount(1)
      await card.getByRole('combobox').selectOption('qa-driver-a')
      await card.getByTestId('asignar-reparto').click()
      await expect.poll(() => requests.length).toBe(4)
      expect(requests[3]).toEqual({ assignedToId: 'qa-driver-a' })
    }
    if (!denied) {
      await page.getByRole('button', { name: 'Rendiciones', exact: true }).click()
      await expect(page.getByTestId('rendicion-admin')).toContainText('Pendiente')
      await page.getByTestId('rendicion-verificar').click()
      const dialog = page.getByRole('dialog', { name: '¿Verificar la rendición?' })
      await expect(dialog).toBeVisible()
      expect(verificationRequests).toEqual([])
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await page.getByTestId('rendicion-verificar').click()
      await dialog.getByRole('button', { name: 'Verificar', exact: true }).click()
      await expect.poll(() => verificationRequests.length).toBe(1)
      expect(verificationRequests[0]).toEqual({ state: 'VERIFIED' })
      await expect(page.getByTestId('rendicion-admin')).toHaveCount(0)
      // Reset only the explicit contract mock, not application or backend records.
      settlementState = 'PENDING'
      // Reload also resets the API client's short GET cache for this new mock scenario.
      await page.reload()
      await page.getByRole('button', { name: 'Rendiciones', exact: true }).click()
      await expect(page.getByTestId('rendicion-admin')).toHaveCount(1)
      await page
        .getByTestId('rendicion-admin')
        .getByRole('button', { name: 'Rechazar', exact: true })
        .click()
      const reject = page.getByRole('dialog', { name: 'Rechazar la rendición', exact: true })
      await reject.getByLabel('Motivo', { exact: true }).fill('Contrato aislado sin persistencia')
      await reject.getByTestId('rendicion-rechazar').click()
      await expect.poll(() => verificationRequests.length).toBe(2)
      expect(verificationRequests[1]).toEqual({
        state: 'REJECTED',
        note: 'Contrato aislado sin persistencia',
      })
    }
    await noOverflow(page)
  })
}

// F3 Clientes: isolated frontend contracts, never backend/persistence evidence.
const clientesOutput = '/tmp/mobos-redesign-clientes-qa'
const longCustomerName = 'Comercial San Miguel y Asociados Importaciones de Tecnología Paraguay'
const clienteFixture = (index = 0) => ({
  id: `qa-cliente-${index}`,
  name: index === 0 ? longCustomerName : `Cliente local ${String(index).padStart(2, '0')}`,
  phone: '0981123456',
  countryCode: '+595',
  email: 'qa@example.invalid',
  pricingTier: index === 0 ? 'WHOLESALE' : 'RETAIL',
  creditLimitPyg: index === 0 ? 100000000 : null,
  stats: {
    orders: 2,
    totalSpentPyg: index === 0 ? 100000000 : 1000,
    pendingPyg: index === 0 ? 100000000 : index === 50 ? 250000 : 0,
    lastOrderAt: '2026-10-10T12:00:00Z',
  },
})

async function mockClientes(
  page,
  { role = 'ADMIN', summaryFailure = false, paginated = false, rejected = false } = {},
) {
  const state = { queries: [], posts: [], exports: [], summaries: 0, total: 127 }
  const fixtures = Array.from({ length: paginated ? 51 : 2 }, (_, index) => clienteFixture(index))
  await page.route(/https:\/\//, (route) => route.abort())
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const path = url.pathname
    let body = []
    if (path === '/api/auth/me')
      body = {
        user: {
          id: 'qa-user',
          name: 'Usuario local',
          role,
          tenantId: 'qa-tenant',
          branchId: 'qa-branch',
          branchName: 'Sucursal local',
        },
        tenant: { id: 'qa-tenant', name: 'Tienda local' },
      }
    if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
    if (path === '/api/customers/summary') {
      state.summaries++
      if (summaryFailure)
        return route.fulfill({ status: 503, json: { message: 'Resumen aislado no disponible' } })
      body = { total: state.total, wholesalers: 1, retail: state.total - 1 }
    }
    if (path === '/api/customers' && route.request().method() === 'GET') {
      state.queries.push(Object.fromEntries(url.searchParams))
      body = paginated
        ? url.searchParams.has('cursor')
          ? fixtures.slice(50)
          : fixtures.slice(0, 50)
        : fixtures
    }
    if (path === '/api/customers' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      state.posts.push(payload)
      if (rejected)
        return route.fulfill({
          status: 403,
          json: { message: 'Alta denegada por contrato aislado' },
        })
      state.total++
      body = payload.rows ? { created: 1, skipped: 0, total: 1 } : { id: 'qa-created' }
    }
    if (path === '/api/message-templates')
      body = [
        {
          id: 'qa-template',
          name: 'Saludo local',
          category: 'CUSTOMERS',
          body: 'Hola {{cliente}}',
          isActive: true,
        },
      ]
    if (path === '/api/customers/duplicates') body = { duplicados: [] }
    if (path === '/api/customers/segments') body = { rows: [], total: 0 }
    if (/^\/api\/customers\/qa-cliente-\d+$/.test(path)) {
      const customer = fixtures.find((row) => row.id === path.split('/').pop())
      body = {
        customer,
        orders: [],
        payments: [],
        devices: [],
        notes: [],
        followUps: [],
        warranties: [],
        services: [],
        billingIdentities: [],
        summary: {},
      }
    }
    if (path.includes('/analytics')) body = { summary: {}, periods: [], products: [] }
    if (path.includes('/timeline')) body = { rows: [], nextCursor: null }
    if (path === '/api/exports/customers') {
      state.exports.push(Object.fromEntries(url.searchParams))
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'Nombre,Correo\nCliente,qa@example.invalid',
      })
    }
    return route.fulfill({ status: 200, json: body })
  })
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
  return state
}

for (const width of [320, 390, 768, 860, 861, 1440]) {
  for (const dark of [false, true]) {
    test(`F3 Clientes presentation, menus and profile at ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await mkdir(clientesOutput, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await mockClientes(page)
      await page.goto('/clientes')
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark)
      const root = page.locator('.clientes-f3')
      const row = root.getByTestId('cliente-fila').first()
      await expect(row).toContainText(longCustomerName)
      await expect(row).toContainText('100.000.000')
      await expect(row).not.toContainText('qa@example.invalid')
      await expect(root.getByTestId('resumen-clientes')).toContainText('127')
      await expect(root.getByTestId('resumen-clientes')).toContainText('2 en pantalla')
      await expect(root.getByTestId('barra-clientes').getByRole('button')).toHaveCount(3)
      expect(
        await row.locator('.clientes-f3-identity').evaluate((el) => ({
          text: el.textContent,
          ellipsis: getComputedStyle(el).textOverflow,
          fits: el.scrollWidth <= el.clientWidth,
        })),
      ).toEqual({ text: longCustomerName, ellipsis: 'clip', fits: true })
      for (const control of await root.locator('button:visible, select:visible').all()) {
        const box = await control.boundingBox()
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      const money = row
        .locator('span')
        .filter({ hasText: /^Gs\.?\s*100\.000\.000$/ })
        .last()
      expect(
        await money.evaluate((el) => ({
          ellipsis: getComputedStyle(el).textOverflow,
          fits: el.scrollWidth <= el.clientWidth,
          font: parseFloat(getComputedStyle(el).fontSize),
        })),
      ).toEqual({ ellipsis: 'clip', fits: true, font: 14 })
      await noOverflow(page)
      await page.screenshot({
        path: `${clientesOutput}/${width}-${dark ? 'dark' : 'light'}-clientes.png`,
        fullPage: true,
      })
      const trigger = row.getByTestId('cliente-mas-acciones')
      await trigger.focus()
      await page.keyboard.press('ArrowDown')
      const menu = row.getByRole('menu')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(menu.getByRole('menuitem').nth(1)).toBeFocused()
      await page.keyboard.press('End')
      await expect(menu.getByRole('menuitem').last()).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(menu.getByRole('menuitem').last()).toBeFocused()
      await page.keyboard.press('Enter')
      const template = row.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
      await expect(template).toBeVisible()
      await expect(template.getByRole('button').first()).toBeFocused()
      await noOverflow(page)
      await page.keyboard.press('Escape')
      await expect(template).toBeHidden()
      await expect(menu.getByRole('menuitem').last()).toBeFocused()
      await page.keyboard.press('Home')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await menu.getByRole('menuitem').first().click()
      const profile = page.getByRole('dialog', {
        name: `Cliente: ${longCustomerName}`,
        exact: true,
      })
      await expect(profile).toBeVisible()
      await expect(profile.getByTestId('perfil-cabecera-fija')).toBeVisible()
      await noOverflow(page)
      await page.keyboard.press('Escape')
      await expect(profile).toBeHidden()
      await expect(trigger).toBeFocused()
      await row.getByRole('button', { name: `Resumen rápido de ${longCustomerName}` }).click()
      const quick = page.getByRole('dialog', { name: `Cliente: ${longCustomerName}`, exact: true })
      await expect(quick.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
      await expect(quick).toContainText('qa@example.invalid')
      await page.keyboard.press('Escape')
      await noOverflow(page)
      await root.getByRole('button', { name: 'Ver como cuadrícula', exact: true }).click()
      await expect(root.locator('.clientes-f3-grid > li')).toHaveCount(2)
      await noOverflow(page)
      await root.getByRole('button', { name: 'Ver como lista', exact: true }).click()
      await expect(root.getByTestId('cliente-fila')).toHaveCount(2)
    })
  }
}

test('F3 Clientes cursor, tenant/page scopes, filters and export contracts', async ({ page }) => {
  const state = await mockClientes(page, { paginated: true })
  await page.goto('/clientes')
  const root = page.locator('.clientes-f3')
  await expect(root.getByTestId('cliente-fila')).toHaveCount(50)
  await expect(root.getByTestId('resumen-clientes')).toContainText('127')
  await expect(root.getByTestId('resumen-clientes')).toContainText('50 en pantalla')
  expect(state.queries[0]).toEqual({ orden: 'actividad', limit: '50' })
  await root.getByRole('button', { name: 'Cargar más clientes' }).click()
  await expect(root.getByTestId('cliente-fila')).toHaveCount(51)
  expect(state.queries.at(-1)).toEqual({ orden: 'actividad', limit: '50', cursor: 'qa-cliente-49' })
  await expect(root.getByTestId('resumen-clientes')).toContainText('51 en pantalla')
  const pageDebt = root.getByTestId('resumen-clientes').locator('> div').last()
  await expect(pageDebt).toContainText('100.250.000')
  await expect(pageDebt).toContainText('En pantalla')
  await expect(root.getByRole('button', { name: 'Cargar más clientes' })).toHaveCount(0)
  const queriesBefore = state.queries.length
  await root.getByRole('button', { name: 'Ordenar cliente en pantalla', exact: true }).click()
  expect(state.queries.length).toBe(queriesBefore)
  await root.getByRole('combobox', { name: 'Ordenar clientes en la tienda' }).selectOption('total')
  await expect.poll(() => state.queries.at(-1)?.orden).toBe('total')
  await root.getByRole('button', { name: 'Con deuda', exact: true }).click()
  await root.getByRole('textbox', { name: 'Buscar clientes' }).fill('Paraguay')
  await expect.poll(() => state.queries.at(-1)?.q).toBe('Paraguay')
  expect(state.queries.at(-1)).toEqual({
    q: 'Paraguay',
    filtro: 'deuda',
    orden: 'total',
    limit: '50',
  })
  await root
    .getByTestId('barra-clientes')
    .getByRole('button', { name: 'Exportar CSV', exact: true })
    .click()
  await expect.poll(() => state.exports.length).toBe(1)
  expect(state.exports[0]).toEqual({ q: 'Paraguay', filtro: 'deuda' })
  const first = root.getByTestId('cliente-fila').first()
  await first.getByRole('checkbox').check()
  const download = page.waitForEvent('download')
  await root.getByRole('button', { name: 'Exportar CSV', exact: true }).last().click()
  expect((await download).suggestedFilename()).toBe('mobos-clientes-seleccionados.csv')
  await root.getByTestId('cliente-fila').nth(1).getByRole('checkbox').check()
  await expect(root.getByTestId('unificar-seleccionados')).toBeVisible()
  await noOverflow(page)
})

for (const role of ['ADMIN', 'GERENTE', 'VENDEDOR']) {
  test(`F3 Clientes summary unavailable and campaigns return for ${role}`, async ({ page }) => {
    const state = await mockClientes(page, { role, summaryFailure: true })
    await page.goto('/clientes')
    const root = page.locator('.clientes-f3')
    await expect(root.getByTestId('resumen-clientes')).toContainText('—')
    await expect(
      root.getByRole('status').filter({ hasText: 'Resumen de tienda no disponible' }),
    ).toContainText('Resumen de tienda no disponible')
    const tenantCount = root.getByTestId('resumen-clientes').locator('> div').first()
    await expect(tenantCount.locator('.clientes-f3-value')).toHaveText('—')
    await expect(tenantCount).toContainText('Tienda · 2 en pantalla')
    if (role === 'VENDEDOR')
      await expect(root.getByRole('navigation', { name: 'Secciones de clientes' })).toHaveCount(0)
    else {
      const nav = root.getByRole('navigation', { name: 'Secciones de clientes' })
      await nav.getByRole('button', { name: 'Campañas', exact: true }).click()
      await expect(nav).toBeVisible()
      await nav.getByRole('button', { name: 'Clientes', exact: true }).click()
      await expect(root.getByTestId('cliente-fila')).toHaveCount(2)
    }
    expect(state.posts).toEqual([])
  })
}

for (const rejected of [false, true]) {
  test(`F3 Clientes create consent/credit and summary refresh ${rejected ? 'denied' : 'confirmed plus import'}`, async ({
    page,
  }) => {
    const state = await mockClientes(page, { rejected, role: rejected ? 'VENDEDOR' : 'ADMIN' })
    await page.goto('/clientes')
    await expect(page.locator('.clientes-f3-value').first()).toHaveText('127')
    const summariesBefore = state.summaries
    await page.getByRole('button', { name: '+ Crear cliente', exact: true }).click()
    const create = page.getByRole('dialog', { name: 'Crear cliente', exact: true })
    await create.getByLabel('Primer nombre', { exact: true }).fill('Cliente')
    await create.getByLabel('Segundo nombre', { exact: false }).fill('Aislado')
    for (const label of ['WhatsApp', 'SMS', 'Email'])
      await expect(create.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked()
    await create.getByRole('checkbox', { name: 'WhatsApp', exact: true }).check()
    await create.getByRole('checkbox', { name: 'Email', exact: true }).check()
    await create.getByLabel('Límite de crédito (Gs)').fill('100000000')
    await create.getByLabel('Plazo de crédito (días)').fill('30')
    await create.getByRole('textbox', { name: 'Teléfono', exact: true }).fill('12')
    await create.getByRole('button', { name: 'Guardar cliente', exact: true }).click()
    expect(state.posts).toEqual([])
    await create.getByRole('textbox', { name: 'Teléfono', exact: true }).fill('0981123456')
    await create.getByRole('button', { name: 'Guardar cliente', exact: true }).click()
    await expect.poll(() => state.posts.length).toBe(1)
    expect(state.posts[0]).toMatchObject({
      name: 'Cliente Aislado',
      acceptsEmailMarketing: true,
      acceptsSmsMarketing: false,
      acceptsWhatsappMarketing: true,
      creditLimitPyg: 100000000,
      creditDays: 30,
    })
    if (rejected) {
      await expect(create).toContainText('Alta denegada por contrato aislado')
      await expect(create).toBeVisible()
      expect(state.summaries).toBe(summariesBefore)
    } else {
      await expect(create).toBeHidden()
      await expect(page.locator('.clientes-f3-value').first()).toHaveText('128')
      expect(state.summaries).toBe(summariesBefore + 1)
      await page.getByRole('button', { name: 'Importar', exact: true }).click()
      const importer = page.getByRole('dialog', { name: 'Importar clientes', exact: true })
      await importer
        .getByLabel('Filas del export a importar')
        .fill(
          'First Name,Last Name,Email,Phone\nImportado,Aislado,import@example.invalid,0981123456',
        )
      await importer.getByRole('button', { name: 'Importar clientes', exact: true }).click()
      await expect(importer).toContainText('1 clientes creados')
      await expect(page.locator('.clientes-f3-value').first()).toHaveText('129')
      expect(state.summaries).toBe(summariesBefore + 2)
      expect(state.posts[1].rows).toHaveLength(1)
      expect(state.posts[1].rows[0]).not.toHaveProperty('acceptsWhatsappMarketing')
    }
  })
}

test('F3 Clientes demo deep link, quick summary Datos and campaign restriction', async ({
  page,
}) => {
  await enterDemo(page)
  await page.goto('/clientes?cliente=demo-cliente-lucia')
  // Use the existing canonical seed id, not a new profile implementation.
  const dialog = page.getByRole('dialog', { name: /^Cliente:/ })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/cliente=/)
  const root = page.locator('.clientes-f3')
  await expect(root.getByRole('navigation', { name: 'Secciones de clientes' })).toHaveCount(0)
  await root
    .getByTestId('cliente-fila')
    .first()
    .getByRole('button', { name: /^Resumen rápido de/ })
    .click()
  await dialog.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Datos/ })).toHaveAttribute('aria-selected', 'true')
})

// F3 Taller: appended contracts only. Earlier 76 cases remain untouched.
const tallerOutput = '/tmp/mobos-redesign-taller-qa'
for (const width of [320, 390, 1440]) {
  for (const dark of [false, true]) {
    test(`F3 Taller rendered demo, keyboard and full amounts ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await mkdir(tallerOutput, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await setF3Theme(page, width, dark)
      await page.goto('/servicio')
      const root = page.locator('.taller-f3')
      await expect(root.getByTestId('servicio-fila')).toHaveCount(4)
      await expect(root).toContainText('Distribuidora del Este S.A.')
      await expect(root).toContainText('MacBook Air M2')
      await expect(root.getByLabel('Filtrar por etapa').locator('option')).toHaveCount(10)
      await expect(root.getByTestId('resumen-taller')).toContainText('En pantalla')
      await noOverflow(page)
      expect(
        await root.getByTestId('servicio-tabla').evaluate(el => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      for (const button of await root.getByRole('button').all()) {
        if (!(await button.isVisible())) continue
        const box = await button.boundingBox()
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      await page.screenshot({
        path: `${tallerOutput}/${width}-${dark ? 'dark' : 'light'}-list.png`,
        fullPage: true,
      })
      const newOrder = root.getByRole('button', {
        name: '+ Nueva orden',
        exact: true,
      })
      await newOrder.focus()
      await page.keyboard.press('Enter')
      const form = page.getByRole('dialog', {
        name: 'Nueva orden de servicio',
        exact: true,
      })
      await expect(form).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(form).toBeHidden()
      await expect(newOrder).toBeFocused()
      const trigger = root.getByRole('button', {
        name: 'Ver detalle de MacBook Air M2',
        exact: true,
      })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const detail = page.getByTestId('taller-detalle')
      await expect(detail).toContainText('Distribuidora del Este S.A.')
      await expect(detail).toContainText('Esperando repuesto')
      for (const name of [
        'Recepción',
        '80 mm',
        'Reporte',
        'Ticketera',
        'Editar',
        'Pasar a Reparado',
      ]) {
        const control = page
          .getByRole('dialog', { name: 'Reparación OS-#0002', exact: true })
          .getByRole('button', { name, exact: true })
        await expect(control).toBeVisible()
        await control.focus()
        await expect(control).toBeFocused()
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44)
      }
      await page.screenshot({
        path: `${tallerOutput}/${width}-${dark ? 'dark' : 'light'}-detail.png`,
        fullPage: true,
      })
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await root.getByLabel('Buscar órdenes de servicio').fill('MacBook')
      await expect(root.getByTestId('servicio-fila')).toHaveCount(1)
      await root.getByLabel('Buscar órdenes de servicio').fill('')
      await root.getByLabel('Ordenar órdenes en pantalla').selectOption('cliente')
      await root.getByRole('button', { name: 'Invertir orden' }).click()
      // Modify only the existing demo order in this page's in-memory storage.
      await page.evaluate(async () => {
        const { getDemoServicio, saveDemoServicio } = await import('/src/lib/demoServicio.js')
        const data = getDemoServicio()
        saveDemoServicio({
          rows: data.rows.map(row =>
            row.id === 'demo-os-2'
              ? {
                  ...row,
                  customerName: 'Distribuidora del Este S.A. — nombre completo de prueba aislada',
                  device: 'MacBook Air M2 · modelo completo de prueba aislada',
                  pricePyg: 100000000,
                }
              : row,
          ),
        })
      })
      await root.getByRole('button', { name: 'Actualizar', exact: true }).click()
      const bigRow = root.getByTestId('servicio-fila').filter({ hasText: 'modelo completo' })
      await expect(bigRow).toContainText('nombre completo de prueba aislada')
      const price = bigRow.locator('.taller-f3-money p').first().locator('b')
      await assertMoneyFits(price, /100\.000\.000/)
      await noOverflow(page)
      await page.screenshot({
        path: `${tallerOutput}/${width}-${dark ? 'dark' : 'light'}-100m.png`,
        fullPage: true,
      })
      await bigRow.getByRole('button', { name: /^Ver detalle de/ }).click()
      const largeDetail = page.getByTestId('taller-detalle')
      await expect(largeDetail).toContainText('modelo completo de prueba aislada')
      await assertMoneyFits(
        largeDetail.getByRole('region', { name: 'Costos de la reparación' }).locator('b').first(),
        /100\.000\.000/,
      )
      await noOverflow(page)
      await page.keyboard.press('Escape')
      await root.getByRole('button', { name: 'Filtros', exact: true }).click()
      const filters = page.getByRole('dialog', {
        name: 'Filtros del taller',
        exact: true,
      })
      await filters.getByLabel('Tipo de dispositivo').selectOption('MacBook')
      await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
      await expect(root.getByTestId('servicio-fila')).toHaveCount(1)
      await root.getByRole('button', { name: 'Catálogo de servicios', exact: true }).click()
      await expect(
        page.getByRole('dialog', {
          name: 'Catálogo de servicios',
          exact: true,
        }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    })
  }
}

async function mockTaller(page, scenario) {
  const state = {
    patches: [],
    rows: [
      {
        id: 'qa-a',
        device: 'Equipo A',
        customerName: 'Cliente A',
        status: 'RECIBIDO',
        receivedAt: '2026-10-11T10:00:00Z',
      },
      {
        id: 'qa-b',
        device: 'Equipo B',
        customerName: 'Cliente B',
        status: 'DIAGNOSTICO',
        receivedAt: '2026-10-10T10:00:00Z',
      },
      {
        id: 'qa-terminal',
        device: 'Equipo terminal',
        customerName: 'Cliente terminal',
        status: 'ENTREGADO',
      },
    ],
  }
  await page.route(/https:\/\//, route => route.abort())
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
    if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
    if (path === '/api/service-orders') {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON()
        state.patches.push(payload)
        if (scenario === 'all-fail' || (scenario === 'mixed' && payload.id === 'qa-b'))
          return route.fulfill({
            status: 422,
            json: { message: 'Mutación rechazada por mock aislado' },
          })
        state.rows = state.rows.map(row =>
          row.id === payload.id ? { ...row, status: payload.status } : row,
        )
        body = { id: payload.id }
      } else {
        if (scenario === 'refresh-fail' && state.patches.length)
          return route.fulfill({
            status: 503,
            json: { message: 'Lectura rechazada después del PATCH confirmado' },
          })
        body = state.rows
      }
    }
    await route.fulfill({ status: 200, json: body })
  })
  await page.goto('/servicio')
  await expect(page.locator('.taller-f3').getByTestId('servicio-fila')).toHaveCount(2)
  return state
}

for (const scenario of ['mixed', 'all-fail', 'terminal', 'nonvisible', 'refresh-fail']) {
  test(`F3 Taller bulk exact feedback ${scenario} (PATCH mocks, not persistence)`, async ({
    page,
  }) => {
    const state = await mockTaller(page, scenario)
    const root = page.locator('.taller-f3')
    if (scenario === 'terminal') await root.getByLabel('Filtrar por etapa').selectOption('todos')
    await root.getByLabel('Seleccionar la orden de Equipo A', { exact: true }).check()
    if (['mixed', 'all-fail', 'nonvisible'].includes(scenario))
      await root.getByLabel('Seleccionar la orden de Equipo B', { exact: true }).check()
    if (scenario === 'terminal')
      await root.getByLabel('Seleccionar la orden de Equipo terminal', { exact: true }).check()
    if (scenario === 'nonvisible')
      await root.getByLabel('Buscar órdenes de servicio').fill('Equipo A')
    await root.getByRole('button', { name: 'Avanzar estado', exact: true }).click()
    const feedback = root.getByTestId('taller-avance-feedback')
    const expected = {
      mixed: '1 orden avanzada. 1 falló; conserva la selección para reintentar.',
      'all-fail': '0 órdenes avanzadas. 2 fallaron; conserva la selección para reintentar.',
      terminal: '1 orden avanzada. 1 sin avanzar (fuera de la vista o sin estado siguiente).',
      nonvisible: '1 orden avanzada. 1 sin avanzar (fuera de la vista o sin estado siguiente).',
      'refresh-fail':
        '1 orden avanzada. El cambio se guardó, pero no se pudo actualizar la lista. Actualiza antes de continuar.',
    }
    await expect(feedback).toHaveText(expected[scenario])
    const expectedPatches = ['mixed', 'all-fail'].includes(scenario)
      ? [
          { id: 'qa-a', status: 'DIAGNOSTICO' },
          { id: 'qa-b', status: 'CON_TECNICO' },
        ]
      : [{ id: 'qa-a', status: 'DIAGNOSTICO' }]
    expect(state.patches).toEqual(expectedPatches)
    if (scenario === 'nonvisible') await root.getByLabel('Buscar órdenes de servicio').fill('')
    if (['mixed', 'all-fail', 'nonvisible'].includes(scenario))
      await expect(
        root.getByLabel('Seleccionar la orden de Equipo B', { exact: true }),
      ).toBeChecked()
    if (scenario === 'terminal')
      await expect(
        root.getByLabel('Seleccionar la orden de Equipo terminal', {
          exact: true,
        }),
      ).toBeChecked()
    if (scenario === 'all-fail')
      await expect(
        root.getByLabel('Seleccionar la orden de Equipo A', { exact: true }),
      ).toBeChecked()
    else
      await expect(
        root.getByLabel('Seleccionar la orden de Equipo A', { exact: true }),
      ).not.toBeChecked()
    if (scenario === 'refresh-fail')
      await expect(root.getByTestId('servicio-fila').filter({ hasText: 'Equipo A' })).toContainText(
        'Diagnóstico',
      )
    await mkdir(tallerOutput, { recursive: true })
    await page.screenshot({
      path: `${tallerOutput}/bulk-${scenario}.png`,
      fullPage: true,
    })
  })
}

// F4 serialized body: append-only coverage; all earlier 87 cases stay byte-identical.
const stockOutput = '/tmp/mobos-redesign-stock-qa'
const stockWidths = [320, 390, 430, 1280, 1440, 1920]

async function stockTheme(page, width, dark) {
  if (!dark) return
  await page.getByTestId(width < 1024 ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page
    .getByRole('dialog', { name: 'Perfil y preferencias' })
    .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}
async function stockCellMetrics(page) {
  return page.locator('.stock-f4-row, .stock-f4-card, .stock-lista-fila, .stock-tarjeta').evaluateAll((rows) =>
    rows.map((row) => ({
      width: row.clientWidth,
      scroll: row.scrollWidth,
      cells: [...row.children].map((cell) => ({
        width: cell.clientWidth,
        scroll: cell.scrollWidth,
      })),
      identity: [
        ...row.querySelectorAll(
          '[data-testid="unidad-modelo"], [data-testid="unidad-imei"], [data-testid="unidad-verificacion"]',
        ),
      ].map((cell) => {
        const range = document.createRange()
        range.selectNodeContents(
          cell.querySelector('b') ||
            (cell.dataset.testid === 'unidad-verificacion' ? cell.firstElementChild || cell : cell),
        )
        return {
          text: cell.textContent.trim(),
          width: cell.clientWidth,
          scroll: cell.scrollWidth,
          lines: new Set(
            [...range.getClientRects()]
              .filter((rect) => rect.width > 0)
              .map((rect) => Math.round(rect.top)),
          ).size,
        }
      }),
    })),
  )
}
for (const width of stockWidths) {
  for (const dark of [false, true]) {
    test(`F4 Stock demo complete identities ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await stockTheme(page, width, dark)
      await page
        .getByTestId(width < 1024 ? 'shell-bottom-nav' : 'shell-lateral')
        .getByRole('button', { name: 'Stock', exact: true })
        .click()
      const rows = page.getByTestId(width < 640 ? 'inventario-tarjeta-movil' : 'inventario-fila')
      await expect(rows.first()).toBeVisible()
      await noOverflow(page)
      const metrics = await stockCellMetrics(page)
      for (const row of metrics) {
        expect(row.scroll).toBeLessThanOrEqual(row.width)
        for (const cell of row.cells) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
        for (const cell of row.identity) {
          expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
          if (width >= 1440) expect(cell.lines, cell.text).toBe(1)
        }
      }
      if (width >= 1440) {
        const header = page.getByTestId('inventario-encabezado')
        await expect(header).toBeVisible()
        const positions = await header.evaluate((e) =>
          [...e.children].map((c) => c.getBoundingClientRect().x),
        )
        const rowPositions = await rows
          .first()
          .evaluate((e) => [...e.children].map((c) => c.getBoundingClientRect().x))
        positions.forEach((x, i) => expect(Math.abs(x - rowPositions[i])).toBeLessThanOrEqual(1))
      }
      if (width < 640) {
        const targets = await rows
          .first()
          .locator('button, label')
          .evaluateAll((es) =>
            es.map((e) => ({
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
            })),
          )
        for (const target of targets) {
          expect(target.width).toBeGreaterThanOrEqual(44)
          expect(target.height).toBeGreaterThanOrEqual(44)
        }
      }
      if (width >= 640) {
        const selectAll = page.getByLabel('Seleccionar visibles', { exact: true })
        await selectAll.check()
        expect(
          await rows.getByRole('checkbox').evaluateAll((es) => es.every((e) => e.checked)),
        ).toBe(true)
        await selectAll.uncheck()
        expect(
          await rows.getByRole('checkbox').evaluateAll((es) => es.every((e) => !e.checked)),
        ).toBe(true)
      }
      const first = rows.first()
      await first.getByRole('checkbox').check()
      await expect(first.getByRole('checkbox')).toBeChecked()
      await first.getByRole('checkbox').uncheck()
      const trigger = first.getByRole('button', { name: /^Acciones de/ })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const menu = first.getByRole('menu')
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('End')
      await expect(menu.getByRole('menuitem').last()).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('Home')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger).toBeFocused()
      // La fila es el botón en escritorio; en la tarjeta móvil lo es «Ver detalles».
      const opener = width < 640 ? first.getByRole('button', { name: /^Ver detalles/ }) : first
      await opener.focus()
      await page.keyboard.press('Space')
      await expect(page.getByRole('dialog').first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(opener).toBeFocused()
      await mkdir(stockOutput, { recursive: true })
      await page.screenshot({
        path: `${stockOutput}/${width}-${dark ? 'dark' : 'light'}.png`,
        fullPage: true,
      })
      await import('node:fs/promises').then((fs) =>
        fs.writeFile(
          `${stockOutput}/${width}-${dark ? 'dark' : 'light'}-metrics.json`,
          JSON.stringify(metrics, null, 2),
        ),
      )
    })
  }
}

async function mockStock(
  page,
  { empty = false, delayed = false, noRate = false, long = false } = {},
) {
  const state = { mutations: [], release: null }
  const gate = delayed
    ? new Promise((resolve) => {
        state.release = resolve
      })
    : null
  const standard = {
    id: 'qa-stock-a',
    productId: 'qa-stock-product',
    serial: '123456789012345',
    product: {
      id: 'qa-stock-product',
      name: long ? 'Modelo excepcional '.repeat(20) : 'iPhone 15 Pro Max',
      capacity: '256 GB',
      color: 'Titanio',
    },
    batteryHealth: 94,
    status: 'AVAILABLE',
    condition: 'USED',
    branchId: 'qa-branch',
    branch: { id: 'qa-branch', name: long ? 'Sucursal completa '.repeat(10) : 'Casa Central' },
    locationId: 'qa-location',
    location: { id: 'qa-location', code: 'D1', name: 'Depósito 1' },
    lastVerifiedAt: '2026-10-10T12:00:00Z',
    lastVerifiedBy: { name: long ? 'Verificador completo '.repeat(15) : 'Hernán Acosta' },
    costCurrency: 'PYG',
    costPyg: 100000000,
    originalCost: null,
  }
  const units = empty
    ? []
    : [
        standard,
        {
          ...standard,
          id: 'qa-stock-b',
          serial: '223456789012345',
          status: 'SOLD',
          sale: { fulfillmentStatus: 'READY_FOR_PICKUP' },
          costPyg: null,
          originalCost: null,
        },
        {
          ...standard,
          id: 'qa-stock-c',
          serial: '323456789012345',
          status: 'IN_TRANSIT',
          costCurrency: 'USD',
          costPyg: 5248700,
          originalCost: 719,
          exchangeRatePyg: 7300,
        },
      ]
  await page.route(/https:\/\//, (route) => route.abort())
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (route.request().method() !== 'GET') {
      if (['/api/push/sincronizar', '/api/presence/heartbeat'].includes(path))
        return route.fulfill({
          status: 503,
          json: { error: 'Unrelated background operation blocked' },
        })
      state.mutations.push({ path, payload: route.request().postDataJSON() })
      return route.fulfill({ status: 200, json: { id: 'isolated-ack' } })
    }
    let body = []
    if (path === '/api/auth/me')
      body = {
        user: {
          id: 'qa-user',
          name: 'Usuario local',
          role: 'ADMIN',
          tenantId: 'qa-tenant',
          branchId: 'qa-branch',
          branchName: 'Casa Central',
        },
        tenant: { id: 'qa-tenant', name: 'Tienda local' },
      }
    if (['/api/inventory-branches', '/api/inventory/branches'].includes(path))
      body = [{ id: 'qa-branch', name: 'Casa Central' }]
    if (path === '/api/fx') body = noRate ? {} : { referencialDiario: 7300 }
    if (path === '/api/inventory-units') {
      if (gate) await gate
      body = units
    }
    if (path === '/api/stock/items') {
      if (gate) await gate
      const estados = { AVAILABLE: 'disponible', RESERVED: 'reservado', SOLD: 'vendido', DEFECTIVE: 'defectuoso', IN_TRANSIT: 'en_transito' }
      const pedido = new URL(route.request().url()).searchParams.get('status')
      const items = units
        .map((unit) => ({
          id: unit.id,
          kind: 'unit',
          stockKind: 'EQUIPO',
          productId: unit.productId,
          sku: '',
          model: [unit.product?.capacity, unit.product?.color].filter(Boolean).join(' '),
          name: unit.product?.name,
          serial: unit.serial,
          batteryHealth: unit.batteryHealth ?? null,
          supplierId: null,
          supplierName: null,
          costPyg: unit.costPyg ?? null,
          status: estados[unit.status],
          quantity: 1,
          branchId: unit.branchId,
          branchName: unit.branch?.name ?? null,
          locationId: unit.locationId ?? null,
          locationName: unit.location?.name ?? null,
          createdAt: '2026-10-01T10:00:00.000Z',
          soldAt: unit.status === 'SOLD' ? '2026-10-12T15:00:00.000Z' : null,
        }))
        .filter((item) => !pedido || item.status === pedido)
      body = { items, nextCursor: null, hasMore: false, limit: 50, totals: { total: items.length, byStatus: {}, byKind: {}, byRowKind: {} } }
    }
    await route.fulfill({ status: 200, json: body })
  })
  await page.goto('/stock/unidades')
  return state
}
for (const width of stockWidths) {
  test(`F4 Stock isolated 15-digit identity and full Gs cost ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockStock(page)
    const row = page
      .getByTestId(width < 640 ? 'inventario-tarjeta-movil' : 'inventario-fila')
      .filter({ hasText: '123456789012345' })
    await expect(row).toBeVisible()
    await expect(row.getByTestId('unidad-modelo')).toContainText(
      /iPhone 15 Pro Max.*256 GB.*Titanio/,
    )
    await expect(row.getByTestId('unidad-imei')).toHaveText('123456789012345')
    // U3: la lista muestra batería, estado y el costo completo en guaraníes (en la
    // tarjeta móvil el costo vive en el detalle plegado).
    await expect(row).toContainText('94%')
    await expect(row).toContainText('Disponible')
    await expect(row).toContainText('Gs 100.000.000')
    await expect(row).toContainText('Casa Central · Depósito 1')
    await noOverflow(page)
    const metrics = await stockCellMetrics(page)
    for (const item of metrics) {
      for (const cell of item.cells) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
      if (width >= 1440) for (const cell of item.identity) expect(cell.lines, cell.text).toBe(1)
    }
    expect(state.mutations).toEqual([])
    await mkdir(stockOutput, { recursive: true })
    await page.screenshot({ path: `${stockOutput}/isolated-${width}.png`, fullPage: true })
  })
}
test('F4 Stock loading, empty, USD edit Escape and Sold/In-transit body regressions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let state = await mockStock(page, { delayed: true })
  await expect(page.getByTestId('unidades-cargando')).toBeVisible()
  await expect(page.getByTestId('unidades-vacio')).toHaveCount(0)
  const columns = await page
    .getByTestId('inventario-encabezado')
    .evaluate((e) => getComputedStyle(e).gridTemplateColumns)
  state.release()
  const row = page.getByTestId('inventario-fila').filter({ hasText: '123456789012345' })
  await expect(row).toBeVisible()
  // Encabezado y filas comparten la misma grilla.
  expect(await row.evaluate((e) => getComputedStyle(e).gridTemplateColumns)).toBe(columns)
  // Escape cierra el menú de la fila y devuelve el foco a su botón; la ficha
  // (un diálogo) también cierra con Escape. Ninguna de las dos escribe nada.
  const accion = row.getByRole('button', { name: 'Acciones de 123456789012345', exact: true })
  await accion.click()
  await expect(row.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row.getByRole('menu')).toBeHidden()
  await expect(accion).toBeFocused()
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.mutations).toEqual([])
  await page.goto('/stock/vendidos')
  await expect(
    page.getByTestId('inventario-fila').filter({ hasText: '223456789012345' }),
  ).toContainText('Sin costo')
  await page.goto('/stock/transito')
  await expect(
    page.getByTestId('inventario-fila').filter({ hasText: '323456789012345' }),
  ).toContainText('719,00')
  await expect(page.getByTestId('unidad-verificacion').first()).toContainText('Hernán Acosta')
  await page.unroute('**/api/**')
  state = await mockStock(page, { empty: true })
  await expect(page.getByTestId('unidades-vacio')).toBeVisible()
  await expect(page.getByTestId('inventario-fila')).toHaveCount(0)
  expect(state.mutations).toEqual([])
})
for (const width of [320, 1440]) {
  test(`F4 Stock oversized isolated names remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockStock(page, { long: true, noRate: true })
    await expect(page.getByTestId('unidad-modelo').first()).toContainText(
      'Modelo excepcional '.repeat(20).trim(),
    )
    await expect(page.locator('.stock-tarjeta, .stock-lista-fila').first()).toContainText(
      'Gs 100.000.000',
    )
    await noOverflow(page)
    for (const row of await stockCellMetrics(page))
      for (const cell of row.cells) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
    expect(state.mutations).toEqual([])
  })
}

test('F4 Stock USD cost Enter keeps original mock-only payload and does not open detail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const state = await mockStock(page)
  // La edición rápida del costo en USD vive en la fila de En tránsito (la lista
  // unificada abre la ficha para editar).
  await page.goto('/stock/transito')
  const row = page.getByTestId('inventario-fila').filter({ hasText: '323456789012345' })
  await expect(row).toContainText('719,00')
  await row.getByRole('button', { name: 'Editar el costo de 323456789012345', exact: true }).click()
  const input = row.getByRole('textbox', { name: 'Costo en USD de 323456789012345' })
  await expect(input).toHaveValue(/^719/)
  await input.fill('700')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => state.mutations)
    .toEqual([
      {
        path: '/api/inventory-units',
        payload: {
          id: 'qa-stock-c',
          action: 'details',
          costCurrency: 'USD',
          originalCost: 700,
          exchangeRatePyg: 7300,
        },
      },
    ])
  await expect(input).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
for (const width of [320, 1280]) {
  test(`F4 Stock Sold and In-transit natural cards ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockStock(page)
    await page.goto('/stock/vendidos')
    const sold = page
      .getByTestId(width < 640 ? 'inventario-tarjeta-movil' : 'inventario-fila')
      .filter({ hasText: '223456789012345' })
    await expect(sold).toContainText('Vendido')
    await expect(sold).toContainText('Sin costo')
    await sold.getByRole('button', { name: 'Acciones de 223456789012345' }).click()
    await expect(sold.getByRole('menuitem', { name: 'Comprobante rápido' })).toBeVisible()
    await page.keyboard.press('Escape')
    await noOverflow(page)
    await page.goto('/stock/transito')
    const transit = page.getByTestId('inventario-fila').filter({ hasText: '323456789012345' })
    await expect(transit).toContainText('En tránsito')
    await expect(transit.getByTestId('unidad-verificacion')).toContainText(
      'OK Hernán Acosta · 10/10/2026',
    )
    const button = transit.getByRole('button', { name: 'Acciones de 323456789012345' })
    await button.click()
    await expect(transit.getByRole('menuitem', { name: 'Apartar para una venta' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(button).toBeFocused()
    await noOverflow(page)
    for (const row of await stockCellMetrics(page))
      for (const cell of row.cells) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
    for (const target of await transit
      .locator('button')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(target.width).toBeGreaterThanOrEqual(44)
      expect(target.height).toBeGreaterThanOrEqual(44)
    }
    expect(state.mutations).toEqual([])
  })
}

// Zero-display follow-up: append only; the preceding 111 cases are frozen.
const stockZeroOutput = '/tmp/mobos-redesign-stock-zero-qa'
for (const width of [1440, 320]) {
  for (const noRate of [false, true]) {
    test(`F4 Stock zero versus missing display ${width}px ${noRate ? 'without' : 'with'} FX`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      // All API data is isolated and every nonlocal request is blocked.
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        return url.origin === `http://127.0.0.1:${process.env.MOBOS_QA_PORT || 5291}` ? route.continue() : route.abort()
      })
      const state = await mockStock(page, { noRate })
      const cases = [
        { name: 'stored-pyg-zero', cost: { costPyg: 0 }, gs: 'Gs 0', usd: '0,00' },
        {
          name: 'original-pyg-zero',
          cost: { costPyg: null, originalCost: 0, costCurrency: 'PYG' },
          gs: 'Gs 0',
          usd: '0,00',
        },
        {
          name: 'original-pyg-string-zero',
          cost: { originalCost: '0', costCurrency: 'PYG' },
          gs: 'Gs 0',
          usd: '0,00',
        },
        {
          name: 'blank-pyg-original-zero',
          cost: { costPyg: '', originalCost: 0, costCurrency: 'PYG' },
          gs: 'Gs 0',
          usd: '0,00',
        },
        {
          name: 'original-usd-zero-rate',
          cost: { costPyg: null, originalCost: 0, costCurrency: 'USD', exchangeRatePyg: 7300 },
          gs: 'Gs 0',
          usd: '0,00',
        },
        {
          name: 'original-usd-zero-no-rate',
          cost: { originalCost: 0, costCurrency: 'USD' },
          gs: 'USD 0,00',
          usd: '0,00',
        },
        { name: 'missing-original', cost: {}, missing: true },
        { name: 'null-original', cost: { originalCost: null, costPyg: null }, missing: true },
        { name: 'undefined-original', cost: { originalCost: undefined }, missing: true },
        { name: 'blank-original', cost: { originalCost: '' }, missing: true },
        { name: 'whitespace-original', cost: { originalCost: '  ' }, missing: true },
        { name: 'negative-original', cost: { originalCost: -1 }, gs: '—', usd: '—' },
        { name: 'invalid-original', cost: { originalCost: 'invalid' }, gs: '—', usd: '—' },
        { name: 'negative-pyg', cost: { costPyg: -1 }, gs: '—', usd: '—' },
        { name: 'invalid-pyg', cost: { costPyg: 'invalid' }, gs: '—', usd: '—' },
        {
          name: 'usd-missing-original-stored-pyg',
          cost: { costPyg: 7300, originalCost: null, costCurrency: 'USD' },
          gs: 'Gs 7.300',
          usd: noRate ? 'Gs 7.300' : '1,00',
        },
      ]
      const units = cases.map((item, index) => ({
        id: `zero-${item.name}`,
        productId: 'zero-product',
        product: { id: 'zero-product', name: `Zero QA ${item.name}` },
        serial: `990000000000${String(index).padStart(3, '0')}`,
        status: 'IN_TRANSIT',
        condition: 'USED',
        branchId: 'qa-branch',
        ...item.cost,
      }))
      await page.route(/\/api\/inventory-units(?:\?|$)/, route => {
        expect(route.request().method()).toBe('GET')
        return route.fulfill({ status: 200, json: units })
      })
      // La fila con edición rápida y conversión a USD vive en En tránsito.
      await page.goto('/stock/transito')
      // En tránsito conserva la fila con edición rápida en todos los anchos.
      const rows = page.getByTestId('inventario-fila')
      await expect(rows).toHaveCount(cases.length)
      for (const [index, item] of cases.entries()) {
        const row = rows.filter({ hasText: units[index].serial })
        await expect(row).toBeVisible()
        if (item.missing) {
          await expect(row).toContainText('Sin costo')
          await expect(row.locator('.stock-f4-cost')).toHaveCount(0)
        } else {
          const expected =
            noRate && item.cost.costCurrency !== 'USD' && item.usd === '0,00' ? 'Gs 0' : item.usd
          await expect(row.locator('.stock-f4-cost')).toHaveText(expected)
          await expect(row).not.toContainText('Sin costo')
        }
      }
      await noOverflow(page)
      for (const row of await stockCellMetrics(page))
        for (const cell of row.cells) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1)
      expect(state.mutations).toEqual([])
      await mkdir(stockZeroOutput, { recursive: true })
      await page.screenshot({
        path: `${stockZeroOutput}/zero-${width}-${noRate ? 'no-fx' : 'fx'}.png`,
        fullPage: true,
      })
    })
  }
}
// F5 reconciliation: append-only frontend evidence, isolated from real APIs/data.
const reconciliationOutput = `${process.env.MOBOS_QA_OUT || '/tmp/mobos-redesign-conciliacion-qa'}/renewed-continuation`
const reconciliationWidths = [320, 360, 390, 430, 1440]

async function reconciliationMetrics(page) {
  return page
    .locator(
      '.conciliacion-f5 [data-label], .conciliacion-f5-kpi strong, .conciliacion-f5-selected, .conciliacion-f5-batch-money b',
    )
    .evaluateAll(nodes =>
      nodes.map(node => ({
        text: node.textContent,
        width: node.clientWidth,
        scroll: node.scrollWidth,
        nowrap: getComputedStyle(node).whiteSpace,
      })),
    )
}

for (const width of reconciliationWidths) {
  for (const dark of [false, true]) {
    test(`F5 demo reconciliation ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await enterDemo(page)
      await page.goto('/finanzas/conciliacion')
      await stockTheme(page, width, dark)
      const root = page.locator('.conciliacion-f5')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conciliación')
      await expect(root.getByRole('heading', { level: 2 })).toHaveCount(0)
      await expect(
        root.getByText('Demo: cobros y cuentas ficticios', { exact: false }),
      ).toBeVisible()
      await expect(root.getByTestId('conciliacion-fila').first()).toBeVisible()
      const disclosure = root.locator('[aria-controls="conciliacion-group-content"]')
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      await disclosure.focus()
      await expect(disclosure).toBeFocused()
      expect(await disclosure.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe(
        'none',
      )
      await page.keyboard.press('Enter')
      await expect(root.getByTestId('conciliacion-grupos')).toBeVisible()
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
      await noOverflow(page)
      for (const cell of await reconciliationMetrics(page))
        expect(cell.scroll, cell.text).toBeLessThanOrEqual(cell.width + 1)
      await page.keyboard.press('Space')
      await expect(root.getByTestId('conciliacion-grupos')).toHaveCount(0)
      if (width < 1060) {
        for (const button of await root.locator('button').all()) {
          if (!(await button.isVisible())) continue
          const box = await button.boundingBox()
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
      const summary = await root.getByTestId('conciliacion-resumen').textContent()
      await root.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('VERIFIED')
      await expect(root.getByTestId('conciliacion-resumen')).toHaveText(summary)
      await expect(root.getByTestId('conciliacion-list-scope')).toContainText(
        'El estado solo filtra esta lista',
      )
      await root.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('')
      await mkdir(reconciliationOutput, { recursive: true })
      const { writeFile } = await import('node:fs/promises')
      await writeFile(
        `${reconciliationOutput}/demo-${width}-${dark ? 'dark' : 'light'}-metrics.json`,
        JSON.stringify(
          {
            cells: await reconciliationMetrics(page),
            geometry: await root.evaluate(node => ({
              moduleHeight: node.scrollHeight,
              documentHeight: document.documentElement.scrollHeight,
              width: node.clientWidth,
            })),
          },
          null,
          2,
        ),
      )
      if (width === 390)
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight),
        ).toBeLessThanOrEqual(2400)
      await page.screenshot({
        path: `${reconciliationOutput}/demo-${width}-${dark ? 'dark' : 'light'}.png`,
        fullPage: true,
      })
    })
  }
}

async function mockReconciliation(
  page,
  {
    role = 'ADMIN',
    empty = false,
    delayed = false,
    failed = false,
    extra = false,
    long = false,
  } = {},
) {
  const state = { gets: [], mutations: [], release: null, fail: failed }
  const gate = delayed
    ? new Promise(resolve => {
        state.release = resolve
      })
    : null
  const item = {
    id: 'qa-payment-a',
    fecha: '2026-10-10T12:00:00Z',
    method: 'TRANSFER',
    status: 'CONFIRMED',
    orderId: 'qa-order/a',
    orderNumber: 'QA-0001',
    cliente: long ? 'Cliente completo '.repeat(15) : 'Cliente completo de prueba',
    vendedor: 'Responsable completo',
    accountId: 'qa-account-a',
    cuenta: long ? 'Cuenta completa '.repeat(12) : 'Cuenta completa de prueba',
    titular: long ? 'Titular completo '.repeat(10) : 'Titular completo',
    banco: 'Banco de prueba',
    procesadora: 'Procesadora QA',
    currency: 'PYG',
    originalAmount: null,
    montoPyg: 100000000,
    reference: long ? 'REFERENCIA'.repeat(25) : 'Referencia completa de prueba',
    settlesAt: '2026-10-11T12:00:00Z',
    conciliacion: { state: 'PENDING', batchId: null },
  }
  const items = empty
    ? []
    : [
        item,
        {
          ...item,
          id: 'qa-payment-b',
          orderId: null,
          orderNumber: 'QA-0002',
          accountId: 'qa-account-b',
          cuenta: 'Otra cuenta completa',
          montoPyg: -100000000,
          conciliacion: { state: 'REJECTED', batchId: null },
        },
        {
          ...item,
          id: 'qa-payment-refund',
          orderId: null,
          orderNumber: 'QA-REFUND',
          status: 'REFUNDED',
          montoPyg: 0,
        },
        {
          ...item,
          id: 'qa-payment-verified',
          orderId: null,
          orderNumber: 'QA-VERIFIED',
          conciliacion: { state: 'VERIFIED', batchId: 'qa-batch' },
        },
      ]
  if (extra)
    for (let index = 0; index < 21; index++)
      items.push({
        ...item,
        id: `qa-extra-${index}`,
        orderId: null,
        orderNumber: `QA-EXTRA-${index}`,
        montoPyg: 1,
      })
  const group = {
    key: 'qa-account-a',
    label: item.cuenta,
    method: 'TRANSFER',
    processor: item.procesadora,
    secondary: item.titular,
    count: 4,
    verifiedCount: 1,
    pendingCount: 2,
    verifiedPyg: 100000000,
    unverifiedPyg: 100000000,
    differencePyg: -100000000,
  }
  // Stress values are isolated presentation records, not a financially coherent demo fixture.
  const body = {
    resumen: empty
      ? {}
      : {
          count: 4,
          confirmedPyg: 100000000,
          verifiedPyg: 100000000,
          unverifiedPyg: 100000000,
          pendingPyg: 0,
          differencePyg: -100000000,
          verifiedCount: 1,
          pendingCount: 2,
          lotes: 1,
        },
    items,
    porCuenta: empty
      ? []
      : [group, { ...group, key: 'qa-account-b', label: 'Otra cuenta completa' }],
    porMedio: empty ? [] : [{ ...group, key: 'TRANSFER' }],
    porProcesadora: empty ? [] : [{ ...group, key: item.procesadora, label: item.procesadora }],
    lotes: empty
      ? []
      : [
          {
            id: 'qa-batch',
            cuenta: item.cuenta,
            procesadora: item.procesadora,
            expectedPyg: 100000000,
            receivedPyg: 0,
            differencePyg: -100000000,
            pagos: 1,
            estado: 'DIFFERENCE',
            createdAt: item.fecha,
            note: 'Observación de prueba',
            creadoPor: item.vendedor,
          },
        ],
    truncado: false,
  }
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (request.method() !== 'GET') {
      if (['/api/push/sincronizar', '/api/presence/heartbeat'].includes(url.pathname))
        return route.fulfill({
          status: 503,
          json: { error: 'Unrelated background operation blocked' },
        })
      const payload = request.postDataJSON()
      state.mutations.push({ path: url.pathname, payload })
      if (url.pathname !== '/api/finance/reconciliation')
        return route.fulfill({ status: 503, json: { error: 'Unexpected mutation blocked' } })
      if (payload.paymentIds.includes('qa-payment-b'))
        return route.fulfill({
          status: 400,
          json: { message: 'Los pagos del lote deben pertenecer a la misma cuenta.' },
        })
      items[0].conciliacion = { state: 'VERIFIED', batchId: 'qa-ack' }
      body.lotes.unshift({
        ...body.lotes[0],
        id: 'qa-ack',
        expectedPyg: 100000000,
        receivedPyg: payload.receivedPyg,
        differencePyg: payload.receivedPyg - 100000000,
        note: payload.note,
      })
      return route.fulfill({ status: 200, json: { conciliados: 1, lote: body.lotes[0] } })
    }
    state.gets.push(url.pathname + url.search)
    if (url.pathname === '/api/auth/me')
      return route.fulfill({
        json: {
          user: {
            id: 'qa-user',
            name: 'Usuario local',
            role,
            tenantId: 'qa-tenant',
            branchId: 'qa-branch',
            branchName: 'Casa Central',
          },
          tenant: { id: 'qa-tenant', name: 'Tienda local' },
        },
      })
    if (['/api/inventory-branches', '/api/inventory/branches'].includes(url.pathname))
      return route.fulfill({ json: [{ id: 'qa-branch', name: 'Casa Central' }] })
    if (url.pathname === '/api/finance/reconciliation') {
      if (gate) await gate
      return state.fail
        ? route.fulfill({
            status: 503,
            json: { message: 'Conciliación no disponible en prueba' },
          })
        : route.fulfill({ json: body })
    }
    if (url.pathname.startsWith('/api/orders/'))
      return route.fulfill({
        json: {
          id: item.orderId,
          orderNumber: item.orderNumber,
          createdAt: item.fecha,
          status: 'CONFIRMED',
          items: [],
          payments: [],
          totalPyg: 100000000,
          customer: { name: item.cliente },
        },
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/finanzas/conciliacion')
  return state
}

for (const width of reconciliationWidths) {
  for (const dark of [false, true]) {
    test(`F5 isolated full signed money and selection ${width}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const state = await mockReconciliation(page)
      await stockTheme(page, width, dark)
      const root = page.locator('.conciliacion-f5')
      const rows = root.getByTestId('conciliacion-fila')
      await expect(rows).toHaveCount(width < 1100 ? 2 : 4)
      await expect(rows.nth(0).locator('[data-label="Monto"]')).toHaveText('Gs 100.000.000')
      await expect(rows.nth(1).locator('[data-label="Monto"]')).toHaveText('-Gs 100.000.000')
      if (width < 1100) await root.getByRole('button', { name: 'Siguiente', exact: true }).click()
      const refund = rows.filter({ hasText: 'QA-REFUND' })
      const verified = rows.filter({ hasText: 'QA-VERIFIED' })
      await expect(refund.getByRole('checkbox')).toBeDisabled()
      await expect(verified.getByRole('checkbox')).toBeDisabled()
      await expect(refund).toContainText('Pago: Reembolsado')
      if (width < 1100) await root.getByRole('button', { name: 'Anterior', exact: true }).click()
      await rows.first().getByRole('checkbox').check()
      await expect(root.locator('.conciliacion-f5-selected')).toContainText('Gs 100.000.000')
      await root.getByLabel('Monto recibido', { exact: true }).fill('200000000')
      await expect(root.getByRole('button', { name: 'Conciliar lote', exact: true })).toBeDisabled()
      await expect(root.getByText('+Gs 100.000.000', { exact: true })).toBeVisible()
      await root.getByLabel('Monto recibido', { exact: true }).fill('0')
      await expect(root.getByText('-Gs 100.000.000', { exact: true }).last()).toBeVisible()
      await root.getByRole('button', { name: 'Mostrar Cuentas del período' }).click()
      for (const cell of await reconciliationMetrics(page))
        expect(cell.scroll, cell.text).toBeLessThanOrEqual(cell.width + 1)
      await noOverflow(page)
      await page.screenshot({
        path: `${reconciliationOutput}/isolated-all-${width}-${dark ? 'dark' : 'light'}.png`,
        fullPage: true,
      })
      const summary = await root.getByTestId('conciliacion-resumen').textContent()
      await root.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('VERIFIED')
      await expect(rows).toHaveCount(1)
      await expect(root.getByTestId('conciliacion-resumen')).toHaveText(summary)
      await expect(root.locator('.conciliacion-f5-selected')).toContainText('1 pago(s)')
      expect(state.gets.filter(url => url.startsWith('/api/finance/reconciliation'))).toHaveLength(
        1,
      )
      expect(state.mutations).toEqual([])
      await mkdir(reconciliationOutput, { recursive: true })
      const { writeFile } = await import('node:fs/promises')
      await writeFile(
        `${reconciliationOutput}/isolated-${width}-${dark ? 'dark' : 'light'}-metrics.json`,
        JSON.stringify(
          {
            cells: await reconciliationMetrics(page),
            geometry: await root.evaluate(node => ({
              moduleHeight: node.scrollHeight,
              documentHeight: document.documentElement.scrollHeight,
              width: node.clientWidth,
            })),
          },
          null,
          2,
        ),
      )
      await page.screenshot({
        path: `${reconciliationOutput}/isolated-${width}-${dark ? 'dark' : 'light'}.png`,
        fullPage: true,
      })
    })
  }
}

for (const role of ['ADMIN', 'GERENTE', 'CAJERA']) {
  test(`F5 mock contracts, difference, mixed-account rejection and order trace ${role}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    const state = await mockReconciliation(page, { role })
    if (role !== 'ADMIN') {
      // Existing owner-only shell boundary, not changed to match broader API capabilities.
      await expect(page).toHaveURL(/\/pos/)
      await expect(page.locator('.conciliacion-f5')).toHaveCount(0)
      expect(state.gets.filter(url => url.startsWith('/api/finance/reconciliation'))).toEqual([])
      expect(state.mutations).toEqual([])
      return
    }
    const root = page.locator('.conciliacion-f5')
    const rows = root.getByTestId('conciliacion-fila')
    await expect(rows).toHaveCount(2)
    const request = new URL(
      state.gets.find(url => url.startsWith('/api/finance/reconciliation')),
      'http://local',
    )
    expect([...request.searchParams.keys()].sort()).toEqual(['from', 'to'])
    await root.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('qa-account-a')
    await root.getByRole('combobox', { name: 'Medio', exact: true }).selectOption('TRANSFER')
    await root
      .getByRole('combobox', { name: 'Procesadora', exact: true })
      .selectOption('Procesadora QA')
    await expect
      .poll(() => state.gets.filter(url => url.startsWith('/api/finance/reconciliation')).length)
      .toBe(4)
    const scoped = new URL(
      state.gets.filter(url => url.startsWith('/api/finance/reconciliation')).at(-1),
      'http://local',
    )
    expect(Object.fromEntries(scoped.searchParams)).toEqual({
      from: request.searchParams.get('from'),
      to: request.searchParams.get('to'),
      accountId: 'qa-account-a',
      method: 'TRANSFER',
      processor: 'Procesadora QA',
    })
    await root.getByRole('button', { name: 'Limpiar filtros', exact: true }).click()
    await rows.nth(0).getByRole('checkbox').check()
    await rows.nth(1).getByRole('checkbox').check()
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('2 pago(s)')
    await root.getByRole('button', { name: 'Conciliar lote', exact: true }).click()
    await expect(
      root.getByText('Los pagos del lote deben pertenecer a la misma cuenta.', {
        exact: true,
      }),
    ).toBeVisible()
    expect(state.mutations[0]).toEqual({
      path: '/api/finance/reconciliation',
      payload: {
        action: 'batch',
        paymentIds: ['qa-payment-a', 'qa-payment-b'],
        receivedPyg: 0,
      },
    })
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('2 pago(s)')
    await rows.nth(1).getByRole('checkbox').uncheck()
    await root.getByLabel('Monto recibido', { exact: true }).fill('90000000')
    await expect(root.getByRole('button', { name: 'Conciliar lote', exact: true })).toBeDisabled()
    await root.getByLabel('Observación', { exact: true }).fill('Diferencia de prueba')
    await root.getByRole('button', { name: 'Conciliar lote', exact: true }).click()
    await expect(root.locator('.conciliacion-f5-selected')).toHaveCount(0)
    expect(state.mutations[1]).toEqual({
      path: '/api/finance/reconciliation',
      payload: {
        action: 'batch',
        paymentIds: ['qa-payment-a'],
        receivedPyg: 90000000,
        note: 'Diferencia de prueba',
        accountId: 'qa-account-a',
      },
    })
    await expect(root.getByTestId('conciliacion-lote').first()).toContainText(
      'Diferencia de prueba',
    )
    await rows.first().getByRole('button', { name: 'Ver pedido' }).click()
    await expect(page.getByText('Pagos · QA-0001', { exact: false })).toBeVisible()
    expect(state.gets).toContain('/api/orders/qa-order%2Fa')
    await page.keyboard.press('Escape')
    await expect(page.getByText('Pagos · QA-0001', { exact: false })).not.toBeVisible()
    await root.getByRole('button', { name: 'Seleccionar por conciliar' }).click()
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('1 pago(s)')
    await expect(rows.nth(1).getByRole('checkbox')).toBeChecked()
    expect(state.mutations).toHaveLength(2)
    await noOverflow(page)
  })
}

test('F5 loading, error and empty states reflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const state = await mockReconciliation(page, { delayed: true, failed: true })
  const root = page.locator('.conciliacion-f5')
  await expect(root.locator('[role="status"]')).toBeVisible()
  await expect(root.getByText('Sin pagos para estos filtros')).toHaveCount(0)
  await noOverflow(page)
  state.release()
  await expect(root.getByText('Conciliación no disponible en prueba')).toBeVisible()
  await noOverflow(page)
  await page.unroute('**/api/**')
  await mockReconciliation(page, { empty: true })
  await expect(root.getByText('Sin pagos para estos filtros')).toBeVisible()
  await expect(root.getByText('Todavía no hay lotes en el período')).toBeVisible()
  await noOverflow(page)
})

for (const width of [390, 1440]) {
  test(`F5 paging retains selection and bulk uses all filtered pending payments ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockReconciliation(page, { extra: true })
    const root = page.locator('.conciliacion-f5')
    const rows = root.getByTestId('conciliacion-fila')
    await expect(rows).toHaveCount(width === 390 ? 2 : 20)
    await rows.first().getByRole('checkbox').check()
    const pager = root.getByRole('navigation', { name: 'Páginas de pagos' })
    await pager.getByRole('button', { name: 'Siguiente' }).click()
    if (width === 390) await pager.getByRole('button', { name: 'Siguiente' }).click()
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('1 pago(s)')
    await rows.first().getByRole('checkbox').check()
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('2 pago(s)')
    await pager.getByRole('button', { name: 'Anterior' }).click()
    if (width === 390) await pager.getByRole('button', { name: 'Anterior' }).click()
    await expect(rows.first().getByRole('checkbox')).toBeChecked()
    await root.getByRole('button', { name: 'Seleccionar por conciliar' }).click()
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('23 pago(s)')
    if (width === 390) await pager.getByRole('button', { name: 'Siguiente' }).click()
    await expect(rows.filter({ hasText: 'QA-REFUND' }).getByRole('checkbox')).toBeDisabled()
    await expect(rows.filter({ hasText: 'QA-VERIFIED' }).getByRole('checkbox')).toBeDisabled()
    await root.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('VERIFIED')
    await expect(rows).toHaveCount(1)
    await expect(root.locator('.conciliacion-f5-selected')).toContainText('23 pago(s)')
    await expect(pager).toHaveCount(0)
    await root.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('')
    await expect(pager).toContainText('Página 1')
    expect(state.mutations).toEqual([])
    await noOverflow(page)
  })
}

test('F5 demo batch and mixed-account rejection stay local without API mutations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const writes = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/finance/')) writes.push(request.url())
  })
  await enterDemo(page)
  await page.goto('/finanzas/conciliacion')
  const root = page.locator('.conciliacion-f5')
  const rows = root.getByTestId('conciliacion-fila')
  await expect(rows.first()).toBeVisible()
  await root.getByRole('button', { name: 'Seleccionar por conciliar' }).click()
  await root.getByRole('button', { name: 'Conciliar lote', exact: true }).click()
  await expect(
    root.getByText('Los pagos del lote deben pertenecer a la misma cuenta.', { exact: true }),
  ).toBeVisible()
  await root.getByRole('button', { name: 'Quitar selección' }).click()
  await root.getByRole('combobox', { name: 'Medio', exact: true }).selectOption('CASH')
  await rows.first().getByRole('checkbox').check()
  await root.getByRole('button', { name: 'Conciliar lote', exact: true }).click()
  await expect(page.getByText(/Lote conciliado \(demo\)/)).toBeVisible()
  await expect(root.getByTestId('conciliacion-lote').first()).toBeVisible()
  await expect(root.locator('.conciliacion-f5-selected')).toHaveCount(0)
  expect(writes).toEqual([])
  await rows.first().getByRole('button', { name: 'Ver pedido' }).click()
  await expect(page.getByText(/Pagos ·/).first()).toBeVisible()
  expect(writes).toEqual([])
})

for (const width of [320, 1440]) {
  test(`F5 oversized identities reflow without loss at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockReconciliation(page, { long: true })
    const root = page.locator('.conciliacion-f5')
    const row = root.getByTestId('conciliacion-fila').first()
    await expect(row.locator('[data-label="Referencia"]')).toContainText('REFERENCIA'.repeat(25))
    await expect(row.locator('[data-label="Cuenta / titular"]')).toContainText(
      'Cuenta completa '.repeat(12).trim(),
    )
    await root.getByRole('button', { name: 'Mostrar Cuentas del período' }).click()
    const headers = root.locator('.conciliacion-f5-header')
    if (width === 1440) await expect(headers.last()).toBeVisible()
    else await expect(headers.last()).toBeHidden()
    for (const cell of await reconciliationMetrics(page))
      expect(cell.scroll, cell.text).toBeLessThanOrEqual(cell.width + 1)
    expect(state.mutations).toEqual([])
    await noOverflow(page)
    await page.screenshot({
      path: `${reconciliationOutput}/long-${width}.png`,
      fullPage: true,
    })
  })
}

// Bounded correction: full document height, not the component-only height.
for (const dark of [false, true]) {
  test(`F5 final document height and readable 2x2 money at 390px ${dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await enterDemo(page)
    await page.goto('/finanzas/conciliacion')
    await stockTheme(page, 390, dark)
    const root = page.locator('.conciliacion-f5')
    await expect(root.getByTestId('conciliacion-fila')).toHaveCount(2)
    await expect(root.locator('[aria-controls="conciliacion-group-content"]')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await page.evaluate(() => scrollTo(0, 0))
    const geometry = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }))
    await mkdir(reconciliationOutput, { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(
      `${reconciliationOutput}/document-390-${dark ? 'dark' : 'light'}.json`,
      JSON.stringify(geometry, null, 2),
    )
    expect(geometry.height).toBeLessThanOrEqual(2400)
    expect(geometry.width).toBe(390)
    await page.screenshot({
      path: `${reconciliationOutput}/document-390-${dark ? 'dark' : 'light'}.png`,
      fullPage: true,
    })
    // Isolated signed stress records do not replace the demo economic fixture.
    await page.unroute('**/api/**')
    await page.evaluate(() => {
      sessionStorage.clear()
      localStorage.clear()
    })
    await mockReconciliation(page)
    await stockTheme(page, 390, dark)
    const kpis = root.locator('.conciliacion-f5-kpi')
    await expect(kpis).toHaveCount(4)
    const boxes = await kpis.evaluateAll(nodes =>
      nodes.map(node => ({
        top: node.getBoundingClientRect().top,
        left: node.getBoundingClientRect().left,
      })),
    )
    expect(boxes[0].top).toBe(boxes[1].top)
    expect(boxes[2].top).toBe(boxes[3].top)
    expect(boxes[2].top).toBeGreaterThan(boxes[0].top)
    expect(boxes[1].left).toBeGreaterThan(boxes[0].left)
    await expect(kpis.nth(0).locator('.conciliacion-f5-digits')).toHaveText('100.000.000')
    // El signo va pegado al símbolo («-Gs 100.000.000»); los dígitos quedan enteros.
    await expect(kpis.nth(3).locator('.conciliacion-f5-digits')).toHaveText('100.000.000')
    await expect(kpis.nth(3).locator('strong')).toHaveText('-Gs 100.000.000')
    await writeFile(
      `${reconciliationOutput}/kpi-stress-390-${dark ? 'dark' : 'light'}-metrics.json`,
      JSON.stringify(
        await root.locator('.conciliacion-f5-digits').evaluateAll(nodes =>
          nodes.map(node => ({
            text: node.textContent,
            font: parseFloat(getComputedStyle(node).fontSize),
            width: node.getBoundingClientRect().width,
            parent: node.parentElement.clientWidth,
            scroll: node.parentElement.scrollWidth,
          })),
        ),
        null,
        2,
      ),
    )
    for (const digit of await root.locator('.conciliacion-f5-digits').all()) {
      const metric = await digit.evaluate(node => ({
        font: parseFloat(getComputedStyle(node).fontSize),
        width: node.getBoundingClientRect().width,
        parent: node.parentElement.clientWidth,
      }))
      expect(metric.font).toBeGreaterThanOrEqual(20)
      expect(metric.width).toBeLessThanOrEqual(metric.parent + 1)
    }
    for (const control of await root.locator('button, select').all()) {
      if (!(await control.isVisible())) continue
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    await noOverflow(page)
    await page.screenshot({
      path: `${reconciliationOutput}/kpi-stress-390-${dark ? 'dark' : 'light'}.png`,
      fullPage: true,
    })
  })
}

// U5a: Rendiciones (tienda) y panel del repartidor con el sistema visual F3.
const u5Output = process.env.MOBOS_QA_OUT || '/tmp/mobos-redesign-u5-qa'
async function u5Controls(root) {
  for (const control of await root.locator('button, select, summary, a[href^="tel:"]').all()) {
    if (!(await control.isVisible())) continue
    const box = await control.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
}
for (const [width, dark] of [[375, false], [375, true], [1440, false]]) {
  test(`U5a store Rendiciones ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await mkdir(u5Output, { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    await enterDemo(page)
    await setF3Theme(page, width, dark)
    await page.goto('/delivery')
    await page.getByRole('button', { name: 'Rendiciones', exact: true }).click()
    const root = page.locator('[aria-label="Rendiciones de repartidores"]')
    const cards = root.getByTestId('rendicion-admin')
    await expect(cards.first()).toBeVisible()
    await expect(cards.first()).toContainText('Rendido')
    await expect(cards.first()).toContainText('Gs')
    expect(await cards.first().innerText()).not.toContain('…')
    await expect(cards.first().getByTestId('rendicion-verificar')).toBeVisible()
    await noOverflow(page)
    await u5Controls(root)
    // Esc cancela el rechazo sin enviar nada.
    await cards.first().getByRole('button', { name: 'Rechazar', exact: true }).click()
    const dialogo = page.getByRole('dialog', { name: 'Rechazar la rendición' })
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).toHaveCount(0)
    await root.getByRole('button', { name: 'Todas', exact: true }).click()
    await expect(root.getByRole('button', { name: 'Todas', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await noOverflow(page)
    if (width === 375 && dark) await page.screenshot({ path: `${u5Output}/rendiciones-375-dark.png`, fullPage: true })
  })
  test(`U5a driver panel ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await mkdir(u5Output, { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    await enterDemo(page, 'Delivery')
    await setF3Theme(page, width, dark)
    await page.waitForURL(/\/delivery/)
    const orders = page.getByTestId('reparto-pedido')
    await expect(orders.first()).toBeVisible()
    await expect(orders.first()).toContainText('Total')
    await expect(orders.first().getByRole('button', { name: 'Marcar entregado' })).toBeVisible()
    await expect(orders.first().getByTestId('reparto-cobrar')).toBeVisible()
    expect(await orders.first().innerText()).not.toContain('…')
    await noOverflow(page)
    await u5Controls(page.locator('main'))
    // Cobro en la calle: el modal se cierra con Esc.
    const cobro = page.getByRole('dialog', { name: 'Registrar cobro en la calle' })
    // El listado se refresca solo: reintenta el clic si cayó durante un re-render.
    await expect(async () => {
      if (!(await cobro.isVisible())) await orders.first().getByTestId('reparto-cobrar').click()
      await expect(cobro).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30000 })
    await page.keyboard.press('Escape')
    await expect(cobro).toHaveCount(0)
    // Navegación del router sin recargar (conserva sesión demo y tema).
    await page.evaluate(() => {
      history.pushState({}, '', '/delivery/rendiciones')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.getByTestId('rendicion-total')).toContainText('Gs')
    await expect(page.getByTestId('rendicion').first()).toBeVisible()
    await noOverflow(page)
    await u5Controls(page.locator('main'))
    if (width === 375 && !dark) await page.screenshot({ path: `${u5Output}/driver-375-light.png`, fullPage: true })
  })
}

// U3: Stock absorbe Inventario (lista unificada, secciones, filtros en la URL y
// etiquetas por selección). Todo corre sobre el demo, sin red.
const stockU3Widths = [375, 1440]
async function masUnidadesDemo(page, cantidad = 90) {
  // El inventario demo vive en memoria de la pestaña: se amplía con el mismo
  // módulo que usa la app y se navega dentro de la SPA (sin recargar).
  await page.evaluate(async (n) => {
    const demo = await import('/src/lib/demoInventory.js')
    const base = demo.listDemoUnits()[0]
    demo.createDemoUnit({
      productId: base.productId,
      serials: Array.from({ length: n }, (_, i) => `EXTRA${String(i).padStart(10, '0')}`),
      costPyg: 5000000,
    })
  }, cantidad)
}
async function abrirFiltroStock(page, grupo) {
  // Celular: hoja «Filtros»; escritorio: el chip del grupo.
  await page.getByTestId('filtros-abrir').or(page.getByTestId(`filtro-${grupo}-abrir`)).first().click()
}
async function elegirFiltroStock(page, grupo, id) {
  await abrirFiltroStock(page, grupo)
  await page.getByTestId(`filtro-${grupo}-${id}`).click()
  if (await page.getByTestId('filtros-hoja').count()) await page.keyboard.press('Escape')
}
async function abrirStock(page, width) {
  await page
    .getByTestId(width < 1024 ? 'shell-bottom-nav' : 'shell-lateral')
    .getByRole('button', { name: 'Stock', exact: true })
    .click()
}

test('U3 /inventario/* redirige a /stock/* y las doce vistas siguen abriendo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const vistas = {
    unidades: 'Unidades', reservas: 'Reservas', ubicaciones: 'Ubicaciones', alertas: 'Alertas',
    transito: 'En tránsito', traslados: 'Traslados', vendidos: 'Vendidos', eliminados: 'Eliminados',
    taller: 'Taller', conteos: 'Conteos', compartido: 'Compartido', autorizaciones: 'Autorizaciones',
  }
  // Rediseño 2A: las pestañas son del shell y no hay una segunda barra de
  // secciones dentro de la pantalla.
  const contexto = page.getByTestId('shell-contexto')
  await abrirStock(page, 1440)
  await expect(page).toHaveURL(/\/stock\/unidades$/)
  for (const id of ['unidades', 'productos', 'traslados', 'control', 'precios'])
    await expect(contexto.locator(`[data-tab-id="${id}"]`)).toBeVisible()
  await expect(page.getByTestId('tabs-inventario')).toHaveCount(0)
  const grupoDe = { unidades: 'unidades', vendidos: 'unidades', eliminados: 'unidades', traslados: 'traslados', transito: 'traslados' }
  for (const [id, etiqueta] of Object.entries(vistas)) {
    await selectInventorySection(page, id)
    // Autorizaciones vive solo en esta pantalla: no cambia la URL.
    if (id !== 'autorizaciones') await expect(page).toHaveURL(new RegExp(`/stock/${id}$`))
    await expect(contexto.locator(`[data-tab-id="${grupoDe[id] || 'control'}"]`)).toHaveAttribute('aria-current', 'page')
    // Las vistas de segundo nivel marcan la activa; Unidades/Vendidos/Eliminados la muestran en el chip Estado.
    if (!['unidades', 'vendidos', 'eliminados'].includes(id))
      await expect(page.getByTestId('grupos-inventario').getByRole('tab', { name: new RegExp(`^${etiqueta}`) })).toHaveAttribute('aria-selected', 'true')
  }
  // Un enlace guardado a /inventario/<vista>?q=… conserva vista y búsqueda.
  await page.goto('/inventario/reservas?q=iphone')
  await expect(page).toHaveURL(/\/stock\/reservas\?q=iphone$/)
})

for (const width of stockU3Widths) {
  test(`U3 lista de Stock: columnas, filtros en la URL y Cargar más ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await enterDemo(page)
    await masUnidadesDemo(page)
    await abrirStock(page, width)
    const tarjetas = width < 768
    const filas = page.getByTestId(tarjetas ? 'inventario-tarjeta-movil' : 'inventario-fila')
    await expect(filas.first()).toBeVisible()
    if (!tarjetas) {
      const encabezado = page.getByTestId('inventario-encabezado')
      for (const columna of ['Modelo', 'IMEI / serie', 'Batería', 'Proveedor', 'Costo', 'Estado'])
        await expect(encabezado).toContainText(columna, { ignoreCase: true })
    }
    await expect(page.getByTestId('stock-mostrando')).toHaveText(/^Mostrando 50 de 1\d\d$/)
    await page.getByRole('button', { name: 'Cargar más' }).click()
    await expect(page.getByTestId('stock-mostrando')).toHaveText(/^Mostrando 100 de 1\d\d$/)
    // Filtros: el chip queda en la URL y la lista se acota. Escritorio: un chip
    // por filtro con su lista; celular: una hoja «Filtros» con los mismos grupos.
    await elegirFiltroStock(page, 'estado', 'reservado')
    await expect(page).toHaveURL(/estado=reservado/)
    await expect(filas.first()).toContainText('Reservado')
    await elegirFiltroStock(page, 'tipo', 'ACCESORIO')
    await expect(page).toHaveURL(/tipo=ACCESORIO/)
    await page.reload()
    await abrirFiltroStock(page, 'estado')
    await expect(page.getByTestId('filtro-estado-reservado')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('filtros-limpiar').click()
    await expect(page).not.toHaveURL(/estado=|tipo=/)
    await noOverflow(page)
    if (tarjetas) {
      for (const target of await page
        .getByTestId('inventario-tarjeta-movil')
        .first()
        .locator('button, label, summary')
        .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().toJSON()))) {
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
      }
    }
  })
}

test('U3 selección: N filas elegidas ofrecen imprimir etiquetas y vista previa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await abrirStock(page, 1440)
  const filas = page.getByTestId('inventario-fila')
  await expect(filas.first()).toBeVisible()
  for (const indice of [0, 1, 2]) await filas.nth(indice).getByRole('checkbox').check()
  await expect(page.getByTestId('imprimir-etiquetas')).toBeVisible()
  await expect(page.getByTestId('etiquetas-vista-previa')).toBeVisible()
  // En el demo la impresora no está disponible: el aviso lo dice sin inventar un éxito.
  await page.getByTestId('imprimir-etiquetas').click()
  await expect(page.getByText(/demostración|demo/i).first()).toBeVisible()
  await page.keyboard.press('Escape')
})
