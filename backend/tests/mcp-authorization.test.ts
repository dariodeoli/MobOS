const assert = require('node:assert/strict')
const { authorizeMcpAction, parseMcpScopes, mcpAuditMetadata } = require('../lib/mcp/authorization')
const { catalogEntry } = require('../lib/mcp/catalog')

const base = {
  tenantId: 'tenant-a',
  user: { id: 'user-a', tenantId: 'tenant-a', role: 'GERENTE', branchId: 'branch-a', permissions: ['products:read', 'products:manage', 'orders:manage', 'reports:read', 'dashboard:read', 'customers:manage'] },
  enabledModules: { inventario: { enabled: true }, clientes: { enabled: true }, ventas: { enabled: true }, reportes: { enabled: true }, equipo: { enabled: true } },
}

assert.equal(catalogEntry('products.read').scope, 'products:read')
assert.equal(catalogEntry('sql.query'), null)
assert.equal(authorizeMcpAction('products.read', base).allowed, true)
assert.equal(authorizeMcpAction('sales.read', base).allowed, true)
assert.equal(authorizeMcpAction('unknown', base).code, 'UNKNOWN_ACTION')
assert.equal(authorizeMcpAction('products.read', { ...base, user: null }).code, 'NO_SESSION')
assert.equal(authorizeMcpAction('products.read', { ...base, tenantId: 'tenant-b' }).code, 'TENANT_MISMATCH')
assert.equal(authorizeMcpAction('products.read', { ...base, enabledModules: { ...base.enabledModules, inventario: { enabled: false } } }).code, 'MODULE_DISABLED')
assert.equal(authorizeMcpAction('products.write', { ...base, user: { ...base.user, permissions: ['products:read'] } }).code, 'PERMISSION_DENIED')
assert.equal(authorizeMcpAction('products.read', { ...base, requestedBranchId: 'branch-b' }).code, 'BRANCH_DENIED')
assert.equal(authorizeMcpAction('products.read', { ...base, requestedBranchId: null }).branchId, 'branch-a')
assert.equal(parseMcpScopes('products:read reports:read').length, 2)
assert.deepEqual(parseMcpScopes('products:read bad:scope'), [])
assert.deepEqual(parseMcpScopes('products:read products:read'), ['products:read'])
assert.deepEqual(mcpAuditMetadata({ action: 'products.write', connector: 'claude', requestId: 'req-1', branchId: 'branch-a' }), { action: 'products.write', connector: 'claude', requestId: 'req-1', branchId: 'branch-a' })
assert.equal('token' in mcpAuditMetadata({ action: 'products.write', connector: 'claude' }), false)
console.log('mcp authorization tests: ok')
