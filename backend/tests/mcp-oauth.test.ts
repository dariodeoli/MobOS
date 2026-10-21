export {}
const assert = require('node:assert/strict')
const { actionForScope } = require('../lib/mcp/catalog')
const { sameOriginForMcp } = require('../lib/google-oauth')
const { assertScopeActions, normalizeMcpScopes, pkceChallenge, validPkceVerifier, configuredMcpClients, findMcpClient, oauthMetadata } = require('../lib/mcp/oauth')
const verifier = 'a'.repeat(43)
assert.equal(validPkceVerifier(verifier, pkceChallenge(verifier)), true)
assert.equal(validPkceVerifier('b'.repeat(43), pkceChallenge(verifier)), false)
assert.equal(validPkceVerifier('short', pkceChallenge(verifier)), false)
assert.deepEqual(normalizeMcpScopes('products:read reports:read'), ['products:read', 'reports:read'])
assert.deepEqual(normalizeMcpScopes(['products:read', 'products:read']), ['products:read'])
assert.deepEqual(normalizeMcpScopes('products:read unknown'), [])
assert.equal(actionForScope('products:read'), 'products.read')
assert.equal(actionForScope('sql:read'), null)
const beforeApp = process.env.MOBOS_APP_URL
const beforeIssuer = process.env.MOBOS_MCP_ISSUER
process.env.MOBOS_APP_URL = 'https://app.moboss.online'
process.env.MOBOS_MCP_ISSUER = 'https://api.moboss.online'
process.env.MOBOS_MCP_RESOURCE = 'https://api.moboss.online'
const metadata = oauthMetadata()
assert.equal(metadata.authorization_response_iss_parameter_supported, true)
assert.equal(sameOriginForMcp(new Request('https://api.moboss.online/api/mcp/authorize', { headers: { origin: 'https://api.moboss.online' } })), true)
assert.equal(sameOriginForMcp(new Request('https://app.moboss.online/api/mcp/authorize', { headers: { origin: 'https://app.moboss.online' } })), true)
assert.equal(sameOriginForMcp(new Request('https://api.moboss.online/api/mcp/authorize', { headers: { origin: 'https://evil.example' } })), false)
assert.equal(sameOriginForMcp(new Request('https://api.moboss.online/api/mcp/authorize')), false)
if (beforeApp === undefined) delete process.env.MOBOS_APP_URL; else process.env.MOBOS_APP_URL = beforeApp
if (beforeIssuer === undefined) delete process.env.MOBOS_MCP_ISSUER; else process.env.MOBOS_MCP_ISSUER = beforeIssuer
if (process.env.MOBOS_MCP_RESOURCE === 'https://api.moboss.online') delete process.env.MOBOS_MCP_RESOURCE
assert.throws(() => assertScopeActions(['bad:scope']), /scope/i)
const before = process.env.MOBOS_MCP_CLIENTS_JSON
process.env.MOBOS_MCP_CLIENTS_JSON = JSON.stringify([{ clientId: 'claude', name: 'Claude', redirectUris: ['https://claude.example/callback'] }, { clientId: 'bad', redirectUris: ['http://insecure/callback'] }])
assert.equal(configuredMcpClients().length, 1)
assert.ok(findMcpClient('claude', 'https://claude.example/callback'))
assert.equal(findMcpClient('claude', 'https://other.example/callback'), null)
if (before === undefined) delete process.env.MOBOS_MCP_CLIENTS_JSON; else process.env.MOBOS_MCP_CLIENTS_JSON = before
console.log('mcp oauth tests: ok')
