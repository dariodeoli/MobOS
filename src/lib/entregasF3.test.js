import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const path = 'src/components/delivery/StoreDelivery.jsx'
const source = readFileSync(path, 'utf8')
const assignment = text =>
  text.slice(
    text.indexOf('  async function asignar(row)'),
    text.indexOf('\n  return (', text.indexOf('  async function asignar(row)')),
  )

test('Entregas presentation preserves assignment/release handlers and settlement screen', () => {
  // Freeze the protected bytes from checkpoint 514e7f65 without requiring Git in CI.
  const digest = text => createHash('sha256').update(text).digest('hex')
  assert.equal(
    digest(assignment(source)),
    'd71499649aee2cfc2add441a067f4d96388dc3a176288b18eb9b287d1cd12128',
  )
  // U5a: Rendiciones was redesigned (same F3 card system); the bytes are no longer frozen,
  // so the verify/reject contract is asserted explicitly instead.
  const settlement = source.slice(
    source.indexOf('function Rendiciones()'),
    source.indexOf('export default function StoreDelivery'),
  )
  for (const contract of [
    "api.post(`/api/delivery/settlements/${encodeURIComponent(fila.id)}/verify`",
    'verificarRendicionDemo(fila.id, state, note)',
    "verificar(confirmar, 'VERIFIED')",
    "verificar(rechazar, 'REJECTED', motivo)",
    'validar({ motivo }).valido',
    'data-testid="rendicion-verificar"',
    'data-testid="rendicion-rechazar"',
    'data-testid="rendicion-admin"',
    "fila.estado === 'PENDING'",
    '<ConfirmDialog',
    'dirty={Boolean(rechazar) && motivo.trim() !== \'\'}',
    "['PENDING', 'Pendientes']",
    "['REJECTED', 'Rechazadas']",
    "usePaginaLista(data.rows",
  ])
    assert.ok(settlement.includes(contract), contract)
  for (const contract of [
    'allowUnpaidDelivery: true',
    "row.pendiente > 0 && row.fulfillment !== 'DELIVERED'",
    'checked={Boolean(autorizar[row.id])}',
    'value={row.repartidorId}',
    'disabled={!seleccion[row.id] || ocupado === row.id}',
    'data-testid="reparto-admin-pedido"',
    'data-testid="asignar-reparto"',
    "['sin-asignar', 'Sin asignar']",
    "['asignados', 'Asignados']",
    "['todos', 'Todos']",
    'row.sinRendir > 0 && row.pendiente === 0',
  ])
    assert.ok(source.includes(contract), contract)
})

test('Entregas renders existing address and scoped responsive full-value presentation', () => {
  for (const field of [
    'row.direccion',
    'row.direccionEtiqueta',
    'row.direccionNotas',
    'row.cliente',
    'row.articulos',
    'row.total',
    'row.pendiente',
    'row.sinRendir',
  ])
    assert.ok(source.includes(field), field)
  const css = readFileSync('src/components/delivery/entregasF3.css', 'utf8')
  assert.ok(css.includes('repeat(2, minmax(0, 1fr))'))
  assert.ok(css.includes('min-height: 44px'))
  assert.ok(css.includes('white-space: nowrap'))
  assert.ok(css.includes('overflow-wrap: anywhere'))
  assert.ok(!css.includes('rendicion-admin'))
  assert.ok(!css.includes('truncate'))
})

test('Panel del repartidor y Rendiciones usan el sistema visual F3 sin perder acciones', () => {
  const orders = readFileSync('src/components/delivery/DriverOrders.jsx', 'utf8')
  const settlements = readFileSync('src/components/delivery/DriverSettlements.jsx', 'utf8')
  for (const contract of [
    "onEstado(row, 'IN_TRANSIT')",
    "onEstado(row, 'DELIVERED')",
    'data-testid="reparto-cobrar"',
    'data-testid="reparto-cobro-confirmar"',
    'data-testid="reparto-pedido"',
    'data-testid="reparto-cliente"',
    '/collections`',
    "'Idempotency-Key'",
    'className="entregas-f3-order"',
    'usePaginaLista(data.rows',
    "['activos', 'A entregar']",
    "['entregados', 'Entregados']",
  ])
    assert.ok(orders.includes(contract), contract)
  for (const contract of [
    'data-testid="rendicion-total"',
    'data-testid="rendir-abrir"',
    'data-testid="rendir-confirmar"',
    "api.post('/api/delivery/settlements'",
    'crearRendicionDemo()',
    'data-testid="rendicion"',
    'className="entregas-f3-order"',
    'usePaginaLista(historial.rows',
  ])
    assert.ok(settlements.includes(contract), contract)
  const css = readFileSync('src/components/delivery/entregasF3.css', 'utf8')
  assert.ok(css.includes('.entregas-f3-tel') && css.includes('min-height: 44px'))
})
