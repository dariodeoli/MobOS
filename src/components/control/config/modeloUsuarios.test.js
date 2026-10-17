import assert from 'node:assert/strict'
import test from 'node:test'
import { avisoSeguridad, contarUsuarios, csvUsuarios, filasUsuarios, filtrarUsuarios } from './modeloUsuarios.js'

const usuarios = [
  { id: 'u1', name: 'Dario', email: 'd@x.com', role: 'ADMIN', status: 'ACTIVE', branchId: null },
  { id: 'u2', name: 'Ana "la mejor"', email: 'a@x.com', role: 'VENDEDOR', status: 'ACTIVE', branchId: 'b1', isLocked: true },
  { id: 'u3', name: 'Luis', email: 'l@x.com', role: 'CAJERA', status: 'INACTIVE', branchId: 'b1' },
]
const invitaciones = [
  { id: 'i1', name: 'Eva', email: 'e@x.com', role: 'TECNICO', status: 'PENDING', branchId: null },
  { id: 'i2', name: 'Raúl', email: 'r@x.com', role: 'VENDEDOR', status: 'EXPIRED', branchId: 'b1' },
  { id: 'i3', name: 'Ya aceptó', email: 'y@x.com', role: 'VENDEDOR', status: 'ACCEPTED' },
  { id: 'i4', name: 'Revocada', email: 'v@x.com', role: 'VENDEDOR', status: 'REVOKED' },
]
const sucursales = [{ id: 'b1', name: 'Centro', city: 'Asunción', address: 'Senador Long 506' }]
const filas = filasUsuarios({ usuarios, invitaciones, sucursales })

test('filasUsuarios une equipo e invitaciones sin responder, con estado y sucursal', () => {
  assert.deepEqual(filas.map((f) => [f.id, f.estado, f.sucursal]), [
    ['u1', 'activo', 'Todas'], ['u2', 'activo', 'Centro'], ['u3', 'inactivo', 'Centro'],
    ['inv-i1', 'pendiente', 'Todas'], ['inv-i2', 'vencida', 'Centro'],
  ])
  assert.equal(filas[0].rolEtiqueta, 'Dueño')
  assert.deepEqual(
    [filas[0].origen, filas[0].ciudad, filas[0].direccion, filas[0].alcance],
    ['Casa central', '', '', 'Todas las sucursales'],
  )
  assert.deepEqual(
    [filas[1].origen, filas[1].ciudad, filas[1].direccion, filas[1].alcance],
    ['Centro', 'Asunción', 'Senador Long 506', 'Esta sucursal'],
  )
})

test('el aviso de seguridad es la cuenta bloqueada; el resto no tiene aviso', () => {
  assert.match(avisoSeguridad({ isLocked: true }), /bloqueada/)
  assert.equal(avisoSeguridad({ isLocked: false }), null)
  assert.equal(filas.find((f) => f.id === 'u2').aviso !== null, true)
  assert.equal(filas.find((f) => f.id === 'u1').aviso, null)
})

test('filtros: Activos, Pendientes (pendiente + vencida) y Solo POS (activos vendedor/cajera)', () => {
  assert.deepEqual(filtrarUsuarios(filas, 'activos').map((f) => f.id), ['u1', 'u2'])
  assert.deepEqual(filtrarUsuarios(filas, 'pendientes').map((f) => f.id), ['inv-i1', 'inv-i2'])
  assert.deepEqual(filtrarUsuarios(filas, 'pos').map((f) => f.id), ['u2'])
  assert.equal(filtrarUsuarios(filas, 'todos').length, 5)
  assert.deepEqual(contarUsuarios(filas), { todos: 5, activos: 2, pendientes: 2, pos: 1 })
})

test('csvUsuarios escapa comillas y respeta el filtro recibido', () => {
  const csv = csvUsuarios(filtrarUsuarios(filas, 'activos')).split('\r\n')
  assert.equal(csv[0], '"Nombre","Correo","Rol","Estado","Origen","Sucursal","Ciudad","Dirección","Alcance"')
  assert.equal(csv[2], '"Ana ""la mejor""","a@x.com","Vendedor","Activo","Centro","Centro","Asunción","Senador Long 506","Esta sucursal"')
  assert.equal(csv.length, 3)
})

test('sin datos devuelve listas vacías', () => {
  assert.deepEqual(filasUsuarios(), [])
  assert.deepEqual(filtrarUsuarios(undefined, 'activos'), [])
})
