// Pruebas de los estados de inspección (#240): claves canónicas, tonos y
// umbrales de batería sin pantalla de por medio.
import test from 'node:test'
import assert from 'node:assert/strict'

const {
  ESTADOS_CHIP,
  ESTADOS_ITEM,
  ESTADOS_LOCK,
  GRADOS_CONDICION,
  LOCKS_DISPOSITIVO,
  TONOS,
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

test('los locks conocidos son cinco y el estado desconocido no alarma', () => {
  assert.deepEqual(Object.keys(LOCKS_DISPOSITIVO), ['icloud', 'mdm', 'esn', 'carrier', 'oem'])
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

// Lote 16: el contrato de los objetos de inspección es el mismo que publica
// owncoding-ui (mismas claves, mismos tonos y misma forma de TONOS). Si acá
// cambia algo, la biblioteca tiene que cambiar primero.
test('el contrato de inspección coincide con la biblioteca (#240/#241)', () => {
  assert.deepEqual(Object.keys(ESTADOS_ITEM), ['ok', 'aviso', 'falla', 'sinVerificar'])
  assert.deepEqual(Object.keys(ESTADOS_CHIP), ['pass', 'revision', 'pendiente', 'falla'])
  assert.deepEqual(Object.keys(ESTADOS_LOCK), ['libre', 'activo', 'desconocido'])
  assert.deepEqual(Object.keys(LOCKS_DISPOSITIVO), ['icloud', 'mdm', 'esn', 'carrier', 'oem'])
  assert.deepEqual(Object.keys(GRADOS_CONDICION), ['A', 'B', 'C'])
  assert.deepEqual(Object.keys(TONOS), ['punto', 'chip', 'texto'])
  assert.deepEqual(Object.keys(TONOS.punto), ['ok', 'warn', 'bad', 'mute', 'info', 'pass'])
  assert.equal(TONOS.chip.bad, 'border-bad/30 bg-bad/10 text-bad')
  assert.equal(TONOS.punto.pass, 'bg-pass/15 text-pass')
  assert.equal(TONOS.texto.info, 'text-info')
  assert.equal(UMBRAL_BATERIA_OK, 90)
  assert.equal(UMBRAL_BATERIA_ATENCION, 80)
})
