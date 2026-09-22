// Pruebas de los estados de inspección (#240): claves canónicas, tonos y
// umbrales de batería sin pantalla de por medio.
import test from 'node:test'
import assert from 'node:assert/strict'

const {
  ESTADOS_ITEM,
  GRADOS_CONDICION,
  LOCKS_DISPOSITIVO,
  UMBRAL_BATERIA_ATENCION,
  UMBRAL_BATERIA_OK,
  colorBadge,
  estadoItem,
  estadoLock,
  gradoCondicion,
  tonoBateria,
} = await import('./estadoEquipo.js')

test('el semáforo del checklist tiene estados y tonos fijos', () => {
  assert.deepEqual(Object.keys(ESTADOS_ITEM), ['ok', 'aviso', 'falla', 'sinVerificar'])
  assert.equal(estadoItem('ok').tono, 'ok')
  assert.equal(estadoItem('aviso').tono, 'warn')
  assert.equal(estadoItem('falla').tono, 'bad')
  assert.equal(estadoItem(undefined).tono, 'mute', 'sin dato no se inventa estado')
  assert.equal(estadoItem('cualquier-cosa').etiqueta, 'Sin verificar')
})

test('los locks conocidos son cuatro y el estado desconocido no alarma', () => {
  assert.deepEqual(Object.keys(LOCKS_DISPOSITIVO), ['icloud', 'mdm', 'esn', 'carrier'])
  assert.equal(estadoLock('libre').tono, 'ok')
  assert.equal(estadoLock('activo').tono, 'bad')
  assert.equal(estadoLock('sin-dato').tono, 'mute')
})

test('la batería cambia de tono en los umbrales y nunca inventa un valor', () => {
  assert.equal(tonoBateria(100), 'ok')
  assert.equal(tonoBateria(UMBRAL_BATERIA_OK), 'ok')
  assert.equal(tonoBateria(UMBRAL_BATERIA_OK - 1), 'warn')
  assert.equal(tonoBateria(UMBRAL_BATERIA_ATENCION), 'warn')
  assert.equal(tonoBateria(UMBRAL_BATERIA_ATENCION - 1), 'bad')
  assert.equal(tonoBateria(''), 'mute')
  assert.equal(tonoBateria(null), 'mute')
  assert.equal(tonoBateria(undefined), 'mute')
})

test('los grados de condición son A/B/C y el color sale del tono', () => {
  assert.deepEqual(Object.keys(GRADOS_CONDICION), ['A', 'B', 'C'])
  assert.equal(gradoCondicion('a').tono, 'ok')
  assert.equal(gradoCondicion(' B ').tono, 'warn')
  assert.equal(gradoCondicion('C').descripcion, 'Marcas o detalles visibles')
  assert.equal(gradoCondicion('D'), null, 'un grado inválido no se inventa')
  assert.equal(colorBadge('ok'), 'green')
  assert.equal(colorBadge('warn'), 'orange')
  assert.equal(colorBadge('bad'), 'red')
  assert.equal(colorBadge('mute'), 'slate')
})
