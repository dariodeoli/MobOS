import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ANCHOS_POPUP, TIPOS_POPUP, ordenarAcciones, resolverPopup } from './popupReglas.js'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

test('cada tipo de popup tiene rol y tamaño por defecto', () => {
  assert.deepEqual(Object.keys(TIPOS_POPUP).sort(), ['aviso', 'confirmar', 'detalle', 'formulario'])
  assert.equal(resolverPopup({ tipo: 'confirmar' }).tamano, 'sm')
  assert.equal(resolverPopup({ tipo: 'confirmar' }).rol, 'alertdialog')
  assert.equal(resolverPopup({ tipo: 'formulario' }).rol, 'dialog')
  assert.equal(resolverPopup({ tipo: 'detalle' }).tamano, 'lg')
})

test('el tamaño explícito manda y uno inválido cae al del tipo', () => {
  assert.equal(resolverPopup({ tipo: 'confirmar', tamano: 'xl' }).ancho, ANCHOS_POPUP.xl)
  assert.equal(resolverPopup({ tipo: 'detalle', tamano: 'enorme' }).tamano, 'lg')
  assert.equal(resolverPopup({ tipo: 'inventado' }).tamano, 'md')
})

test('el peligro reemplaza a la primaria y la secundaria va primero en el DOM', () => {
  const normal = ordenarAcciones({ primaria: { label: 'Guardar' }, secundaria: { label: 'Volver' } })
  assert.deepEqual(normal.map(a => a.clave), ['secundaria', 'primaria'])
  const peligro = ordenarAcciones({ primaria: { label: 'Guardar' }, peligro: { label: 'Anular' }, secundaria: { label: 'Volver' } })
  assert.deepEqual(peligro.map(a => [a.clave, a.variante]), [['secundaria', 'outline'], ['peligro', 'danger']])
  assert.deepEqual(ordenarAcciones(), [])
})

test('el Popup cumple foco, Esc, X de 44 px, hoja móvil y reducir movimiento', () => {
  const jsx = leer('./Popup.jsx')
  assert.match(jsx, /useDialogFocusTrap\(open, cerrar, panel, \{ busy: bloqueado \}\)/)
  assert.match(jsx, /aria-label="Cerrar"/)
  assert.match(jsx, /h-11 w-11/)
  assert.match(jsx, /items-end[^"]*md:items-center/)
  assert.match(jsx, /rounded-t-3xl/)
  assert.match(jsx, /prefers-reduced-motion: reduce/)
  const css = leer('./popup.css')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /popup-hoja-entra/)
})
