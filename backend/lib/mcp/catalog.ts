/**
 * Catálogo cerrado de capacidades que un conector MCP podrá solicitar.
 *
 * Este catálogo no crea sesiones ni concede permisos. Cada acción se traduce a
 * un permiso existente de MobOS y después pasa por authorization.ts.
 */
export const MCP_ACTIONS = [
  'products.read',
  'products.write',
  'prices.write',
  'customers.read',
  'customers.write',
  'company.read',
  'company.write',
  'sales.read',
  'sales.write',
  'reports.read',
  'product_images.write',
] as const
export type McpAction = (typeof MCP_ACTIONS)[number]

export const MCP_SCOPES = [
  'products:read', 'products:write', 'prices:write',
  'customers:read', 'customers:write', 'company:read',
  'sales:read', 'sales:write', 'reports:read', 'product_images:write',
] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export type McpCatalogEntry = {
  action: McpAction
  scope: McpScope
  label: string
  moduleId: string
  permission: string
  alternativePermissions?: readonly string[]
  mutating: boolean
  allowedRoles?: readonly string[]
  branchScoped: boolean
}

export const MCP_CATALOG: readonly McpCatalogEntry[] = [
  { action: 'products.read', scope: 'products:read', label: 'Leer productos y variantes', moduleId: 'inventario', permission: 'products:read', alternativePermissions: ['products:manage'], mutating: false, branchScoped: true },
  { action: 'products.write', scope: 'products:write', label: 'Crear o editar productos', moduleId: 'inventario', permission: 'products:manage', mutating: true, branchScoped: true },
  { action: 'prices.write', scope: 'prices:write', label: 'Editar precios', moduleId: 'inventario', permission: 'products:manage', mutating: true, branchScoped: false },
  { action: 'customers.read', scope: 'customers:read', label: 'Leer clientes', moduleId: 'clientes', permission: 'customers:manage', mutating: false, branchScoped: false },
  { action: 'customers.write', scope: 'customers:write', label: 'Crear o editar clientes', moduleId: 'clientes', permission: 'customers:manage', mutating: true, branchScoped: false },
  { action: 'company.read', scope: 'company:read', label: 'Leer datos de la empresa', moduleId: 'equipo', permission: 'dashboard:read', mutating: false, branchScoped: false },
  { action: 'company.write', scope: 'company:write', label: 'Editar datos de la empresa', moduleId: 'equipo', permission: 'dashboard:read', allowedRoles: ['ADMIN'], mutating: true, branchScoped: false },
  { action: 'sales.read', scope: 'sales:read', label: 'Leer ventas y pedidos', moduleId: 'ventas', permission: 'orders:own', alternativePermissions: ['orders:branch', 'orders:manage'], mutating: false, branchScoped: true },
  { action: 'sales.write', scope: 'sales:write', label: 'Crear o editar ventas', moduleId: 'ventas', permission: 'orders:manage', mutating: true, branchScoped: true },
  { action: 'reports.read', scope: 'reports:read', label: 'Leer informes', moduleId: 'reportes', permission: 'reports:read', mutating: false, branchScoped: false },
  { action: 'product_images.write', scope: 'product_images:write', label: 'Subir fotos de productos', moduleId: 'inventario', permission: 'products:manage', mutating: true, branchScoped: true },
] as const

export function catalogEntry(action: unknown): McpCatalogEntry | null {
  return typeof action === 'string' ? MCP_CATALOG.find(entry => entry.action === action) ?? null : null
}

export function scopeForAction(action: unknown): McpScope | null {
  return catalogEntry(action)?.scope ?? null
}
