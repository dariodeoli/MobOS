import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { orderDetailPath } from './orderDetailNavigation.js'

const context = { empresaId: 'tenant-a', sucursalId: 'branch-a', userId: 'seller-a' }

test('confirmed persisted internal ID opens only in its original active POS context', () => {
  assert.equal(
    orderDetailPath({ id: 'internal/id' }, context, { ...context }, '/pos'),
    '/pedidos/internal%2Fid',
  )
  assert.equal(
    orderDetailPath({ id: 'persisted', offline: true }, context, context, '/pos'),
    '/pedidos/persisted',
  )
  for (const key of ['empresaId', 'sucursalId', 'userId']) {
    assert.equal(
      orderDetailPath({ id: 'persisted' }, context, { ...context, [key]: 'changed' }, '/pos'),
      null,
    )
  }
  assert.equal(orderDetailPath({ id: 'persisted' }, context, context, '/clientes'), null)
  assert.equal(orderDetailPath({ id: 'persisted' }, context, null, '/pos'), null)
})

test('missing IDs, rejected orders and pending offline payloads never fabricate a detail route', () => {
  for (const order of [
    null,
    {},
    { orderNumber: 'PUBLIC-100' },
    { id: 'x', ok: false },
    { id: 'x', error: 'Rejected' },
    { payload: { offline: true }, status: 'PENDING' },
  ]) {
    assert.equal(orderDetailPath(order, context, context, '/pos'), null)
  }
})

test('POS captures context before saving and only schedules confirmed success, not offline enqueue', () => {
  const form = readFileSync(
    new URL('../components/ventas/FormularioVenta.jsx', import.meta.url),
    'utf8',
  )
  assert.ok(
    form.indexOf('const orderContext = contextoActual()') <
      form.indexOf('const order = await guardarOrdenApi'),
  )
  assert.match(form, /!order\?\.id \|\| order.error \|\| order.ok === false/)
  assert.match(
    form,
    /orderDetailPath\(completedOrder, orderContext, contextoActual\(\), window.location.pathname\)/,
  )
  const offline = form.split('const item = await encolarVenta(')[1].split('} catch {')[0]
  assert.ok(
    !offline.includes('navigate(') &&
      !offline.includes('irAlDetalleRef') &&
      !offline.includes('completedOrder ='),
  )
})
