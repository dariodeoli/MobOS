#!/usr/bin/env node

// Contrato de las exportaciones CSV por módulo. Uso:
//   node exports.mjs <baseUrl> <adminToken> <sellerToken>
//
// Comprueba por módulo: 200, Content-Type text/csv, BOM UTF-8, encabezados en
// español y el 403 del vendedor donde el listado no lo permite.

import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: exports.mjs <baseUrl> <adminToken> <sellerToken>')

const MODULOS = [
  { modulo: 'customers', columnas: ['Cliente', 'Documento', 'Teléfono', 'Correo', 'Ciudad', 'Mayorista', 'Límite de crédito', 'Pedidos', 'Total gastado', 'Saldo'], vendedor: 200 },
  { modulo: 'inventory-units', columnas: ['Producto', 'Capacidad', 'SKU', 'Serial', 'Condición', 'Estado', 'Sucursal', 'Ubicación', 'Proveedor', 'Costo (Gs)'], vendedor: 200 },
  { modulo: 'purchases', columnas: ['Proveedor', 'Estado', 'Fecha', 'Vencimiento', 'Total', 'Pagado', 'Saldo'], vendedor: 403 },
  { modulo: 'cash-movements', columnas: ['Fecha', 'Tipo', 'Dirección', 'Medio', 'Monto (Gs)', 'Estado', 'Usuario'], vendedor: 403 },
  { modulo: 'warranties', columnas: ['Cliente', 'Teléfono', 'Serial', 'Caso', 'Estado', 'Garantía', 'Vence'], vendedor: 403 },
  { modulo: 'commissions', columnas: ['Vendedor', 'Ventas', 'Total vendido', 'Margen', '% comisión', 'Comisión'], vendedor: 403 },
]

async function descargar(modulo, token, extra = '') {
  const response = await fetch(`${baseUrl}/api/exports/${modulo}${extra}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it' },
  })
  // response.text() descarta el BOM al decodificar; se inspeccionan los bytes.
  const bytes = Buffer.from(await response.arrayBuffer())
  const tieneBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
  const texto = bytes.toString('utf8').replace(/^\uFEFF/, '')
  return { response, texto, tieneBom }
}

for (const { modulo, columnas, vendedor } of MODULOS) {
  const admin = await descargar(modulo, adminToken)
  assert.equal(admin.response.status, 200, `${modulo}: ${admin.texto.slice(0, 200)}`)
  assert.match(admin.response.headers.get('content-type') || '', /text\/csv/, `${modulo}: falta Content-Type text/csv`)
  assert.ok(admin.tieneBom, `${modulo}: falta el BOM UTF-8`)
  const primera = admin.texto.split('\r\n', 1)[0]
  assert.equal(primera, columnas.join(';'), `${modulo}: encabezados inesperados`)
  const vendedorResp = await descargar(modulo, sellerToken)
  assert.equal(vendedorResp.response.status, vendedor, `${modulo}: el vendedor recibió ${vendedorResp.response.status} en lugar de ${vendedor}`)
  console.log(`exports ${modulo}: PASS (${columnas.length} columnas, vendedor ${vendedor})`)
}

// Un filtro que el listado no acepta y un módulo inexistente se rechazan; el
// vendedor no puede exportar una sucursal que no es la suya.
const filtroInvalido = await descargar('customers', adminToken, '?filtro=inexistente')
assert.equal(filtroInvalido.response.status, 400, 'customers: un filtro inválido debe devolver 400')
const sucursalAjena = await descargar('inventory-units', sellerToken, '?branchId=branch-a2-it')
assert.equal(sucursalAjena.response.status, 403, 'inventory-units: el vendedor no puede exportar otra sucursal')
const inexistente = await descargar('desconocido', adminToken)
assert.equal(inexistente.response.status, 404, 'un módulo inexistente debe devolver 404')

console.log('exports: PASS (6 módulos con CSV, BOM, encabezados y alcance por rol).')
