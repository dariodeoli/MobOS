import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codigoGiftCardValido, generarCodigoGiftCardDemo, normalizarCodigoGiftCard } from './giftCards.js'

// #280: el código se tipea en el POS y se imprime en la tarjeta. La
// normalización acepta minúsculas, espacios y los caracteres que se confunden
// (O→0, I/L→1) y siempre devuelve el formato canónico GC-XXXX-XXXX-XXXX.
test('el código de gift card se normaliza al formato canónico', () => {
  assert.equal(normalizarCodigoGiftCard('Gc-ab12-cd34-ef56'), 'GC-AB12-CD34-EF56')
  assert.equal(normalizarCodigoGiftCard('gcab12cd34ef56'), 'GC-AB12-CD34-EF56')
  assert.equal(normalizarCodigoGiftCard('AB12 CD34 EF56'), 'GC-AB12-CD34-EF56')
  // O/I/L se confunden al leerlos en papel.
  assert.equal(normalizarCodigoGiftCard('GC-OI1L-2345-6789'), 'GC-0111-2345-6789')
  assert.equal(codigoGiftCardValido('gc-ab12-cd34-ef56'), 'GC-AB12-CD34-EF56')
})

test('un código fuera del formato no se acepta', () => {
  assert.equal(normalizarCodigoGiftCard('GC-AB12-CD34'), '')
  assert.equal(normalizarCodigoGiftCard('GC-AB12-CD34-EF56-7890'), '')
  assert.equal(codigoGiftCardValido('no-es-un-codigo-largo'), '')
  assert.equal(codigoGiftCardValido(null), '')
  assert.equal(codigoGiftCardValido(''), '')
})

test('el generador de la demo usa el mismo formato y alfabeto Crockford', () => {
  const codigos = new Set()
  for (let indice = 0; indice < 50; indice += 1) codigos.add(generarCodigoGiftCardDemo())
  assert.equal(codigos.size, 50, 'los códigos no se repiten')
  for (const codigo of codigos) {
    assert.match(codigo, /^GC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
    assert.equal(normalizarCodigoGiftCard(codigo), codigo, 'ya viene canónico')
  }
})
