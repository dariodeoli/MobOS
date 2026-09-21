// Mapeo Order/Customer → campos fiscales del DE (#130, Fase 1).
import assert from 'node:assert/strict'
import { cdcValido } from '../lib/sifen/cdc'
import { interpretarDocumento, mapearDocumentoFiscal, tipoContribuyenteDe } from '../lib/sifen/mapping'
import type { ClienteFiscal, OrdenFiscal } from '../lib/sifen/mapping'
import type { SifenConfig } from '../lib/sifen/config'

const config: SifenConfig = {
  ambiente: 'test',
  ruc: '44444401',
  dv: '7',
  razonSocial: 'Comercio de Prueba S.A.',
  tipoContribuyente: 2,
  direccion: 'Av. Mariscal López 1234',
  ciudad: 'Asunción',
  departamento: 'Central',
  telefono: '+595 981 000 000',
  email: 'fiscal@example.invalid',
  timbrado: '12558946',
  establecimiento: '001',
  puntoExpedicion: '001',
  certificadoPath: '',
  certificadoPassword: '',
  endpointRecibe: 'https://sifen-test.invalid/recibe',
  endpointConsulta: 'https://sifen-test.invalid/consulta',
  timeoutMs: 15000,
}

const orden: OrdenFiscal = {
  id: 'orden-1',
  orderNumber: 'MOB #1001',
  createdAt: new Date(2026, 5, 10, 15, 30, 0),
  subtotalPyg: 1_000_000,
  discountPyg: 100_000,
  deliveryPyg: 50_000,
  deliveryType: 'Delivery',
  dueAt: null,
  creditDays: null,
  totalPyg: 950_000,
  items: [
    { description: 'iPhone 15 128 GB', quantity: 1, unitPricePyg: 900_000, totalPyg: 900_000, discountPyg: 0, serials: ['356789102345678'] },
    { description: 'Funda & cable', quantity: 1, unitPricePyg: 100_000, totalPyg: 100_000, discountPyg: 0 },
  ],
  payments: [
    { method: 'CASH', amountPyg: 500_000, status: 'CONFIRMED' },
    { method: 'CARD', amountPyg: 450_000, status: 'CONFIRMED' },
  ],
}

const cliente: ClienteFiscal = {
  name: 'María Pérez',
  document: '80069563-1',
  email: 'maria@example.invalid',
  phone: '981123456',
  countryCode: '+595',
}

// ── Contado con RUC y descuento global ────────────────────────────────
const borrador = mapearDocumentoFiscal({ orden, cliente, config, numeroDocumento: 42, codigoSeguridad: '123456789' })
assert.equal(borrador.version, '150')
assert.equal(borrador.tipoDocumento, 1)
assert.equal(borrador.receptor.tipoDocumento, 1, 'el RUC del cliente se reconoce por el guion')
assert.equal(borrador.receptor.documento, '80069563')
assert.equal(borrador.receptor.dv, '1')
assert.equal(borrador.receptor.naturaleza, 1)
assert.equal(borrador.receptor.tipoOperacion, 1)
assert.equal(borrador.receptor.tipoContribuyente, 1, 'María Pérez es persona física')
assert.equal(borrador.receptor.razonSocial, 'María Pérez')
assert.equal(borrador.condicion.tipo, 1, 'con pagos confirmados la condición es contado')
assert.deepEqual(borrador.condicion.entregas, [
  { tipo: 1, monto: 500_000, moneda: 'PYG' },
  { tipo: 3, monto: 450_000, moneda: 'PYG' },
])
assert.equal(borrador.totales.totalOperacion, 1_050_000)
assert.equal(borrador.totales.descuentoGlobal, 100_000)
assert.equal(borrador.totales.totalGeneral, 950_000, 'el total final tiene que ser el del pedido')
assert.equal(borrador.items.length, 3, 'el envío entra como ítem de servicio')
assert.equal(borrador.items[0].seriales[0], '356789102345678')

// Los netos con descuento global tienen que cerrar exactos y el IVA despejarse
// del total (los precios del negocio son finales con IVA incluido).
const sumaNetos = borrador.items.reduce((suma, item) => suma + item.total, 0)
assert.equal(sumaNetos, 950_000)
const sumaBase = borrador.items.reduce((suma, item) => suma + item.baseGravada, 0)
assert.equal(sumaBase, borrador.totales.baseGravada10)
assert.equal(sumaBase + borrador.totales.totalIva, 950_000, 'base + IVA cierra al guaraní')
assert.equal(borrador.totales.baseGravada5, 0)
assert.equal(borrador.totales.totalGs, 950_000)
assert.ok(borrador.items.every((item) => item.tasaIva === 10 && item.afectacionIva === 1))

// CDC compuesto y verificable; sin código de seguridad queda sin componer.
assert.ok(borrador.cdc && cdcValido(borrador.cdc))
assert.equal(borrador.cdc.slice(0, 2), '01')
assert.equal(borrador.cdc.slice(24, 25), '2', 'el emisor es persona jurídica')
assert.equal(borrador.cdc.slice(33, 34), '1', 'emisión normal')
assert.equal(borrador.cdc.slice(34, 43), '123456789')
const sinCodigo = mapearDocumentoFiscal({ orden, cliente, config, numeroDocumento: 42 })
assert.equal(sinCodigo.cdc, null)

// La lista de datos faltantes menciona el IVA y el tipo de documento inferido.
assert.ok(borrador.faltantes.some((texto) => texto.includes('IVA')))
assert.ok(borrador.faltantes.some((texto) => texto.includes('RUC de cédula') || texto.includes('RUC o cédula')))

// ── Consumidor final innominado ───────────────────────────────────────
const anonimo = mapearDocumentoFiscal({ orden: { ...orden, payments: [{ method: 'CASH', amountPyg: 950_000, status: 'CONFIRMED' }] }, cliente: null, config, numeroDocumento: 43, codigoSeguridad: '987654321' })
assert.equal(anonimo.receptor.tipoDocumento, 5, 'sin documento es innominado')
assert.equal(anonimo.receptor.documento, '0')
assert.equal(anonimo.receptor.naturaleza, 2)
assert.equal(anonimo.receptor.tipoOperacion, 2)
assert.equal(anonimo.receptor.razonSocial, 'Sin Nombre')
assert.equal(anonimo.receptor.tipoContribuyente, null)
assert.ok(anonimo.faltantes.some((texto) => texto.includes('no tiene cliente')))

// ── Venta a crédito ───────────────────────────────────────────────────
const credito = mapearDocumentoFiscal({
  orden: { ...orden, dueAt: new Date(2026, 6, 10), creditDays: 30, payments: [] },
  cliente,
  config,
  numeroDocumento: 44,
  codigoSeguridad: '111222333',
})
assert.equal(credito.condicion.tipo, 2)
assert.equal(credito.condicion.plazoDias, 30)
assert.deepEqual(credito.condicion.entregas, [])
assert.ok(credito.faltantes.every((texto) => !texto.includes('sin pagos confirmados')))

// ── Interpretación de documentos y tipo de contribuyente ──────────────
assert.deepEqual(interpretarDocumento(''), { tipo: 5, numero: '0', dv: null, inferido: false })
assert.deepEqual(interpretarDocumento('80069563-1'), { tipo: 1, numero: '80069563', dv: '1', inferido: false })
assert.deepEqual(interpretarDocumento('80069563'), { tipo: 1, numero: '80069563', dv: '1', inferido: true })
assert.deepEqual(interpretarDocumento('3456789'), { tipo: 2, numero: '3456789', dv: null, inferido: true })
assert.deepEqual(interpretarDocumento('X1234567'), { tipo: 9, numero: 'X1234567', dv: null, inferido: true })
// Un DV escrito que no cierra se reemplaza por el calculado (módulo 11).
assert.equal(interpretarDocumento('80069563-9').dv, '1')
assert.equal(tipoContribuyenteDe('Comercial del Este S.R.L.'), 2)
assert.equal(tipoContribuyenteDe('Juan Ramírez'), 1)

console.log('sifen-mapping: receptor, ítems, IVA, descuento, crédito y faltantes OK')
