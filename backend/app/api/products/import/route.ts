import { randomUUID } from 'node:crypto'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { ensureStoreBranch } from '../../../../lib/store-branch'
import { IMPORT_MAX_FILAS, analizarImportacion } from '../../../../lib/product-import'
import type { ImportMode } from '../../../../lib/product-import'
import type { SessionContext } from '../../../../lib/auth'

const ID_MAX = 128

type FilaActualizada = { id: string; sku: string; before: { pricePyg: number; wholesalePricePyg: number | null; priceUsd: number | null }; after: { pricePyg: number; wholesalePricePyg: number | null; priceUsd: number | null } }

// Importación de productos por lote: la vista previa (`dryRun`) valida fila
// por fila contra el catálogo real y la escritura es una única transacción, así
// que un fallo no deja productos a medias. Un lote ya aplicado se puede
// deshacer (`action: 'undo'`) sin tocar lo que se modificó después.
export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('No autorizado.', 403)
  let body: any
  try { body = await request.json() } catch { return error('Cuerpo inválido.') }
  if (body?.action === 'undo') return deshacer(tenant, session.user.id, body)
  return importar(tenant, session, body)
}

async function importar(tenant: string, session: SessionContext, body: any) {
  const mode: ImportMode = body?.mode === 'actualizar' ? 'actualizar' : 'crear'
  const dryRun = body?.dryRun !== false
  const rows: unknown[] = Array.isArray(body?.rows) ? body.rows : []
  if (!rows.length) return error('El archivo no tiene filas para importar.')
  if (rows.length > IMPORT_MAX_FILAS) return error(`El máximo por importación es de ${IMPORT_MAX_FILAS} filas.`)

  // Misma resolución de sucursal que el alta individual (POST /api/products).
  const requestedBranchId: string | null = body?.branchId || session.user.branchId || null
  const branchId = requestedBranchId ?? await ensureStoreBranch(session)
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)
  if (session.user.branchId && branchId !== session.user.branchId) return error('No autorizado para esa sucursal.', 403)

  // Se incluyen los productos dados de baja: el SKU sigue ocupado por el
  // índice único y la vista previa tiene que avisarlo antes de intentar crear.
  const skus = [...new Set(rows.map(fila => (fila && typeof fila === 'object' ? String((fila as any).sku ?? '').trim() : '')).filter(Boolean))]
  const existentes = skus.length
    ? await prisma.product.findMany({ where: { tenantId: tenant, branchId, sku: { in: skus } }, select: { id: true, sku: true, name: true, pricePyg: true, wholesalePricePyg: true, priceUsd: true, isActive: true } })
    : []
  const { rows: analizadas, resumen } = analizarImportacion(rows, { existentes, mode })
  if (dryRun) return json({ rows: analizadas, resumen, mode, branchId, maxFilas: IMPORT_MAX_FILAS })

  const aCrear = analizadas.filter(fila => fila.action === 'crear')
  const aActualizar = analizadas.filter(fila => fila.action === 'actualizar')
  if (!aCrear.length && !aActualizar.length) return error('No hay filas válidas para importar.', 400, { rows: analizadas, resumen })

  const fileName = typeof body?.fileName === 'string' && body.fileName.trim() ? body.fileName.trim().slice(0, 120) : null
  const batchId = randomUUID()
  try {
    const resultado = await prisma.$transaction(async tx => {
      const porSku = new Map(existentes.map(producto => [producto.sku, producto]))
      const actualizadas: FilaActualizada[] = []
      const creadas: Array<{ id: string; sku: string; name: string }> = []
      for (const fila of aCrear) {
        const datos = fila.data
        const producto = await tx.product.create({
          data: {
            tenantId: tenant,
            branchId,
            sku: datos.sku,
            name: datos.name || datos.sku,
            category: datos.category,
            model: datos.model,
            color: datos.color,
            capacity: datos.capacity,
            condition: datos.condition || 'NEW',
            pricePyg: datos.pricePyg || 0,
            wholesalePricePyg: datos.wholesalePricePyg,
            priceUsd: datos.priceUsd,
            costPyg: datos.costPyg,
            warrantyDays: datos.warrantyDays,
            stock: datos.stock || 0,
          },
        })
        creadas.push({ id: producto.id, sku: producto.sku, name: producto.name })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_CREATED', entity: 'Product', entityId: producto.id, metadata: { name: producto.name, sku: producto.sku, pricePyg: producto.pricePyg, costPyg: producto.costPyg, stock: producto.stock, imported: true, batchId } } })
      }
      for (const fila of aActualizar) {
        const datos = fila.data
        const actual = porSku.get(datos.sku)
        if (!actual) throw new Error('SKU cambiado mientras se importaba.')
        const before = { pricePyg: actual.pricePyg, wholesalePricePyg: actual.wholesalePricePyg ?? null, priceUsd: actual.priceUsd === null ? null : Number(actual.priceUsd) }
        const after = {
          pricePyg: datos.pricePyg as number,
          wholesalePricePyg: datos.wholesalePricePyg ?? before.wholesalePricePyg,
          priceUsd: datos.priceUsd ?? before.priceUsd,
        }
        await tx.product.update({ where: { id: actual.id }, data: { pricePyg: after.pricePyg, wholesalePricePyg: after.wholesalePricePyg, priceUsd: after.priceUsd } })
        actualizadas.push({ id: actual.id, sku: actual.sku, before, after })
        await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: actual.id, metadata: { name: actual.name, sku: actual.sku, pricePyg: after.pricePyg, imported: true, batchId } } })
      }
      await tx.auditLog.create({
        data: {
          tenantId: tenant, userId: session.user.id, action: 'PRODUCTS_IMPORTED', entity: 'ProductImport', entityId: batchId,
          metadata: { batchId, mode, branchId, fileName, creados: creadas.length, actualizados: actualizadas.length, omitidos: resumen.omitir, errores: resumen.errores, created: creadas, updated: actualizadas },
        },
      })
      return { batchId, creados: creadas.length, actualizados: actualizadas.length, omitidos: resumen.omitir, resumen }
    }, { timeout: 30000, maxWait: 10000 })
    return json(resultado, { status: 201 })
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'No se pudo importar.'
    // Nada quedó escrito: la transacción se revierte completa.
    return error(`No se importó nada. ${mensaje}`, 409)
  }
}

async function deshacer(tenant: string, userId: string, body: any) {
  const batchId = typeof body?.batchId === 'string' ? body.batchId.trim().slice(0, ID_MAX) : ''
  if (!batchId) return error('Lote obligatorio.')
  const lote = await prisma.auditLog.findFirst({ where: { tenantId: tenant, entity: 'ProductImport', entityId: batchId, action: 'PRODUCTS_IMPORTED' } })
  if (!lote) return error('No se encontró el lote de importación.', 404)
  const metadata = (lote.metadata || {}) as any
  const created: Array<{ id: string; sku: string; name: string }> = Array.isArray(metadata.created) ? metadata.created : []
  const updated: FilaActualizada[] = Array.isArray(metadata.updated) ? metadata.updated : []
  const desactivadas: Array<{ sku: string }> = []
  const restauradas: Array<{ sku: string }> = []
  const omitidas: Array<{ sku: string; motivo: string }> = []
  try {
    await prisma.$transaction(async tx => {
      for (const fila of created) {
        const producto = await tx.product.findFirst({ where: { id: fila.id, tenantId: tenant }, select: { id: true, sku: true, name: true, isActive: true, createdAt: true, updatedAt: true, _count: { select: { inventoryUnits: true } } } })
        if (!producto) { omitidas.push({ sku: fila.sku, motivo: 'ya no existe' }); continue }
        if (!producto.isActive) { omitidas.push({ sku: fila.sku, motivo: 'ya estaba eliminado' }); continue }
        if (producto._count.inventoryUnits > 0) { omitidas.push({ sku: fila.sku, motivo: 'tiene unidades/IMEI cargados' }); continue }
        if (producto.updatedAt.getTime() - producto.createdAt.getTime() > 5000) { omitidas.push({ sku: fila.sku, motivo: 'se editó después de importarlo' }); continue }
        await tx.product.update({ where: { id: producto.id }, data: { isActive: false } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'PRODUCT_DELETED', entity: 'Product', entityId: producto.id, metadata: { name: producto.name, sku: producto.sku, imported: true, batchId, undo: true } } })
        desactivadas.push({ sku: producto.sku })
      }
      for (const fila of updated) {
        const producto = await tx.product.findFirst({ where: { id: fila.id, tenantId: tenant }, select: { id: true, sku: true, name: true, isActive: true, pricePyg: true } })
        if (!producto) { omitidas.push({ sku: fila.sku, motivo: 'ya no existe' }); continue }
        if (!producto.isActive) { omitidas.push({ sku: fila.sku, motivo: 'está eliminado' }); continue }
        const igualAlLote = producto.pricePyg === fila.after.pricePyg
        if (!igualAlLote) { omitidas.push({ sku: fila.sku, motivo: 'el precio cambió después de importarlo' }); continue }
        await tx.product.update({ where: { id: producto.id }, data: { pricePyg: fila.before.pricePyg, wholesalePricePyg: fila.before.wholesalePricePyg, priceUsd: fila.before.priceUsd } })
        await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'PRODUCT_UPDATED', entity: 'Product', entityId: producto.id, metadata: { name: producto.name, sku: producto.sku, pricePyg: fila.before.pricePyg, imported: true, batchId, undo: true } } })
        restauradas.push({ sku: producto.sku })
      }
      await tx.auditLog.create({ data: { tenantId: tenant, userId, action: 'PRODUCTS_IMPORT_UNDONE', entity: 'ProductImport', entityId: batchId, metadata: { batchId, desactivados: desactivadas.length, restaurados: restauradas.length, omitidos: omitidas.length, detalleOmitidos: omitidas } } })
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo deshacer la importación.', 409)
  }
  return json({ batchId, desactivados: desactivadas.length, restaurados: restauradas.length, omitidos: omitidas })
}
