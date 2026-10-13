import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import {
  openShellDestination,
  selectAnalysisSection,
  selectFinanceSection,
} from '../helpers/shell-navigation.js'
import { expectLayoutContract } from './helpers/layoutContract.js'

// Finanzas (unit 2B): QA-A on every Finanzas tab plus Análisis > Reportes,
// measured on the demo (frontend-only, no backend) at 375/768/1280/1440 in
// light and dark, and the screen-specific acceptance of audit #23-#29.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-finanzas-qa'

const WIDTHS = [
  [360, 740],
  [375, 812],
  [768, 1024],
  [1280, 900],
  [1440, 900],
]
const FINANZAS = [
  'Caja',
  'Conciliación',
  'Cuotas',
  'Créditos',
  'Bancos y cuentas',
  'Comisiones',
]

async function enterDemo(page) {
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
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function setTheme(page, dark) {
  if (!dark) return
  const mobile = page.viewportSize().width < 1024
  await page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page
    .getByRole('dialog', { name: 'Perfil y preferencias' })
    .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}

async function settle(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  await page.waitForTimeout(250)
}

async function openFinanzas(page, tab) {
  await openShellDestination(page, 'Finanzas')
  await selectFinanceSection(page, tab)
  await settle(page)
}

async function openReportes(page) {
  await openShellDestination(page, 'Análisis')
  await selectAnalysisSection(page, 'Reportes')
  await settle(page)
}

// Every `.truncate`/tabular-nums box inside `root` must show its full text.
async function cutBoxes(root) {
  return root.evaluate(node =>
    [...node.querySelectorAll('.truncate, .tabular-nums')]
      .filter(el => el.getBoundingClientRect().width > 0)
      .filter(el => el.scrollWidth > el.clientWidth + 1)
      .map(el => (el.textContent || '').trim().slice(0, 50)),
  )
}

const intersects = (a, b) =>
  a.x < b.x + b.width - 1 &&
  b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 &&
  b.y < a.y + a.height - 1

// The demo hides Cuotas, Créditos and Comisiones (they need real data), so QA-A
// runs twice: on the demo tabs and on a simulated real session that serves
// representative rows (long names, full amounts) for every Finanzas tab.
const DEMO_TABS = FINANZAS.filter(tab => !['Cuotas', 'Créditos', 'Comisiones'].includes(tab))

for (const [width, height] of WIDTHS) {
  for (const dark of [false, true]) {
    test(`QA-A demo Finanzas + Reportes ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width: 375, height: 812 })
      await enterDemo(page)
      await setTheme(page, dark)
      await page.setViewportSize({ width, height })
      for (const tab of DEMO_TABS) {
        await openFinanzas(page, tab)
        await expectLayoutContract(page, `${tab} · ${width}px · ${dark ? 'dark' : 'light'}`, {
          scope: 'all',
        })
      }
      await openReportes(page)
      await expectLayoutContract(page, `Reportes · ${width}px · ${dark ? 'dark' : 'light'}`, {
        scope: 'all',
      })
    })
  }
}

const LARGO = 'Proveedor de repuestos y accesorios electrónicos Aurora Móviles Sociedad Anónima'
const FILAS_CAJA = {
  proveedores: [
    { id: 'p1', supplierName: LARGO, concept: 'Pantallas OLED y baterías para reparación', condition: 'CREDITO', amountPyg: 12500000, pendientePyg: 12500000, depositoPyg: 0, dueAt: '2026-10-20T12:00:00Z', vencimiento: 'POR_VENCER' },
    { id: 'p2', supplierName: 'Insumos del Este', concept: 'Consignación de cargadores', condition: 'CONSIGNACION', amountPyg: 4300000, pendientePyg: 0, depositoPyg: 4300000, dueAt: null, vencimiento: null },
    { id: 'p3', supplierName: 'Casa Repuestos', concept: 'Compra a crédito', condition: 'CREDITO', amountPyg: 1000000000, pendientePyg: 1000000000, depositoPyg: 0, dueAt: '2026-09-30T12:00:00Z', vencimiento: 'VENCIDA' },
  ],
  taller: [
    { id: 't1', name: 'Pantalla iPhone 13 original con marco', code: 'REP-0001', supplierName: LARGO, paymentMode: 'CREDITO', deudaPyg: 1250000, dueAt: '2026-10-02T12:00:00Z', vencimiento: 'VENCIDA' },
    { id: 't2', name: 'Batería Samsung A54', code: 'REP-0002', supplierName: null, paymentMode: 'CONSIGNACION', deudaPyg: 85000, dueAt: null, vencimiento: null },
  ],
}

async function mockSesionFinanzas(page, dark) {
  await page.addInitScript(oscuro => {
    try {
      localStorage.setItem('mobos:theme', oscuro ? 'dark' : 'light')
    } catch {
      /* sin storage */
    }
  }, dark)
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (request.method() !== 'GET') return route.fulfill({ status: 503, json: { error: 'Mutation blocked' } })
    const ruta = url.pathname
    if (ruta === '/api/auth/me')
      return route.fulfill({
        json: {
          user: { id: 'qa-user', name: 'Usuario local', role: 'ADMIN', tenantId: 'qa-tenant', branchId: 'qa-branch', branchName: 'Casa Central' },
          tenant: { id: 'qa-tenant', name: 'Tienda local' },
        },
      })
    if (['/api/inventory-branches', '/api/inventory/branches'].includes(ruta))
      return route.fulfill({ json: [{ id: 'qa-branch', name: 'Casa Central' }] })
    if (ruta === '/api/cash/audit-operations')
      return route.fulfill({
        json: {
          resumen: { aperturaPyg: 500000, recibidoPyg: 48590000, esperadoPyg: 49090000, diferenciaPyg: -50000, operaciones: 2, verificadas: 0, pendientes: 2, conDiferencia: 0 },
          sesiones: [{ id: 's1' }],
          operaciones: [
            { kind: 'PAYMENT', id: 'a1', fecha: '2026-10-13T12:00:00Z', pedido: 'AUR-0001', cliente: 'María González de la Torre y Benítez', vendedor: 'Hernán Acosta', montoPyg: 6850000, direction: 'IN', status: 'PENDING', notaAuditoria: '' },
            { kind: 'MOVEMENT', id: 'a2', fecha: '2026-10-12T12:00:00Z', nota: 'Retiro para compra de insumos del local', vendedor: 'Hernán Acosta', montoPyg: 120000, direction: 'OUT', status: 'DIFFERENCE', notaAuditoria: 'Falta el comprobante' },
          ],
        },
      })
    if (ruta === '/api/cash') {
      if (url.searchParams.has('sesiones'))
        return route.fulfill({
          json: {
            sesiones: [
              { id: 'c1', status: 'CLOSED', openedByName: 'Hernán Acosta de la Torre', openedAt: '2026-10-12T11:00:00Z', closedAt: '2026-10-12T21:00:00Z', notes: 'Cierre sin novedades', pedidos: 12, ventasPyg: 1000000000, efectivoPyg: 1000000000, esperadoPyg: 1000000000, contadoPyg: 1000000000, diferenciaPyg: -1000000000 },
              { id: 'c2', status: 'OPEN', openedByName: 'Ana', openedAt: '2026-10-13T11:00:00Z', closedAt: null, notes: '', pedidos: 3, ventasPyg: 1250000, efectivoPyg: 250000, esperadoPyg: 750000, contadoPyg: null, diferenciaPyg: null },
            ],
          },
        })
      return route.fulfill({ json: { status: 'CLOSED' } })
    }
    if (ruta === '/api/finance')
      return route.fulfill({
        json: {
          movements: [],
          accounts: [],
          receivables: { rows: [], totalPyg: 0, orders: 0 },
          payables: { rows: [], totalPyg: 0, purchases: 0 },
          supplierPayables: { rows: FILAS_CAJA.proveedores, totalPyg: 110500000, vencidasPyg: 98000000, porVencerPyg: 12500000, depositoPyg: 4300000, compras: 3 },
          workshopParts: { rows: FILAS_CAJA.taller, totalPyg: 1335000, vencidasPyg: 1250000, partes: 2 },
          margin: { profitPyg: 0, marginPct: null },
          reconciliations: [],
        },
      })
    if (ruta === '/api/credits')
      return route.fulfill({
        json: {
          truncado: false,
          totals: { outstandingPyg: 148500000, overduePyg: 98000000, customersWithDebt: 3, overdueCustomers: 1 },
          credits: [
            { customerId: 'k1', name: 'Importadora y Distribuidora Aurora Móviles S.A.', pricingTier: 'WHOLESALE', pendingOrders: 4, oldestDueAt: '2026-09-20T12:00:00Z', creditLimitPyg: 1000000000, limitUsagePct: 74, creditDays: 30, outstandingPyg: 1000000000, overduePyg: 1000000000, maxOverdueDays: 23 },
            { customerId: 'k2', name: 'María González', pricingTier: 'RETAIL', pendingOrders: 1, oldestDueAt: '2026-10-25T12:00:00Z', creditLimitPyg: 0, limitUsagePct: null, creditDays: 0, outstandingPyg: 500000, overduePyg: 0, maxOverdueDays: 0 },
          ],
        },
      })
    if (ruta === '/api/commission-rules')
      return route.fulfill({ json: [{ id: 'r1', userId: 'u1', role: 'VENDEDOR', percentPyg: 5, user: { name: 'Hernán Acosta de la Torre y Benítez' } }, { id: 'r2', userId: null, role: 'VENDEDOR', percentPyg: 3.5, user: null }] })
    if (ruta === '/api/users') return route.fulfill({ json: [{ id: 'u1', name: 'Hernán Acosta', email: 'hernan@aurora.com.py', role: 'VENDEDOR' }] })
    if (ruta === '/api/commission-settlements')
      return route.fulfill({
        json: [
          { id: 'l1', sellerName: 'Hernán Acosta de la Torre y Benítez', totalPyg: 1250000, periodFrom: '2026-10-01', periodTo: '2026-10-13', createdAt: '2026-10-13T12:00:00Z', status: 'DRAFT', commissionPct: 5 },
          { id: 'l2', sellerName: 'Ana', totalPyg: 1000000000, periodFrom: '2026-09-01', periodTo: '2026-09-30', createdAt: '2026-10-01T12:00:00Z', status: 'PAID', commissionPct: 3.5 },
        ],
      })
    if (ruta === '/api/collections/reminders')
      return route.fulfill({
        json: {
          moraBpPorDia: 0,
          rows: [
            { id: 'q1', tipo: 'VENCIDA', customerName: 'Importadora Aurora Móviles S.A.', orderNumber: 'AUR-0007', orderId: 'o1', dueAt: '2026-10-01T12:00:00Z', saldoPendientePyg: 12500000, recargoPyg: 0, reference: 'Cuota 2 de 6', phone: '0981123456', countryCode: 'PY', whatsappUrl: 'https://wa.me/595981123456', avisadoEn: null },
            { id: 'q2', tipo: 'PROXIMA', customerName: 'María González', orderNumber: 'AUR-0008', orderId: 'o2', dueAt: '2026-10-20T12:00:00Z', saldoPendientePyg: 480000, recargoPyg: 0, reference: 'Cuota 1 de 3', phone: '', countryCode: 'PY', whatsappUrl: '', avisadoEn: null },
          ],
        },
      })
    return route.fulfill({ json: [] })
  })
}

const RUTAS_REALES = [
  ['Caja', '/finanzas/caja'],
  ['Cuotas', '/finanzas/cuotas'],
  ['Créditos', '/finanzas/creditos'],
  ['Comisiones', '/finanzas/comisiones'],
]
for (const [width, height] of WIDTHS) {
  for (const dark of [false, true]) {
    test(`QA-A sesión simulada (Caja con repuestos, Cuotas, Créditos, Comisiones) ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height })
      await mockSesionFinanzas(page, dark)
      for (const [tab, ruta] of RUTAS_REALES) {
        await page.goto(ruta)
        await page.evaluate(oscuro => document.documentElement.classList.toggle('dark', oscuro), dark)
        await settle(page)
        await expect(page.locator('main')).not.toContainText('No se pudo')
        await expectLayoutContract(page, `${tab} (sesión simulada) · ${width}px · ${dark ? 'dark' : 'light'}`, {
          scope: 'all',
        })
        const listados = { Caja: ['proveedores-tabla', 'taller-tabla', 'auditoria-efectivo-tabla', 'ventas-por-caja-tabla'], Créditos: ['creditos-tabla'], Comisiones: ['comisiones-reglas-tabla', 'comisiones-liquidaciones-tabla'] }[tab] || []
        for (const id of listados) {
          const lista = page.getByTestId(id)
          await expect(lista, `${tab}: ${id}`).toBeVisible()
          const scroll = await lista.evaluate(el => [el.scrollWidth, el.clientWidth])
          expect(scroll[0], `${tab} ${id} @${width}: scroll horizontal`).toBeLessThanOrEqual(scroll[1] + 1)
          expect(await cutBoxes(lista), `${tab} ${id} @${width}: cifras cortadas`).toEqual([])
        }
      }
    })
  }
}

test('Caja Auditoría: Estado and Observación never overlap and the status shows once (1280, 1440)', async ({
  page,
}) => {
  await enterDemo(page)
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openFinanzas(page, 'Caja')
    const filas = page.getByTestId('auditoria-fila')
    await expect(filas.first()).toBeVisible()
    const total = await filas.count()
    expect(total).toBeGreaterThan(0)
    for (let i = 0; i < total; i += 1) {
      const fila = filas.nth(i)
      const estado = fila.getByRole('combobox', { name: /^Estado de / })
      // The status is ONE editable control: no read-only badge next to it.
      await expect(estado, `fila ${i}: un solo control de estado`).toHaveCount(1)
      await expect(fila.locator('span[data-tono]'), `fila ${i}: sin chip duplicado`).toHaveCount(0)
      const observacion = fila.getByRole('textbox', { name: 'Observación' })
      const a = await estado.boundingBox()
      const b = await observacion.boundingBox()
      expect(a, `fila ${i}: estado visible`).not.toBeNull()
      expect(b, `fila ${i}: observación visible`).not.toBeNull()
      expect(intersects(a, b), `fila ${i} @${width}: Estado se superpone con Observación`).toBe(false)
      // The control keeps its full label (no clipped text).
      const recorte = await estado.evaluate(el => el.scrollWidth > el.clientWidth + 1)
      expect(recorte, `fila ${i} @${width}: etiqueta de estado recortada`).toBe(false)
    }
    expect(await cutBoxes(page.getByTestId('auditoria-efectivo-tabla'))).toEqual([])
  }
})

test('Bancos y cuentas: bank shown once, no truncated names at 1440', async ({ page }, testInfo) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openFinanzas(page, 'Bancos y cuentas')
  const filas = page.getByTestId('cuenta-fila')
  await expect(filas.first()).toBeVisible()
  const total = await filas.count()
  expect(total).toBeGreaterThan(0)
  for (let i = 0; i < total; i += 1) {
    const fila = filas.nth(i)
    // The bank (logo + name) lives in the first cell; the data cell must not
    // repeat it.
    const datos = await fila.locator('[data-celda="datos"]').textContent()
    const banco = (await fila.getAttribute('data-banco')) || ''
    if (banco) expect(datos || '', `fila ${i}: banco repetido en Datos`).not.toContain(banco)
  }
  expect(await cutBoxes(page.getByTestId('cuentas-tabla')), 'nombres recortados').toEqual([])
  await page.screenshot({ path: `${out}/bancos-1440.png` })
  testInfo.annotations.push({ type: 'rows', description: String(total) })
})

for (const [name, tab, tabla, fila] of [
  ['Caja Auditoría', 'Caja', 'auditoria-efectivo-tabla', 'auditoria-fila'],
  ['Caja Ventas por caja', 'Caja', 'ventas-por-caja-tabla', 'ventas-por-caja-fila'],
  ['Bancos y cuentas', 'Bancos y cuentas', 'cuentas-tabla', 'cuenta-fila'],
]) {
  test(`375: ${name} cards show amount, status and actions without horizontal scroll`, async ({
    page,
  }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width: 375, height: 812 })
    await enterDemo(page)
    await openFinanzas(page, tab)
    const lista = page.getByTestId(tabla)
    await lista.scrollIntoViewIfNeeded()
    const primera = page.getByTestId(fila).first()
    await expect(primera).toBeVisible()
    // Cards, not a scrolling table.
    await expect(page.getByTestId(tabla).locator('[role="columnheader"]')).toHaveCount(0)
    const scroll = await lista.evaluate(el => [el.scrollWidth, el.clientWidth])
    expect(scroll[0], `${name}: scroll horizontal de la lista`).toBeLessThanOrEqual(scroll[1] + 1)
    const doc = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    expect(doc[0], `${name}: scroll horizontal de la página`).toBeLessThanOrEqual(doc[1])
    const texto = (await primera.innerText()).replace(/\s+/g, ' ')
    if (tab === 'Caja' && fila === 'auditoria-fila') {
      expect(texto).toMatch(/Gs\s[\d.]+/)
      await expect(primera.getByRole('combobox', { name: /^Estado de / })).toBeVisible()
      await expect(primera.getByRole('button', { name: 'Guardar' })).toBeVisible()
    } else if (fila === 'ventas-por-caja-fila') {
      expect(texto).toMatch(/Gs\s[\d.]+/)
      expect(texto).toMatch(/Abierta|Cerrada/)
    } else {
      expect(texto).toMatch(/Activa|Inactiva/)
      await expect(primera.getByRole('button', { name: /^Editar / })).toBeVisible()
      await expect(primera.getByRole('button', { name: /^(Desactivar|Activar) / })).toBeVisible()
    }
    expect(await cutBoxes(lista), `${name}: importes o nombres recortados`).toEqual([])
    if (name === 'Caja Auditoría') await page.screenshot({ path: `${out}/caja-auditoria-375.png` })
    if (name === 'Bancos y cuentas') await page.screenshot({ path: `${out}/bancos-375.png` })
  })
}

test('Reportes: controls and pager are 44px below lg and Exportar CSV matches its siblings', async ({
  page,
}) => {
  await enterDemo(page)
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await openReportes(page)
    const controles = page.locator('main').getByRole('button')
    const pequenos = []
    for (const control of await controles.all()) {
      if (!(await control.isVisible())) continue
      const box = await control.boundingBox()
      if (box && (box.height < 43.5 || box.width < 43.5))
        pequenos.push(`${(await control.innerText()).trim().slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`)
    }
    expect(pequenos, `@${width}: controles < 44px`).toEqual([])
  }
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await openReportes(page)
    const medidas = async nombre => {
      const boton = page.getByRole('button', { name: nombre, exact: true }).first()
      return boton.evaluate(el => ({
        font: getComputedStyle(el).fontSize,
        alto: Math.round(el.getBoundingClientRect().height),
      }))
    }
    const exportar = await medidas('Exportar CSV')
    const imprimir = await medidas('Imprimir')
    const actualizar = await medidas('Actualizar')
    expect(exportar, `@${width}: Exportar CSV vs Imprimir`).toEqual(imprimir)
    expect(exportar, `@${width}: Exportar CSV vs Actualizar`).toEqual(actualizar)
  }
})

test('Conciliación: no debug copy and full signed money', async ({ page }) => {
  await enterDemo(page)
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openFinanzas(page, 'Conciliación')
    const main = page.locator('main')
    await expect(main).not.toContainText(/Lista:\s*\d+\s*pago\(s\)/)
    await expect(main).not.toContainText('Selección masiva')
    await expect(main).not.toContainText('Estado: Todos')
    await expect(main).not.toContainText('Página:')
    await expect(main).not.toContainText(/Gs\s{2,}/)
    // A scope summary survives, short and human.
    const resumen = page.getByTestId('conciliacion-list-scope')
    await expect(resumen).toBeVisible()
    expect((await resumen.innerText()).length).toBeLessThan(140)
    expect(await cutBoxes(main)).toEqual([])
  }
})

test('no min-w-[] utility remains in the Finanzas screens (below md)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const file of [
    'AuditoriaEfectivo',
    'VentasPorCaja',
    'PaymentAccounts',
    'Conciliacion',
    'Reportes',
    'Caja',
    'Creditos',
    'Comisiones',
  ])
    expect(readFileSync(`src/components/control/${file}.jsx`, 'utf8'), file).not.toMatch(
      /min-w-\[/,
    )
})
