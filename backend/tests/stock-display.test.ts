import assert from 'node:assert/strict'
import { STOCK_DISPLAY_MAX_DEPOSITOS, emptyStockDisplay, sanitizeStockDisplay, stockDisplayFrom } from '../lib/stock-display'

// Presentación del Stock (#448): sanitizado y lectura estable de Tenant.settings.

assert.deepEqual(sanitizeStockDisplay(null), emptyStockDisplay())
assert.deepEqual(sanitizeStockDisplay('x'), emptyStockDisplay())

const valido = sanitizeStockDisplay({
  tipoPrimero: 'EQUIPO',
  condicionPrimero: 'semi',
  colores: { '*': { nuevo: '#DCF3E5', semi: '#fef0be' }, loc_1: { nuevo: '#123456' } },
})
assert.equal(valido.tipoPrimero, 'EQUIPO')
assert.equal(valido.condicionPrimero, 'semi')
assert.deepEqual(valido.colores['*'], { nuevo: '#dcf3e5', semi: '#fef0be' })
assert.deepEqual(valido.colores.loc_1, { nuevo: '#123456' })

// Valores fuera de la lista, colores mal formados y claves raras se descartan.
const sucio = sanitizeStockDisplay({
  tipoPrimero: 'DROP TABLE',
  condicionPrimero: 'usado',
  colores: { 'a b': { nuevo: '#111111' }, ok: { nuevo: 'rojo', semi: 'javascript:1' }, '<x>': { nuevo: '#111111' } },
})
assert.equal(sucio.tipoPrimero, '')
assert.equal(sucio.condicionPrimero, '')
assert.deepEqual(sucio.colores, {})

// Tope de depósitos.
const muchos: Record<string, { nuevo: string }> = {}
for (let i = 0; i < 100; i += 1) muchos[`d${i}`] = { nuevo: '#aabbcc' }
assert.equal(Object.keys(sanitizeStockDisplay({ colores: muchos }).colores).length, STOCK_DISPLAY_MAX_DEPOSITOS)

// Lectura desde Tenant.settings: forma estable aunque falte la clave.
assert.deepEqual(stockDisplayFrom({}), emptyStockDisplay())
assert.equal(stockDisplayFrom({ stockDisplay: { tipoPrimero: 'ACCESORIO' } }).tipoPrimero, 'ACCESORIO')
