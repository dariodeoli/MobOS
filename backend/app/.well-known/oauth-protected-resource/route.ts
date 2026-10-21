import { NextResponse } from 'next/server'
import { mcpIssuer, mcpResource, McpOAuthError } from '../../../lib/mcp/oauth'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const issuer = mcpIssuer(); const resource = mcpResource()
    return NextResponse.json({ resource, authorization_servers: [issuer], scopes_supported: ['products:read', 'products:write', 'prices:write', 'customers:read', 'customers:write', 'company:read', 'company:write', 'sales:read', 'sales:write', 'reports:read', 'product_images:write'], bearer_methods_supported: ['header'] }, { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'OAuth no está configurado.', 500)
    return NextResponse.json({ error: cause.code }, { status: cause.status })
  }
}
