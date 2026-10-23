import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { advanceService, advanceSelectedServices, serviceAdvanceFeedback } from './tallerAvance.js'
import { ESTADOS_SERVICIO, SIGUIENTE_SERVICIO } from './estadosServicio.js'

const rows = [
  { id: 'a', status: 'RECIBIDO' },
  { id: 'b', status: 'DIAGNOSTICO' },
]
const mutateError = new Error('Denied')
const advanced = row => ({ id: row.id, outcome: 'advanced' })
test('Taller mixed mutations count only confirmed changes and retain failed ids', async () => {
  const result = await advanceSelectedServices(['a', 'b'], rows, row =>
    advanceService(row, {
      mutate: async () => {
        if (row.id === 'b') throw mutateError
      },
      refresh: async () => true,
    }),
  )
  assert.deepEqual(result, {
    advanced: 1,
    failed: 1,
    skipped: 0,
    refreshFailed: false,
    confirmedIds: ['a'],
  })
  assert.equal(
    serviceAdvanceFeedback(result),
    '1 orden avanzada. 1 falló; conserva la selección para reintentar.',
  )
})
test('Taller all failures neither clear selection nor claim success or refresh', async () => {
  let refreshes = 0
  const result = await advanceSelectedServices(['a', 'b'], rows, row =>
    advanceService(row, {
      mutate: async () => {
        throw mutateError
      },
      refresh: async () => {
        refreshes++
        return true
      },
    }),
  )
  assert.equal(result.advanced, 0)
  assert.deepEqual(result.confirmedIds, [])
  assert.equal(refreshes, 0)
  assert.equal(
    serviceAdvanceFeedback(result),
    '0 órdenes avanzadas. 2 fallaron; conserva la selección para reintentar.',
  )
})
test('Taller terminal and nonvisible selection are skipped, never mutated or counted', async () => {
  const calls = []
  const result = await advanceSelectedServices(
    ['a', 'hidden', 'delivered', 'cancelled'],
    [...rows, { id: 'delivered', status: 'ENTREGADO' }, { id: 'cancelled', status: 'CANCELADO' }],
    async row => {
      calls.push(row.id)
      return advanced(row)
    },
  )
  assert.deepEqual(calls, ['a'])
  assert.equal(result.skipped, 3)
  assert.equal(
    serviceAdvanceFeedback(result),
    '1 orden avanzada. 3 sin avanzar (fuera de la vista o sin estado siguiente).',
  )
})
test('Taller refresh failure after PATCH still confirms the mutation and warns exactly', async () => {
  for (const refresh of [
    async () => false,
    async () => {
      throw new Error('GET failed')
    },
  ]) {
    const payloads = []
    const result = await advanceSelectedServices(['a'], rows, row =>
      advanceService(row, {
        mutate: async payload => payloads.push(payload),
        refresh,
      }),
    )
    assert.deepEqual(payloads, [{ id: 'a', status: 'DIAGNOSTICO' }])
    assert.deepEqual(result.confirmedIds, ['a'])
    assert.equal(result.failed, 0)
    assert.equal(
      serviceAdvanceFeedback(result),
      '1 orden avanzada. El cambio se guardó, pero no se pudo actualizar la lista. Actualiza antes de continuar.',
    )
  }
})
test('Taller all eight real states retain exact next transitions and terminal outcomes', async () => {
  assert.equal(ESTADOS_SERVICIO.length, 8)
  for (const [status] of ESTADOS_SERVICIO) {
    const calls = []
    const result = await advanceService(
      { id: status, status },
      {
        mutate: async payload => calls.push(payload),
        refresh: async () => true,
      },
    )
    assert.equal(result.outcome, SIGUIENTE_SERVICIO[status] ? 'advanced' : 'skipped')
    assert.deepEqual(
      calls,
      SIGUIENTE_SERVICIO[status] ? [{ id: status, status: SIGUIENTE_SERVICIO[status] }] : [],
    )
  }
})
test('Taller financial save, catalog, inspection and print handlers keep their contracts', () => {
  // Semantic contract (replaces the old `git show` byte comparison): every
  // money field, handler and guard of the four protected regions is still there.
  const current = readFileSync('src/components/control/ServicioTecnico.jsx', 'utf8')
  for (const text of [
    // Totals and the order save payload.
    'acc.facturado += Number(row.pricePyg || 0)',
    'acc.costos += Number(row.costPyg || 0)',
    'if (!validarOrden({ customerName: form.customerName, device: form.device }).valido) return',
    'partsPyg: numeroDe(form.partsPyg)',
    'laborPyg: numeroDe(form.laborPyg)',
    'otherCostPyg: numeroDe(form.otherCostPyg)',
    'pricePyg: numeroDe(form.pricePyg)',
    'costPyg: numeroDe(form.costPyg)',
    // Service catalog save and delete.
    'if (!servicioEdit.name.trim())',
    'suggestedPricePyg: numeroDe(servicioEdit.precio)',
    "api.patch('/api/service-items'",
    "api.post('/api/service-items'",
    // Opening an order for edit keeps every cost field and the dirty reference.
    "pricePyg: String(row.pricePyg || '')",
    'setReferenciaForm(JSON.stringify(datos))',
    'const hayDesgloseForm',
    // Order modal: submit handler, dirty guard and busy lock.
    '<form id="form-taller-orden" onSubmit={guardar}',
    'dirty={formSucio}',
    'busy || checklistOpen || catalogoOpen ? undefined',
  ])
    assert.ok(current.includes(text), text)
  assert.ok(current.includes("await api.patch('/api/service-orders', payload)"))
  assert.ok(current.includes('current.filter(id => !result.confirmedIds.includes(id))'))
  assert.ok(current.includes('setRows(current =>'))
})
test('Taller scoped responsive presentation retains full identities, sort, detail and feedback', () => {
  const css = readFileSync('src/components/control/tallerF3.css', 'utf8')
  const source = readFileSync('src/components/control/ServicioTecnico.jsx', 'utf8')
  assert.ok(!source.includes('min-w-[65rem]'))
  for (const text of [
    'Ordenar órdenes en pantalla',
    'Invertir: de mayor a menor',
    'Seleccionar órdenes',
    'Catálogo de servicios',
    'Cargar catálogo sugerido',
    'role="status"',
    'aria-live="polite"',
    'Ver detalle de',
    'SIGUIENTE[row.status]',
  ])
    assert.ok(source.includes(text), text)
  for (const text of [
    'min-height: 44px',
    'overflow-wrap: anywhere',
    'white-space: nowrap',
    'repeat(2, minmax(0, 1fr))',
    // #448: desde 1280 px cada orden es una fila fina (una por renglón).
    'grid-template-columns: 16rem minmax(0, 1.6fr) minmax(0, 1fr) 24rem',
  ])
    assert.ok(css.includes(text), text)
  assert.ok(!css.includes('.shell-'))
})
