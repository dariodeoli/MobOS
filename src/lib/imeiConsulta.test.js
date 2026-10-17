import test from 'node:test'
import assert from 'node:assert/strict'
import { ejecutarConsultaCompleta, validarImeiConsulta } from './imeiConsulta.js'

test('valida IMEI real antes de hacer la consulta', () => {
  assert.deepEqual(validarImeiConsulta('490154203237518'), { ok: true, imei: '490154203237518' })
  assert.deepEqual(validarImeiConsulta('490 154 203 237 518'), { ok: true, imei: '490154203237518' })
  assert.match(validarImeiConsulta('').error, /Falta el IMEI/)
  assert.match(validarImeiConsulta('123').error, /15 dígitos/)
  assert.match(validarImeiConsulta('490154203237519').error, /dígito de control/)
})

test('no confirma una consulta IMEI si el precheck falla', async () => {
  let confirmaciones = 0
  let completados = 0
  const resultado = await ejecutarConsultaCompleta({
    precheck: async () => false,
    confirmar: async () => { confirmaciones += 1; return true },
    alCompletar: () => { completados += 1 },
  })
  assert.equal(resultado, false)
  assert.equal(confirmaciones, 0)
  assert.equal(completados, 0)
})
