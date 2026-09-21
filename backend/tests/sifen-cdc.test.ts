// CDC y dígito verificador del SIFEN (#130, Fase 1). El vector oficial está en
// el Manual Técnico v150 §10.1: con RUC 44444401-7, establecimiento 001, punto
// 001, número 14528, persona jurídica, fecha 20170125, emisión normal y código
// de seguridad 587326098 el CDC es 01444444017001001001452822017012515873260988.
import assert from 'node:assert/strict'
import { cdcValido, componerCdc, digitoVerificadorModulo11, dvRucValido, formatearCdc, generarCodigoSeguridad, separarRuc, SifenError } from '../lib/sifen/cdc'

// El dígito del RUC del ejemplo oficial (44444401-7).
assert.equal(digitoVerificadorModulo11('44444401'), 7)
assert.equal(dvRucValido('44444401', '7'), true)
assert.equal(dvRucValido('44444401', '8'), false)
// 80069563-1 es un RUC de ejemplo usado por las librerías de SIFEN.
assert.equal(dvRucValido('80069563', '1'), true)
assert.equal(dvRucValido('80069563', '2'), false)

const camposOficiales = {
  tipoDocumento: 1,
  rucEmisor: '44444401',
  dvRucEmisor: '7',
  establecimiento: '1',
  puntoExpedicion: '1',
  numeroDocumento: 14528,
  tipoContribuyente: 2,
  fechaEmision: new Date(2017, 0, 25, 12, 0, 0),
  tipoEmision: 1,
  codigoSeguridad: '587326098',
}
const CDC_OFICIAL = '01444444017001001001452822017012515873260988'

const cdc = componerCdc(camposOficiales)
assert.equal(cdc, CDC_OFICIAL, 'el CDC debe reproducir el ejemplo del manual')
assert.equal(cdc.length, 44)
assert.equal(cdcValido(cdc), true)
assert.equal(formatearCdc(cdc), '0144 4444 0170 0100 1001 4528 2201 7012 5158 7326 0988')

// Basura y verificadores que no cierran.
assert.equal(cdcValido(''), false)
assert.equal(cdcValido('01444444017001001001452822017012515873260989'), false)
assert.equal(cdcValido(cdc.slice(0, 43)), false)
assert.equal(cdcValido('no-es-un-cdc'), false)

// Un RUC con DV que no corresponde no puede entrar al CDC.
assert.throws(() => componerCdc({ ...camposOficiales, dvRucEmisor: '8' }), (error: unknown) => error instanceof SifenError && error.codigo === 'dv_ruc_invalido')
// Número fuera de rango y código de seguridad inválido.
assert.throws(() => componerCdc({ ...camposOficiales, numeroDocumento: 0 }), (error: unknown) => error instanceof SifenError && error.codigo === 'numero_invalido')
assert.throws(() => componerCdc({ ...camposOficiales, codigoSeguridad: '123' }), (error: unknown) => error instanceof SifenError && error.codigo === 'codigo_seguridad_invalido')
assert.throws(() => componerCdc({ ...camposOficiales, codigoSeguridad: '000014528' }), (error: unknown) => error instanceof SifenError && error.codigo === 'codigo_seguridad_invalido')
assert.throws(() => componerCdc({ ...camposOficiales, establecimiento: '1234' }), (error: unknown) => error instanceof SifenError && error.codigo === 'campo_invalido')

// separarRuc: respeta el DV escrito y lo calcula cuando falta.
assert.deepEqual(separarRuc('80069563-1'), { ruc: '80069563', dv: '1' })
assert.deepEqual(separarRuc('44444401'), { ruc: '44444401', dv: '7' })
assert.throws(() => separarRuc('abc'), (error: unknown) => error instanceof SifenError && error.codigo === 'ruc_invalido')

// Código de seguridad: 9 dígitos, no cero, distinto del número de documento.
for (let intento = 0; intento < 50; intento++) {
  const codigo = generarCodigoSeguridad(14528)
  assert.match(codigo, /^\d{9}$/)
  assert.notEqual(codigo, '000000000')
  assert.notEqual(codigo, '000014528')
}

console.log('sifen-cdc: estructura, DV, ejemplo oficial y códigos de seguridad OK')
