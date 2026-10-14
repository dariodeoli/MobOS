import { prisma } from './prisma'

// #422 · Preferencias del negocio que viven en Tenant.settings (JSON, sin
// migración): procesamiento de pedidos y portal de clientes. Ausente = el
// comportamiento de siempre, así una empresa existente no cambia sola.
export type TenantPreferences = {
  orders: { autoArchivePrepared: boolean }
  portal: { showStoreCredit: boolean }
}

// «Preparado»: el pedido ya está listo para entregar (o retirado) y no
// necesita más seguimiento en la lista activa. El resto del recorrido
// (en camino, enviado) sigue visible porque todavía hay trabajo pendiente.
export const PREPARED_FULFILLMENT = ['READY_TO_SHIP', 'READY_FOR_PICKUP', 'PICKED_UP'] as const

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function preferencesFrom(settings: unknown): TenantPreferences {
  const root = asRecord(settings)
  const orders = asRecord(root.orders)
  const portal = asRecord(root.portal)
  return {
    orders: { autoArchivePrepared: orders.autoArchivePrepared === true },
    portal: { showStoreCredit: portal.showStoreCredit !== false },
  }
}

export type PreferencesPatch = { orders?: { autoArchivePrepared?: boolean }; portal?: { showStoreCredit?: boolean } }

/** Valida el cuerpo del PUT: solo claves conocidas y booleanas. */
export function parsePreferencesPatch(body: unknown): PreferencesPatch | null {
  const root = asRecord(body)
  const patch: Record<string, Record<string, boolean>> = {}
  for (const [group, keys] of [['orders', ['autoArchivePrepared']], ['portal', ['showStoreCredit']]] as const) {
    if (root[group] === undefined) continue
    const section = asRecord(root[group])
    const out: Record<string, boolean> = {}
    for (const key of keys) {
      if (section[key] === undefined) continue
      if (typeof section[key] !== 'boolean') return null
      out[key] = section[key] as boolean
    }
    if (Object.keys(out).length) patch[group] = out
  }
  return Object.keys(patch).length ? patch as PreferencesPatch : null
}

/** Aplica el parche sobre el JSON de ajustes conservando todo lo demás. */
export function mergePreferences(settings: unknown, patch: PreferencesPatch): Record<string, unknown> {
  const root = asRecord(settings)
  return {
    ...root,
    ...(patch.orders ? { orders: { ...asRecord(root.orders), ...patch.orders } } : {}),
    ...(patch.portal ? { portal: { ...asRecord(root.portal), ...patch.portal } } : {}),
  }
}

export async function loadTenantPreferences(tenantId: string): Promise<TenantPreferences> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  return preferencesFrom(tenant?.settings)
}
