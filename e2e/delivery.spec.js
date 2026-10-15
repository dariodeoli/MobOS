import { openShellDestination, shellCatalog } from './helpers/shell-navigation.js'
// Delivery propio de punta a punta: login aparte del repartidor, pedidos
// asignados con dirección y teléfono, pre-cobro en la calle y rendición que la
// tienda verifica. El seed (global-setup) crea el usuario REPARTIDOR y el
// pedido asignado, y lo reinicia en cada corrida.

import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { SEED } from './helpers/seed-data.js'
import { loginCompany } from './helpers/login.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function entrarConPin(page, pin, destino) {
  await loginCompany(page)
  await page.locator('#seller-pin').pressSequentially(pin)
  await expect(page).toHaveURL(destino)
}

test.describe('delivery', () => {
  test('el repartidor ve sus pedidos, cobra en la calle y la tienda verifica la rendición', async ({ page, browser }) => {
    await entrarConPin(page, SEED.repartidor.pin, /\/delivery\/repartos$/)

    // Navegación propia: sin panel de venta.
    const catalog = await shellCatalog(page)
    expect(catalog.primary).toEqual(['Entregas'])
    expect(catalog.destinations).toContain('Mis repartos')
    expect(catalog.destinations).toContain('Rendiciones')
    expect(catalog.destinations).not.toContain('Nueva venta')

    // El panel de venta no es su lugar: la URL vuelve al reparto.
    await page.goto('/pos')
    await expect(page).toHaveURL(/\/delivery\/repartos$/)

    // El pedido asignado trae cliente, dirección y teléfono; y solo ese.
    const tarjeta = page.locator(`[data-testid="reparto-pedido"][data-pedido="${SEED.deliveryOrderNumber}"]`)
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText(SEED.deliveryCustomer.name)
    await expect(tarjeta).toContainText('Av. Reparto E2E 123')
    await expect(tarjeta.locator('a[href*="595981555111"]')).toBeVisible()
    await expect(tarjeta).toContainText('Falta cobrar')
    await expect(tarjeta).toContainText('Gs 45.000')
    await expect(page.locator('[data-testid="reparto-pedido"]')).toHaveCount(1)

    // La API de gestión no está a su alcance.
    const auditoria = await page.request.get(`${API}/api/audit`, { headers: { origin: new URL(page.url()).origin } })
    expect(auditoria.status()).toBe(403)

    // Pre-cobro parcial en la calle.
    await tarjeta.getByTestId('reparto-cobrar').click()
    await page.locator('#delivery-monto').fill('1000')
    await page.getByTestId('reparto-cobro-confirmar').click()
    await expect(page.getByText('Cobro registrado')).toBeVisible()
    await expect(tarjeta).toContainText('Cobrado en la calle (sin rendir)')
    await expect(tarjeta).toContainText('Gs 44.000')

    // Rendición: queda pendiente de verificación en la tienda.
    await openShellDestination(page, 'Rendiciones')
    await expect(page.getByTestId('rendicion-total')).toContainText('Gs 1.000')
    await page.getByTestId('rendir-abrir').click()
    await page.getByTestId('rendir-confirmar').click()
    await expect(page.getByText('Rendición registrada')).toBeVisible()
    const rendicion = page.locator('[data-testid="rendicion"]').first()
    await expect(rendicion).toContainText('Pendiente')
    await expect(rendicion).toContainText('Gs 1.000')
    await expect(rendicion).toContainText(SEED.deliveryOrderNumber)

    // La tienda entra con su propio acceso y verifica la rendición.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const tienda = await contexto.newPage()
    await entrarConPin(tienda, SEED.admin.pin, /\/resumen$/)
    await tienda.goto('/delivery')
    await expect(tienda.getByRole('heading', { name: 'Delivery', level: 1 })).toBeVisible()
    // Pestaña Repartos: el pedido figura asignado al repartidor con lo cobrado.
    await tienda.getByRole('button', { name: 'Asignados', exact: true }).click()
    const filaTienda = tienda.locator(`[data-testid="reparto-admin-pedido"][data-pedido="${SEED.deliveryOrderNumber}"]`)
    await expect(filaTienda).toContainText(SEED.repartidor.name)
    await expect(filaTienda).toContainText('Cobrado en la calle sin rendir')
    await tienda.getByRole('button', { name: 'Rendiciones', exact: true }).first().click()
    const pendiente = tienda.locator('[data-testid="rendicion-admin"]').filter({ hasText: SEED.deliveryOrderNumber }).first()
    await expect(pendiente).toContainText(SEED.repartidor.name)
    await expect(pendiente).toContainText('Gs 1.000')
    await pendiente.getByTestId('rendicion-verificar').click()
    await tienda.locator('[role="dialog"]').getByRole('button', { name: 'Verificar', exact: true }).click()
    await expect(tienda.getByText('Rendición verificada')).toBeVisible()

    // El repartidor ve el cobro confirmado y el pedido saldado.
    await page.reload()
    await expect(page.getByTestId('rendicion-total')).toContainText('Gs 0')
    const verificada = page.locator('[data-testid="rendicion"]').first()
    await expect(verificada).toContainText('Verificada')
    await openShellDestination(page, 'Mis repartos')
    await expect(tarjeta).toContainText('Confirmado en tienda')
    await expect(tarjeta).toContainText('Gs 1.000')

    await contexto.close()
  })
})


test('tarifas explícitas, multiviaje, sin venta y cierre auditable con rendición posterior (#394/#395)', async ({ page, browser }, testInfo) => {
  test.setTimeout(180000)
  const require = createRequire(new URL('../backend/package.json', import.meta.url))
  const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg')
  const pgPort = process.env.MOBOS_E2E_PGPORT, dbName = process.env.MOBOS_E2E_DB
  expect(pgPort).toBeTruthy(); expect(dbName).toMatch(/^mobos_e2e(?:_|$)/)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres@127.0.0.1:${pgPort}/${dbName}` }) })
  const contexts = []
  try {
    // Solo fixtures de esta funcionalidad, dentro del tenant sintético del arnés.
    const fixtureTenant = await db.tenant.findFirstOrThrow({ where: { email: SEED.company.email }, select: { id: true } })
    await db.deliveryWeeklyAdjustment.deleteMany({ where: { tenantId: fixtureTenant.id } })
    await db.deliveryTrip.deleteMany({ where: { tenantId: fixtureTenant.id } })
    await db.deliveryWeeklyClose.deleteMany({ where: { tenantId: fixtureTenant.id } })
    await db.deliveryTariff.deleteMany({ where: { tenantId: fixtureTenant.id } })
    await entrarConPin(page, SEED.admin.pin, /\/resumen$/)
    await page.goto('/delivery')
    const headers = { origin: new URL(page.url()).origin }
    async function call(path, method = 'GET', data, client = page) {
      const response = await client.request.fetch(`${API}${path}`, { method, headers, ...(data === undefined ? {} : { data }) })
      return { status: response.status(), body: await response.json() }
    }
    const team = await call('/api/delivery/team')
    expect(team.status).toBe(200)
    const driver = team.body.find(row => row.name === SEED.repartidor.name)
    expect(driver).toBeTruthy()
    const order = await db.order.findFirstOrThrow({ where: { orderNumber: SEED.deliveryOrderNumber } })
    const tenantId = order.tenantId, branchId = order.branchId
    const monday = new Date(); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7)
    const weekStart = monday.toISOString().slice(0, 10), sunday = new Date(+new Date(`${weekStart}T00:00:00Z`) + 6 * 86400000), endDate = sunday.toISOString().slice(0, 10)
    const baseTrip = { branchId, driverId: driver.id, orderId: order.id, route: 'Ruta E2E 394', performedOn: weekStart, distanceKm: 5, tripsCount: 3, idempotencyKey: randomUUID() }
    expect((await call('/api/delivery/tariffs')).body.rows).toHaveLength(0)
    expect((await call('/api/delivery/trips', 'POST', baseTrip)).status).toBe(409)
    const orderCount = await db.order.count({ where: { tenantId } }), paymentCount = await db.payment.count({ where: { tenantId } })

    await page.getByRole('button', { name: 'Viajes y cierres', exact: true }).click()
    await page.getByRole('button', { name: 'Tarifas', exact: true }).click()
    await page.getByRole('button', { name: 'Nueva tarifa', exact: true }).click()
    await page.locator('#tariff-name').fill('Tarifa E2E explícita')
    await page.locator('#tariff-from').fill(weekStart); await page.locator('#tariff-until').fill(endDate)
    await page.locator('#tier-fee-0').fill('10000')
    await page.getByRole('button', { name: 'Guardar tarifa', exact: true }).click()
    await expect(page.getByText('Tarifa guardada', { exact: true })).toBeVisible()
    const rates = await call('/api/delivery/tariffs')
    const rate = rates.body.rows[0]
    expect(rate.tiers).toEqual([{ upToKm: 28, feePyg: 10000 }])
    expect((await call('/api/delivery/tariffs', 'POST', { name: 'Superpuesta', validFrom: weekStart, validUntil: endDate, tiers: rate.tiers })).status).toBe(409)
    for (const distanceKm of [0, 28.001]) expect((await call('/api/delivery/trips', 'POST', { ...baseTrip, distanceKm, idempotencyKey: randomUUID() })).status).toBe(400)
    const concurrentTrips = await Promise.all([call('/api/delivery/trips', 'POST', baseTrip), call('/api/delivery/trips', 'POST', baseTrip)])
    expect(concurrentTrips.map(row => row.status)).toEqual([201, 201])
    expect(concurrentTrips[0].body.id).toBe(concurrentTrips[1].body.id)
    expect(concurrentTrips[0].body.totalFeePyg).toBe(30000)
    expect(await db.deliveryTrip.count({ where: { tenantId, idempotencyKey: baseTrip.idempotencyKey } })).toBe(1)
    expect((await call('/api/delivery/trips', 'POST', { ...baseTrip, tripsCount: 4 })).status).toBe(409)

    const orphan = await call('/api/delivery/trips', 'POST', { ...baseTrip, orderId: null, tripsCount: 1, idempotencyKey: randomUUID() })
    expect(orphan.status).toBe(201)
    const query = { branchId, driverId: driver.id, weekStart }
    expect((await call('/api/delivery/weekly', 'POST', query)).status).toBe(409)
    expect((await call(`/api/delivery/trips/${orphan.body.id}`, 'PATCH', { action: 'discard', reason: 'ab' })).status).toBe(400)
    expect((await call(`/api/delivery/trips/${orphan.body.id}`, 'PATCH', { action: 'discard', reason: 'Aviso sin viaje realizado' })).body.status).toBe('CANCELLED')
    const linked = await call('/api/delivery/trips', 'POST', { ...baseTrip, orderId: null, tripsCount: 1, idempotencyKey: randomUUID() })
    expect((await call(`/api/delivery/trips/${linked.body.id}`, 'PATCH', { action: 'link', orderId: order.id, reason: 'Pedido confirmado por el dueño' })).status).toBe(200)
    expect((await call('/api/delivery/trips?unresolved=true')).body.rows).toHaveLength(0)
    expect(await db.order.count({ where: { tenantId } })).toBe(orderCount)
    expect(await db.payment.count({ where: { tenantId } })).toBe(paymentCount)

    // Empresa ajena y perfil del equipo no heredan permisos del dueño.
    const foreign = await db.tenant.create({ data: { name: 'Otra empresa 394', slug: `foreign-394-${randomUUID()}` } })
    const foreignBranch = await db.branch.create({ data: { tenantId: foreign.id, name: 'Ajena' } })
    expect((await call('/api/delivery/trips', 'POST', { ...baseTrip, branchId: foreignBranch.id, idempotencyKey: randomUUID() })).status).toBe(404)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } }); contexts.push(ctx)
    const seller = await ctx.newPage(); await entrarConPin(seller, SEED.sellers[0].pin, /\/pos$/)
    expect((await call('/api/delivery/tariffs', 'POST', { name: 'No autorizado', validFrom: weekStart, validUntil: endDate, tiers: rate.tiers }, seller)).status).toBe(403)
    expect((await call('/api/delivery/weekly', 'POST', query, seller)).status).toBe(403)
    expect((await call(`/api/delivery/trips/${orphan.body.id}`, 'PATCH', { action: 'discard', reason: 'No corresponde' }, seller)).status).toBe(403)
    expect((await call('/api/delivery/trips', 'POST', { ...baseTrip, branchId: SEED.branch2Id, idempotencyKey: randomUUID() }, seller)).status).toBe(403)
    expect((await call('/api/delivery/weekly')).status).toBe(400)
    const adminWithoutOwnership = await db.user.create({ data: { tenantId, branchId, name: 'Admin sin cuenta dueña E2E', pinHash: 'fixture-no-pin-login', role: 'ADMIN' } })
    const token = randomBytes(32).toString('hex')
    await db.session.create({ data: { tenantId, userId: adminWithoutOwnership.id, level: 'SELLER', tokenHash: createHash('sha256').update(token).digest('hex'), deviceId: 'delivery-394-owner-policy', expiresAt: new Date(Date.now() + 3600000) } })
    const forbiddenAdmin = await page.request.post(`${API}/api/delivery/tariffs`, { headers: { ...headers, authorization: `Bearer ${token}` }, data: { name: 'ADMIN no es OWNER', validFrom: weekStart, validUntil: endDate, tiers: rate.tiers } })
    expect(forbiddenAdmin.status()).toBe(403)


    // Cambiar la configuración no revaloriza los viajes ya realizados.
    expect((await call(`/api/delivery/tariffs/${rate.id}`, 'PATCH', { reason: 'Nueva versión acordada' })).status).toBe(200)
    expect((await call('/api/delivery/tariffs', 'POST', { name: 'Reemplazo E2E', validFrom: weekStart, validUntil: endDate, tiers: [{ upToKm: 28, feePyg: 99000 }] })).status).toBe(201)
    expect((await call('/api/delivery/trips', 'POST', baseTrip)).body.totalFeePyg).toBe(30000)

    // Dos cobros históricos reales y separados permiten verificar/rechazar después del cierre.
    const collectedAt = new Date(`${endDate}T18:00:00Z`)
    const payments = []
    for (const amountPyg of [40000, 4000]) {
      const settlement = await db.deliverySettlement.create({ data: { tenantId, branchId, deliveryUserId: driver.id, totalPyg: amountPyg, ordersCount: 1 } })
      const payment = await db.payment.create({ data: { tenantId, orderId: order.id, method: 'CASH', status: 'PENDING', amountPyg, deliveryUserId: driver.id, userId: driver.id, deliverySettlementId: settlement.id, collectedAt, createdAt: collectedAt } })
      payments.push({ payment, settlement })
    }
    const parallel = await Promise.all([call('/api/delivery/weekly', 'POST', query), call('/api/delivery/weekly', 'POST', query)])
    expect(parallel.map(row => row.status)).toEqual([200, 200])
    expect(parallel[0].body.id).toBe(parallel[1].body.id)
    const closeId = parallel[0].body.id
    expect(parallel[0].body.feesPyg).toBe(40000)
    expect(parallel[0].body.collectedPyg).toBe(44000)
    expect(parallel[0].body.balanceAtClosePyg).toBe(-4000)
    expect(await db.deliveryWeeklyClose.count({ where: { tenantId, branchId, driverId: driver.id, weekStart: new Date(`${weekStart}T00:00:00Z`) } })).toBe(1)
    expect(await db.auditLog.count({ where: { tenantId, entityId: closeId, action: 'DELIVERY_WEEK_CLOSED' } })).toBe(1)
    expect((await call('/api/delivery/trips', 'POST', { ...baseTrip, idempotencyKey: randomUUID() })).status).toBe(409)
    expect((await call(`/api/delivery/settlements/${payments[0].settlement.id}/verify`, 'POST', { state: 'VERIFIED' })).status).toBe(200)
    const view = () => call(`/api/delivery/weekly?${new URLSearchParams(query)}`)
    const afterRender = (await view()).body.close
    expect(afterRender.balanceAtClosePyg).toBe(-4000)
    expect(afterRender.current.pendingPyg).toBe(4000)
    expect(afterRender.current.balancePyg).toBe(36000)
    expect(afterRender.snapshot.collections.find(row => row.id === payments[0].payment.id).status).toBe('PENDING')
    expect(afterRender.collections.find(row => row.id === payments[0].payment.id).status).toBe('CONFIRMED')
    expect((await call(`/api/delivery/settlements/${payments[1].settlement.id}/verify`, 'POST', { state: 'REJECTED', note: 'Cobro no recibido, se anuló' })).status).toBe(200)
    const afterReject = (await view()).body.close
    expect(afterReject.current.balancePyg).toBe(40000)
    expect(afterReject.current.collectedPyg).toBe(40000)
    expect(afterReject.balanceAtClosePyg).toBe(-4000)
    const adj = { deltaPyg: -5000, reason: 'Corrección acordada en cierre', idempotencyKey: randomUUID() }
    expect((await call(`/api/delivery/weekly/${closeId}/adjustments`, 'POST', { ...adj, reason: '' })).status).toBe(400)
    const adjustments = await Promise.all([call(`/api/delivery/weekly/${closeId}/adjustments`, 'POST', adj), call(`/api/delivery/weekly/${closeId}/adjustments`, 'POST', adj)])
    expect(adjustments.map(row => row.status)).toEqual([200, 200])
    expect(adjustments[0].body.current.balancePyg).toBe(35000)
    expect(adjustments[1].body.adjustments).toHaveLength(1)
    expect(adjustments[1].body.balanceAtClosePyg).toBe(-4000)
    expect((await call(`/api/delivery/weekly/${closeId}/adjustments`, 'POST', adj, seller)).status).toBe(403)
    expect(await db.payment.count({ where: { tenantId } })).toBe(paymentCount + 2)
    expect(await db.order.count({ where: { tenantId } })).toBe(orderCount)
    await db.user.update({ where: { id: driver.id }, data: { status: 'INACTIVE' } })
    expect((await view()).status).toBe(200, 'el cierre histórico sigue legible tras desactivar al repartidor')
    await db.user.update({ where: { id: driver.id }, data: { status: 'ACTIVE' } })

    await page.getByRole('button', { name: 'Cierre semanal', exact: true }).click()
    await page.locator('#weekly-branch').selectOption(branchId); await page.locator('#weekly-driver').selectOption(driver.id); await page.locator('#weekly-start').fill(weekStart)
    await page.getByRole('button', { name: 'Consultar semana', exact: true }).click()
    await expect(page.getByTestId('delivery-weekly-totals')).toContainText('Gs 35.000')
    // Una respuesta de otra semana no puede habilitar acciones junto a filtros nuevos.
    const originalReport = (await view()).body
    let releaseReport
    const reportGate = new Promise(resolve => { releaseReport = resolve })
    let reportStarted
    const started = new Promise(resolve => { reportStarted = resolve })
    await page.route('**/api/delivery/weekly?*', async route => { reportStarted(); await reportGate; await route.fulfill({ json: originalReport }) })
    await page.getByRole('button', { name: 'Consultar semana', exact: true }).click()
    await started
    const otherWeek = new Date(+new Date(`${weekStart}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10)
    await page.locator('#weekly-start').fill(otherWeek)
    releaseReport()
    await page.unrouteAll({ behavior: 'wait' })
    await expect(page.getByTestId('delivery-weekly-totals')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Consultar semana', exact: true })).toBeEnabled()
    await page.locator('#weekly-start').fill(weekStart)
    await page.getByRole('button', { name: 'Consultar semana', exact: true }).click()
    await expect(page.getByTestId('delivery-weekly-totals')).toContainText('Gs 35.000')
    for (const [width, theme] of [[375, 'light'], [375, 'dark'], [1280, 'light']]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`delivery-394-${width}-${theme}.png`), fullPage: true, animations: 'disabled' })
    }
  } finally { for (const context of contexts) await context.close(); await db.$disconnect() }
})
