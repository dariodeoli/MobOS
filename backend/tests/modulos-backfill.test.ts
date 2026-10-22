import test from 'node:test'
import assert from 'node:assert/strict'
import { backfillModulosV2 } from '../scripts/modulos-v2-backfill'
import { moduleStoreFrom } from '../lib/module-store'
import { moduloActivo } from '../lib/modulos-catalogo.mjs'

type Fila = { id: string; settings: Record<string, unknown> | null }
function baseEnMemoria(filas: Fila[], datos: { unidades: string[]; sobrePedido: string[]; mayoristas?: string[]; listasMayoristas?: string[] } = { unidades: [], sobrePedido: [] }) {
  const auditoria: Array<{ tenantId: string; action: string; metadata: Record<string, unknown> }> = []
  let escrituras = 0
  const tx = {
    $queryRaw: async () => [],
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => filas.find(f => f.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { settings: Record<string, unknown> } }) => { escrituras += 1; filas.find(f => f.id === where.id)!.settings = data.settings },
    },
    auditLog: { create: async ({ data }: { data: { tenantId: string; action: string; metadata: Record<string, unknown> } }) => { auditoria.push(data) } },
    inventoryUnit: { findFirst: async ({ where }: { where: { tenantId: string } }) => (datos.unidades.includes(where.tenantId) ? { id: 'u' } : null) },
    orderItem: { findFirst: async ({ where }: { where: { order: { tenantId: string } } }) => (datos.sobrePedido.includes(where.order.tenantId) ? { id: 'i' } : null) },
    customer: { findFirst: async ({ where }: { where: { tenantId: string } }) => ((datos.mayoristas ?? []).includes(where.tenantId) ? { id: 'c' } : null) },
    priceList: { findFirst: async ({ where }: { where: { tenantId: string } }) => ((datos.listasMayoristas ?? []).includes(where.tenantId) ? { id: 'l' } : null) },
  }
  const db = {
    tenant: {
      findMany: async ({ take, cursor, skip }: { take: number; cursor?: { id: string }; skip?: number }) => {
        const ordenadas = [...filas].sort((a, b) => a.id.localeCompare(b.id))
        const desde = cursor ? ordenadas.findIndex(f => f.id === cursor.id) + (skip ?? 0) : 0
        return ordenadas.slice(desde, desde + take).map(f => ({ id: f.id, settings: f.settings }))
      },
    },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  }
  return { db, auditoria, escrituras: () => escrituras }
}

const v1Delivery = { moduleStore: { version: 1, preset: 'comercio', modules: { delivery: { enabled: false, source: 'manual', manuallySelected: true } } }, onboarding: { done: true } }

test('backfill v2: guarda el estado actual en versión 2, audita y es idempotente', async () => {
  const filas: Fila[] = [
    { id: 't1', settings: null },
    { id: 't2', settings: { keep: 1 } },
    { id: 't3', settings: v1Delivery },
    { id: 't4', settings: { moduleStore: moduleStoreFrom({}) } },
  ]
  const antes = filas.map(f => JSON.stringify(f.settings))
  const { db, auditoria, escrituras } = baseEnMemoria(filas)
  const primera = await backfillModulosV2(db as never, { pageSize: 2, now: '2026-10-21T10:00:00.000Z' })
  assert.deepEqual({ revisadas: primera.revisadas, migradas: primera.migradas, yaEnV2: primera.yaEnV2 }, { revisadas: 4, migradas: 3, yaEnV2: 1 })
  assert.deepEqual(primera.ids, ['t1', 't2', 't3'])
  assert.equal(escrituras(), 3)
  assert.equal(auditoria.length, 3)
  assert.ok(auditoria.every(a => a.action === 'TENANT_MODULES_MIGRATED'))
  for (const fila of filas.slice(0, 3)) assert.equal((fila.settings!.moduleStore as { version: number }).version, 2)
  assert.equal(filas[1].settings!.keep, 1, 'conserva el resto de los ajustes')
  assert.deepEqual(filas[2].settings!.onboarding, { done: true })
  // Lo apagado a mano se respeta; el resto queda activo; el estado efectivo no cambia.
  assert.equal(moduloActivo(filas[2].settings, 'delivery'), false)
  assert.equal(moduloActivo(filas[2].settings, 'servicios'), true)
  assert.equal(moduloActivo(filas[0].settings, 'gift-cards'), true)
  assert.equal(JSON.stringify(filas[3].settings), antes[3], 'una empresa ya en v2 no se toca')

  const despues = filas.map(f => JSON.stringify(f.settings))
  const segunda = await backfillModulosV2(db as never, { pageSize: 2 })
  assert.deepEqual({ revisadas: segunda.revisadas, migradas: segunda.migradas, yaEnV2: segunda.yaEnV2 }, { revisadas: 4, migradas: 0, yaEnV2: 4 })
  assert.equal(escrituras(), 3, 'segunda corrida: cero escrituras')
  assert.equal(auditoria.length, 3, 'segunda corrida: cero auditorías')
  assert.deepEqual(filas.map(f => JSON.stringify(f.settings)), despues)
})

test('backfill v2: un módulo agregado después no se prende solo en una empresa migrada', async () => {
  const filas: Fila[] = [{ id: 't1', settings: {} }]
  const { db } = baseEnMemoria(filas)
  await backfillModulosV2(db as never)
  const guardado = filas[0].settings!.moduleStore as { modules: Record<string, unknown> }
  delete guardado.modules.tradein
  assert.equal(moduloActivo(filas[0].settings, 'tradein'), false)
  assert.equal(moduloActivo(filas[0].settings, 'delivery'), true)
})

test('backfill v2: --dry-run informa sin escribir', async () => {
  const filas: Fila[] = [{ id: 't1', settings: v1Delivery }]
  const { db, auditoria, escrituras } = baseEnMemoria(filas)
  const resultado = await backfillModulosV2(db as never, { dryRun: true })
  assert.equal(resultado.migradas, 1)
  assert.equal(escrituras(), 0)
  assert.equal(auditoria.length, 0)
  assert.equal((filas[0].settings!.moduleStore as { version: number }).version, 1)
})

test('backfill v2: inventario por unidades y venta sin stock se deciden por los datos de cada empresa', async () => {
  const filas: Fila[] = [{ id: 'con-unidades', settings: {} }, { id: 'con-backorder', settings: v1Delivery }, { id: 'vacia', settings: null }]
  const { db } = baseEnMemoria(filas, { unidades: ['con-unidades'], sobrePedido: ['con-backorder'] })
  await backfillModulosV2(db as never)
  const estados = filas.map(f => ({ unidades: moduloActivo(f.settings, 'inventario-unidades'), sinStock: moduloActivo(f.settings, 'venta-sin-stock') }))
  assert.deepEqual(estados, [{ unidades: true, sinStock: false }, { unidades: false, sinStock: true }, { unidades: false, sinStock: false }])
  assert.equal(moduloActivo(filas[1].settings, 'delivery'), false, 'lo apagado a mano se respeta')
})

test('backfill v2: mayoristas queda activo solo con clientes mayoristas o lista mayorista', async () => {
  const filas: Fila[] = [{ id: 'con-clientes', settings: {} }, { id: 'con-lista', settings: null }, { id: 'sin-datos', settings: {} }]
  const { db } = baseEnMemoria(filas, { unidades: [], sobrePedido: [], mayoristas: ['con-clientes'], listasMayoristas: ['con-lista'] })
  await backfillModulosV2(db as never)
  assert.deepEqual(filas.map(f => moduloActivo(f.settings, 'mayoristas')), [true, true, false])
})
