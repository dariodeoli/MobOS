import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
test('Taller financial save, catalog, inspection and print handlers remain byte-identical', () => {
  const path = 'src/components/control/ServicioTecnico.jsx'
  const current = readFileSync(path, 'utf8')
  const original = execFileSync('git', ['show', `11cb29d2:${path}`], {
    encoding: 'utf8',
  })
  const between = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end)).trim()
  for (const [start, end] of [
    ['  const totales =', '  // ── Catálogo'],
    ['  async function guardarServicio', '  const alternar ='],
    ['  function editar(row)', '  return (\n    <Card'],
    ['      <Modal open={Boolean(form)}', '      <Modal open={catalogoOpen}'],
  ])
    assert.equal(between(current, start, end), between(original, start, end))
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
    'Invertir orden',
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
  ])
    assert.ok(css.includes(text), text)
  assert.ok(!css.includes('.shell-'))
})
