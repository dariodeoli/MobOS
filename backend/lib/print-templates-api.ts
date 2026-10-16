import { requireSession } from './auth'
import { error, json } from './http'
import { prisma } from './prisma'
import { InputError } from './payment-input'
import { changeTemplate, createTemplate, getTemplateDefaults, listTemplates, readTemplate, setTemplateDefault } from './print-templates-store'

export async function templateApi(request: Request, operation: 'list' | 'create' | 'get' | 'patch' | 'delete' | 'action' | 'defaults-get' | 'defaults-put', id = '') {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, role: session.user.role, branchId: session.user.branchId }
  if (!['list', 'get', 'defaults-get'].includes(operation) && ctx.role !== 'ADMIN') return error('No autorizado.', 403)
  const url = new URL(request.url)
  try {
    if (operation === 'list') return json(await listTemplates(prisma, ctx, url.searchParams.get('kind')))
    if (operation === 'get') return json(await readTemplate(prisma, ctx, id))
    if (operation === 'defaults-get') return json(await getTemplateDefaults(prisma, ctx, url.searchParams.has('branchId') ? url.searchParams.get('branchId') || null : undefined, url.searchParams.get('kind')))
    // Limit before JSON parsing; templates are small declarative configurations.
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 65536) { await reader.cancel(); return error('La plantilla supera 64 KiB.', 413) }
      chunks.push(part.value)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    let body: unknown
    try { body = JSON.parse(raw) } catch { return error('JSON inválido.') }
    if (operation === 'create') return json(await createTemplate(prisma, ctx, body), { status: 201 })
    if (operation === 'defaults-put') return json(await setTemplateDefault(prisma, ctx, body))
    return json(await changeTemplate(prisma, ctx, id, operation, body), { status: operation === 'action' && (body as { action?: string })?.action === 'duplicate' ? 201 : 200 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    console.error('print-template operation failed', operation)
    return error('No se pudo procesar la plantilla.', 500)
  }
}
