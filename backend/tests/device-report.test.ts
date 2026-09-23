import assert from 'node:assert/strict'
import { ORIGEN_APERTURA, detalleAperturaInforme, serialEnmascarado, serialSeguimiento } from '../lib/device-report'

// Normalización: la clave de la fila de seguimiento no distingue caja ni
// espacios y no crece más allá de lo que acepta el serial en la base.
assert.equal(serialSeguimiento(' 356789012345678 '), '356789012345678')
assert.equal(serialSeguimiento('aur-0001'), 'AUR-0001')
assert.equal(serialSeguimiento(null), '')
assert.equal(serialSeguimiento('x'.repeat(80)).length, 64)

// Mascarado: mismo criterio que el informe público.
assert.equal(serialEnmascarado('356789012345678'), '3567…678')
assert.equal(serialEnmascarado('ABC123'), 'ABC123')

// La apertura se lee según el canal del envío previo.
assert.equal(detalleAperturaInforme({ serial: '356789012345678', canal: 'WHATSAPP' }), 'abierto desde el enlace de WhatsApp · serial 3567…678')
assert.equal(detalleAperturaInforme({ serial: '356789012345678', canal: 'EMAIL' }), 'abierto desde el enlace del correo · serial 3567…678')
assert.equal(detalleAperturaInforme({ serial: '356789012345678', canal: 'PORTAL' }), 'abierto desde el portal del cliente · serial 3567…678')
assert.equal(detalleAperturaInforme({ serial: '356789012345678' }), 'abierto desde el portal del cliente · serial 3567…678')
assert.equal(detalleAperturaInforme(null), '')
assert.equal(detalleAperturaInforme('texto'), '')
assert.ok(Object.keys(ORIGEN_APERTURA).length >= 3)

console.log('PASS: seguimiento del informe de dispositivo (#240)')
