import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cashBreakdownRows,
  cashBreakdownTotal,
  cashDifferencePyg,
  cashExpectedPyg,
  countedBreakdownInput,
} from '../lib/cash-shift'

test('sin movimientos el esperado es la apertura', () => {
  assert.equal(cashExpectedPyg({ openingPyg: 500000 }), 500000)
  assert.equal(cashExpectedPyg({ openingPyg: 0 }), 0)
})

test('cobros y movimientos suman o restan del esperado', () => {
  assert.equal(
    cashExpectedPyg({ openingPyg: 100000, paymentsPyg: 250000, movementsPyg: -50000 }),
    300000,
  )
  // Las salidas pueden superar la apertura: el esperado se acota a cero.
  assert.equal(cashExpectedPyg({ openingPyg: 10000, movementsPyg: -99999 }), 0)
})

test('diferencia negativa cuando falta efectivo', () => {
  assert.equal(cashDifferencePyg(780000, 800000), -20000)
  assert.equal(cashDifferencePyg(800000, 800000), 0)
  assert.equal(cashDifferencePyg(810000, 800000), 10000)
})

test('denominaciones vacías o ausentes no aportan total', () => {
  assert.equal(countedBreakdownInput(null)?.countedPyg, 0)
  assert.equal(countedBreakdownInput('')?.countedPyg, 0)
  assert.equal(cashBreakdownTotal(null), 0)
  assert.equal(cashBreakdownTotal({}), 0)
  assert.deepEqual(cashBreakdownRows(null), [])
})

test('el arqueo válido se limpia, totaliza y ordena de mayor a menor', () => {
  const limpio = countedBreakdownInput({ 100000: 3, 50000: 1, 500: 2, 100: 0 })
  assert.deepEqual(limpio, { breakdown: { 100000: 3, 50000: 1, 500: 2 }, countedPyg: 351000 })
  assert.equal(cashBreakdownTotal(limpio?.breakdown), 351000)
  assert.deepEqual(cashBreakdownRows(limpio?.breakdown), [
    { valor: 100000, cantidad: 3, subtotal: 300000 },
    { valor: 50000, cantidad: 1, subtotal: 50000 },
    { valor: 500, cantidad: 2, subtotal: 1000 },
  ])
})

test('un arqueo inválido se rechaza entero', () => {
  assert.equal(countedBreakdownInput({ 12345: 1 }), undefined)
  assert.equal(countedBreakdownInput({ 1000: -1 }), undefined)
  assert.equal(countedBreakdownInput({ 1000: 1.5 }), undefined)
  assert.equal(countedBreakdownInput({ 1000: 'dos' }), undefined)
  assert.equal(countedBreakdownInput({ 1000: 1000001 }), undefined)
  assert.equal(countedBreakdownInput([]), undefined)
  assert.equal(countedBreakdownInput('1000'), undefined)
  assert.equal(countedBreakdownInput({}), undefined)
})

test('el desglose con denominaciones repetidas no infla el total', () => {
  assert.equal(countedBreakdownInput({ 100000: 2, 100000: 2 })?.countedPyg, 200000)
  assert.equal(cashBreakdownTotal({ 100000: 2, 20000: 1 }), 220000)
})
