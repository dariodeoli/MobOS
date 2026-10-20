const assert = require('node:assert/strict')
const { authorizeMcpAction, parseMcpScopes, mcpAuditMetadata } = require('../lib/mcp/authorization')
const { catalogEntry } = require('../lib/mcp/catalog')

const modules = { inventario: { enabled: true }, clientes: { enabled: true }, ventas: { enabled: true }, reportes: { enabled: true }, equipo: { enabled: true } }
const scopes = ['products:read', 'products:write', 'prices:write', 'customers:read', 'customers:write', 'company:read', 'company:write', 'sales:read', 'sales:write', 'reports:read', 'product_images:write']
const gerente = { id: 'user-a', tenantId: 'tenant-a', role: 'GERENTE', branchId: 'branch-a', permissions: ['dashboard:read', 'reports:read', 'products:manage', 'orders:manage', 'customers:manage'] }
const base = { tenantId: 'tenant-a', user: gerente, enabledModules: modules, grantedScopes: scopes }

assert.equal(catalogEntry('products.read').scope, 'products:read')
assert.equal(catalogEntry('sql.query'), null)
assert.equal(authorizeMcpAction('products.read', base).allowed, true)
assert.equal(authorizeMcpAction('sales.read', base).dataScope, 'all')
assert.equal(authorizeMcpAction('unknown', base).code, 'UNKNOWN_ACTION')
assert.equal(authorizeMcpAction('products.read', { ...base, grantedScopes: [] }).code, 'SCOPE_NOT_GRANTED')
assert.equal(authorizeMcpAction('products.read', { ...base, user: null }).code, 'NO_SESSION')
assert.equal(authorizeMcpAction('products.read', { ...base, tenantId: 'tenant-b' }).code, 'TENANT_MISMATCH')
assert.equal(authorizeMcpAction('products.read', { ...base, enabledModules: { ...modules, inventario: { enabled: false } } }).code, 'MODULE_DISABLED')
assert.equal(authorizeMcpAction('products.write', { ...base, user: { ...gerente, permissions: ['products:manage'] } }).allowed, true)
assert.equal(authorizeMcpAction('products.read', { ...base, requestedBranchId: 'branch-b' }).code, 'BRANCH_DENIED')
assert.equal(authorizeMcpAction('products.read', { ...base, requestedBranchId: null }).branchId, 'branch-a')
assert.equal(authorizeMcpAction('company.write', { ...base, user: { ...gerente, role: 'VENDEDOR', permissions: ['dashboard:read'] } }).code, 'ROLE_DENIED')
const vendedor = { id: 'seller', tenantId: 'tenant-a', role: 'VENDEDOR', branchId: 'branch-a', permissions: ['products:read', 'orders:own'] }
assert.equal(authorizeMcpAction('products.read', { ...base, user: vendedor }).allowed, true)
assert.equal(authorizeMcpAction('sales.read', { ...base, user: vendedor }).dataScope, 'own')
const cajera = { id: 'cashier', tenantId: 'tenant-a', role: 'CAJERA', branchId: 'branch-a', permissions: ['products:read', 'orders:branch'] }
assert.equal(authorizeMcpAction('sales.read', { ...base, user: cajera }).dataScope, 'branch')
assert.equal(parseMcpScopes('products:read reports:read').length, 2)
assert.deepEqual(parseMcpScopes('products:read bad:scope'), [])
assert.deepEqual(parseMcpScopes('products:read products:read'), ['products:read'])
assert.deepEqual(mcpAuditMetadata({ action: 'products.write', connector: 'claude', requestId: 'req-1', branchId: 'branch-a' }), { action: 'products.write', connector: 'claude', requestId: 'req-1', branchId: 'branch-a' })
assert.equal('token' in mcpAuditMetadata({ action: 'products.write', connector: 'claude' }), false)
console.log('mcp authorization tests: ok')
