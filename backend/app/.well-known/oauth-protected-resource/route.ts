import { NextResponse } from 'next/server'
import { mcpIssuer, mcpResource, McpOAuthError } from '../../../lib/mcp/oauth'
import { IMPLEMENTED_MCP_SCOPES } from '../../../lib/mcp/catalog'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const issuer = mcpIssuer(); const resource = mcpResource()
    return NextResponse.json({ resource, authorization_servers: [issuer], scopes_supported: [...IMPLEMENTED_MCP_SCOPES], bearer_methods_supported: ['header'] }, { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch (error) {
    const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'OAuth no está configurado.', 500)
    return NextResponse.json({ error: cause.code }, { status: cause.status })
  }
}
