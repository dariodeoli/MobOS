import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatUnitCode, normalizeUnitCodePrefix, parseBatteryCycles, parseHexColor, parseLocationIcon, parseSupplierDisplayMode,
  parseSupplierIcon, parseUnitCode, parseWarrantyUntil, resolveUnitCodePrefix, unitCodeInitials, LOCATION_ICONS,
} from '../lib/unit-code'

// #400 (A) · código interno de unidad y validaciones de la ficha: partes puras.
// El trigger, la concurrencia y la búsqueda se prueban contra Postgres en
// tests/unit-code.mjs y tests/unit-code-migration.mjs.

test('formatUnitCode: 4 dígitos mínimo y crece sin cortar', () => {
  assert.equal(formatUnitCode('MOV', 1), 'MOV-0001')
  assert.equal(formatUnitCode('MOV', 42), 'MOV-0042')
  assert.equal(formatUnitCode('MOV', 9999), 'MOV-9999')
  assert.equal(formatUnitCode('MOV', 10000), 'MOV-10000')
  assert.equal(formatUnitCode('MOV', 10234), 'MOV-10234')
  assert.equal(formatUnitCode('MOV', null), null)
  assert.equal(formatUnitCode('MOV', 0), null)
  assert.equal(formatUnitCode('MOV', 1.5), null)
})

test('parseUnitCode: con o sin guion, ceros y minúsculas', () => {
  assert.deepEqual(parseUnitCode('MOV-0042'), { prefix: 'MOV', seq: 42 })
  assert.deepEqual(parseUnitCode('mov42'), { prefix: 'MOV', seq: 42 })
  assert.deepEqual(parseUnitCode(' MOV-10234 '), { prefix: 'MOV', seq: 10234 })
  assert.deepEqual(parseUnitCode('AB-1'), { prefix: 'AB', seq: 1 })
  assert.deepEqual(parseUnitCode('ABCD-0001'), { prefix: 'ABCD', seq: 1 })
  for (const mal of ['A-1', 'ABCDE-1', 'MOV-', 'MOV-0', '123456789012345', 'MOV-12x', 'MOV 12', '', null, undefined, 'MOV-99999999999']) assert.equal(parseUnitCode(mal), null, String(mal))
})

test('MOV-9999 → MOV-10000 se mantiene ordenable y reversible', () => {
  assert.equal(parseUnitCode(formatUnitCode('MOV', 9999)!)!.seq + 1, parseUnitCode(formatUnitCode('MOV', 10000)!)!.seq)
})

test('sigla: 2–4 letras mayúsculas, con prioridad propia → pedidos → iniciales', () => {
  assert.equal(normalizeUnitCodePrefix('mov'), 'MOV')
  assert.equal(normalizeUnitCodePrefix(' ab '), 'AB')
  for (const mal of ['A', 'ABCDE', 'M1', 'M-V', '', null, 5]) assert.equal(normalizeUnitCodePrefix(mal), null, String(mal))
  assert.equal(resolveUnitCodePrefix({ unitCodePrefix: 'zz', orderPrefix: 'MOB', name: 'Móvil Store' }), 'ZZ')
  assert.equal(resolveUnitCodePrefix({ unitCodePrefix: null, orderPrefix: 'MOB', name: 'Móvil Store' }), 'MOB')
  assert.equal(resolveUnitCodePrefix({ unitCodePrefix: 'x', orderPrefix: null, name: 'Móvil Store SA' }), 'MSS')
  assert.equal(resolveUnitCodePrefix({ name: 'Movil' }), 'MOV')
  assert.equal(resolveUnitCodePrefix({ name: '123' }), 'UNI')
  assert.equal(resolveUnitCodePrefix(null), 'UNI')
  assert.equal(unitCodeInitials('Álvarez & Hijos Telefonía Paraguay'), 'AHTP')
})

test('ícono de ubicación: set fijo', () => {
  assert.deepEqual([...LOCATION_ICONS], ['DEPOSITO', 'VITRINA', 'CAJA_FUERTE', 'TALLER', 'TRANSITO', 'PRESTAMO'])
  assert.equal(parseLocationIcon('vitrina'), 'VITRINA')
  assert.equal(parseLocationIcon(null), null)
  assert.equal(parseLocationIcon(''), null)
  assert.equal(parseLocationIcon('COHETE'), undefined)
  assert.equal(parseLocationIcon(3), undefined)
})

test('proveedor: modo, color e ícono', () => {
  assert.equal(parseSupplierDisplayMode('completo'), 'COMPLETO')
  assert.equal(parseSupplierDisplayMode('ABREVIADO'), 'ABREVIADO')
  assert.equal(parseSupplierDisplayMode('GRANDE'), undefined)
  assert.equal(parseSupplierDisplayMode(null), undefined)
  assert.equal(parseHexColor('#AbCdEf'), '#abcdef')
  assert.equal(parseHexColor(''), null)
  assert.equal(parseHexColor('#fff'), undefined)
  assert.equal(parseSupplierIcon('store'), 'STORE')
  assert.equal(parseSupplierIcon(null), null)
  assert.equal(parseSupplierIcon('no válido!'), undefined)
})

test('ciclos de batería: entero 0–5000', () => {
  assert.equal(parseBatteryCycles(312), 312)
  assert.equal(parseBatteryCycles('45'), 45)
  assert.equal(parseBatteryCycles(0), 0)
  assert.equal(parseBatteryCycles(null), null)
  assert.equal(parseBatteryCycles(''), null)
  for (const mal of [-1, 5001, 1.5, 'abc', '1e3', NaN, {}]) assert.equal(parseBatteryCycles(mal), undefined, String(mal))
})

test('garantía: siempre el primer día del mes (UTC)', () => {
  assert.equal(parseWarrantyUntil('2027-03-15')!.toISOString(), '2027-03-01T00:00:00.000Z')
  assert.equal(parseWarrantyUntil('2027-03')!.toISOString(), '2027-03-01T00:00:00.000Z')
  assert.equal(parseWarrantyUntil('2027-12-31T23:59:59Z')!.toISOString(), '2027-12-01T00:00:00.000Z')
  assert.equal(parseWarrantyUntil(null), null)
  assert.equal(parseWarrantyUntil(''), null)
  for (const mal of ['2027-13', '2027-00', 'mañana', '27-03', '2027-02-31', 5, '1999-01']) assert.equal(parseWarrantyUntil(mal), undefined, String(mal))
})
