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
  const settlement = text =>
    text.slice(
      text.indexOf('function Rendiciones()'),
      text.indexOf('export default function StoreDelivery'),
    )
  assert.equal(
    digest(settlement(source)),
    'db1cbf7daa0b9f95575d5f5fce3bdbfc593cce5003ea8f1456b823e4bba2c865',
  )
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
