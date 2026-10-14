import { describe, expect, it } from 'vitest'
import { corregirPagoDemo } from '@/lib/demoCorreccionPago'
import { cuerpoCorreccion, errorCorreccion, evaluarCorreccionPago, puedeDejarAlRepartidor, restanteCorreccion, reversionesPorOriginal } from './correccionPago'

const pago = { id: 'p1', method: 'TRANSFER', status: 'CONFIRMED', amountPyg: 100000, currency: 'PYG', userId: 'u1' }
const admin = { id: 'a', role: 'ADMIN' }
const cuentas = [{ id: 'c1', kind: 'CASH', name: 'Caja', currency: 'PYG' }, { id: 't1', kind: 'TRANSFER', name: 'Itaú', currency: 'PYG' }]

describe('evaluarCorreccionPago', () => {
  it('permite a gerencia y bloquea reversiones, correcciones, ya corregidos y repartidor', () => {
    expect(evaluarCorreccionPago({ pago, pagos: [pago], pedido: {}, usuario: admin }).puede).toBe(true)
    expect(evaluarCorreccionPago({ pago: { ...pago, reversalOfId: 'x' }, usuario: admin }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago: { ...pago, correctionId: 'x' }, usuario: admin }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago, pagos: [pago, { id: 'r', reversalOfId: 'p1' }], usuario: admin }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago: { ...pago, deliveryUserId: 'd' }, usuario: admin }).puede).toBe(false)
  })
  it('bloquea medios fuera de alcance, no PYG y pedido anulado', () => {
    for (const method of ['GIFT_CARD', 'TRADE_IN', 'STORE_CREDIT']) expect(evaluarCorreccionPago({ pago: { ...pago, method }, usuario: admin }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago: { ...pago, currency: 'USD' }, usuario: admin }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago, pedido: { status: 'CANCELLED' }, usuario: admin }).puede).toBe(false)
  })
  it('el personal solo corrige lo propio y si el dueño lo habilita; verificado solo ADMIN', () => {
    const cajera = { id: 'u1', role: 'CAJERA' }
    expect(evaluarCorreccionPago({ pago, usuario: cajera }).puede).toBe(true)
    expect(evaluarCorreccionPago({ pago, usuario: { id: 'u2', role: 'VENDEDOR' } }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago, usuario: cajera, personalPuede: false }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago, usuario: { id: 'g', role: 'GERENTE' }, conciliacion: 'VERIFIED' }).puede).toBe(false)
    expect(evaluarCorreccionPago({ pago, usuario: admin, conciliacion: 'VERIFIED' }).puede).toBe(true)
    expect(evaluarCorreccionPago({ pago, usuario: { id: 'x', role: 'REPARTIDOR' } }).puede).toBe(false)
  })
  it('efectivo al repartidor solo gerencia con repartidor asignado', () => {
    expect(puedeDejarAlRepartidor(admin, { assignedToId: 'd' })).toBe(true)
    expect(puedeDejarAlRepartidor(admin, {})).toBe(false)
    expect(puedeDejarAlRepartidor({ role: 'CAJERA' }, { assignedToId: 'd' })).toBe(false)
  })
})

describe('reparto y cuerpo', () => {
  const filas = [{ accountId: 'c1', amount: 40000 }, { accountId: 't1', amount: 60000, toDriver: false }]
  it('calcula el resto y exige suma exacta y motivo', () => {
    expect(restanteCorreccion(pago, [{ amount: 30000 }])).toBe(70000)
    expect(errorCorreccion({ original: pago, filas, motivo: 'se cobró en caja' })).toBeNull()
    expect(errorCorreccion({ original: pago, filas, motivo: ' a ' })).toMatch(/motivo/)
    expect(errorCorreccion({ original: pago, filas: [{ accountId: 'c1', amount: 99999 }], motivo: 'abc' })).toMatch(/sumar exactamente/)
    expect(errorCorreccion({ original: pago, filas: [{ accountId: '', amount: 100000 }], motivo: 'abc' })).toMatch(/cuenta/)
  })
  it('arma el cuerpo del endpoint', () => {
    expect(cuerpoCorreccion({ motivo: ' motivo ', filas: [{ accountId: 'c1', amount: 100000, toDriver: true }] })).toEqual({ reason: 'motivo', payments: [{ accountId: 'c1', amount: 100000, toDriver: true }] })
  })
  it('mapea reversiones por original', () => {
    expect(reversionesPorOriginal([pago, { id: 'r', reversalOfId: 'p1' }]).get('p1').id).toBe('r')
  })
})

describe('corregirPagoDemo', () => {
  const pedido = { id: 'o1', pagos: [{ ...pago, monto: 100000, accountId: 't1' }], totalPagado: 100000, totalPendiente: 0, assignedToId: 'd' }
  it('revierte el original y crea los nuevos con el motivo', () => {
    const r = corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'fue efectivo', filas: [{ accountId: 'c1', amount: 100000 }], cuentas })
    expect(r.pagos).toHaveLength(3)
    expect(r.pagos[1]).toMatchObject({ reversalOfId: 'p1', amountPyg: -100000 })
    expect(r.pagos[2]).toMatchObject({ method: 'CASH', correctionReason: 'fue efectivo', status: 'CONFIRMED' })
    expect(r.totalPagado).toBe(100000)
  })
  it('efectivo al repartidor queda pendiente y reabre el saldo', () => {
    const r = corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'lo tiene el repartidor', filas: [{ accountId: 'c1', amount: 100000, toDriver: true }], cuentas, repartidor: true })
    expect(r.pagos[2]).toMatchObject({ status: 'PENDING', deliveryUserId: 'd' })
    expect(r.totalPendiente).toBe(100000)
  })
  it('rechaza suma distinta, mismo medio y doble corrección', () => {
    expect(() => corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'abc', filas: [{ accountId: 'c1', amount: 5 }], cuentas })).toThrow(/sumar/)
    expect(() => corregirPagoDemo({ pedido, original: pedido.pagos[0], motivo: 'abc', filas: [{ accountId: 't1', amount: 100000 }], cuentas })).toThrow(/igual al original/)
    const ya = { ...pedido, pagos: [...pedido.pagos, { id: 'r', reversalOfId: 'p1' }] }
    expect(() => corregirPagoDemo({ pedido: ya, original: pedido.pagos[0], motivo: 'abc', filas: [{ accountId: 'c1', amount: 100000 }], cuentas })).toThrow(/ya fue corregido/)
  })
})
