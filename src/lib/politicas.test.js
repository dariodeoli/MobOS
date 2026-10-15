import assert from 'node:assert/strict'
import test from 'node:test'
import { POLITICAS, POLITICA_MAX_CHARS, PLANTILLAS_POLITICA, garantiaConPolitica, limpiarTextoPolitica, parsearPolitica, plantillaPolitica, urlPoliticas } from './politicas.js'

test('hay una plantilla útil por cada política, dentro del tope y ya limpia', () => {
  assert.equal(POLITICAS.length, 6)
  for (const { tipo } of POLITICAS) {
    const plantilla = plantillaPolitica(tipo)
    assert.ok(plantilla.length > 100, `${tipo} tiene plantilla`)
    assert.ok(plantilla.length < POLITICA_MAX_CHARS, `${tipo} entra en el tope`)
    assert.equal(limpiarTextoPolitica(plantilla), plantilla, `${tipo} no tiene HTML ni control`)
  }
  assert.match(PLANTILLAS_POLITICA.garantia, /semi-nuevos/)
  assert.match(PLANTILLAS_POLITICA.cambios, /7 días/)
})

test('el texto se limpia: sin HTML ni caracteres de control', () => {
  assert.equal(limpiarTextoPolitica('<script>alert(1)</script>Hola'), 'alert(1)Hola')
  assert.equal(limpiarTextoPolitica('a\u0000b‮c'), 'abc')
  assert.equal(limpiarTextoPolitica('<img src=x onerror=alert(1)'), '')
})

test('el formato simple se convierte en bloques, nunca en HTML', () => {
  const bloques = parsearPolitica('# Garantía\n- **30 días** en equipos\n- 7 días en accesorios\n\nTexto <b>libre</b>\nsigue acá')
  assert.deepEqual(bloques.map(b => b.tipo), ['titulo', 'lista', 'parrafo'])
  assert.equal(bloques[0].texto, 'Garantía')
  assert.deepEqual(bloques[1].items[0], [{ texto: '30 días', negrita: true }, { texto: ' en equipos', negrita: false }])
  assert.equal(bloques[1].items.length, 2)
  // El HTML escrito se descarta y las líneas contiguas forman un solo párrafo.
  assert.equal(bloques[2].partes.map(p => p.texto).join(''), 'Texto libre sigue acá')
})

test('el enlace público usa el slug de la empresa y solo tipos válidos', () => {
  assert.equal(urlPoliticas('https://clientes.moboss.online/', 'don-pepe'), 'https://clientes.moboss.online/don-pepe/politicas')
  assert.equal(urlPoliticas('https://clientes.moboss.online', 'don-pepe', 'garantia'), 'https://clientes.moboss.online/don-pepe/politicas/garantia')
  assert.equal(urlPoliticas('https://clientes.moboss.online', 'don-pepe', '../x'), 'https://clientes.moboss.online/don-pepe/politicas')
  assert.equal(urlPoliticas('https://clientes.moboss.online', ''), '')
})

test('el comprobante usa la política publicada y, sin ella, la leyenda general', () => {
  assert.equal(garantiaConPolitica('General', { garantia: '• 30 días' }), '• 30 días')
  assert.equal(garantiaConPolitica('General', { garantia: '' }), 'General')
  assert.equal(garantiaConPolitica('General', null), 'General')
})
