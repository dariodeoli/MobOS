import assert from 'node:assert/strict'
import { PIN_MAX, PIN_MIN, largoPinDe, pinValido } from '../lib/pin'

// #158/#159: el PIN de operador va de 4 a 6 dígitos y el largo guardado manda
// para que la pantalla de PIN valide sola. Los usuarios viejos son de 4.
assert.equal(PIN_MIN, 4)
assert.equal(PIN_MAX, 6)

assert.equal(pinValido('1234'), true, '4 dígitos')
assert.equal(pinValido('12345'), true, '5 dígitos')
assert.equal(pinValido('123456'), true, '6 dígitos')
assert.equal(pinValido('123'), false, '3 dígitos no')
assert.equal(pinValido('1234567'), false, '7 dígitos no')
assert.equal(pinValido('12a4'), false, 'solo dígitos')
assert.equal(pinValido(''), false)
assert.equal(pinValido(1234), false, 'número no, string')
assert.equal(pinValido(null), false)

assert.equal(largoPinDe(null), 4, 'sin dato = PIN viejo de 4')
assert.equal(largoPinDe(undefined), 4)
assert.equal(largoPinDe(4), 4)
assert.equal(largoPinDe(5), 5)
assert.equal(largoPinDe(6), 6)
assert.equal(largoPinDe(3), 4, 'fuera de rango cae al default')
assert.equal(largoPinDe(9), 4)

console.log('PASS: reglas del PIN de operador (4-6 dígitos)')
