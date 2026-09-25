// #250 · #83 — Repuestos a crédito y consignación: cuenta a pagar al proveedor
// (contado vs crédito con vencimiento) y depósito sin impacto hasta el consumo.
// Lógica pura en backend/lib/supplier-payables.ts.
import assert from 'node:assert/strict'
import {
  CONDICION_PROVEEDOR_LABELS,
  enDepositoDeCompra,
  estadoDeVencimiento,
  payableDeCompra,
  pendienteDeCompra,
  resumenProveedores,
} from '../lib/supplier-payables'

const ahora = new Date('2026-09-25T12:00:00Z')

// ── Contado: se paga al recibir, nunca queda en «por pagar» ─────────────────
assert.equal(payableDeCompra({ condition: 'CONTADO', amountPyg: 500000 }), 0)
assert.equal(pendienteDeCompra({ condition: 'CONTADO', amountPyg: 500000, paidPyg: 0 }), 0)

// ── Crédito: impacta el total, con vencimiento ──────────────────────────────
const credito = { condition: 'CREDITO' as const, amountPyg: 1200000, dueAt: '2026-10-10T00:00:00Z' }
assert.equal(payableDeCompra(credito), 1200000)
assert.equal(pendienteDeCompra({ ...credito, paidPyg: 200000 }), 1000000)
assert.equal(pendienteDeCompra({ ...credito, paidPyg: 2000000 }), 0)
assert.equal(enDepositoDeCompra(credito), 0)

// ── Consignación/depósito: sin impacto hasta el consumo ─────────────────────
const deposito = { condition: 'CONSIGNACION' as const, amountPyg: 800000 }
assert.equal(payableDeCompra(deposito), 0)
assert.equal(pendienteDeCompra(deposito), 0)
assert.equal(enDepositoDeCompra(deposito), 800000)
// El taller consume la mitad: esa mitad pasa a pagarse y la otra sigue en depósito.
assert.equal(payableDeCompra({ ...deposito, consumedPyg: 400000 }), 400000)
assert.equal(pendienteDeCompra({ ...deposito, consumedPyg: 400000, paidPyg: 100000 }), 300000)
assert.equal(enDepositoDeCompra({ ...deposito, consumedPyg: 400000 }), 400000)
// El consumo no puede superar lo comprado.
assert.equal(payableDeCompra({ ...deposito, consumedPyg: 900000 }), 800000)
assert.equal(enDepositoDeCompra({ ...deposito, consumedPyg: 900000 }), 0)

// ── Vencimientos ────────────────────────────────────────────────────────────
assert.equal(estadoDeVencimiento(null, ahora), 'SIN_VENCIMIENTO')
assert.equal(estadoDeVencimiento('2026-09-20T00:00:00Z', ahora), 'VENCIDA')
assert.equal(estadoDeVencimiento('2026-09-28T12:00:00Z', ahora), 'POR_VENCER')
assert.equal(estadoDeVencimiento('2026-10-20T00:00:00Z', ahora), 'AL_DIA')

// ── Resumen del KPI ─────────────────────────────────────────────────────────
const resumen = resumenProveedores([
  { condition: 'CONTADO', amountPyg: 300000 },
  { condition: 'CREDITO', amountPyg: 1000000, paidPyg: 250000, dueAt: '2026-09-20T00:00:00Z' },
  { condition: 'CREDITO', amountPyg: 500000, dueAt: '2026-09-30T00:00:00Z' },
  { condition: 'CREDITO', amountPyg: 400000, dueAt: '2026-12-01T00:00:00Z' },
  { condition: 'CONSIGNACION', amountPyg: 800000, consumedPyg: 200000, paidPyg: 0 },
  { condition: 'CONSIGNACION', amountPyg: 600000 },
], ahora)
assert.deepEqual(resumen, { totalPyg: 1850000, vencidasPyg: 750000, porVencerPyg: 500000, depositoPyg: 1200000 })

// ── Validaciones ────────────────────────────────────────────────────────────
assert.throws(() => payableDeCompra({ condition: 'CREDITO', amountPyg: -1 }), /Monto inválido/)
assert.throws(() => pendienteDeCompra({ condition: 'CREDITO', amountPyg: 100, paidPyg: 1.5 }), /Pagado inválido/)
assert.throws(() => estadoDeVencimiento('no-es-fecha', ahora), /Vencimiento inválido/)

// Etiquetas del producto para la pantalla.
assert.deepEqual(Object.keys(CONDICION_PROVEEDOR_LABELS), ['CONTADO', 'CREDITO', 'CONSIGNACION'])
