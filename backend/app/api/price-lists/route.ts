import { prisma } from '../../../lib/prisma'
import { error, json } from '../../../lib/http'
import { requireSession } from '../../../lib/auth'
import { InputError, objectInput, textInput } from '../../../lib/payment-input'
import { diffCampos } from '../../../lib/audit'

// Listas de precios de la empresa: nombre, moneda, ítems por producto o
// categoría con descuento/recargo. La lista se asigna a la ficha del cliente y
// gana sobre mayorista/minorista en los productos que cubre. Todas las
// escrituras dejan rastro en la auditoría.
const MONEDAS = ['PYG', 'USD', 'BRL', 'EUR', 'USDT']
const CAMPOS_LISTA = ['name', 'currency', 'isActive'] as const
const MAX_ITEMS = 500
const esGestor = (rol: string) => ['ADMIN', 'GERENTE'].includes(rol)

type ItemNormalizado = { productId: string | null; category: string | null; adjustment: 'DISCOUNT' | 'SURCHARGE'; valuePct: number }

function normalizarItems(raw: unknown): ItemNormalizado[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new InputError('Los ítems de la lista deben ser una lista.')
  if (raw.length > MAX_ITEMS) throw new InputError(`La lista admite hasta ${MAX_ITEMS} ítems.`)
  const items: ItemNormalizado[] = []
  const productos = new Set<string>()
  const categorias = new Set<string>()
  for (const fila of raw) {
    const item = objectInput(fila)
    const productId = typeof item.productId === 'string' && item.productId.trim() ? item.productId.trim().slice(0, 128) : null
    const category = typeof item.category === 'string' && item.category.trim() ? item.category.trim().slice(0, 120) : null
    if (Boolean(productId) === Boolean(category)) throw new InputError('Cada ítem lleva un producto o una categoría, no ambos.')
    const adjustment = item.adjustment === undefined || item.adjustment === null || item.adjustment === 'DISCOUNT' ? 'DISCOUNT' : item.adjustment === 'SURCHARGE' ? 'SURCHARGE' : null
    if (!adjustment) throw new InputError('El ajuste del ítem debe ser descuento o recargo.')
    const valuePct = Number(item.valuePct)
    if (!Number.isFinite(valuePct) || valuePct < 0 || valuePct > 100 || Number(valuePct.toFixed(2)) !== valuePct) throw new InputError('El porcentaje del ítem debe estar entre 0 y 100 con hasta 2 decimales.')
    if (productId) {
      if (productos.has(productId)) throw new InputError('Hay productos repetidos en la lista.')
      productos.add(productId)
    }
    if (category) {
      const clave = category.toLowerCase()
      if (categorias.has(clave)) throw new InputError('Hay categorías repetidas en la lista.')
      categorias.add(clave)
    }
    items.push({ productId, category, adjustment, valuePct })
  }
  return items
}

// Verifica que los productos de los ítems sean de la empresa.
async function productosValidos(tenantId: string, items: ItemNormalizado[]) {
  const ids = items.flatMap((item) => (item.productId ? [item.productId] : []))
  if (!ids.length) return
  const encontrados = await prisma.product.count({ where: { id: { in: ids }, tenantId } })
  if (encontrados !== ids.length) throw new InputError('Algún producto de la lista no pertenece a esta empresa.', 404)
}

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const todas = params.get('all') === '1' && esGestor(session.user.role)
  const listas = await prisma.priceList.findMany({
    where: { tenantId: session.user.tenantId, ...(todas ? {} : { isActive: true }) },
    include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 200,
  })
  return json(listas)
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!esGestor(session.user.role)) return error('Solo administración o gerencia configuran listas de precios.', 403)
  try {
    const body = objectInput(await request.json())
    const name = textInput(body.name, 'Nombre', 120)
    const currency = MONEDAS.includes(String(body.currency)) ? String(body.currency) : 'PYG'
    const items = normalizarItems(body.items)
    await productosValidos(session.user.tenantId, items)
    const lista = await prisma.$transaction(async (tx) => {
      const creada = await tx.priceList.create({ data: { tenantId: session.user.tenantId, name, currency: currency as 'PYG' } })
      if (items.length) await tx.priceListItem.createMany({ data: items.map((item) => ({ ...item, tenantId: session.user.tenantId, priceListId: creada.id })) })
      const completa = await tx.priceList.findUniqueOrThrow({ where: { id: creada.id }, include: { items: true } })
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: 'PRICE_LIST_CREATED',
          entity: 'PriceList',
          entityId: creada.id,
          metadata: { name: creada.name, currency: creada.currency, isActive: creada.isActive, items: completa.items.length },
        },
      })
      return completa
    })
    return json(lista, { status: 201 })
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if (cause && typeof cause === 'object' && (cause as { code?: string }).code === 'P2002') return error('Ya existe una lista con ese nombre.', 409)
    return error('No se pudo crear la lista de precios.')
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!esGestor(session.user.role)) return error('Solo administración o gerencia configuran listas de precios.', 403)
  try {
    const body = objectInput(await request.json())
    const id = textInput(body.id, 'Lista', 128)
    const existente = await prisma.priceList.findFirst({ where: { id, tenantId: session.user.tenantId }, include: { items: true } })
    if (!existente) return error('Lista de precios no encontrada.', 404)
    const cambios: Record<string, unknown> = {}
    if (body.name !== undefined) cambios.name = textInput(body.name, 'Nombre', 120)
    if (body.currency !== undefined) {
      if (!MONEDAS.includes(String(body.currency))) throw new InputError('Moneda inválida.')
      cambios.currency = String(body.currency)
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new InputError('"Activa" debe ser verdadero o falso.')
      cambios.isActive = body.isActive
    }
    const items = body.items === undefined ? undefined : normalizarItems(body.items)
    if (items) await productosValidos(session.user.tenantId, items)
    if (!Object.keys(cambios).length && items === undefined) throw new InputError('No enviaste cambios.')
    const actualizada = await prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        await tx.priceListItem.deleteMany({ where: { priceListId: existente.id, tenantId: session.user.tenantId } })
        if (items.length) await tx.priceListItem.createMany({ data: items.map((item) => ({ ...item, tenantId: session.user.tenantId, priceListId: existente.id })) })
      }
      const guardada = await tx.priceList.update({ where: { id: existente.id }, data: cambios, include: { items: true } })
      const diff = diffCampos(existente, guardada, CAMPOS_LISTA)
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          action: 'PRICE_LIST_UPDATED',
          entity: 'PriceList',
          entityId: guardada.id,
          metadata: { name: guardada.name, ...diff, ...(items === undefined ? {} : { items: { from: existente.items.length, to: items.length } }) },
        },
      })
      return guardada
    })
    return json(actualizada)
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if (cause && typeof cause === 'object' && (cause as { code?: string }).code === 'P2002') return error('Ya existe una lista con ese nombre.', 409)
    return error('No se pudo actualizar la lista de precios.')
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!esGestor(session.user.role)) return error('Solo administración o gerencia configuran listas de precios.', 403)
  const id = (new URL(request.url).searchParams.get('id') || '').trim().slice(0, 128)
  if (!id) return error('Indicá la lista a eliminar.')
  const existente = await prisma.priceList.findFirst({ where: { id, tenantId: session.user.tenantId }, include: { items: { select: { id: true } }, customers: { select: { id: true } } } })
  if (!existente) return error('Lista de precios no encontrada.', 404)
  await prisma.$transaction(async (tx) => {
    await tx.priceList.delete({ where: { id: existente.id } })
    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: 'PRICE_LIST_DELETED',
        entity: 'PriceList',
        entityId: id,
        metadata: { name: existente.name, items: existente.items.length, customers: existente.customers.length },
      },
    })
  })
  return json({ id, eliminada: true })
}
