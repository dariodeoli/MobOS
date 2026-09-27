import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { requireSession } from '../../../../../lib/auth'
import { conflictosDeContacto, conteosDe, fusionarEscalares, puedeUnificar, resumenMerge } from '../../../../../lib/customer-merge'

// Unificar clientes duplicados (#268): desde la ficha o la lista se busca el
// duplicado, se ve el preview de lo que se mueve y se elige la ficha principal.
// El duplicado no se borra: queda archivado con puntero a la principal para no
// romper enlaces, tokens ni historial. Solo ADMIN/GERENTE.

const texto = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '')

async function clienteDelTenant(id: string, tenant: string) {
  return prisma.customer.findFirst({
    where: { id: id.slice(0, 128), tenantId: tenant },
    select: {
      id: true, name: true, firstName: true, secondName: true, phone: true, countryCode: true, email: true, document: true,
      billingName: true, billingDocument: true, notes: true, publicNote: true, externalId: true, priceListId: true,
      creditLimitPyg: true, creditDays: true, insuranceEnabled: true, insuranceRatePct: true, loyaltyPointsPyg: true,
      acceptsEmailMarketing: true, acceptsSmsMarketing: true, acceptsWhatsappMarketing: true, taxExempt: true, tags: true,
      archivedAt: true, mergedIntoId: true,
    },
  })
}

function perfil(customer: Awaited<ReturnType<typeof clienteDelTenant>>) {
  if (!customer) return null
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    countryCode: customer.countryCode,
    email: customer.email,
    document: customer.document,
    tags: customer.tags,
    archivedAt: customer.archivedAt,
    mergedIntoId: customer.mergedIntoId,
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!puedeUnificar(session.user.role)) return error('Solo el dueño o gerencia pueden unificar clientes.', 403)
  const { id } = await context.params
  const otroId = (new URL(request.url).searchParams.get('with') || '').trim().slice(0, 128)
  if (!otroId || otroId === id) return error('Elegí otro cliente para unificar.')
  const [a, b] = await Promise.all([clienteDelTenant(id, session.user.tenantId), clienteDelTenant(otroId, session.user.tenantId)])
  if (!a || !b) return error('Cliente no encontrado.', 404)
  if (a.archivedAt || b.archivedAt) return error('Una de las fichas ya está fusionada; no se puede volver a unificar.', 409)
  const [conteosA, conteosB] = await Promise.all([conteosDe(prisma, a.id), conteosDe(prisma, b.id)])
  const comoPrincipalA = fusionarEscalares(a, b)
  const comoPrincipalB = fusionarEscalares(b, a)
  return json({
    a: { perfil: perfil(a), conteos: conteosA, rellenados: comoPrincipalA.rellenados },
    b: { perfil: perfil(b), conteos: conteosB, rellenados: comoPrincipalB.rellenados },
    conflictos: conflictosDeContacto(a, b),
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!puedeUnificar(session.user.role)) return error('Solo el dueño o gerencia pueden unificar clientes.', 403)
  const { id } = await context.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const duplicadoId = texto(body?.duplicateId, 128)
  const principalId = texto(body?.principalId, 128) || id.slice(0, 128)
  if (!duplicadoId || duplicadoId === principalId) return error('Elegí el cliente duplicado y la ficha principal.')
  if (![id.slice(0, 128), duplicadoId].includes(principalId)) return error('La ficha principal tiene que ser una de las dos.')

  const [principal, duplicado] = await Promise.all([
    clienteDelTenant(principalId, session.user.tenantId),
    clienteDelTenant(duplicadoId, session.user.tenantId),
  ])
  if (!principal || !duplicado) return error('Cliente no encontrado.', 404)
  if (principal.archivedAt || duplicado.archivedAt) return error('Una de las fichas ya está fusionada; no se puede volver a unificar.', 409)

  try {
    const resultado = await prisma.$transaction(async tx => {
      // 1) La principal manda: solo se completan huecos, puntos y etiquetas.
      const { data, rellenados } = fusionarEscalares(principal, duplicado)
      if (Object.keys(data).length) await tx.customer.update({ where: { id: principal.id }, data })

      // 2) Se repunta todo lo del duplicado a la principal.
      const movidos = await conteosDe(tx, duplicado.id)
      const repunte = { customerId: principal.id }
      await Promise.all([
        tx.order.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.quote.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerNote.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerFollowUp.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerNotice.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerAddress.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerPortalToken.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.deviceReportShare.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.loyaltyMovement.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.storeCredit.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.suspendedSale.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.supplyNeed.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.warrantyCase.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.serviceOrder.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.customerAuthorization.updateMany({ where: { customerId: duplicado.id }, data: repunte }),
        tx.inventoryUnit.updateMany({ where: { reservationCustomerId: duplicado.id }, data: { reservationCustomerId: principal.id } }),
      ])

      // 3) Tablas con índice único por cliente: se salta lo que chocaría.
      const omitidos: string[] = []
      const identidades = await tx.customerBillingIdentity.findMany({ where: { customerId: duplicado.id }, select: { id: true, name: true, document: true } })
      for (const identidad of identidades) {
        const choque = await tx.customerBillingIdentity.findFirst({ where: { customerId: principal.id, document: identidad.document } })
        if (choque) { omitidos.push(`titular ${identidad.document}`); continue }
        await tx.customerBillingIdentity.update({ where: { id: identidad.id }, data: { customerId: principal.id } })
      }
      const destinatarios = await tx.marketingRecipient.findMany({ where: { customerId: duplicado.id }, select: { id: true, campaignId: true } })
      for (const destinatario of destinatarios) {
        const choque = await tx.marketingRecipient.findFirst({ where: { customerId: principal.id, campaignId: destinatario.campaignId } })
        if (choque) { omitidos.push('envío de campaña'); continue }
        await tx.marketingRecipient.update({ where: { id: destinatario.id }, data: { customerId: principal.id } })
      }

      // 4) El duplicado queda archivado con puntero (no se borra).
      await tx.customer.update({ where: { id: duplicado.id }, data: { archivedAt: new Date(), mergedIntoId: principal.id } })
      const resumen = resumenMerge(movidos)
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: 'CUSTOMER_MERGED',
          entity: 'Customer',
          entityId: principal.id,
          metadata: { duplicadoId: duplicado.id, duplicado: duplicado.name, movidos, rellenados, omitidos, resumen },
        },
      })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: 'CUSTOMER_MERGED_INTO',
          entity: 'Customer',
          entityId: duplicado.id,
          metadata: { principalId: principal.id, principal: principal.name, resumen },
        },
      })
      return { movidos, rellenados, omitidos, resumen }
    })
    return json({ ok: true, principalId: principal.id, duplicadoId: duplicado.id, ...resultado })
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudieron unificar los clientes.', 409)
  }
}
