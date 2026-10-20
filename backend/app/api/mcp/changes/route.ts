import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { requireMcpAccessToken } from '../../../../lib/mcp/oauth'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { changePayloadHash, validateChange } from '../../../../lib/mcp/changes'
import { updateProductPrice, ProductPriceError } from '../../../../lib/product-price'

export const dynamic = 'force-dynamic'
const TTL_MS = 10 * 60 * 1000
function json(error: string, status = 400, extra: Record<string, unknown> = {}) { return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } }) }
function safe(value: unknown) { return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v)) }

export async function POST(request: Request) {
  const auth = await requireMcpAccessToken(request)
  if (!auth) return json('invalid_token', 401)
  let body: any
  try { body = await request.json() } catch { return json('json_invalido') }
  const mode = body?.mode === 'commit' ? 'commit' : body?.mode === 'preview' ? 'preview' : null
  if (!mode) return json('modo_invalido')
  const checked = validateChange(body.action, body.payload)
  if (!checked.ok) return json(checked.error)
  // Other mutation domains remain disabled until their existing application
  // services are extracted and reused here. This endpoint must not create a
  // second, weaker CRUD path.
  if (checked.action !== 'prices.write') return json('mutacion_no_disponible', 501)
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { id: true, settings: true } })
  if (!tenant) return json('empresa_no_disponible', 404)
  const modules = moduleStoreFrom(tenant.settings).modules
  const branchId = typeof checked.payload.branchId === 'string' ? checked.payload.branchId : null
  const decision = authorizeMcpAction(checked.action, { tenantId: auth.tenantId, user: auth.user, enabledModules: modules, grantedScopes: auth.scopes, requestedBranchId: branchId })
  if (!decision.allowed) return json(decision.code.toLowerCase(), 403)
  const hash = changePayloadHash(checked.action, checked.payload)
  const idempotencyKey = typeof body.idempotencyKey === 'string' && /^[A-Za-z0-9._:-]{8,120}$/.test(body.idempotencyKey) ? body.idempotencyKey : ''
  if (!idempotencyKey) return json('idempotency_key_requerida')
  if (mode === 'preview') {
    const expiresAt = new Date(Date.now() + TTL_MS)
    const product = await prisma.product.findFirst({ where: { id: String(checked.payload.productId), tenantId: auth.tenantId, isActive: true, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true, name: true, sku: true, pricePyg: true, branchId: true } })
    if (!product) return json('producto_no_disponible', 404)
    if (Number(product.pricePyg) !== checked.payload.expectedPricePyg) return json('precio_desactualizado', 409, { currentPricePyg: Number(product.pricePyg) })
    const before = safe({ id: product.id, name: product.name, sku: product.sku, pricePyg: product.pricePyg, branchId: product.branchId })
    const after = { ...before, pricePyg: checked.payload.pricePyg }
    const existing = await prisma.mcpChangePreview.findUnique({ where: { tenantId_userId_idempotencyKey: { tenantId: auth.tenantId, userId: auth.user.id, idempotencyKey } } })
    if (existing) {
      if (existing.action !== checked.action || existing.payloadHash !== hash) return json('idempotencia_reutilizada', 409)
      return NextResponse.json({ previewId: existing.id, action: existing.action, payloadHash: existing.payloadHash, status: existing.status, expiresAt: existing.expiresAt, before: existing.before, after: existing.after, resultEntity: existing.resultEntity, resultId: existing.resultId }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const preview = await prisma.mcpChangePreview.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: checked.action, payloadHash: hash, payload: checked.payload as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, idempotencyKey, expiresAt } })
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_PREVIEWED', entity: 'McpChangePreview', entityId: preview.id, metadata: { action: checked.action, payloadHash: hash } } })
    return NextResponse.json({ previewId: preview.id, action: checked.action, payloadHash: hash, status: preview.status, expiresAt, before, after }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }
  if (typeof body.previewId !== 'string' || body.previewId.length > 100) return json('preview_requerido')
  const preview = await prisma.mcpChangePreview.findFirst({ where: { id: body.previewId, tenantId: auth.tenantId, userId: auth.user.id } })
  if (!preview) return json('preview_invalido', 409)
  if (preview.status === 'COMMITTED' && preview.payloadHash === hash) return NextResponse.json({ committed: true, idempotent: true, previewId: preview.id, entity: preview.resultEntity, entityId: preview.resultId }, { headers: { 'Cache-Control': 'no-store' } })
  if (preview.status !== 'PREVIEW' || preview.expiresAt <= new Date()) return json('preview_invalido', 409)
  if (preview.action !== checked.action || preview.payloadHash !== hash) return json('payload_no_coincide', 409)
  const current = await prisma.product.findFirst({ where: { id: String(checked.payload.productId), tenantId: auth.tenantId, isActive: true, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true, pricePyg: true } })
  if (!current || Number(current.pricePyg) !== checked.payload.expectedPricePyg) return json('precio_desactualizado', 409, { currentPricePyg: current ? Number(current.pricePyg) : null })
  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.mcpChangePreview.updateMany({ where: { id: preview.id, status: 'PREVIEW', expiresAt: { gt: new Date() } }, data: { status: 'COMMITTED', committedAt: new Date() } })
    if (claimed.count !== 1) throw new Error('preview_invalido')
    const p = checked.payload
    let entity = 'Tenant'; let entityId = auth.tenantId
    if (checked.action === 'products.write') {
      const product = await tx.product.create({ data: { tenantId: auth.tenantId, branchId: branchId, sku: String(p.sku), name: String(p.name), category: typeof p.category === 'string' ? p.category : null, pricePyg: BigInt(typeof p.pricePyg === 'number' ? p.pricePyg : 0), stock: typeof p.stock === 'number' ? p.stock : 0 } })
      entity = 'Product'; entityId = product.id
    } else if (checked.action === 'prices.write') {
      try {
        const changed = await updateProductPrice({ tenantId: auth.tenantId, user: auth.user, productId: String(p.productId), pricePyg: Number(p.pricePyg), expectedPricePyg: Number(p.expectedPricePyg) }, tx)
        entity = 'Product'; entityId = changed.productId
      } catch (error) { throw error instanceof ProductPriceError ? error : new Error('producto_precio_no_actualizado') }
    } else if (checked.action === 'customers.write') {
      const customer = await tx.customer.create({ data: { tenantId: auth.tenantId, createdById: auth.user.id, name: String(p.name), phone: typeof p.phone === 'string' ? p.phone : null, email: typeof p.email === 'string' ? p.email : null, document: typeof p.document === 'string' ? p.document : null } })
      entity = 'Customer'; entityId = customer.id
    } else if (checked.action === 'product_images.write') {
      const product = await tx.product.findFirst({ where: { id: String(p.productId), tenantId: auth.tenantId, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true } })
      if (!product) throw new Error('producto_no_disponible')
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(String(p.dataBase64)) || String(p.dataBase64).length % 4 !== 0) throw new Error('imagen_invalida')
      const data = Buffer.from(String(p.dataBase64), 'base64')
      if (data.length === 0 || data.length > 5_000_000) throw new Error('imagen_invalida')
      const image = await tx.productImage.create({ data: { tenantId: auth.tenantId, productId: product.id, data, width: Number(p.width), height: Number(p.height), contentType: String(p.contentType), sizeBytes: data.length, createdById: auth.user.id, isPrimary: p.isPrimary === true } })
      entity = 'ProductImage'; entityId = image.id
    } else {
      await tx.tenant.update({ where: { id: auth.tenantId }, data: { ...(typeof p.name === 'string' ? { name: p.name } : {}), ...(typeof p.email === 'string' ? { email: p.email } : {}) } })
    }
    await tx.mcpChangePreview.update({ where: { id: preview.id }, data: { resultEntity: entity, resultId: entityId } })
    await tx.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_COMMITTED', entity, entityId, metadata: { action: checked.action, previewId: preview.id, payloadHash: hash, idempotencyKey: preview.idempotencyKey } } })
    return { entity, entityId }
  }).catch(error => { if (error instanceof Error && ['preview_invalido', 'producto_no_disponible'].includes(error.message)) throw error; throw new Error('cambio_no_aplicado') })
  return NextResponse.json({ committed: true, ...safe(result), previewId: preview.id }, { headers: { 'Cache-Control': 'no-store' } })
}
