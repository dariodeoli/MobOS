// Visibilidad de costos: una sola regla y un solo juego de redactores para todas
// las rutas. Costo, proveedor y consignación son datos de administración y
// gerencia; VENDEDOR/CAJERA (y cualquier otro rol) nunca los reciben.

const COST_ROLES = ['ADMIN', 'GERENTE']

export function canSeeCost(role: string | null | undefined): boolean {
  return !!role && COST_ROLES.includes(role)
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
