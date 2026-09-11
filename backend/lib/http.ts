import { NextResponse } from 'next/server'

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function error(message: string, status = 400, details?: unknown) {
  return json({ message, ...(details === undefined ? {} : { details }) }, { status })
}

export function tenantId(request: Request) {
  return request.headers.get('x-tenant-id') || process.env.MOBOS_DEFAULT_TENANT_ID || null
}
