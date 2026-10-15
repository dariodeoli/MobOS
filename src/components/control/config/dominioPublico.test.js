import assert from 'node:assert/strict'
import test from 'node:test'
import { dominioDeCorreo, esDominioPublico } from './dominioPublico.js'

test('dominioDeCorreo extrae el dominio en minúsculas', () => {
  assert.equal(dominioDeCorreo('Ventas@MiTienda.com.py'), 'mitienda.com.py')
  for (const valor of [undefined, null, '', 'sin-arroba', '@solo.com']) assert.equal(dominioDeCorreo(valor), '', String(valor))
})

test('esDominioPublico detecta correos gratuitos y respeta los de empresa', () => {
  for (const correo of ['dario@gmail.com', 'A@Hotmail.com', 'x@outlook.es', 'x@icloud.com', 'x@yahoo.com']) assert.equal(esDominioPublico(correo), true, correo)
  for (const correo of ['ventas@mitienda.com.py', 'a@gmail.com.py', '', null, undefined, 'gmail.com']) assert.equal(esDominioPublico(correo), false, String(correo))
})
