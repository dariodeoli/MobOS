import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { dbNow, requireMcpAccessToken } from '../../../../lib/mcp/oauth'
import { authorizeMcpAction } from '../../../../lib/mcp/authorization'
import { moduleStoreFrom } from '../../../../lib/module-store'
import { changePayloadHash, validateChange } from '../../../../lib/mcp/changes'
import { updateProductPrice, ProductPriceError } from '../../../../lib/product-price'
import { generateProductImagesBase64, persistProductImage, ProductImageError, serializeProductImage } from '../../../../lib/product-images'
import { createCustomer, updateCustomer, CustomerServiceError } from '../../../../lib/customer-service'
import { readTenantCompanyProfile, updateTenantCompanyProfile, CompanyReauthenticationRequiredError, TENANT_COMPANY_PROFILE_FIELDS } from '../../../../lib/tenant-company-profile'

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
  if (!['prices.write', 'product_images.write', 'customers.write', 'company.write'].includes(checked.action)) return json('mutacion_no_disponible', 501)
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
    const expiresAt = new Date((await dbNow(prisma)).getTime() + TTL_MS)
    if (checked.action === 'company.write') {
      let before
      try { before = await readTenantCompanyProfile({ tenantId: auth.tenantId, actorUserId: auth.user.id }) } catch { return json('empresa_no_disponible', 404) }
      const fields = Object.fromEntries(Object.entries(checked.payload).filter(([key]) => (TENANT_COMPANY_PROFILE_FIELDS as readonly string[]).includes(key)))
      if (!Object.keys(fields).length) return json('empresa_sin_cambios')
      const after = { ...before, ...fields }
      const existing = await prisma.mcpChangePreview.findUnique({ where: { grantId_idempotencyKey: { grantId: auth.grantId, idempotencyKey } } })
      if (existing) { if (existing.action !== checked.action || existing.payloadHash !== hash) return json('idempotencia_reutilizada', 409); return NextResponse.json({ previewId: existing.id, action: existing.action, payloadHash: existing.payloadHash, status: existing.status, expiresAt: existing.expiresAt, before: existing.before, after: existing.after, resultEntity: existing.resultEntity, resultId: existing.resultId }, { headers: { 'Cache-Control': 'no-store' } }) }
      const preview = await prisma.mcpChangePreview.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, grantId: auth.grantId, clientId: auth.clientId, sessionId: auth.sessionId, action: checked.action, payloadHash: hash, payload: checked.payload as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, idempotencyKey, expiresAt } })
      await prisma.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_PREVIEWED', entity: 'McpChangePreview', entityId: preview.id, metadata: { action: checked.action, payloadHash: hash } } })
      return NextResponse.json({ previewId: preview.id, action: preview.action, payloadHash: hash, status: preview.status, expiresAt, before, after }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }
    if (checked.action === 'customers.write') {
      const operation = checked.payload.operation === 'update' ? 'update' : 'create'
      const customer = operation === 'update' ? await prisma.customer.findFirst({ where: { id: String(checked.payload.customerId), tenantId: auth.tenantId }, include: { addresses: true } }) : null
      if (operation === 'update' && !customer) return json('cliente_no_disponible', 404)
      const before = safe(customer ? { id: customer.id, name: customer.name, document: customer.document, phone: customer.phone, email: customer.email, addresses: customer.addresses } : null)
      const after = safe({ ...before, ...(operation === 'create' ? { name: checked.payload.name ?? checked.payload.firstName } : {}), ...Object.fromEntries(['name', 'firstName', 'secondName', 'document', 'phone', 'countryCode', 'email', 'addresses'].filter(key => Object.hasOwn(checked.payload, key)).map(key => [key, checked.payload[key]])) })
      const existing = await prisma.mcpChangePreview.findUnique({ where: { grantId_idempotencyKey: { grantId: auth.grantId, idempotencyKey } } })
      if (existing) { if (existing.action !== checked.action || existing.payloadHash !== hash) return json('idempotencia_reutilizada', 409); return NextResponse.json({ previewId: existing.id, action: existing.action, payloadHash: existing.payloadHash, status: existing.status, expiresAt: existing.expiresAt, before: existing.before, after: existing.after, resultEntity: existing.resultEntity, resultId: existing.resultId }, { headers: { 'Cache-Control': 'no-store' } }) }
      const preview = await prisma.mcpChangePreview.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, grantId: auth.grantId, clientId: auth.clientId, sessionId: auth.sessionId, action: checked.action, payloadHash: hash, payload: checked.payload as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, idempotencyKey, expiresAt } })
      await prisma.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_PREVIEWED', entity: 'McpChangePreview', entityId: preview.id, metadata: { action: checked.action, payloadHash: hash } } })
      return NextResponse.json({ previewId: preview.id, action: preview.action, payloadHash: hash, status: preview.status, expiresAt, before, after }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }
    if (checked.action === 'product_images.write') {
      let generated
      try { generated = await generateProductImagesBase64(checked.payload.dataBase64, checked.payload.contentType) }
      catch (error) { if (error instanceof ProductImageError) return json('imagen_invalida', error.status, { detail: error.message }); return json('imagen_invalida') }
      const product = await prisma.product.findFirst({ where: { id: String(checked.payload.productId), tenantId: auth.tenantId, isActive: true, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true, name: true, sku: true, branchId: true } })
      if (!product) return json('producto_no_disponible', 404)
      const active = await prisma.productImage.count({ where: { tenantId: auth.tenantId, productId: product.id, deletedAt: null } })
      if (active >= 12) return json('limite_imagenes', 409)
      const before = safe({ productId: product.id, name: product.name, sku: product.sku, branchId: product.branchId, imageCount: active })
      const after = { ...before, image: { contentType: generated.image.mimeType, width: generated.image.width, height: generated.image.height, sizeBytes: generated.image.sizeBytes, sha256: generated.image.sha256 }, thumb: { width: generated.thumb.width, height: generated.thumb.height, sizeBytes: generated.thumb.sizeBytes, sha256: generated.thumb.sha256 } }
      const existing = await prisma.mcpChangePreview.findUnique({ where: { grantId_idempotencyKey: { grantId: auth.grantId, idempotencyKey } } })
      if (existing) {
        if (existing.action !== checked.action || existing.payloadHash !== hash) return json('idempotencia_reutilizada', 409)
        return NextResponse.json({ previewId: existing.id, action: existing.action, payloadHash: existing.payloadHash, status: existing.status, expiresAt: existing.expiresAt, before: existing.before, after: existing.after, resultEntity: existing.resultEntity, resultId: existing.resultId }, { headers: { 'Cache-Control': 'no-store' } })
      }
      const preview = await prisma.mcpChangePreview.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, grantId: auth.grantId, clientId: auth.clientId, sessionId: auth.sessionId, action: checked.action, payloadHash: hash, payload: checked.payload as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, idempotencyKey, expiresAt } })
      await prisma.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_PREVIEWED', entity: 'McpChangePreview', entityId: preview.id, metadata: { action: checked.action, payloadHash: hash } } })
      return NextResponse.json({ previewId: preview.id, action: checked.action, payloadHash: hash, status: preview.status, expiresAt, before, after }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }
    const product = await prisma.product.findFirst({ where: { id: String(checked.payload.productId), tenantId: auth.tenantId, isActive: true, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true, name: true, sku: true, pricePyg: true, branchId: true } })
    if (!product) return json('producto_no_disponible', 404)
    if (Number(product.pricePyg) !== checked.payload.expectedPricePyg) return json('precio_desactualizado', 409, { currentPricePyg: Number(product.pricePyg) })
    const before = safe({ id: product.id, name: product.name, sku: product.sku, pricePyg: product.pricePyg, branchId: product.branchId })
    const after = { ...before, pricePyg: checked.payload.pricePyg }
    const existing = await prisma.mcpChangePreview.findUnique({ where: { grantId_idempotencyKey: { grantId: auth.grantId, idempotencyKey } } })
    if (existing) {
      if (existing.action !== checked.action || existing.payloadHash !== hash) return json('idempotencia_reutilizada', 409)
      return NextResponse.json({ previewId: existing.id, action: existing.action, payloadHash: existing.payloadHash, status: existing.status, expiresAt: existing.expiresAt, before: existing.before, after: existing.after, resultEntity: existing.resultEntity, resultId: existing.resultId }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const preview = await prisma.mcpChangePreview.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, grantId: auth.grantId, clientId: auth.clientId, sessionId: auth.sessionId, action: checked.action, payloadHash: hash, payload: checked.payload as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, idempotencyKey, expiresAt } })
    await prisma.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_PREVIEWED', entity: 'McpChangePreview', entityId: preview.id, metadata: { action: checked.action, payloadHash: hash } } })
    return NextResponse.json({ previewId: preview.id, action: checked.action, payloadHash: hash, status: preview.status, expiresAt, before, after }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }
  if (typeof body.previewId !== 'string' || body.previewId.length > 100) return json('preview_requerido')
  const preview = await prisma.mcpChangePreview.findFirst({ where: { id: body.previewId, tenantId: auth.tenantId, userId: auth.user.id, grantId: auth.grantId, clientId: auth.clientId, sessionId: auth.sessionId } })
  if (!preview) return json('preview_invalido', 409)
  if (preview.status === 'COMMITTED' && preview.payloadHash === hash) return NextResponse.json({ committed: true, idempotent: true, previewId: preview.id, entity: preview.resultEntity, entityId: preview.resultId }, { headers: { 'Cache-Control': 'no-store' } })
  const now = await dbNow(prisma)
  if (preview.status !== 'PREVIEW' || preview.expiresAt <= now) return json('preview_invalido', 409)
  if (preview.action !== checked.action || preview.payloadHash !== hash) return json('payload_no_coincide', 409)
  if (checked.action === 'product_images.write') {
    let generated
    try { generated = await generateProductImagesBase64(checked.payload.dataBase64, checked.payload.contentType) }
    catch (error) { if (error instanceof ProductImageError) return json('imagen_invalida', error.status, { detail: error.message }); return json('imagen_invalida') }
    try {
      const created = await persistProductImage({ db: prisma as any, tenantId: auth.tenantId, userId: auth.user.id, productId: String(checked.payload.productId), branchId: decision.branchId, canManage: decision.allowed, image: generated.image, thumb: generated.thumb, variantKey: typeof checked.payload.variantKey === 'string' ? checked.payload.variantKey : null, provenance: 'mcp', onPersisted: async (tx, row) => {
        const claimed = await tx.mcpChangePreview.updateMany({ where: { id: preview.id, status: 'PREVIEW', expiresAt: { gt: now }, payloadHash: hash }, data: { status: 'COMMITTED', committedAt: now, resultEntity: 'ProductImage', resultId: row.id } })
        if (claimed.count !== 1) throw new ProductImageError(409, 'preview_invalido')
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_COMMITTED', entity: 'ProductImage', entityId: row.id, metadata: { action: checked.action, previewId: preview.id, payloadHash: hash, idempotencyKey: preview.idempotencyKey } } })
      } })
      return NextResponse.json({ committed: true, entity: 'ProductImage', entityId: created.id, previewId: preview.id }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof ProductImageError) return json(error.message === 'preview_invalido' ? 'preview_invalido' : 'imagen_no_guardada', error.status, { detail: error.message })
      return json('imagen_no_guardada', 500)
    }
  }
  if (checked.action === 'customers.write') {
    try {
      const result = await prisma.$transaction(async tx => {
        const actor = { id: auth.user.id, tenantId: auth.tenantId, role: auth.user.role, permissions: auth.user.permissions }
        const customer = checked.payload.operation === 'update'
          ? await updateCustomer(tx, actor, String(checked.payload.customerId), checked.payload as any)
          : await createCustomer(tx, actor, checked.payload as any)
        const claimed = await tx.mcpChangePreview.updateMany({ where: { id: preview.id, status: 'PREVIEW', expiresAt: { gt: now }, payloadHash: hash }, data: { status: 'COMMITTED', committedAt: now, resultEntity: 'Customer', resultId: customer.id } })
        if (claimed.count !== 1) throw new CustomerServiceError('conflict', 'preview_invalido')
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_COMMITTED', entity: 'Customer', entityId: customer.id, metadata: { action: checked.action, previewId: preview.id, payloadHash: hash, idempotencyKey: preview.idempotencyKey } } })
        return customer
      })
      return NextResponse.json({ committed: true, entity: 'Customer', entityId: result.id, previewId: preview.id, customer: safe(result) }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof CustomerServiceError) return json(error.message === 'preview_invalido' ? 'preview_invalido' : `cliente_${error.code}`, error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : 400)
      return json('cliente_no_guardado', 500)
    }
  }
  if (checked.action === 'company.write') {
    try {
      const result = await prisma.$transaction(async tx => {
        const fields = Object.fromEntries(Object.entries(checked.payload).filter(([key]) => (TENANT_COMPANY_PROFILE_FIELDS as readonly string[]).includes(key)))
        const company = await updateTenantCompanyProfile({ db: tx, tenantId: auth.tenantId, actorUserId: auth.user.id, sessionId: auth.sessionId, fields })
        const claimed = await tx.mcpChangePreview.updateMany({ where: { id: preview.id, status: 'PREVIEW', expiresAt: { gt: now }, payloadHash: hash }, data: { status: 'COMMITTED', committedAt: now, resultEntity: 'Tenant', resultId: auth.tenantId } })
        if (claimed.count !== 1) throw new Error('preview_invalido')
        await tx.auditLog.create({ data: { tenantId: auth.tenantId, userId: auth.user.id, action: 'MCP_CHANGE_COMMITTED', entity: 'Tenant', entityId: auth.tenantId, metadata: { action: checked.action, previewId: preview.id, payloadHash: hash, idempotencyKey: preview.idempotencyKey } } })
        return company
      })
      return NextResponse.json({ committed: true, entity: 'Tenant', entityId: auth.tenantId, previewId: preview.id, company: safe(result) }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof CompanyReauthenticationRequiredError) return json('reauth_required', 403)
      if (error instanceof Error && error.message === 'preview_invalido') return json('preview_invalido', 409)
      return json('empresa_no_actualizada', 400)
    }
  }
  const current = await prisma.product.findFirst({ where: { id: String(checked.payload.productId), tenantId: auth.tenantId, isActive: true, ...(decision.branchId ? { OR: [{ branchId: decision.branchId }, { branchId: null }] } : {}) }, select: { id: true, pricePyg: true } })
  if (!current || Number(current.pricePyg) !== checked.payload.expectedPricePyg) return json('precio_desactualizado', 409, { currentPricePyg: current ? Number(current.pricePyg) : null })
  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.mcpChangePreview.updateMany({ where: { id: preview.id, status: 'PREVIEW', expiresAt: { gt: now } }, data: { status: 'COMMITTED', committedAt: now } })
    if (claimed.count !== 1) throw new Error('preview_invalido')
    const p = checked.payload
    let entity = 'Tenant'; let entityId = auth.tenantId
    if (checked.action === 'products.write') {
      const product = await tx.product.create({ data: { tenantId: auth.tenantId, branchId: branchId, sku: String(p.sku), name: String(p.name), category: typeof p.category === 'string' ? p.category : null, pricePyg: BigInt(typeof p.pricePyg === 'number' ? p.pricePyg : 0), stock: typeof p.stock === 'number' ? p.stock : 0 } })
      entity = 'Product'; entityId = product.id
    } else if (checked.action === 'prices.write') {
      try {
        const changed = await updateProductPrice({ tenantId: auth.tenantId, user: auth.user, productId: String(p.productId), pricePyg: Number(p.pricePyg), expectedPricePyg: Number(p.expectedPricePyg), includeAudit: true }, tx)
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
