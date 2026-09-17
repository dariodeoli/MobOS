import test from 'node:test'
import assert from 'node:assert/strict'
import { partirSerial, serialEnmascarado, ultimos4 } from './serial.js'

test('el serial separa la cabeza del final, que siempre se ve', () => {
  assert.deepEqual(partirSerial('356789102345678'), { cabeza: '35678910234', cola: '5678' })
  assert.deepEqual(partirSerial('4821'), { cabeza: '', cola: '4821' })
  assert.deepEqual(partirSerial(''), { cabeza: '', cola: '' })
  assert.deepEqual(partirSerial(null), { cabeza: '', cola: '' })
})

test('los últimos 4 toleran valores vacíos', () => {
  assert.equal(ultimos4('356789102345678'), '5678')
  assert.equal(ultimos4('4821'), '4821')
  assert.equal(ultimos4(undefined), '')
})

test('la máscara deja ver el final', () => {
  assert.equal(serialEnmascarado('356789102345678'), '••••5678')
  assert.equal(serialEnmascarado(''), '')
})
