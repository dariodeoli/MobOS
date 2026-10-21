/** Native OAuth clients may omit Origin. Browser origins must match an exact allowlist. */
export function mcpOriginAllowed(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  let url: URL
  try { url = new URL(origin) } catch { return false }
  const configured = (process.env.MOBOS_MCP_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (configured.includes(url.origin)) return true
  try { return url.origin === new URL(request.url).origin } catch { return false }
}
export function mcpJsonRequest(request: Request) {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}
