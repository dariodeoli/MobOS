import assert from 'node:assert/strict'
import { CREDITOS_SERVICIO, claveMes, correspondeReembolso, creditosDeServicio, imeiCreditsEnforce, inicioMes } from '../lib/imei-credits'
import { SERVICIOS } from '../lib/imeicheck'

// Costo en créditos por servicio: cubre todos los servicios del adaptador.
assert.equal(creditosDeServicio('APPLE_BASIC'), 1)
assert.equal(creditosDeServicio('FIND_MY'), 1)
assert.equal(creditosDeServicio('IDENTIFICACION'), 1)
assert.equal(creditosDeServicio('APPLE_ADVANCED'), 2)
assert.equal(creditosDeServicio('BLACKLIST_PRO'), 2)
assert.equal(creditosDeServicio('FULL_MDM'), 15)
for (const clave of Object.keys(SERVICIOS)) assert.ok(clave in CREDITOS_SERVICIO, `${clave} sin costo en créditos`)

// Flag IMEI_CREDITS_ENFORCE: producción arranca en sombra; el resto, activo.
assert.equal(imeiCreditsEnforce({ NODE_ENV: 'production' }), false)
assert.equal(imeiCreditsEnforce({ NODE_ENV: 'production', IMEI_CREDITS_ENFORCE: '1' }), true)
assert.equal(imeiCreditsEnforce({ NODE_ENV: 'test' }), true)
assert.equal(imeiCreditsEnforce({ NODE_ENV: 'development', IMEI_CREDITS_ENFORCE: '0' }), false)
assert.equal(imeiCreditsEnforce({}), true)

// Mes de Paraguay (UTC-3): a las 01:00 UTC del día 1 todavía es el mes anterior.
assert.equal(claveMes(new Date('2027-03-01T01:00:00Z')), '2027-02')
assert.equal(claveMes(new Date('2027-03-01T03:00:00Z')), '2027-03')
assert.equal(inicioMes('2027-03').toISOString(), '2027-03-01T03:00:00.000Z')
assert.equal(inicioMes('2027-03', 12).toISOString(), '2028-03-01T03:00:00.000Z')
assert.equal(claveMes(inicioMes('2027-12', 1)), '2028-01')

// Solo se reembolsa lo que falló sin cobro del proveedor; «a conciliar» conserva el crédito.
assert.equal(correspondeReembolso('fallido', 0), true)
assert.equal(correspondeReembolso('fallido', 0.06), false)
assert.equal(correspondeReembolso('conciliar', 0), false)
assert.equal(correspondeReembolso('verificado', 0.06), false)
assert.equal(correspondeReembolso('pendiente', 0), false)
console.log('imei-credits: OK')
