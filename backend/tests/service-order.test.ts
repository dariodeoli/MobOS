import assert from 'node:assert/strict'
import { ESTADO_SERVICIO, etiquetaServicio } from '../lib/service-order'
import { ACCIONES_AUDITORIA } from '../lib/audit'

// #240 §4: el taller se lee en lenguaje de cliente en la ficha, la cronología
// y el portal; la auditoría conserva su etiqueta humana.
assert.equal(etiquetaServicio('RECIBIDO'), 'Recibido')
assert.equal(etiquetaServicio('DIAGNOSTICO'), 'Diagnóstico')
assert.equal(etiquetaServicio('CON_TECNICO'), 'Con técnico')
assert.equal(etiquetaServicio('ESPERANDO_REPUESTO'), 'Esperando repuesto')
assert.equal(etiquetaServicio('REPARADO'), 'Reparado')
assert.equal(etiquetaServicio('LISTO'), 'Listo para retirar')
assert.equal(etiquetaServicio('ENTREGADO'), 'Entregado')
assert.equal(etiquetaServicio('CANCELADO'), 'Cancelado')
assert.equal(Object.keys(ESTADO_SERVICIO).length, 8)
// Un estado desconocido no se oculta con una etiqueta inventada.
assert.equal(etiquetaServicio('OTRO'), 'OTRO')
assert.equal(etiquetaServicio(null), '')
assert.equal(etiquetaServicio(undefined), '')

assert.equal(ACCIONES_AUDITORIA.SERVICE_ORDER_CREATED, 'Orden de servicio creada')
assert.equal(ACCIONES_AUDITORIA.SERVICE_ORDER_FROM_WARRANTY, 'Orden de servicio creada (garantía)')
assert.equal(ACCIONES_AUDITORIA.SERVICE_ORDER_STATUS, 'Estado del taller')

console.log('PASS: estados y etiquetas del taller (#240)')
