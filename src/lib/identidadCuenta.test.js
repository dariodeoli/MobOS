import assert from 'node:assert/strict'
import test from 'node:test'
import { cambiosIdentidad, formularioIdentidad, hayCambiosIdentidad } from './identidadCuenta.js'

const EMPRESA = { nombre: 'Tienda E2E', email: 'e2e-tienda@test.local' }
const TENANT = {
  address: 'Av. Mcal. López 1234',
  city: 'Asunción',
  department: 'Central',
  phone: '+595 981 000 111',
  ruc: '80012345-6',
}

test('#298 · sin cambios reales no hay nada para guardar', () => {
  const form = formularioIdentidad({ empresa: EMPRESA, tenant: TENANT })
  assert.deepEqual(cambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), {})
  assert.equal(hayCambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), false)
})

test('#298 · el teléfono reformateado no cuenta como cambio', () => {
  const form = { ...formularioIdentidad({ empresa: EMPRESA, tenant: TENANT }), phone: '981000111', countryCode: '+595' }
  assert.deepEqual(cambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), {})
})

test('#298 · cada campo editado viaja una sola vez en el payload', () => {
  const base = formularioIdentidad({ empresa: EMPRESA, tenant: TENANT })
  const form = {
    ...base,
    name: 'Tienda E2E QA',
    email: 'qa298@test.local',
    address: 'Nueva dirección 298',
    city: 'Luque',
    department: 'Nuevo Depto',
    ruc: '80099999-1',
    phone: '981 555 222',
  }
  assert.deepEqual(cambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), {
    name: 'Tienda E2E QA',
    email: 'qa298@test.local',
    address: 'Nueva dirección 298',
    city: 'Luque',
    department: 'Nuevo Depto',
    phone: '+595 981 555 222',
    ruc: '80099999-1',
  })
})

test('#298 · borrar un campo opcional es un cambio (y se envía vacío)', () => {
  const form = { ...formularioIdentidad({ empresa: EMPRESA, tenant: TENANT }), address: '', ruc: '' }
  assert.deepEqual(cambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), { address: '', ruc: '' })
})

test('#298 · los espacios de más no generan cambios fantasma', () => {
  const form = { ...formularioIdentidad({ empresa: EMPRESA, tenant: TENANT }), name: '  Tienda E2E  ', ruc: ' 80012345-6 ' }
  assert.deepEqual(cambiosIdentidad(form, { empresa: EMPRESA, tenant: TENANT }), {})
})

test('#298 · sin datos guardados el formulario arranca vacío y prolijo', () => {
  const form = formularioIdentidad({})
  assert.deepEqual(form, {
    name: '',
    email: '',
    address: '',
    city: '',
    department: '',
    countryCode: '+595',
    phone: '',
    ruc: '',
  })
  assert.deepEqual(cambiosIdentidad(form, {}), {})
})
