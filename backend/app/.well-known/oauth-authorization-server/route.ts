import { NextResponse } from 'next/server'
import { oauthMetadata, McpOAuthError } from '../../../lib/mcp/oauth'
export const dynamic = 'force-dynamic'
export async function GET() { try { return NextResponse.json(oauthMetadata(), { headers: { 'Cache-Control': 'public, max-age=300' } }) } catch (error) { const cause = error instanceof McpOAuthError ? error : new McpOAuthError('server_error', 'OAuth no está configurado.', 500); return NextResponse.json({ error: cause.code }, { status: cause.status }) } }
