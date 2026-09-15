import { timingSafeEqual } from 'node:crypto'
import { dispatchPendingEmailOutbox } from '../../../../lib/email-outbox'
import { error, json } from '../../../../lib/http'

function authorized(request: Request) {
  const expected = process.env.MOBOS_MAINTENANCE_TOKEN || ''
  const actual = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!expected || !actual) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Scheduler-safe retry entrypoint. Delivery is at-least-once across relay crash windows.
export async function POST(request: Request) {
  if (!process.env.MOBOS_MAINTENANCE_TOKEN) return error('El mantenimiento programado todavía no está configurado.', 503)
  if (!authorized(request)) return error('No autorizado.', 401)
  const results = await dispatchPendingEmailOutbox()
  return json({
    processed: results.length,
    sent: results.filter(result => result.state === 'sent').length,
    retryable: results.filter(result => result.state === 'retryable').length,
    failed: results.filter(result => result.state === 'failed').length,
    checkedAt: new Date().toISOString(),
  })
}
