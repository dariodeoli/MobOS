import assert from 'node:assert/strict'
import { reglaSucursalEfectiva } from '../lib/sucursal-efectiva'

// Regla de Dario (#286) para un usuario sin sucursal asignada: se queda con la
// última que usó; si no usó ninguna, la primera sucursal creada.
assert.equal(reglaSucursalEfectiva({ asignada: 's1', ultima: 's2', primera: 's3' }), 's1', 'la sucursal asignada manda')
assert.equal(reglaSucursalEfectiva({ asignada: null, ultima: 's2', primera: 's3' }), 's2', 'sin asignada gana la última usada')
assert.equal(reglaSucursalEfectiva({ asignada: null, ultima: null, primera: 's3' }), 's3', 'sin uso previo gana la primera creada')
assert.equal(reglaSucursalEfectiva({}), null, 'sin sucursales no hay efectiva')
assert.equal(reglaSucursalEfectiva({ asignada: 's9' }), 's9', 'un solo dato alcanza')

console.log('sucursal-efectiva: regla asignada → última usada → primera creada OK')
