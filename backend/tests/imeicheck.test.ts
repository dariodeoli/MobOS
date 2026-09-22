import assert from 'node:assert/strict'
import { IDS_SANDBOX, NO_VERIFICADO, SERVICIOS, consultarImei, enmascararImei, estadoDeConsulta, etiquetaEstado, modoImeicheck, normalizarRespuesta, validarImei } from '../lib/imeicheck'

// ── Validación de IMEI antes de llamar ─────────────────────────────────────
assert.equal(validarImei('490154203237518').ok, true)
assert.equal(validarImei('490154203237519').ok, false, 'dígito control inválido')
assert.match((validarImei('123') as { error: string }).error, /15 dígitos/)
assert.match((validarImei('') as { error: string }).error, /Falta el IMEI/)
assert.equal(enmascararImei('490154203237518'), '•••••••••••7518')
assert.equal(enmascararImei('123'), '•••')

// ── Estado: pendiente/fallido nunca es "Limpio" ────────────────────────────
assert.equal(estadoDeConsulta('done'), 'verificado')
assert.equal(estadoDeConsulta('partial'), 'parcial')
assert.equal(estadoDeConsulta('pending'), 'pendiente')
assert.equal(estadoDeConsulta('failed'), 'fallido')
assert.equal(estadoDeConsulta(undefined), 'fallido')
assert.equal(etiquetaEstado('pendiente'), NO_VERIFICADO)
assert.equal(etiquetaEstado('fallido'), NO_VERIFICADO)
assert.equal(etiquetaEstado('parcial'), 'Parcial')
assert.notEqual(etiquetaEstado('fallido'), 'Limpio')

// ── Normalización: campos separados, con fuente y hora ────────────────────
const campos = normalizarRespuesta({ status: 'done', properties: { blacklistStatus: 'Clean', blacklistHistory: '2 reportes 2024', findMyStatus: 'Off', simLock: 'Unlocked', mdmStatus: 'Off', warrantyStatus: 'Expired', usBlockStatus: 'Blocked', estimatedPurchaseDate: '2022-03-01' } }, { hora: '2026-09-21T12:00:00.000Z' })
const porClave = Object.fromEntries(campos.map(campo => [campo.clave, campo]))
assert.equal(porClave.blacklist.valor, 'Sin reportes actuales')
assert.equal(porClave.blacklistHistorial.valor, '2 reportes 2024')
assert.equal(porClave.findMy.valor, 'Off')
assert.equal(porClave.simLock.valor, 'Unlocked')
assert.equal(porClave.mdm.valor, 'Off')
assert.equal(porClave.garantia.valor, 'Expired')
assert.equal(porClave.usBlock.valor, 'Blocked')
assert.match(porClave.usBlock.etiqueta, /no es estado mundial/)
assert.equal(porClave.blacklist.fuente, 'imeicheck.net')
assert.equal(porClave.blacklist.hora, '2026-09-21T12:00:00.000Z')
const sinDatos = normalizarRespuesta({})
assert.ok(sinDatos.every(campo => campo.valor === null), 'sin datos no se inventa ningún valor')

async function pruebasMock() {
  // ── Fase 1: mocks (sin token, sin red) ─────────────────────────────────────
  delete process.env.IMEICHECK_LIVE
  // Modo visible: sin LIVE o sin token siempre es simulado; con ambos, vivo.
  process.env.IMEICHECK_TOKEN = 'token-de-prueba-1234567890'
  assert.equal(modoImeicheck().modo, 'simulado', 'token sin LIVE sigue simulado')
  assert.equal(modoImeicheck().proveedor, 'imeicheck.net')
  process.env.IMEICHECK_LIVE = '1'
  assert.equal(modoImeicheck().modo, 'vivo', 'LIVE=1 con token es vivo')
  delete process.env.IMEICHECK_LIVE
  delete process.env.IMEICHECK_TOKEN
  assert.equal(modoImeicheck().modo, 'simulado', 'sin token siempre simulado')
  const ok = await consultarImei({ imei: '490154203237518', servicio: 'APPLE_BASIC', escenario: 'ok' })
  assert.equal(ok.esMock, true)
  assert.equal(ok.estado, 'verificado')
  assert.equal(ok.costoUsd, 0.06)
  assert.equal(SERVICIOS.APPLE_BASIC.precioConfirmado, true, 'Apple Basic es el único precio con cargo comprobado')
  assert.equal(SERVICIOS.IDENTIFICACION.precioConfirmado, false, 'otras marcas: referencia, no cargo comprobado')
  assert.equal(SERVICIOS.BLACKLIST_PRO.precioConfirmado, false)
// Catálogo Live: IDs reales y ninguno de Sandbox (12-15).
assert.equal(SERVICIOS.APPLE_BASIC.serviceId, '1')
assert.equal(SERVICIOS.APPLE_ADVANCED.serviceId, '2')
assert.equal(SERVICIOS.FULL_MDM.serviceId, '3')
assert.equal(SERVICIOS.BLACKLIST_PRO.serviceId, '16')
assert.equal(SERVICIOS.FIND_MY.serviceId, '18')
assert.equal(SERVICIOS.IDENTIFICACION.serviceId, '22')
for (const servicio of Object.values(SERVICIOS)) assert.ok(!IDS_SANDBOX.includes(String(servicio.serviceId)), `el serviceId ${servicio.serviceId} es de Sandbox`)
  assert.match(String((ok.crudo as any).id), /^mock-/)
  
  const parcial = await consultarImei({ imei: '490154203237518', servicio: 'APPLE_BASIC', escenario: 'parcial' })
  assert.equal(parcial.estado, 'parcial')
  assert.equal(parcial.etiqueta, 'Parcial')
  assert.equal(parcial.costoUsd, 0.06, 'una respuesta parcial sí se cobra')
  
  for (const escenario of ['pendiente', 'timeout', 'sin-saldo', 'no-autorizado'] as const) {
    const resultado = await consultarImei({ imei: '490154203237518', servicio: 'APPLE_BASIC', escenario })
    assert.notEqual(resultado.estado, 'verificado', escenario)
    assert.equal(resultado.etiqueta, NO_VERIFICADO, escenario)
    assert.equal(resultado.costoUsd, 0, 'lo no verificado no se cobra')
  }
  
  // IMEI inválido: no se llama ni se cobra.
  const invalido = await consultarImei({ imei: '123', servicio: 'APPLE_BASIC' })
  assert.equal(invalido.estado, 'fallido')
  assert.equal(invalido.costoUsd, 0)
  assert.equal(invalido.esMock, true)
  assert.match(String(invalido.error), /15 dígitos/)
  
  // Con token pero sin `IMEICHECK_LIVE=1` sigue siendo mock (Fase 1).
  process.env.IMEICHECK_TOKEN = 'token-de-prueba-1234567890'
  const conToken = await consultarImei({ imei: '490154203237518', servicio: 'APPLE_BASIC', escenario: 'ok' })
  assert.equal(conToken.esMock, true, 'sin el flag live nunca se llama al proveedor')
  
  // El modo vivo NO se ejercita acá: llamaría de verdad al proveedor. Queda
  // cubierto por el procedimiento manual autorizado de docs/IMEICHECK.md.
  delete process.env.IMEICHECK_LIVE
  delete process.env.IMEICHECK_TOKEN
  
  
    console.log('imeicheck.test.ts: ok')
}
pruebasMock()
