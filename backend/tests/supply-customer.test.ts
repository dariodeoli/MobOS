import assert from 'node:assert/strict'
import { consolidarNecesidades } from '../lib/supply'
import { puedeVerCliente } from '../lib/supply-customer'

// Abastecimiento F1 (#254, dominio clientes): el cliente de la tarjeta de
// necesidad — el vínculo siempre viaja; el nombre solo con permiso.

assert.equal(puedeVerCliente(['*']), true, 'el dueño ve el cliente')
assert.equal(puedeVerCliente(['customers:manage', 'stock:manage']), true, 'quien gestiona clientes ve el cliente')
assert.equal(puedeVerCliente(['stock:manage', 'orders:manage']), false, 'comprar sin acceso a clientes no expone el nombre')
assert.equal(puedeVerCliente([]), false)
assert.equal(puedeVerCliente(), false)

// La tarjeta sabe que hay cliente aunque el nombre no viaje.
const [oculto] = consolidarNecesidades([
  { id: 'n1', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: null },
])
assert.equal(oculto.destinos[0]?.clienteOculto, true, 'sin permiso, la tarjeta marca el cliente oculto')
assert.equal(oculto.destinos[0]?.clienteId, 'c1', 'el vínculo con el cliente igual viaja')

const [visible] = consolidarNecesidades([
  { id: 'n2', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'SALE_NO_STOCK', pedidoId: 'o1', pedidoNumero: 'MOB-0048', clienteId: 'c1', cliente: 'Juan Pérez' },
])
assert.equal(visible.destinos[0]?.clienteOculto, false, 'con el nombre visible no se marca oculto')

const [reposicion] = consolidarNecesidades([
  { id: 'n3', productId: 'p1', producto: 'iPhone 15', condicion: 'NEW', cantidad: 1, prioridad: 'NORMAL', origen: 'BELOW_REORDER', sucursalId: 'b1', sucursal: 'Casa Central' },
])
assert.equal(reposicion.destinos[0]?.clienteOculto, false, 'una reposición sin cliente no marca oculto')

console.log('supply-customer: cliente con permiso en la tarjeta de necesidad OK')
