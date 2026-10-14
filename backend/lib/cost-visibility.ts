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

const UNIT_COST_FIELDS = ['costPyg', 'originalCost', 'exchangeRatePyg', 'consignorPyg', 'consignorName', 'consignorPhone', 'costCurrency'] as const

/**
 * El nombre real del proveedor es un dato comercial distinto del costo (#400):
 * solo ADMIN/GERENTE lo ven, sin importar «vendedores ven costos». El resto
 * recibe la sigla (badge). No depende de ningún ajuste del negocio.
 */
export function canSeeSupplierName(role: string | null | undefined): boolean {
  return !!role && COST_ROLES.includes(role)
}

export const SUPPLIER_NO_CODE = 'S/S'

export type SupplierBadge = { id: string | null; code: string; icon?: string | null; color?: string | null }

/** Lo único del proveedor que ve un rol sin permiso. La sigla nunca se deriva del nombre: sin sigla es «S/S». */
export function supplierBadge(supplier: { id?: string | null; code?: string | null; icon?: string | null; color?: string | null } | null | undefined): SupplierBadge {
  const code = typeof supplier?.code === 'string' ? supplier.code.trim() : ''
  const badge: SupplierBadge = { id: supplier?.id ?? null, code: code || SUPPLIER_NO_CODE }
  if (supplier?.icon) badge.icon = supplier.icon
  if (supplier?.color) badge.color = supplier.color
  return badge
}

/** Texto para columnas/etiquetas: el nombre real solo para gerencia; si no, la sigla. */
export function supplierLabel(role: string | null | undefined, supplier: { name?: string | null; code?: string | null } | null | undefined, fallbackName?: string | null): string {
  if (canSeeSupplierName(role)) return supplier?.name || fallbackName || ''
  return supplierBadge(supplier).code
}

/**
 * Quita costos y montos de consignación de una unidad (según `canSee`) y reemplaza
 * al proveedor por su sigla para quien no puede ver el nombre (`canSeeSupplier`).
 * `supplierId` se conserva: es un id opaco, el nombre no sale de él.
 */
export function redactUnitCosts<T extends Record<string, unknown>>(unit: T, canSee: boolean, canSeeSupplier: boolean): T {
  if (canSee && canSeeSupplier) return unit
  const copy: Record<string, unknown> = { ...unit }
  if (!canSeeSupplier && ('supplier' in copy || 'supplierName' in copy)) {
    const relation = copy.supplier && typeof copy.supplier === 'object' ? (copy.supplier as Record<string, unknown>) : null
    const badge = supplierBadge({ id: (relation?.id as string | undefined) ?? (copy.supplierId as string | null | undefined) ?? null, code: relation?.code as string | undefined, icon: relation?.icon as string | undefined, color: relation?.color as string | undefined })
    copy.supplier = badge
    if ('supplierName' in copy) copy.supplierName = badge.code
  }
  if (canSee) return copy as T
  for (const field of UNIT_COST_FIELDS) if (field in copy) copy[field] = null
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

/**
 * Pedido completo sin costos: líneas vivas y copia congelada del comprobante
 * (receiptSnapshot.datos.items). Usar en toda ruta que devuelva un pedido con ítems.
 */
export function redactOrderCosts<T extends Record<string, any>>(order: T, canSee: boolean): T {
  if (canSee || !order) return order
  const copy: Record<string, any> = { ...order }
  if (Array.isArray(copy.items)) copy.items = copy.items.map((item: Record<string, unknown>) => redactOrderItemCosts(item, false))
  const snapshot = copy.receiptSnapshot
  if (snapshot && typeof snapshot === 'object' && snapshot.datos && Array.isArray(snapshot.datos.items)) {
    copy.receiptSnapshot = { ...snapshot, datos: { ...snapshot.datos, items: snapshot.datos.items.map((item: Record<string, unknown>) => redactOrderItemCosts(item, false)) } }
  }
  return copy as T
}

const COST_KEY = /cost|costo|consignor|exchangeRate/i
const SUPPLIER_KEY = /supplier|proveedor/i

/**
 * Metadata de auditoría sin claves de costo (si `canSee` es falso) ni de
 * proveedor (si `canSeeSupplier` es falso); recursivo en objetos y listas.
 */
export function redactAuditMetadata(value: unknown, canSee: boolean, canSeeSupplier: boolean): unknown {
  if ((canSee && canSeeSupplier) || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => redactAuditMetadata(item, canSee, canSeeSupplier))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = (!canSee && COST_KEY.test(key)) || (!canSeeSupplier && SUPPLIER_KEY.test(key)) ? null : redactAuditMetadata(inner, canSee, canSeeSupplier)
  }
  return out
}

/** Quita de una tabla exportable las columnas indicadas (por encabezado) para roles sin permiso. */
export function dropCostColumns<Cell>(headers: string[], rows: Cell[][], hidden: string[], canSee: boolean): { headers: string[]; rows: Cell[][] } {
  if (canSee) return { headers, rows }
  const keep = headers.map((header, index) => (hidden.includes(header) ? -1 : index)).filter(index => index >= 0)
  return { headers: keep.map(index => headers[index]), rows: rows.map(row => keep.map(index => row[index])) }
}

// ── Directorio de proveedores para redactar texto libre (#400) ──────────────
// Defensa en profundidad: aunque una ruta arme un texto con el nombre real
// («Pago a Mayorista Norte», un asiento de caja, una nota), la última pasada
// lo cambia por la sigla para quien no puede ver el nombre.

export type SupplierDirectoryEntry = { id: string; name: string; code: string | null; icon?: string | null; color?: string | null }
export type SupplierDirectory = { byId: Map<string, SupplierDirectoryEntry>; entries: SupplierDirectoryEntry[] }

export function buildSupplierDirectory(entries: SupplierDirectoryEntry[]): SupplierDirectory {
  return { byId: new Map(entries.map(entry => [entry.id, entry])), entries }
}

/** Todos los proveedores de la empresa (id, nombre, sigla). */
export async function loadSupplierDirectory(tenantId: string): Promise<SupplierDirectory> {
  const { prisma } = await import('./prisma')
  const rows = await prisma.supplier.findMany({ where: { tenantId }, select: { id: true, name: true, code: true }, take: 5000 })
  return buildSupplierDirectory(rows)
}

/** Sigla del proveedor por id; «S/S» si no tiene sigla o no existe. */
export function supplierCodeFor(directory: SupplierDirectory, supplierId: string | null | undefined): string {
  return supplierBadge(supplierId ? directory.byId.get(supplierId) : null).code
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Cambia cada aparición del nombre de un proveedor por su sigla, en cualquier texto (recursivo). */
export function scrubSupplierNames<T>(value: T, directory: SupplierDirectory): T {
  const named = directory.entries.filter(entry => entry.name && entry.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length)
  if (!named.length) return value
  const patterns = named.map(entry => ({ re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(entry.name.trim())}(?![\\p{L}\\p{N}])`, 'giu'), code: supplierBadge(entry).code }))
  const scrubText = (text: string) => patterns.reduce((acc, { re, code }) => acc.replace(re, code), text)
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return scrubText(node)
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object' && !(node instanceof Date) && typeof (node as { toJSON?: unknown }).toJSON !== 'function') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, inner]) => [key, walk(inner)]))
    }
    return node
  }
  return walk(value) as T
}

/**
 * Respuesta lista para quien no ve el nombre del proveedor: cada relación
 * `supplier` pasa a su badge y todo texto libre pierde el nombre real.
 */
export function redactSupplierNames<T>(value: T, directory: SupplierDirectory): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object' && !(node instanceof Date) && typeof (node as { toJSON?: unknown }).toJSON !== 'function') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, inner]) => {
        if (key === 'supplier' && inner && typeof inner === 'object' && !Array.isArray(inner)) {
          const relation = inner as Record<string, unknown>
          const known = typeof relation.id === 'string' ? directory.byId.get(relation.id) : undefined
          return [key, supplierBadge({ id: (relation.id as string | undefined) ?? null, code: (relation.code as string | undefined) ?? known?.code ?? null, icon: relation.icon as string | undefined, color: relation.color as string | undefined })]
        }
        return [key, walk(inner)]
      }))
    }
    return node
  }
  return scrubSupplierNames(walk(value) as T, directory)
}
