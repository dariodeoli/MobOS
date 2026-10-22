// Estado inicial de los módulos que dependen de los datos de la empresa
// (`porDatos` en el catálogo): «Inventario por unidades» y «Venta sin stock».
//
// - Empresa existente (sin store o versión 1) y sin valor guardado para el módulo:
//   inventario-unidades queda activo si ya tiene unidades con IMEI/serie;
//   venta-sin-stock queda activo si alguna línea de pedido tuvo stockPending>0
//   o serialsPending>0 (sobre pedido). Si no, apagado.
// - El resultado se guarda una sola vez (queda explícito) y se audita; después la
//   empresa lo maneja a mano en Configuración › Módulos.
// - Empresa nueva (versión 2): ya trae el valor explícito, no se toca.
import type { Prisma } from '@prisma/client'
import { MODULE_CATALOG, MODULE_STORE_VERSION, leerModuleStore } from './modulos-catalogo.mjs'

export const MODULOS_POR_DATOS: readonly string[] = MODULE_CATALOG.filter(def => def.porDatos).map(def => def.id)

export type ClienteDatosModulos = {
  inventoryUnit: { findFirst(args: { where: { tenantId: string }; select: { id: true } }): Promise<unknown> }
  orderItem: { findFirst(args: { where: { order: { tenantId: string }; OR: Array<Record<string, { gt: number }>> }; select: { id: true } }): Promise<unknown> }
}

const record = (valor: unknown): Record<string, unknown> => valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {}

/** Ids de `MODULOS_POR_DATOS` que esta empresa todavía no tiene explícitos (solo versión 1 o sin store). */
export function modulosPendientesPorDatos(settings: unknown): string[] {
  const almacen = leerModuleStore({ settings })
  if (almacen?.version === MODULE_STORE_VERSION) return []
  return MODULOS_POR_DATOS.filter(id => typeof record(almacen?.modules?.[id]).enabled !== 'boolean')
}

/** Lee los datos de la empresa y decide cada módulo pendiente. */
export async function decidirModulosPorDatos(db: ClienteDatosModulos, tenantId: string, pendientes: readonly string[]): Promise<Record<string, boolean>> {
  const decididos: Record<string, boolean> = {}
  for (const id of pendientes) {
    if (id === 'inventario-unidades') decididos[id] = Boolean(await db.inventoryUnit.findFirst({ where: { tenantId }, select: { id: true } }))
    else if (id === 'venta-sin-stock') decididos[id] = Boolean(await db.orderItem.findFirst({ where: { order: { tenantId }, OR: [{ stockPending: { gt: 0 } }, { serialsPending: { gt: 0 } }] }, select: { id: true } }))
  }
  return decididos
}

/** Settings con los módulos decididos escritos de forma explícita (no cambia la versión). */
export function aplicarModulosPorDatos(settings: unknown, decididos: Record<string, boolean>, ahora = new Date().toISOString()): Prisma.InputJsonObject {
  const raiz = record(settings)
  const almacen = leerModuleStore({ settings })
  const modules: Record<string, unknown> = { ...record(almacen?.modules) }
  for (const [id, enabled] of Object.entries(decididos)) modules[id] = { enabled, manuallySelected: false, source: 'preset', updatedAt: ahora }
  const moduleStore = { ...record(raiz.moduleStore), version: almacen?.version ?? 1, preset: almacen?.preset ?? 'comercio', modules }
  return { ...raiz, moduleStore } as unknown as Prisma.InputJsonObject
}

type TxAsegurar = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  tenant: {
    findUnique(args: { where: { id: string }; select: { settings: true } }): Promise<{ settings: unknown } | null>
    update(args: { where: { id: string }; data: { settings: Prisma.InputJsonObject } }): Promise<unknown>
  }
  auditLog: { create(args: { data: { tenantId: string; action: string; entity: string; entityId: string; metadata: Prisma.InputJsonObject } }): Promise<unknown> }
}
export type DbAsegurar = ClienteDatosModulos & {
  tenant: { findUnique(args: { where: { id: string }; select: { settings: true } }): Promise<{ settings: unknown } | null> }
  $transaction<T>(fn: (tx: TxAsegurar) => Promise<T>): Promise<T>
}

/**
 * Deja explícitos los módulos `porDatos` de una empresa existente que todavía no
 * los tiene y devuelve sus settings vigentes. Una empresa en versión 2 (o ya
 * resuelta) no hace ninguna consulta de datos ni escritura.
 */
export async function asegurarModulosPorDatos(db: DbAsegurar, tenantId: string, settingsActuales?: unknown): Promise<unknown> {
  let settings = settingsActuales
  if (settings === undefined) {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
    if (!tenant) return null
    settings = tenant.settings
  }
  const pendientes = modulosPendientesPorDatos(settings)
  if (!pendientes.length) return settings
  const decididos = await decidirModulosPorDatos(db, tenantId, pendientes)
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
    if (!tenant) return null
    const aun = modulosPendientesPorDatos(tenant.settings)
    if (!aun.length) return tenant.settings
    const aplicar = Object.fromEntries(Object.entries(decididos).filter(([id]) => aun.includes(id)))
    const nuevos = aplicarModulosPorDatos(tenant.settings, aplicar)
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: nuevos } })
    await tx.auditLog.create({ data: { tenantId, action: 'TENANT_MODULES_AUTODETECTED', entity: 'Tenant', entityId: tenantId, metadata: { decididos: aplicar } as unknown as Prisma.InputJsonObject } })
    return nuevos
  })
}
