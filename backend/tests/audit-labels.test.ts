import assert from 'node:assert/strict'
import { ACCIONES_AUDITORIA, AREAS_AUDITORIA, detalleAuditoria } from '../lib/audit'

// #60: ningún evento de impresión puede quedar con el código crudo en el CSV.
const ETIQUETAS_IMPRESION = {
  PRINT_BRIDGE_UPDATED: 'Puente editado',
  PRINT_PRINTER_ENABLED: 'Impresora habilitada',
  PRINT_PRINTER_DISABLED: 'Impresora deshabilitada',
  PRINT_DEFAULT_PRINTER_CHANGED: 'Impresora predeterminada cambiada',
  PRINT_JOB_CANCELLED: 'Trabajo cancelado',
} as const
for (const [accion, etiqueta] of Object.entries(ETIQUETAS_IMPRESION)) {
  assert.equal(ACCIONES_AUDITORIA[accion], etiqueta, `${accion} debe tener etiqueta humana`)
}
for (const entidad of ['PrintJob', 'PrintBridge', 'PrintPrinter']) {
  assert.equal(AREAS_AUDITORIA[entidad], 'Impresiones', `${entidad} debe caer en el área Impresiones`)
}

// #59: las sucursales y el perfil de la tienda se auditan con etiqueta y área.
assert.equal(ACCIONES_AUDITORIA.BRANCH_CREATED, 'Sucursal creada')
assert.equal(ACCIONES_AUDITORIA.BRANCH_UPDATED, 'Sucursal editada')
assert.equal(ACCIONES_AUDITORIA.BRANCH_AUTO_ASSIGNED, 'Sucursal asignada')
assert.equal(ACCIONES_AUDITORIA.TENANT_PROFILE_UPDATED, 'Perfil de la tienda')
assert.equal(AREAS_AUDITORIA.Branch, 'Sucursales')
assert.equal(AREAS_AUDITORIA.Tenant, 'Configuración')

// El CSV del cambio de predeterminada se lee sin claves técnicas.
const detalle = detalleAuditoria(
  { printerId: 'p-1', name: 'Mostrador', previousDefaultId: 'p-0', previousDefaultName: 'Depósito' },
  Number.POSITIVE_INFINITY,
)
assert.ok(detalle.includes('Impresora: p-1'), detalle)
assert.ok(detalle.includes('Impresora anterior: p-0'), detalle)
assert.ok(detalle.includes('Nombre anterior: Depósito'), detalle)
assert.ok(!detalle.includes('previousDefault'), detalle)

// Un puente editado también expone su identificador legible.
const puente = detalleAuditoria({ bridgeId: 'b-1', name: 'Mostrador', changes: { branchId: { from: null, to: 's-2' } } }, Number.POSITIVE_INFINITY)
assert.ok(puente.includes('Puente: b-1'), puente)

// #172/#178: las liquidaciones de comisiones y su rotación de enlace se leen
// sin códigos crudos en la auditoría.
assert.equal(ACCIONES_AUDITORIA.COMMISSION_SETTLED, 'Liquidación de comisiones creada')
assert.equal(ACCIONES_AUDITORIA.COMMISSION_SETTLEMENT_PAID, 'Liquidación de comisiones pagada')
assert.equal(ACCIONES_AUDITORIA.COMMISSION_SETTLEMENT_CANCELLED, 'Liquidación de comisiones anulada')
assert.equal(ACCIONES_AUDITORIA.COMMISSION_SETTLEMENT_TOKEN_ROTATED, 'Enlace del comprobante rotado')
assert.equal(AREAS_AUDITORIA.CommissionSettlement, 'Comisiones')

console.log('PASS: etiquetas y áreas de auditoría (#59/#60)')
