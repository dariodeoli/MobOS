import test from 'node:test'
import assert from 'node:assert/strict'
import { analizarImei, estadoImei, imeiValido as imeiValidoBiblioteca } from 'owncoding-ui/utils'
import { imeiValido } from './imeiComprobante.js'

// Implementación de referencia: la regla local previa a delegar en la
// biblioteca (15 dígitos tras quitar lo que no es dígito + Luhn).
function referencia(valor) {
  const imei = String(valor ?? '').replace(/\D/g, '')
  if (imei.length !== 15) return false
  let suma = 0
  for (let i = 0; i < 15; i += 1) {
    let digito = Number(imei[14 - i])
    if (i % 2 === 1) { digito *= 2; if (digito > 9) digito -= 9 }
    suma += digito
  }
  return suma % 10 === 0
}

const luhn = (base14) => {
  for (let d = 0; d <= 9; d += 1) if (referencia(`${base14}${d}`)) return `${base14}${d}`
  throw new Error('sin dígito control')
}

const CASOS = [
  '356789102345673', '356789102345679', '490154203237518', '490154203237519',
  '000000000000000', '111111111111111', '123456789012345',
  '35 678910 234567 3', '35-678910-234567-3', ' 356789102345673 ',
  '35678910234567', '3567891023456733', '', '   ', null, undefined, 0,
  'DEMO-FERNANDEZ', 'abc356789102345673', '３５６７８９１０２３４５６７３',
  '356789102345673\n', '35678910234567e3',
  luhn('35678910234567'), luhn('86753090000000'), luhn('99999999999999'),
]

test('imeiValido local y de la biblioteca coinciden con la regla de referencia', () => {
  for (const caso of CASOS) {
    assert.equal(imeiValido(caso), referencia(caso), `local: ${JSON.stringify(caso)}`)
    assert.equal(imeiValidoBiblioteca(caso), referencia(caso), `biblioteca: ${JSON.stringify(caso)}`)
  }
})

test('barrido: cada IMEI de 15 dígitos coincide entre local y biblioteca', () => {
  let semilla = 7
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla }
  for (let i = 0; i < 4000; i += 1) {
    const imei = Array.from({ length: 15 }, () => azar() % 10).join('')
    assert.equal(imeiValido(imei), imeiValidoBiblioteca(imei), imei)
  }
})

test('estadoImei de la biblioteca es válido solo cuando la regla local lo es', () => {
  for (const caso of CASOS) {
    const analisis = analizarImei(caso)
    assert.equal(analisis.valido, referencia(caso) && String(caso).replace(/\D/g, '').length === 15, JSON.stringify(caso))
    assert.equal(estadoImei(caso) === 'valido', analisis.valido)
  }
})
