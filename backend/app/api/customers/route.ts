import { prisma } from '../../../lib/prisma'
import { error, json, tenantId } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function addressesInput(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 10) throw new Error('Podés guardar hasta 10 direcciones.')
  const addresses = value.map((row, index) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const address = clean(item.address, 400)
    if (!address) throw new Error('Cada dirección debe incluir su detalle.')
    return {
      label: clean(item.label, 80) || `Dirección ${index + 1}`,
      address,
      city: clean(item.city, 100) || null,
      department: clean(item.department, 100) || null,
      country: clean(item.country, 100) || 'Paraguay',
      notes: clean(item.notes, 400) || null,
      isDefault: item.isDefault === true,
    }
  })
  return addresses.map((address, index) => ({ ...address, isDefault: address.isDefault || (index === 0 && !addresses.some(item => item.isDefault)) }))
}

function esMayorista(customer: { pricingTier?: string | null }) {
  return customer.pricingTier === 'WHOLESALE'
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const q = params.get('q') || ''
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 50))
  const cursor = params.get('cursor')
  // Búsqueda flexible: nombre, teléfono, CI/RUC, correo, datos de facturación
  // del cliente y también pedidos facturados a otro titular (razón social/RUC),
  // para poder llegar al cliente desde el nombre que salió en la factura.
  const data = await prisma.customer.findMany({ where: { tenantId: tenant, ...(q ? { OR: [
    { name: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q } },
    { document: { contains: q } },
    { email: { contains: q, mode: 'insensitive' } },
    { billingName: { contains: q, mode: 'insensitive' } },
    { billingDocument: { contains: q } },
    { tags: { has: q } },
    { notes: { contains: q, mode: 'insensitive' } },
    { addresses: { some: { OR: [
      { city: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
      { label: { contains: q, mode: 'insensitive' } },
    ] } } },
    { orders: { some: { OR: [{ billingName: { contains: q, mode: 'insensitive' } }, { billingDocument: { contains: q } }] } } },
  ] } : {}) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
  const ids = data.map((customer) => customer.id)
  const stats = await prisma.order.groupBy({
    by: ['customerId'],
    where: { tenantId: tenant, customerId: { in: ids }, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { totalPyg: true },
    _max: { createdAt: true },
  })
  const statsPorCliente = new Map(stats.map((fila) => [fila.customerId, { orders: fila._count._all, totalSpentPyg: fila._sum.totalPyg ?? 0, lastOrderAt: fila._max.createdAt }]))
  return json(data.map((customer) => ({ ...customer, wholesale: esMayorista(customer), stats: statsPorCliente.get(customer.id) || { orders: 0, totalSpentPyg: 0, lastOrderAt: null } })))
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  try {
    const body = await request.json() as Record<string, unknown>
    if (Array.isArray(body.rows)) return importarClientes(tenant, body.rows)
    const name = clean(body.name, 200)
    if (!name) return error('El nombre es obligatorio.')
    const document = clean(body.document, 100) || null
    const phone = clean(body.phone, 100) || null
    const countryCode = typeof body.countryCode === 'string' && /^\+\d{1,4}$/.test(body.countryCode) ? body.countryCode : '+595'
    const tags = Array.isArray(body.tags) ? body.tags.map((tag) => clean(tag, 50)).filter(Boolean).slice(0, 20) : []
    const pricingTier: 'RETAIL' | 'WHOLESALE' = body.pricingTier === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL'
    const creditLimitPyg = body.creditLimitPyg === undefined || body.creditLimitPyg === '' || body.creditLimitPyg === null ? undefined : Number(body.creditLimitPyg)
    if (creditLimitPyg !== undefined && (!Number.isSafeInteger(creditLimitPyg) || creditLimitPyg < 0 || creditLimitPyg > 2147483647)) return error('Límite de crédito inválido.')
    const creditDays = body.creditDays === undefined || body.creditDays === '' || body.creditDays === null ? undefined : Number(body.creditDays)
    if (creditDays !== undefined && (!Number.isSafeInteger(creditDays) || creditDays < 0 || creditDays > 365)) return error('Plazo de crédito inválido (0 a 365 días).')
    const fields = {
      name, phone, countryCode, email: clean(body.email, 200) || null, document,
      // Solo se tocan cuando llegan: una ficha guardada no pierde sus datos de
      // facturación por un guardado que no los incluye.
      ...(body.billingName === undefined ? {} : { billingName: clean(body.billingName, 200) || null }),
      ...(body.billingDocument === undefined ? {} : { billingDocument: clean(body.billingDocument, 100) || null }),
      notes: clean(body.notes, 2000) || null,
      externalId: clean(body.externalId, 100) || null,
      acceptsEmailMarketing: body.acceptsEmailMarketing === true,
      acceptsSmsMarketing: body.acceptsSmsMarketing === true,
      acceptsWhatsappMarketing: body.acceptsWhatsappMarketing === true,
      taxExempt: body.taxExempt === true,
      tags,
      pricingTier,
      ...(creditLimitPyg !== undefined ? { creditLimitPyg } : {}),
      ...(creditDays !== undefined ? { creditDays } : {}),
    }
    const addresses = addressesInput(body.addresses)
    const existing = document
      ? await prisma.customer.findFirst({ where: { tenantId: tenant, document } })
      : phone ? await prisma.customer.findFirst({ where: { tenantId: tenant, phone } }) : fields.externalId ? await prisma.customer.findFirst({ where: { tenantId: tenant, externalId: fields.externalId } }) : null
    const data = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { ...fields, ...(addresses === undefined ? {} : { addresses: { deleteMany: {}, create: addresses } }) }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } })
      : await prisma.customer.create({ data: { tenantId: tenant, ...fields, ...(addresses ? { addresses: { create: addresses } } : {}) }, include: { addresses: true } })
    return json(data, { status: existing ? 200 : 201 })
  } catch (cause) { return error(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.') }
}

// Importa fichas en lote (export de otro sistema). Deduplica por documento,
// teléfono o id externo; nunca pisa fichas existentes. Devuelve el conteo.
async function importarClientes(tenant: string, rows: unknown) {
  const entrada = Array.isArray(rows) ? rows.slice(0, 500) : []
  if (entrada.length === 0) return error('Enviá al menos una fila para importar.', 400)
  const normalizadas = entrada.map((row, indice) => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    const name = clean(item.name, 200)
    const document = clean(item.document, 100) || null
    const phone = clean(item.phone, 100) || null
    const externalId = clean(item.externalId, 100) || null
    if (!name && !phone) return null
    const countryCode = typeof item.countryCode === 'string' && /^\+\d{1,4}$/.test(item.countryCode) ? item.countryCode : '+595'
    return {
      name: name || phone || '',
      phone,
      countryCode,
      document,
      externalId,
      email: clean(item.email, 200) || null,
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => clean(tag, 50)).filter(Boolean).slice(0, 20) : [],
      acceptsEmailMarketing: item.acceptsEmailMarketing === true,
      acceptsSmsMarketing: item.acceptsSmsMarketing === true,
      acceptsWhatsappMarketing: item.acceptsWhatsappMarketing === true,
      taxExempt: item.taxExempt === true,
      addresses: (() => { try { return addressesInput(item.addresses) } catch { return undefined } })(),
    }
  }).filter((fila) => fila !== null)

  let creadas = 0
  let saltadas = 0
  const vistosDocumento = new Set<string>()
  const vistosTelefono = new Set<string>()
  const vistosExterno = new Set<string>()
  for (const fila of normalizadas) {
    if (!fila) continue
    const duplicadoLocal = (fila.document && vistosDocumento.has(fila.document)) || (fila.phone && vistosTelefono.has(fila.phone)) || (fila.externalId && vistosExterno.has(fila.externalId))
    if (duplicadoLocal) { saltadas += 1; continue }
    const existente = await prisma.customer.findFirst({
      where: { tenantId: tenant, OR: [{ document: fila.document ?? undefined }, { phone: fila.phone ?? undefined }, { externalId: fila.externalId ?? undefined }].filter((criterio) => Object.values(criterio)[0] !== undefined) },
      select: { id: true },
    })
    if (existente) { saltadas += 1; continue }
    if (fila.document) vistosDocumento.add(fila.document)
    if (fila.phone) vistosTelefono.add(fila.phone)
    if (fila.externalId) vistosExterno.add(fila.externalId)
    try {
      await prisma.customer.create({
        data: {
          tenantId: tenant, name: fila.name, phone: fila.phone, countryCode: fila.countryCode, document: fila.document,
          externalId: fila.externalId, email: fila.email, tags: fila.tags,
          acceptsEmailMarketing: fila.acceptsEmailMarketing, acceptsSmsMarketing: fila.acceptsSmsMarketing,
          acceptsWhatsappMarketing: fila.acceptsWhatsappMarketing, taxExempt: fila.taxExempt,
          ...(fila.addresses?.length ? { addresses: { create: fila.addresses } } : {}),
        },
      })
      creadas += 1
    } catch { saltadas += 1 }
  }
  return json({ created: creadas, skipped: saltadas, total: entrada.length })
}
