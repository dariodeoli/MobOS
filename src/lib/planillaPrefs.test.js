import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLUMNAS_DEFECTO, columnasQueEntran, columnasVisibles, fechaHoraCorta, imeiUltimos4, normalizarPlanilla, planillaEfectiva, plantillaColumnas, siglaSucursal,
} from './planillaPrefs.js'
import { abrevCondicion, estadoVisible, notaDeVenta } from './planilla.js'
import { normalizarConfig } from './stockDisplay.js'
import { SUCURSAL_TODAS, conSucursalActiva, hayFiltrosStock } from '../components/stock/stockFiltros.js'

// Planilla de Unidades (#466): personalización, abreviaturas, nota de venta y filtro de sucursal.

test('normalizarPlanilla descarta lo inválido y conserva lo conocido', () => {
  assert.deepEqual(normalizarPlanilla(null), {})
  assert.deepEqual(normalizarPlanilla({ proveedor: 'nombre', imei: 'x', ubicacion: 'icono', columnas: ['imei', 'imei', 'hack', 'nota'], costo: false, otro: 1 }), { proveedor: 'nombre', ubicacion: 'icono', columnas: ['imei', 'nota'], costo: false })
  assert.deepEqual(normalizarConfig({ planilla: { estado: 'completo' } }).planilla, { estado: 'completo' })
})

test('planillaEfectiva: fábrica < empresa < usuario, campo a campo', () => {
  const fabrica = planillaEfectiva({}, {})
  assert.deepEqual([fabrica.proveedor, fabrica.ubicacion, fabrica.imei, fabrica.estado, fabrica.costo], ['sigla', 'abrev', 'completo', 'abrev', true])
  const mezcla = planillaEfectiva({ proveedor: 'nombre', imei: 'ultimos4' }, { imei: 'completo', estado: 'completo' })
  assert.deepEqual([mezcla.proveedor, mezcla.imei, mezcla.estado], ['nombre', 'completo', 'completo'])
})

test('columnas: el costo solo con permiso y preferencia; el orden elegido se respeta', () => {
  assert.equal(columnasVisibles(planillaEfectiva({}, {}), { verCosto: false }).includes('costo'), false)
  assert.equal(columnasVisibles(planillaEfectiva({}, {}), { verCosto: true }).includes('costo'), true)
  assert.equal(columnasVisibles(planillaEfectiva({}, { costo: false }), { verCosto: true }).includes('costo'), false)
  assert.deepEqual(columnasVisibles(planillaEfectiva({}, { columnas: ['nota', 'imei'] }), { verCosto: true }), ['nota', 'imei'])
})

test('plantilla: una pista por columna visible, con casilla, modelo y acciones', () => {
  const prefs = planillaEfectiva({}, {})
  const columnas = columnasVisibles(prefs, { verCosto: true })
  assert.equal(plantillaColumnas(prefs, columnas).split(' ').length, columnas.length + 3)
})

test('columnasQueEntran suelta primero ingreso y garantía y no toca lo esencial', () => {
  const prefs = planillaEfectiva({}, {})
  assert.deepEqual(columnasQueEntran(prefs, { verCosto: true }, 2000), columnasVisibles(prefs, { verCosto: true }))
  const medio = columnasQueEntran(prefs, { verCosto: true }, 1100)
  assert.equal(medio.includes('ingreso'), false)
  assert.equal(medio.includes('estado'), true)
  const angosto = columnasQueEntran(prefs, { verCosto: true }, 760)
  for (const esencial of ['imei', 'ubicacion', 'estado']) assert.ok(angosto.includes(esencial), esencial)
  assert.ok(COLUMNAS_DEFECTO.length > angosto.length)
})

test('abreviaturas: sucursal, IMEI y fecha de verificación', () => {
  assert.equal(siglaSucursal('Sucursal Villamorra'), 'VIL')
  assert.equal(siglaSucursal('Casa Central'), 'CC')
  assert.equal(siglaSucursal(''), '')
  assert.equal(imeiUltimos4('356938035643809'), '3809')
  assert.equal(imeiUltimos4('12'), '12')
  const ahora = new Date(2026, 9, 15, 18, 0)
  assert.equal(fechaHoraCorta(new Date(2026, 9, 15, 9, 5), ahora), 'hoy 09:05')
  assert.equal(fechaHoraCorta(new Date(2026, 9, 14, 15, 30), ahora), '14/10 15:30')
  assert.equal(fechaHoraCorta(null, ahora), '')
})

test('estado visible: siempre con ícono, 3 letras y color; vendido trae nota de venta', () => {
  const unidad = (extra = {}) => ({ kind: 'unit', status: 'disponible', condition: 'NEW', ...extra })
  assert.deepEqual([estadoVisible(unidad()).abrev, estadoVisible(unidad()).tono, estadoVisible(unidad()).icono], ['DIS', 'ok', 'check'])
  assert.equal(estadoVisible(unidad({ status: 'reservado', reservationCustomer: 'Edgar' })).abrev, 'RES')
  assert.equal(estadoVisible({ kind: 'product', status: 'disponible' }), null)
  for (const status of ['reservado', 'vendido', 'en_transito', 'defectuoso']) {
    const estado = estadoVisible(unidad({ status }))
    assert.ok(estado.abrev.length === 3 && estado.icono && estado.tono, status)
  }
  assert.equal(abrevCondicion(unidad()), 'NUE')
  assert.equal(abrevCondicion(unidad({ condition: 'USED' })), 'SEM')
  assert.equal(notaDeVenta(unidad()), null)
  assert.deepEqual(notaDeVenta(unidad({ status: 'vendido', soldOrderNumber: 'MOB-0042', soldDelivered: true })), { numero: 'MOB-0042', entregado: true, texto: 'MOB-0042 ✓' })
  assert.equal(notaDeVenta(unidad({ status: 'vendido', soldOrderNumber: '#MOB-0043', soldDelivered: false })).texto, 'MOB-0043 · sin entregar')
  assert.equal(notaDeVenta(unidad({ status: 'vendido' })).entregado, false)
})

test('filtro de sucursal: arranca en la activa, «todas» la saca y elegir otra manda', () => {
  const base = { tipo: '', estado: '', sucursal: '', proveedor: '', producto: '' }
  const activa = conSucursalActiva(base, { aplica: true, sucursalActivaId: 'b1' })
  assert.deepEqual([activa.sucursal, activa.sucursalPorDefecto], ['b1', true])
  assert.equal(hayFiltrosStock(activa), false, 'la sucursal por defecto no cuenta como filtro puesto')
  const todas = conSucursalActiva({ ...base, sucursal: SUCURSAL_TODAS }, { aplica: true, sucursalActivaId: 'b1' })
  assert.deepEqual([todas.sucursal, todas.sucursalPorDefecto], ['', false])
  const otra = conSucursalActiva({ ...base, sucursal: 'b2' }, { aplica: true, sucursalActivaId: 'b1' })
  assert.deepEqual([otra.sucursal, otra.sucursalPorDefecto, hayFiltrosStock(otra)], ['b2', false, true])
  assert.equal(conSucursalActiva(base, { aplica: false, sucursalActivaId: 'b1' }).sucursal, '')
  assert.equal(conSucursalActiva({ ...base, producto: 'p1' }, { aplica: true, sucursalActivaId: 'b1' }).sucursal, '', 'un producto acotado muestra todas')
})
