import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosInformeDispositivo, estadoGarantia, verificacionFisica } from './informeDispositivo.js'

const UNIDAD = {
  serial: '356789102345673',
  condition: 'USED',
  batteryHealth: 89,
  location: { code: 'D2', name: 'Depósito 2' },
  branch: { name: 'Casa Central' },
  supplierName: 'Proveedor XYZ',
  lastVerifiedBy: { name: 'Lucía' },
  lastVerifiedAt: '2026-09-21T15:04:00Z',
  verificationCount: 3,
  warrantyUntil: '2026-10-21T00:00:00Z',
  grade: 'A',
  inspection: { puntaje: 92, aprobados: 8, total: 8 },
  product: { name: 'iPhone 15 Pro 256GB Titanio', model: 'iPhone 15 Pro', capacity: '256GB', color: 'Titanio', sku: 'IPH-15P' },
}
const CONSULTA = {
  imei: '356789102345673',
  status: 'verificado',
  resolvedAt: '2026-09-21T15:04:00Z',
  esMock: true,
  normalized: [
    { clave: 'blacklist', etiqueta: 'Blacklist actual', valor: 'Sin reportes actuales' },
    { clave: 'findMy', etiqueta: 'Find My / iCloud', valor: 'Off' },
  ],
}

test('el informe arma equipo, verificación IMEI, inspección y QR (#240)', () => {
  const datos = datosInformeDispositivo(UNIDAD, { consulta: CONSULTA, base: 'https://app.moboss.online', emisor: 'Móvil Center', ahora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(datos.modelo, 'iPhone 15 Pro · 256GB · Titanio')
  assert.equal(datos.serial, '356789102345673')
  assert.equal(datos.identificador, '5673')
  assert.equal(datos.imei, '•••••••••••5673')
  assert.equal(datos.serialImpreso, '', 'un IMEI no se imprime en claro')
  assert.equal(datos.enlace, 'https://app.moboss.online/u/356789102345673')
  assert.equal(datos.emisor, 'Móvil Center')
  assert.equal(datos.ubicacion, 'D2 · Depósito 2')
  assert.equal(datos.verificacion.detalle, 'IMEI verificado: sin reportes al 21/9/2026')
  assert.equal(datos.verificacion.campos.length, 2)
  assert.equal(datos.verificacion.simulado, true)
  assert.equal(datos.inspeccion.grado, 'A')
  assert.equal(datos.inspeccion.verificador, 'Lucía')
  assert.equal(datos.inspeccion.puntaje, 92)
  assert.equal(estadoGarantia(datos, new Date('2026-09-22T10:00:00Z')).etiqueta, 'Garantía vigente')
})

test('sin consulta de IMEI el informe lo dice y enmascara el serial', () => {
  const datos = datosInformeDispositivo(UNIDAD, { base: 'https://app.moboss.online' })
  assert.equal(datos.verificacion, null)
  assert.equal(datos.imei, '•••••••••••5673')
  assert.equal(datos.inspeccion.grado, 'A')
})

test('la garantía vencida y los campos opcionales se muestran honestos', () => {
  const vencida = datosInformeDispositivo({ ...UNIDAD, warrantyUntil: '2026-01-01T00:00:00Z' }, { ahora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(estadoGarantia(vencida, new Date('2026-09-22T10:00:00Z')).etiqueta, 'Garantía vencida')
  const sinDatos = datosInformeDispositivo({ product: { name: 'Producto' } })
  assert.equal(sinDatos.garantia, null)
  assert.equal(estadoGarantia(sinDatos).etiqueta, 'Sin garantía cargada')
  assert.equal(sinDatos.imei, '')
  assert.equal(sinDatos.enlace, '')
})

test('la inspección sin grado ni verificador no inventa datos (#240 · INV)', () => {
  const inspeccion = verificacionFisica({ verificationCount: 0 })
  assert.equal(inspeccion.grado, '')
  assert.equal(inspeccion.verificador, '')
  assert.equal(inspeccion.puntaje, 0)
})

test('un serial común (no IMEI) sí se imprime en el informe', () => {
  const datos = datosInformeDispositivo({ serial: 'SN-0001', product: { name: 'Cargador' } })
  assert.equal(datos.imei, '••••')
  assert.equal(datos.serialImpreso, 'SN-0001')
})
