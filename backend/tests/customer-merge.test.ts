import assert from 'node:assert/strict'
import { conflictosDeContacto, fusionarEscalares, puedeUnificar, resumenMerge } from '../lib/customer-merge'

// #268: reglas puras del merge de clientes.

// Permisos: solo dueño y gerencia.
assert.equal(puedeUnificar('ADMIN'), true)
assert.equal(puedeUnificar('GERENTE'), true)
assert.equal(puedeUnificar('VENDEDOR'), false)
assert.equal(puedeUnificar(null), false)

// La principal manda: solo se completan huecos.
const principal = { name: 'Juan Pérez', phone: '0981123456', email: null, document: '1234567', tags: ['prioridad'], loyaltyPointsPyg: 1000, notes: 'nota principal' }
const duplicado = { name: 'Juan Perez', phone: '0981999999', email: 'juan@ejemplo.com', document: null, tags: ['whatsapp'], loyaltyPointsPyg: 2500, notes: 'nota vieja', insuranceEnabled: true, creditLimitPyg: 500000 }
const { data, rellenados } = fusionarEscalares(principal, duplicado)
assert.equal(data.phone, undefined, 'el teléfono del principal no se pisa')
assert.equal(data.document, undefined, 'el documento del principal no se pisa')
assert.equal(data.notes, undefined, 'las notas del principal no se pisan')
assert.equal(data.email, 'juan@ejemplo.com', 'el correo vacío se completa')
assert.equal(data.insuranceEnabled, true, 'el seguro se hereda si el principal no lo tenía')
assert.equal(data.creditLimitPyg, 500000, 'el crédito vacío se completa')
assert.deepEqual(data.tags, ['prioridad', 'whatsapp'], 'las etiquetas se unen')
assert.equal(data.loyaltyPointsPyg, 3500, 'los puntos se suman')
assert.ok(rellenados.includes('email') && rellenados.includes('tags'))

// Sin huecos no hay cambios (más allá de puntos/etiquetas si cambian).
const gemelo = { ...principal, loyaltyPointsPyg: 0, tags: ['prioridad'], phone: '0981123456' }
const { data: sinCambios } = fusionarEscalares(gemelo, { ...gemelo, loyaltyPointsPyg: 0, tags: ['prioridad'] })
assert.deepEqual(sinCambios, {}, 'dos fichas idénticas no cambian nada')

// Conflictos de contacto: se informan, no se pisan.
const conflictos = conflictosDeContacto(principal, { phone: '0981999999', email: null, document: null })
assert.equal(conflictos.length, 1)
assert.equal(conflictos[0].campo, 'Teléfono')

// Resumen legible para el audit/cronología.
const resumen = resumenMerge({ orders: 2, payments: 3, notes: 1, addresses: 0, tags: 0 })
assert.equal(resumen, '2 pedidos · 3 pagos · 1 nota')
assert.equal(resumenMerge({}), '')

console.log('customer-merge: reglas del merge OK')
