import type { Prisma, PrismaClient } from '@prisma/client'
import { effectivePermissions, hasPermission } from './auth'
import { correoCambioReseteaVerificacion } from './tenant-email'

type Db = PrismaClient | Prisma.TransactionClient

type Actor = {
  id: string
  tenantId: string
  role: string
  permissions?: string[] | null
  status?: string
}

export const TENANT_COMPANY_PROFILE_FIELDS = ['name', 'email', 'address', 'city', 'department', 'phone', 'ruc'] as const
export type TenantCompanyProfileField = typeof TENANT_COMPANY_PROFILE_FIELDS[number]
export type TenantCompanyProfile = {
  id: string
  name: string
  email: string | null
  address: string | null
  city: string | null
  department: string | null
  phone: string | null
  ruc: string | null
}

const SELECT = {
  id: true,
  name: true,
  email: true,
  address: true,
  city: true,
  department: true,
  phone: true,
  ruc: true,
} satisfies Prisma.TenantSelect

function text(value: unknown, field: string, min = 1, max = 500) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`${field} inválido.`)
  return value.trim()
}

function nullableText(value: unknown, field: string, max: number) {
  if (value === null || value === '') return null
  return text(value, field, 1, max)
}

function assertActor(actor: Actor, tenantId: string, mutation: boolean) {
  if (actor.tenantId !== tenantId) throw new Error('La sesión no pertenece a la empresa solicitada.')
  if (actor.status && actor.status !== 'ACTIVE') throw new Error('El usuario no está activo.')
  if (!hasPermission(actor as Parameters<typeof hasPermission>[0], 'dashboard:read')) throw new Error('El usuario no tiene permiso para consultar la empresa.')
  if (mutation && actor.role !== 'ADMIN') throw new Error('Solo el dueño puede editar los datos de la empresa.')
}

async function actorFor(db: Db, tenantId: string, actorUserId: string) {
  const actor = await db.user.findFirst({ where: { id: actorUserId, tenantId }, select: { id: true, tenantId: true, role: true, permissions: true, status: true } })
  if (!actor) throw new Error('El usuario no pertenece a la empresa.')
  const permissions = effectivePermissions(actor.role, actor.permissions)
  return { ...actor, permissions }
}

export async function readTenantCompanyProfile(input: { db?: Db; tenantId: string; actorUserId: string }): Promise<TenantCompanyProfile> {
  const db = input.db ?? (await import('./prisma')).prisma
  const actor = await actorFor(db, input.tenantId, input.actorUserId)
  assertActor(actor, input.tenantId, false)
  const tenant = await db.tenant.findUnique({ where: { id: input.tenantId }, select: SELECT })
  if (!tenant) throw new Error('Empresa no encontrada.')
  return tenant
}

export async function updateTenantCompanyProfile(input: {
  db?: Db
  tenantId: string
  actorUserId: string
  fields: Partial<Record<TenantCompanyProfileField, unknown>>
}): Promise<TenantCompanyProfile> {
  const db = input.db ?? (await import('./prisma')).prisma
  const actor = await actorFor(db, input.tenantId, input.actorUserId)
  assertActor(actor, input.tenantId, true)
  const fields = input.fields
  const keys = Object.keys(fields)
  if (!keys.length || keys.some(key => !(TENANT_COMPANY_PROFILE_FIELDS as readonly string[]).includes(key))) throw new Error('Solo se pueden actualizar datos públicos de la empresa.')
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const current = await db.tenant.findUnique({ where: { id: input.tenantId }, select: SELECT })
  if (!current) throw new Error('Empresa no encontrada.')
  const name = fields.name === undefined ? current.name : text(fields.name, 'Nombre de la tienda', 2, 120)
  const email = fields.email === undefined ? current.email : text(fields.email, 'Correo de la empresa', 3, 160).toLowerCase()
  if (email !== null && !emailPattern.test(email)) throw new Error('El correo de la empresa no es válido.')
  if (email !== current.email && await db.tenant.findFirst({ where: { email, id: { not: input.tenantId } }, select: { id: true } })) throw new Error('Ese correo ya lo usa otra empresa.')
  const data = {
    name,
    email,
    address: fields.address === undefined ? current.address : nullableText(fields.address, 'La dirección de la empresa', 400),
    city: fields.city === undefined ? current.city : nullableText(fields.city, 'La ciudad de la empresa', 120),
    department: fields.department === undefined ? current.department : nullableText(fields.department, 'El departamento de la empresa', 120),
    phone: fields.phone === undefined ? current.phone : nullableText(fields.phone, 'El teléfono de la empresa', 40),
    ruc: fields.ruc === undefined ? current.ruc : nullableText(fields.ruc, 'El RUC de la empresa', 20),
  }
  const updated = await db.$transaction(async tx => {
    const tenant = await tx.tenant.update({ where: { id: input.tenantId }, data: { ...data, ...(correoCambioReseteaVerificacion(current.email, email) ? { emailVerifiedAt: null } : {}) }, select: SELECT })
    await tx.auditLog.create({ data: { tenantId: input.tenantId, userId: input.actorUserId, action: 'TENANT_PROFILE_UPDATED', entity: 'Tenant', entityId: input.tenantId, metadata: { fields: keys, before: { name: current.name, email: current.email, address: current.address, city: current.city, department: current.department, phone: current.phone, ruc: current.ruc }, after: data } } })
    return tenant
  })
  return updated
}
