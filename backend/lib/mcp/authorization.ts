import { hasPermission, type AuthUser } from '../auth'
import { catalogEntry, IMPLEMENTED_MCP_SCOPES, type McpAction, type McpCatalogEntry, type McpScope } from './catalog'

export type McpAuthorizationContext = {
  tenantId: string | null | undefined
  user: Pick<AuthUser, 'id' | 'tenantId' | 'role' | 'branchId' | 'permissions'> | null | undefined
  /** Estado ya leído por el caller mediante moduleStoreFrom. */
  enabledModules: Readonly<Record<string, { enabled: boolean }>>
  requestedBranchId?: string | null
  /** Scopes granted by the consent record; missing means deny. */
  grantedScopes?: readonly McpScope[]
}

export type McpAuthorizationResult =
  | { allowed: true; entry: McpCatalogEntry; branchId: string | null; dataScope: 'own' | 'branch' | 'all' }
  | { allowed: false; code: 'NO_SESSION' | 'TENANT_MISMATCH' | 'UNKNOWN_ACTION' | 'SCOPE_NOT_GRANTED' | 'MODULE_DISABLED' | 'PERMISSION_DENIED' | 'BRANCH_DENIED' | 'ROLE_DENIED'; reason: string }

type McpDenyCode = 'NO_SESSION' | 'TENANT_MISMATCH' | 'UNKNOWN_ACTION' | 'SCOPE_NOT_GRANTED' | 'MODULE_DISABLED' | 'PERMISSION_DENIED' | 'BRANCH_DENIED' | 'ROLE_DENIED'
const deny = (code: McpDenyCode, reason: string): McpAuthorizationResult => ({ allowed: false, code, reason })

/**
 * Fail-closed authorization for an MCP action. It intentionally accepts a
 * session user, never a raw bearer or an external role claim. The route that
 * calls this function must obtain the session with requireSession first.
 */
export function authorizeMcpAction(action: unknown, context: McpAuthorizationContext): McpAuthorizationResult {
  const entry = catalogEntry(action)
  if (!entry) return deny('UNKNOWN_ACTION', 'La capacidad MCP no está en el catálogo permitido.')
  const user = context.user
  if (!user || !context.tenantId) return deny('NO_SESSION', 'Se requiere una sesión MobOS activa.')
  if (!context.grantedScopes?.includes(entry.scope)) return deny('SCOPE_NOT_GRANTED', 'El consentimiento no concedió este scope.')
  if (user.tenantId !== context.tenantId) return deny('TENANT_MISMATCH', 'La sesión no pertenece a la empresa solicitada.')
  if (context.enabledModules[entry.moduleId]?.enabled !== true) return deny('MODULE_DISABLED', 'El módulo requerido no está activo en esta empresa.')
  if (entry.allowedRoles && !entry.allowedRoles.includes(user.role)) return deny('ROLE_DENIED', 'El rol de la sesión no puede ejecutar esta acción.')
  const requiredPermissions = [entry.permission, ...(entry.alternativePermissions ?? [])]
  if (!requiredPermissions.some(permission => hasPermission(user, permission))) return deny('PERMISSION_DENIED', 'El rol o los permisos de la sesión no permiten esta acción.')

  const requested = context.requestedBranchId ?? null
  const dataScope = entry.action === 'sales.read' || entry.action === 'sales.write' ? (hasPermission(user, 'orders:manage') ? 'all' : hasPermission(user, 'orders:branch') ? 'branch' : 'own') : entry.branchScoped ? 'branch' : 'all'
  if (entry.branchScoped && user.role !== 'ADMIN' && !user.branchId && dataScope !== 'all') return deny('BRANCH_DENIED', 'La sesión no tiene una sucursal asignada para esta capacidad.')
  if (entry.branchScoped && user.role !== 'ADMIN' && user.branchId && requested && requested !== user.branchId && dataScope !== 'all') {
    return deny('BRANCH_DENIED', 'La sesión no puede acceder a esa sucursal.')
  }
  if (entry.branchScoped && user.role !== 'ADMIN' && user.branchId && !requested && dataScope !== 'all') {
    return { allowed: true, entry, branchId: user.branchId, dataScope }
  }
  return { allowed: true, entry, branchId: requested, dataScope }
}

export function parseMcpScopes(input: unknown): McpScope[] {
  if (typeof input !== 'string') return []
  const allowed = new Set<string>(IMPLEMENTED_MCP_SCOPES)
  const values = input.split(/[ ]+/).filter(Boolean)
  if (!values.length || values.some(scope => !allowed.has(scope))) return []
  return [...new Set(values)] as McpScope[]
}

export function mcpAuditMetadata(input: { action: McpAction; connector: string; requestId?: string; branchId?: string | null }) {
  // Metadata is deliberately bounded and contains no token, secret or payload.
  return {
    action: input.action,
    connector: input.connector.slice(0, 80),
    ...(input.requestId ? { requestId: input.requestId.slice(0, 120) } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
  }
}

export const MCP_AUDIT_ACTIONS = {
  ACCESS_REQUESTED: 'MCP_ACCESS_REQUESTED',
  ACCESS_GRANTED: 'MCP_ACCESS_GRANTED',
  ACCESS_DENIED: 'MCP_ACCESS_DENIED',
  TOKEN_REVOKED: 'MCP_TOKEN_REVOKED',
} as const
