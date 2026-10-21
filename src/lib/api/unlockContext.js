// A successful PIN confirmation must never reopen a cached, broader identity.
export function mismoContextoDeDesbloqueo(expected, fresh) {
  if (!expected?.id || !expected?.tenantId || !expected?.role || !fresh?.id || !fresh?.tenantId || !fresh?.role) return false
  if (!Array.isArray(expected.permissions) || !Array.isArray(fresh.permissions)) return false
  if ([...expected.permissions, ...fresh.permissions].some(value => typeof value !== 'string')) return false
  const permissions = value => JSON.stringify([...new Set(value)].sort())
  return expected.id === fresh.id && expected.tenantId === fresh.tenantId && expected.role === fresh.role
    && (expected.branchId || null) === (fresh.branchId || null)
    && (expected.pinLength || 4) === (fresh.pinLength || 4)
    && permissions(expected.permissions) === permissions(fresh.permissions)
}
