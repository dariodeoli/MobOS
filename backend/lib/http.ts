import { NextResponse } from 'next/server'
import { requireSession } from './auth'

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function error(message: string, status = 400, details?: unknown) {
  return json({ message, ...(details === undefined ? {} : { details }) }, { status })
}

export async function tenantId(request: Request) {
  const session = await requireSession(request)
  return session?.user.tenantId ?? null
}
