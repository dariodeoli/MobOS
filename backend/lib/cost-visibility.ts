// Visibilidad de costos: una sola regla y un solo juego de redactores para todas
// las rutas. Costo, proveedor y consignación son datos de administración y
// gerencia; VENDEDOR/CAJERA los ven mientras el dueño lo permita (Configuración →
// Equipo y acceso, por defecto sí); cualquier otro rol nunca los recibe.

const COST_ROLES = ['ADMIN', 'GERENTE']
const SELLER_ROLES = ['VENDEDOR', 'CAJERA']

/** Ajuste del negocio (Tenant.settings.permissions.sellerSeesCosts). Ausente = true. */
export function sellerSeesCostsFrom(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return true
  const permissions = (settings as Record<string, unknown>).permissions
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return true
  return (permissions as Record<string, unknown>).sellerSeesCosts !== false
}

/**
 * ADMIN/GERENTE siempre ven costos. VENDEDOR/CAJERA siguen el ajuste del
 * negocio (por defecto sí). Cualquier otro rol nunca.
 */
export function canSeeCost(role: string | null | undefined, settings?: unknown): boolean {
  if (!role) return false
  if (COST_ROLES.includes(role)) return true
  if (SELLER_ROLES.includes(role)) return sellerSeesCostsFrom(settings)
  return false
}

const SETTINGS_TTL_MS = 5000
const settingsCache = new Map<string, { at: number; sellerSeesCosts: boolean }>()

export function invalidateCostVisibility(tenantId: string) {
  settingsCache.delete(tenantId)
}

/** Lee el ajuste del negocio (caché corta por proceso; se invalida al guardar). */
export async function sellerSeesCosts(tenantId: string): Promise<boolean> {
  const hit = settingsCache.get(tenantId)
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.sellerSeesCosts
  const { prisma } = await import('./prisma')
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  const value = sellerSeesCostsFrom(tenant?.settings)
  settingsCache.set(tenantId, { at: Date.now(), sellerSeesCosts: value })
  return value
}

/** Atajo para las rutas: resuelve el permiso de costos de la sesión. */
export async function canSeeCostForSession(session: { user: { role: string; tenantId: string } }): Promise<boolean> {
  const role = session.user.role
  if (!SELLER_ROLES.includes(role)) return canSeeCost(role)
  return canSeeCost(role, { permissions: { sellerSeesCosts: await sellerSeesCosts(session.user.tenantId) } })
}

const UNIT_COST_FIELDS = ['costPyg', 'originalCost', 'exchangeRatePyg', 'consignorPyg', 'consignorName', 'consignorPhone', 'costCurrency', 'supplierId', 'supplierName'] as const

/** Quita costos, proveedor y montos de consignación de una unidad para roles sin permiso. */
export function redactUnitCosts<T extends Record<string, unknown>>(unit: T, canSee: boolean): T {
  if (canSee) return unit
  const copy: Record<string, unknown> = { ...unit }
  for (const field of UNIT_COST_FIELDS) if (field in copy) copy[field] = null
  if ('supplier' in copy) delete copy.supplier
  const inspection = copy.inspection
  if (inspection && typeof inspection === 'object' && !Array.isArray(inspection) && 'costoRepuestosPyg' in inspection) {
    copy.inspection = { ...(inspection as Record<string, unknown>), costoRepuestosPyg: null }
  }
  return copy as T
}

/** Producto del catálogo sin costo para roles sin permiso. */
export function redactProductCosts<T extends Record<string, unknown>>(product: T, canSee: boolean): T {
  if (canSee) return product
  const copy: Record<string, unknown> = { ...product }
  if ('costPyg' in copy) copy.costPyg = null
  return copy as T
}

/** Línea de pedido sin costo unitario (el costo congelado al vender es dato de administración). */
export function redactOrderItemCosts<T extends Record<string, unknown>>(item: T, canSee: boolean): T {
  if (canSee) return item
  const copy: Record<string, unknown> = { ...item }
  for (const field of ['unitCostPyg', 'baseUnitCostPyg']) if (field in copy) copy[field] = null
  return copy as T
}

const COST_KEY = /cost|costo|supplier|proveedor|consignor|exchangeRate/i

/** Metadata de auditoría sin claves de costo/proveedor (recursivo en objetos y listas). */
export function redactAuditMetadata(value: unknown, canSee: boolean): unknown {
  if (canSee || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => redactAuditMetadata(item, false))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = COST_KEY.test(key) ? null : redactAuditMetadata(inner, false)
  }
  return out
}

/** Quita de una tabla exportable las columnas indicadas (por encabezado) para roles sin permiso. */
export function dropCostColumns<Cell>(headers: string[], rows: Cell[][], hidden: string[], canSee: boolean): { headers: string[]; rows: Cell[][] } {
  if (canSee) return { headers, rows }
  const keep = headers.map((header, index) => (hidden.includes(header) ? -1 : index)).filter(index => index >= 0)
  return { headers: keep.map(index => headers[index]), rows: rows.map(row => keep.map(index => row[index])) }
}
