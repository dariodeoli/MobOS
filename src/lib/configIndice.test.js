import assert from 'node:assert/strict'
import test from 'node:test'
import { INDICE_CONFIG, buscarAjustes, destinoAjuste, migasAjuste, normalizarTexto } from './configIndice.js'

const ids = (consulta, opciones = { esOwner: true }) => buscarAjustes(consulta, opciones).map(e => e.id)

test('normaliza acentos y mayúsculas', () => {
  assert.equal(normalizarTexto('  Cotización DÓLAR '), 'cotizacion dolar')
})

test('encuentra los ajustes pedidos por sus sinónimos', () => {
  assert.ok(ids('impresora').includes('impresoras'))
  assert.ok(ids('ticket').includes('ticket'))
  assert.ok(ids('etiquetas').includes('etiquetas'))
  assert.equal(ids('costos vendedor')[0], 'costos-vendedor')
  assert.ok(ids('dolar').includes('cotizacion-dolar'))
  assert.ok(ids('COTIZACION').includes('cotizacion-dolar'))
  assert.ok(ids('ruc').includes('datos-fiscales'))
  assert.ok(ids('timbrado').includes('datos-fiscales'))
  assert.ok(ids('numeracion').includes('numeracion'))
  assert.ok(ids('contraseña').includes('contrasena-reauth'))
  assert.ok(ids('sesiones').includes('sesiones'))
  assert.ok(ids('deposito').includes('ubicaciones-deposito'))
  assert.ok(ids('colores').includes('logo-colores'))
  assert.ok(ids('sucursal').includes('sucursales'))
  assert.ok(!ids('suscripcion').includes('plan-facturacion'), 'MobOS no tiene planes: sin entrada de plan')
  assert.ok(ids('whatsapp').includes('whatsapp-plantillas'))
  assert.ok(ids('invitar').includes('equipo-invitar'))
})

test('acepta coincidencia parcial', () => {
  assert.ok(ids('impres').includes('impresoras'))
  assert.ok(ids('cotiz').includes('cotizacion-dolar'))
})

test('un rol sin administración solo ve lo personal', () => {
  const vendedor = { esOwner: false }
  assert.deepEqual(ids('impresora', vendedor), [])
  assert.deepEqual(ids('costos', vendedor), [])
  assert.deepEqual(ids('ruc', vendedor), [])
  assert.deepEqual(ids('sesiones', vendedor), ['sesiones'])
})

test('arma el camino y el destino', () => {
  const impresoras = INDICE_CONFIG.find(e => e.id === 'impresoras')
  assert.deepEqual(migasAjuste(impresoras), ['Configuración', 'Impresoras'])
  assert.deepEqual(destinoAjuste(impresoras, { esOwner: true }), {
    vista: 'equipo',
    opciones: { subtab: 'dispositivos', ajuste: 'impresoras' },
  })
  const sesiones = INDICE_CONFIG.find(e => e.id === 'sesiones')
  assert.equal(destinoAjuste(sesiones, { esOwner: false }).vista, 'mi-cuenta')
})

test('los ids son únicos y cada entrada tiene roles', () => {
  assert.equal(new Set(INDICE_CONFIG.map(e => e.id)).size, INDICE_CONFIG.length)
  for (const e of INDICE_CONFIG) assert.ok(e.roles.length > 0)
})
