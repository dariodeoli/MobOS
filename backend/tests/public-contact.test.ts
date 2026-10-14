import assert from 'node:assert/strict'
import { contactoPublicoSucursal } from '../lib/public-contact'

// #412: el contacto público sale solo de la sucursal y se normaliza para wa.me.
assert.equal(contactoPublicoSucursal(null), null)
assert.equal(contactoPublicoSucursal({ name: 'Centro', phone: null }), null)
assert.equal(contactoPublicoSucursal({ name: 'Centro', phone: '  ' }), null)
assert.equal(contactoPublicoSucursal({ name: 'Centro', phone: '123' }), null, 'un teléfono inutilizable no arma botón')
const local = contactoPublicoSucursal({ name: 'Centro', phone: '0981 123 456' })
assert.deepEqual(local, { sucursal: 'Centro', telefono: '0981 123 456', whatsapp: '595981123456', whatsappUrl: 'https://wa.me/595981123456' })
assert.equal(contactoPublicoSucursal({ phone: '+595 981 123456' })?.whatsapp, '595981123456')
// Solo viajan los cuatro campos públicos: ningún dato extra de la sucursal.
assert.deepEqual(Object.keys(contactoPublicoSucursal({ name: 'X', phone: '0981123456', address: 'calle', instagram: '@x' } as any) || {}).sort(), ['sucursal', 'telefono', 'whatsapp', 'whatsappUrl'])
console.log('public-contact: contacto público de sucursal OK')
