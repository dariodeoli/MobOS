// Auditoría central por HTTP: rastro de impresoras, productos y promociones,
// búsqueda que cruza el metadato, filtros de fecha/actor y exportación CSV.
// Corre dentro del arnés temporal (integration-http.sh).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !databaseUrl) throw new Error('Uso: audit.mjs <baseUrl> <adminToken> <sellerToken> <databaseUrl>')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = sql => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, { method = 'GET', body, token = adminToken, tenant = 'tenant-a-it' } = {}) {
  const headers = {}
  if (token !== null) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['x-tenant-id'] = tenant
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

async function descargar(path, token = adminToken) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': 'tenant-a-it' } })
  const bytes = Buffer.from(await response.arrayBuffer())
  const tieneBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF
  return { status: response.status, contentType: response.headers.get('content-type') || '', texto: bytes.toString('utf8').replace(/^\uFEFF/, ''), tieneBom }
}

const filasAuditoria = async query => {
  const resultado = await request(`/api/audit?${query}&limit=200`)
  assert.equal(resultado.status, 200, `GET /api/audit?${query}: ${JSON.stringify(resultado.payload)}`)
  assert.ok(Array.isArray(resultado.payload), 'la auditoría devuelve un arreglo')
  return resultado.payload
}

// 1. Rastro de impresoras: crear, editar (con qué cambió), borrar e importar.
let resultado = await request('/api/print/printers', { method: 'POST', body: { name: 'Auditoría Caja', destination: 'lan:10.9.9.9:9100' } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const impresora = resultado.payload
resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'PATCH', body: { name: 'Auditoría Caja 2', density: 5 } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
resultado = await request(`/api/print/printers/${impresora.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
const cuentaImpresora = action => Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = '${action}' AND "entity" = 'PrintPrinter' AND "entityId" = '${impresora.id}' AND "tenantId" = 'tenant-a-it';`))
assert.equal(cuentaImpresora('PRINT_PRINTER_CREATED'), 1, 'el alta de impresora queda auditada')
assert.equal(cuentaImpresora('PRINT_PRINTER_UPDATED'), 1, 'la edición de impresora queda auditada')
assert.equal(cuentaImpresora('PRINT_PRINTER_DELETED'), 1, 'la baja de impresora queda auditada')
const metadataImpresora = psql(`SELECT "metadata"::text FROM "AuditLog" WHERE "action" = 'PRINT_PRINTER_UPDATED' AND "entityId" = '${impresora.id}' LIMIT 1;`)
assert.match(metadataImpresora, /"name"/, 'la edición registra el nombre cambiado')
assert.match(metadataImpresora, /"density"/, 'la edición registra la densidad cambiada')
const importacionesAntes = Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_PRINTER_IMPORTED' AND "tenantId" = 'tenant-a-it';`))
resultado = await request('/api/print/printers/import', { method: 'POST', body: { force: true, printers: [{ id: 'audit-local-1', nombre: 'Importada auditoría', destino: 'lan:10.9.9.10:9100' }], bridges: [] } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
assert.equal(Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PRINT_PRINTER_IMPORTED' AND "tenantId" = 'tenant-a-it';`)), importacionesAntes + 1, 'la importación de impresoras queda auditada')

// 2. Rastro de catálogo: crear, editar (precio/costo/stock) y borrar SKU.
resultado = await request('/api/products', { method: 'POST', body: { sku: 'AUDIT-SKU-1', name: 'Producto Auditoría', pricePyg: 100000, stock: 5, costPyg: 60000 } })
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const producto = resultado.payload
resultado = await request('/api/products', { method: 'PATCH', body: { id: producto.id, pricePyg: 120000, stock: 3 } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
resultado = await request(`/api/products?id=${producto.id}`, { method: 'DELETE' })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
const cuentaProducto = action => Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = '${action}' AND "entity" = 'Product' AND "entityId" = '${producto.id}';`))
assert.equal(cuentaProducto('PRODUCT_CREATED'), 1, 'el alta de producto queda auditada')
assert.equal(cuentaProducto('PRODUCT_UPDATED'), 1, 'la edición de producto queda auditada')
assert.equal(cuentaProducto('PRODUCT_DELETED'), 1, 'la baja de producto queda auditada')
const metadataProducto = psql(`SELECT "metadata"::text FROM "AuditLog" WHERE "action" = 'PRODUCT_UPDATED' AND "entityId" = '${producto.id}' LIMIT 1;`)
assert.match(metadataProducto, /"pricePyg"/, 'la edición registra el precio cambiado')
assert.match(metadataProducto, /"stock"/, 'la edición registra el stock cambiado')
// La baja es lógica: el arnés compara el listado activo de la API contra el
// total de la base (backup-restore), así que se reactiva la fila de prueba.
psql(`UPDATE "Product" SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = '${producto.id}';`)

// 3. Rastro de promociones: crear y desactivar.
const ahora = new Date()
resultado = await request('/api/promotions', {
  method: 'POST',
  body: { code: 'AUDIT10', name: 'Promo Auditoría', kind: 'PERCENT', value: 10, startsAt: ahora.toISOString(), endsAt: new Date(ahora.getTime() + 7 * 86400000).toISOString() },
})
assert.equal(resultado.status, 201, JSON.stringify(resultado.payload))
const promocion = resultado.payload
resultado = await request('/api/promotions', { method: 'PATCH', body: { id: promocion.id, isActive: false } })
assert.equal(resultado.status, 200, JSON.stringify(resultado.payload))
const cuentaPromocion = action => Number(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = '${action}' AND "entity" = 'Promotion' AND "entityId" = '${promocion.id}';`))
assert.equal(cuentaPromocion('PROMOTION_CREATED'), 1, 'el alta de promoción queda auditada')
assert.equal(cuentaPromocion('PROMOTION_DEACTIVATED'), 1, 'la desactivación de promoción queda auditada')

// 4. Permisos: la auditoría (y sus actores y export) no son para un vendedor.
resultado = await request('/api/audit', { token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no lista la auditoría')
resultado = await request('/api/audit/actors', { token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no lista los actores')

// 5. Búsqueda en el metadato: destino de impresora, nombre de producto y cupón.
const porDestino = await filasAuditoria('q=10.9.9')
assert.ok(porDestino.some(fila => fila.action === 'PRINT_PRINTER_CREATED'), 'un destino de impresora encuentra su evento')
assert.ok(porDestino.every(fila => JSON.stringify(fila.metadata).includes('10.9.9') || fila.action.includes('10.9.9') || (fila.entityId || '').includes('10.9.9')), 'la búsqueda devuelve solo filas con la coincidencia')
const porNombre = await filasAuditoria('q=Producto%20Auditor%C3%ADa')
assert.ok(porNombre.some(fila => fila.action === 'PRODUCT_CREATED'), 'el nombre del producto encuentra su evento')
const porCupon = await filasAuditoria('q=AUDIT10')
assert.ok(porCupon.some(fila => fila.action === 'PROMOTION_DEACTIVATED'), 'el código del cupón encuentra su evento')

// 6. Filtros: entidad agrupada, fecha y actor.
const impresiones = await filasAuditoria('entity=PrintJob,PrintBridge,PrintPrinter')
assert.ok(impresiones.length > 0, 'el filtro por Impresiones devuelve filas')
assert.ok(impresiones.every(fila => ['PrintJob', 'PrintBridge', 'PrintPrinter'].includes(fila.entity)), 'el filtro agrupado no mezcla otras áreas')
const soloCreados = await filasAuditoria('action=PRODUCT_CREATED')
assert.ok(soloCreados.length > 0 && soloCreados.every(fila => fila.action === 'PRODUCT_CREATED'), 'el filtro por acción directa sigue funcionando')
const futuro = encodeURIComponent(new Date(Date.now() + 86400000).toISOString())
assert.equal((await filasAuditoria(`desde=${futuro}`)).length, 0, 'un rango futuro no devuelve movimientos')
const ayer = encodeURIComponent(new Date(Date.now() - 86400000).toISOString())
assert.ok((await filasAuditoria(`desde=${ayer}`)).length > 0, 'el rango de hoy/ayer devuelve movimientos')
resultado = await request('/api/audit?desde=no-es-fecha')
assert.equal(resultado.status, 400, 'una fecha inválida se rechaza')
const delAdmin = await filasAuditoria('userId=user-admin-it')
assert.ok(delAdmin.length > 0 && delAdmin.every(fila => fila.userId === 'user-admin-it'), 'el filtro por actor devuelve solo sus movimientos')
assert.equal((await filasAuditoria('userId=user-b-it')).length, 0, 'un actor de otra empresa no tiene movimientos')
resultado = await request('/api/audit/actors')
assert.equal(resultado.status, 200)
assert.ok(resultado.payload.actores.some(actor => actor.id === 'user-admin-it' && actor.movimientos > 0), 'el actor admin aparece con movimientos')

// 7. Exportación CSV de auditoría: columnas, etiquetas, filtros y rol.
const csv = await descargar('/api/exports/audit.csv')
assert.equal(csv.status, 200, csv.texto.slice(0, 200))
assert.match(csv.contentType, /text\/csv/, 'el export es text/csv')
assert.ok(csv.tieneBom, 'el export trae BOM UTF-8')
assert.equal(csv.texto.split('\r\n', 1)[0], 'Fecha;Acción;Actor;Área;Entidad/ID;Detalle', 'las columnas del CSV son las prometidas')
assert.match(csv.texto, /Impresora creada/, 'el CSV usa la etiqueta en español')
assert.match(csv.texto, /Impresiones/, 'el CSV usa el área legible')
assert.match(csv.texto, /Producto creado/, 'el CSV incluye el rastro del catálogo')
const csvFiltrado = await descargar('/api/exports/audit.csv?q=10.9.9')
assert.equal(csvFiltrado.status, 200)
const lineas = csvFiltrado.texto.split('\r\n').slice(1).filter(Boolean)
assert.ok(lineas.length > 0, 'el CSV filtrado no está vacío')
assert.ok(lineas.every(linea => linea.includes('10.9.9')), 'el CSV respeta el filtro de búsqueda')
resultado = await request(`/api/exports/audit.csv`, { token: sellerToken })
assert.equal(resultado.status, 403, 'un vendedor no exporta la auditoría CSV')

console.log('audit: rastro de impresoras/productos/promociones, búsqueda en metadato, filtros y CSV OK.')
