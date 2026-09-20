import { Prisma, ProductCondition } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../lib/auth'
import { error, json } from '../../../lib/http'
import { InputError, INT_MAX, objectInput, textInput } from '../../../lib/payment-input'
import { diffCampos } from '../../../lib/audit'

const CONDITIONS = Object.values(ProductCondition)
const LIMIT = 200
const CAMPOS_DIFF = ['model', 'storage', 'condition', 'baseValuePyg', 'maxValuePyg', 'notes', 'isActive'] as const

// Clave de comparación del modelo: sin mayúsculas, sin acentos y con espacios
// simples. Debe coincidir con `normalizarModelo` del POS (tradeInCheckout.js).
const normalizarModelo = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const storageInput = (value: unknown) => {
  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string' || value.trim().length > 60) throw new InputError('La capacidad debe ser texto de hasta 60 caracteres.')
  return value.trim().replace(/\s+/g, ' ')
}

const conditionInput = (value: unknown) => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !CONDITIONS.includes(value as ProductCondition)) throw new InputError('La condición debe ser NEW, USED o REFURBISHED.')
  return value as ProductCondition
}

const notesInput = (value: unknown) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > 2000) throw new InputError('Las notas deben ser texto de hasta 2000 caracteres.')
  return value.trim() || null
}

const moneyInput = (value: unknown, name: string) => {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isSafeInteger(number) || number <= 0 || number > INT_MAX) throw new InputError(`${name} debe ser un entero positivo.`)
  return number
}

const maxValueInput = (value: unknown) => value === undefined ? undefined : value === null || value === '' ? null : moneyInput(value, 'El valor máximo')

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const model = (params.get('model') || params.get('q') || '').trim()
  const condition = params.get('condition')?.trim()
  if (condition && !CONDITIONS.includes(condition as ProductCondition)) return error('Condición inválida.')
  const all = params.get('all') === '1' && canAccessAny(session.user, ['products:manage'])
  const modelKey = normalizarModelo(model)
  const valuations = await prisma.deviceValuation.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...(all ? {} : { isActive: true }),
      ...(condition ? { condition: condition as ProductCondition } : {}),
      ...(modelKey ? { modelKey: { contains: modelKey } } : {}),
    },
    orderBy: [{ model: 'asc' }, { storage: 'asc' }, { condition: 'asc' }],
    take: LIMIT,
  })
  return json(valuations)
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('Solo administración o gerencia gestionan valores de toma.', 403)
  try {
    const body = objectInput(await request.json())
    const model = textInput(body.model, 'El modelo', 150).replace(/\s+/g, ' ')
    const modelKey = normalizarModelo(model)
    const storage = storageInput(body.storage) ?? ''
    const condition = conditionInput(body.condition) ?? ProductCondition.USED
    const baseValuePyg = moneyInput(body.baseValuePyg, 'El valor base')
    const maxValuePyg = maxValueInput(body.maxValuePyg) ?? null
    if (maxValuePyg !== null && maxValuePyg < baseValuePyg) throw new InputError('El valor máximo no puede ser menor que el valor base.')
    const notes = notesInput(body.notes) ?? null
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new InputError('isActive debe ser booleano.')
    const duplicate = await prisma.deviceValuation.findFirst({ where: { tenantId: session.user.tenantId, modelKey, storage, condition }, select: { id: true } })
    if (duplicate) throw new InputError('Ya existe un valor para ese modelo, capacidad y condición.', 409)
    const created = await prisma.deviceValuation.create({ data: {
      tenantId: session.user.tenantId, model, modelKey, storage, condition, baseValuePyg, maxValuePyg, notes,
      isActive: body.isActive ?? true, createdById: session.user.id,
    } })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'DEVICE_VALUATION_CREATED', entity: 'DeviceValuation', entityId: created.id,
      metadata: { model: created.model, storage: created.storage, condition: created.condition, baseValuePyg: created.baseValuePyg, maxValuePyg: created.maxValuePyg } } })
    return json(created, { status: 201 })
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') return error('Ya existe un valor para ese modelo, capacidad y condición.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo crear el valor de toma.', cause instanceof InputError ? cause.status : cause instanceof SyntaxError ? 400 : 409)
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('Solo administración o gerencia gestionan valores de toma.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'id', 200)
    const current = await prisma.deviceValuation.findFirst({ where: { id, tenantId: session.user.tenantId } })
    if (!current) throw new InputError('Valor de toma no encontrado.', 404)
    const model = body.model === undefined ? undefined : textInput(body.model, 'El modelo', 150).replace(/\s+/g, ' ')
    const storage = storageInput(body.storage)
    const condition = conditionInput(body.condition)
    const baseValuePyg = body.baseValuePyg === undefined ? undefined : moneyInput(body.baseValuePyg, 'El valor base')
    const maxValuePyg = maxValueInput(body.maxValuePyg)
    const notes = notesInput(body.notes)
    const isActive = body.isActive
    if (isActive !== undefined && typeof isActive !== 'boolean') throw new InputError('isActive debe ser booleano.')
    if (model === undefined && storage === undefined && condition === undefined && baseValuePyg === undefined && maxValuePyg === undefined && notes === undefined && isActive === undefined) throw new InputError('Faltan cambios.')
    const next = {
      model: model ?? current.model,
      storage: storage ?? current.storage,
      condition: condition ?? current.condition,
      baseValuePyg: baseValuePyg ?? current.baseValuePyg,
      maxValuePyg: maxValuePyg === undefined ? current.maxValuePyg : maxValuePyg,
      notes: notes === undefined ? current.notes : notes,
      isActive: isActive ?? current.isActive,
    }
    if (next.maxValuePyg !== null && next.maxValuePyg < next.baseValuePyg) throw new InputError('El valor máximo no puede ser menor que el valor base.')
    const modelKey = model === undefined ? current.modelKey : normalizarModelo(next.model)
    const duplicate = await prisma.deviceValuation.findFirst({ where: { tenantId: session.user.tenantId, modelKey, storage: next.storage, condition: next.condition, id: { not: id } }, select: { id: true } })
    if (duplicate) throw new InputError('Ya existe un valor para ese modelo, capacidad y condición.', 409)
    const updated = await prisma.deviceValuation.update({ where: { id }, data: {
      ...(model !== undefined ? { model: next.model, modelKey } : {}),
      ...(storage !== undefined ? { storage: next.storage } : {}),
      ...(condition !== undefined ? { condition: next.condition } : {}),
      ...(baseValuePyg !== undefined ? { baseValuePyg: next.baseValuePyg } : {}),
      ...(maxValuePyg !== undefined ? { maxValuePyg: next.maxValuePyg } : {}),
      ...(notes !== undefined ? { notes: next.notes } : {}),
      ...(isActive !== undefined ? { isActive: next.isActive } : {}),
    } })
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, action: 'DEVICE_VALUATION_UPDATED', entity: 'DeviceValuation', entityId: id,
      metadata: { model: updated.model, storage: updated.storage, condition: updated.condition, ...diffCampos(current, updated, CAMPOS_DIFF) } } })
    return json(updated)
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') return error('Ya existe un valor para ese modelo, capacidad y condición.', 409)
    return error(cause instanceof Error ? cause.message : 'No se pudo actualizar el valor de toma.', cause instanceof InputError ? cause.status : cause instanceof SyntaxError ? 400 : 409)
  }
}
