import { ProductCondition } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json } from '../../../../lib/http'
import { InputError, objectInput } from '../../../../lib/payment-input'
import { LIMITE_MONTO_GENERAL, numero, numeroOpcional } from '../../../../lib/montos'
import { moduloGuard } from '../../../../lib/modulos-guard'
import { capacidadValida, modeloApple, normalizarCapacidad, normalizarClaveModelo } from '../../../../lib/catalogo-apple.mjs'

// Edición masiva de valores de toma: un solo lote, todo o nada, idempotente
// (misma tabla de valores → mismo resultado) y con una sola auditoría.
const MAX_FILAS = 600
const CONDITIONS = Object.values(ProductCondition)

type Fila = { model: string; modelKey: string; storage: string; condition: ProductCondition; baseValuePyg: number; maxValuePyg: number | null; isActive: boolean; notes?: string | null }

function entero(valor: unknown, nombre: string, indice: number) {
  const n = typeof valor === 'number' || (typeof valor === 'string' && valor.trim() !== '') ? Number(valor) : NaN
  if (!Number.isSafeInteger(n) || n <= 0 || n > LIMITE_MONTO_GENERAL) throw new InputError(`Fila ${indice + 1}: ${nombre} debe ser un entero positivo en guaraníes.`)
  return n
}

function normalizarFila(crudo: unknown, indice: number): Fila {
  const fila = objectInput(crudo)
  if (typeof fila.model !== 'string' || !fila.model.trim() || fila.model.trim().length > 150) throw new InputError(`Fila ${indice + 1}: indicá el modelo.`)
  const model = fila.model.trim().replace(/\s+/g, ' ')
  const catalogo = modeloApple(model)
  const storageCrudo = fila.storage === undefined || fila.storage === null ? '' : String(fila.storage).trim().replace(/\s+/g, ' ')
  if (storageCrudo.length > 60) throw new InputError(`Fila ${indice + 1}: la capacidad es demasiado larga.`)
  const storage = catalogo ? normalizarCapacidad(storageCrudo) : storageCrudo
  if (!capacidadValida(model, storage)) throw new InputError(`Fila ${indice + 1}: ${catalogo?.nombre ?? model} no viene en ${storageCrudo || 'esa capacidad'}.`)
  const condition = typeof fila.condition === 'string' && CONDITIONS.includes(fila.condition as ProductCondition) ? fila.condition as ProductCondition : null
  if (!condition) throw new InputError(`Fila ${indice + 1}: la condición debe ser NEW, USED o REFURBISHED.`)
  const baseValuePyg = entero(fila.baseValuePyg, 'el valor base', indice)
  const maxValuePyg = fila.maxValuePyg === undefined || fila.maxValuePyg === null || fila.maxValuePyg === '' ? null : entero(fila.maxValuePyg, 'el valor máximo', indice)
  if (maxValuePyg !== null && maxValuePyg < baseValuePyg) throw new InputError(`Fila ${indice + 1}: el valor máximo no puede ser menor que el valor base.`)
  if (fila.isActive !== undefined && typeof fila.isActive !== 'boolean') throw new InputError(`Fila ${indice + 1}: isActive debe ser booleano.`)
  return { model: catalogo?.nombre ?? model, modelKey: normalizarClaveModelo(catalogo?.nombre ?? model), storage, condition, baseValuePyg, maxValuePyg, isActive: fila.isActive ?? true }
}

export async function POST(request: Request) {
  const moduloApagado = await moduloGuard(request, 'tradein'); if (moduloApagado) return moduloApagado
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['products:manage'])) return error('Solo administración o gerencia gestionan valores de toma.', 403)
  const tenantId = session.user.tenantId
  try {
    const body = objectInput(await request.json())
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw new InputError('El lote necesita al menos una fila.')
    if (body.rows.length > MAX_FILAS) throw new InputError(`El lote admite hasta ${MAX_FILAS} filas por vez.`)
    const filas = body.rows.map(normalizarFila)
    // Una combinación repetida dentro del lote es ambigua: gana la última, pero se avisa en vez de callar.
    const vistas = new Map<string, number>()
    filas.forEach((fila, indice) => {
      const clave = `${fila.modelKey}|${fila.storage}|${fila.condition}`
      if (vistas.has(clave)) throw new InputError(`Fila ${indice + 1}: repite ${fila.model} ${fila.storage} (${fila.condition}) de la fila ${vistas.get(clave)! + 1}.`)
      vistas.set(clave, indice)
    })

    const resultado = await prisma.$transaction(async tx => {
      const existentes = await tx.deviceValuation.findMany({ where: { tenantId, modelKey: { in: [...new Set(filas.map(fila => fila.modelKey))] } } })
      const porClave = new Map(existentes.map(fila => [`${fila.modelKey}|${fila.storage}|${fila.condition}`, fila]))
      const cambios: Array<{ model: string; storage: string; condition: string; from: { base: number | null; max: number | null; active: boolean | null }; to: { base: number; max: number | null; active: boolean } }> = []
      let created = 0, updated = 0, unchanged = 0
      const guardadas = []
      for (const fila of filas) {
        const actual = porClave.get(`${fila.modelKey}|${fila.storage}|${fila.condition}`)
        if (actual && numero(actual.baseValuePyg) === fila.baseValuePyg && numeroOpcional(actual.maxValuePyg) === fila.maxValuePyg && actual.isActive === fila.isActive) {
          unchanged++; guardadas.push(actual); continue
        }
        const antes = actual ? { base: numero(actual.baseValuePyg), max: numeroOpcional(actual.maxValuePyg), active: actual.isActive } : { base: null, max: null, active: null }
        const guardada = actual
          ? await tx.deviceValuation.update({ where: { id: actual.id }, data: { model: fila.model, baseValuePyg: fila.baseValuePyg, maxValuePyg: fila.maxValuePyg, isActive: fila.isActive } })
          : await tx.deviceValuation.create({ data: { tenantId, model: fila.model, modelKey: fila.modelKey, storage: fila.storage, condition: fila.condition, baseValuePyg: fila.baseValuePyg, maxValuePyg: fila.maxValuePyg, isActive: fila.isActive, createdById: session.user.id } })
        if (actual) updated++; else created++
        guardadas.push(guardada)
        cambios.push({ model: fila.model, storage: fila.storage, condition: fila.condition, from: antes, to: { base: fila.baseValuePyg, max: fila.maxValuePyg, active: fila.isActive } })
      }
      // Sin cambios no hay auditoría: repetir el mismo lote es un no-op.
      if (cambios.length) {
        await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'DEVICE_VALUATION_BATCH', entity: 'DeviceValuation', entityId: null,
          metadata: { created, updated, unchanged, total: filas.length, cambios: cambios.slice(0, 100), truncado: cambios.length > 100 } } })
      }
      return { created, updated, unchanged, rows: guardadas }
    })
    return json(resultado)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'No se pudo guardar el lote de valores.', cause instanceof InputError ? cause.status : cause instanceof SyntaxError ? 400 : 409)
  }
}
