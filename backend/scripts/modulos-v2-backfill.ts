// Deja guardado el estado actual de módulos de las empresas que todavía no están
// en versión 2, para que un módulo que se agregue después no se prenda solo.
// Idempotente: una empresa ya en versión 2 no se toca (segunda corrida = 0 cambios).
// Escribe una fila de auditoría TENANT_MODULES_MIGRATED por empresa migrada.
//
// Uso: DATABASE_URL=... npm --prefix backend run modulos:backfill [-- --dry-run]
import type { Prisma } from '@prisma/client'
import { mergeModuleStoreSettings, moduleStoreFrom } from '../lib/module-store'
import { leerModuleStore, MODULE_STORE_VERSION } from '../lib/modulos-catalogo.mjs'

export type BackfillResult = { revisadas: number; migradas: number; yaEnV2: number; ids: string[] }

type Db = {
  tenant: {
    findMany(args: { where?: Record<string, unknown>; select: { id: true; settings: true }; orderBy: { id: 'asc' }; take: number; cursor?: { id: string }; skip?: number }): Promise<Array<{ id: string; settings: unknown }>>
  }
  $transaction<T>(fn: (tx: TxDb) => Promise<T>): Promise<T>
}
type TxDb = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  tenant: {
    findUnique(args: { where: { id: string }; select: { settings: true } }): Promise<{ settings: unknown } | null>
    update(args: { where: { id: string }; data: { settings: Prisma.InputJsonObject } }): Promise<unknown>
  }
  auditLog: { create(args: { data: { tenantId: string; action: string; entity: string; entityId: string; metadata: Prisma.InputJsonObject } }): Promise<unknown> }
}

const enV2 = (settings: unknown) => leerModuleStore({ settings })?.version === MODULE_STORE_VERSION

/** Migra una empresa si hace falta. Devuelve true si escribió algo. */
export async function migrarEmpresa(db: Db, tenantId: string, dryRun = false, now = new Date().toISOString()): Promise<boolean> {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
    if (!tenant || enV2(tenant.settings)) return false
    if (dryRun) return true
    const before = leerModuleStore({ settings: tenant.settings })
    const after = moduleStoreFrom(tenant.settings, now)
    await tx.tenant.update({ where: { id: tenantId }, data: { settings: mergeModuleStoreSettings(tenant.settings, after) } })
    await tx.auditLog.create({ data: { tenantId, action: 'TENANT_MODULES_MIGRATED', entity: 'Tenant', entityId: tenantId, metadata: { fromVersion: before?.version ?? null, toVersion: MODULE_STORE_VERSION, after } as unknown as Prisma.InputJsonObject } })
    return true
  })
}

export async function backfillModulosV2(db: Db, options: { dryRun?: boolean; now?: string; pageSize?: number } = {}): Promise<BackfillResult> {
  const result: BackfillResult = { revisadas: 0, migradas: 0, yaEnV2: 0, ids: [] }
  const pageSize = options.pageSize ?? 200
  let cursor: string | undefined
  for (;;) {
    const page = await db.tenant.findMany({ select: { id: true, settings: true }, orderBy: { id: 'asc' }, take: pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    if (!page.length) break
    for (const tenant of page) {
      result.revisadas += 1
      if (enV2(tenant.settings)) { result.yaEnV2 += 1; continue }
      if (await migrarEmpresa(db, tenant.id, options.dryRun, options.now)) { result.migradas += 1; result.ids.push(tenant.id) }
    }
    cursor = page[page.length - 1].id
  }
  return result
}

// CLI: solo cuando se ejecuta directamente (los tests importan las funciones).
if (typeof require !== 'undefined' && require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  void (async () => {
    const { prisma } = await import('../lib/prisma')
    const result = await backfillModulosV2(prisma as unknown as Db, { dryRun })
    console.log(`[modulos-v2-backfill] ${dryRun ? '(simulación) ' : ''}revisadas=${result.revisadas} migradas=${result.migradas} yaEnV2=${result.yaEnV2}`)
    await prisma.$disconnect()
  })().catch(cause => { console.error('[modulos-v2-backfill] falló:', cause); process.exit(1) })
}
