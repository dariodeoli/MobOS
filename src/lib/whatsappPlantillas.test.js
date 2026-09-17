import assert from 'node:assert/strict'
import test from 'node:test'
import { renderPlantilla, VARIABLES_POR_CONTEXTO, CATEGORIAS_PLANTILLA } from './whatsappPlantillas.js'

test('reemplaza cada variable del contexto y deja vacío lo que falta', () => {
  const salida = renderPlantilla('Hola {{cliente}}, tu pedido {{pedido}} por {{total}}.', { cliente: 'Ana', pedido: 'MOB-0007' })
  assert.equal(salida, 'Hola Ana, tu pedido MOB-0007 por .')
})

test('tolera espacios dentro de los marcadores y conserva el texto sin variables', () => {
  assert.equal(renderPlantilla('Hola {{ nombre }}.', { nombre: 'Luis' }), 'Hola Luis.')
  assert.equal(renderPlantilla('Sin variables.', {}), 'Sin variables.')
  assert.equal(renderPlantilla(null, {}), '')
})

test('los alias heredados siguen resolviéndose', () => {
  assert.equal(renderPlantilla('Hola {{customer_name}}.', { cliente: 'Ana' }), 'Hola Ana.')
  assert.equal(renderPlantilla('Pedido {{order_number}}.', { pedido: 'MOB-0001' }), 'Pedido MOB-0001.')
  assert.equal(renderPlantilla('Listo en {{branch_name}}.', { sucursal: 'Centro' }), 'Listo en Centro.')
  assert.equal(renderPlantilla('{{customer_name}}', {}), '')
})

test('cada contexto declara sus variables y las categorías coinciden', () => {
  assert.deepEqual(Object.keys(VARIABLES_POR_CONTEXTO).sort(), CATEGORIAS_PLANTILLA.map((item) => item.clave).sort())
  for (const variables of Object.values(VARIABLES_POR_CONTEXTO)) {
    assert.ok(variables.length > 0)
    assert.ok(variables.every((variable) => variable.clave && variable.descripcion))
  }
})
