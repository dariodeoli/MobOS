import { catalogForRole, PERMISSION_CATALOG, requireSession, USER_ROLES } from '../../../lib/auth'
import { error, json } from '../../../lib/http'

// Catálogo de permisos granulares que el dueño puede recortar por integrante.
// El backend es la fuente de verdad: la interfaz solo dibuja esta lista y las
// rutas aplican `canAccessAny` sobre los permisos efectivos de la sesión.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('No autorizado.', 403)
  const byRole = Object.fromEntries(
    USER_ROLES.filter(role => role !== 'ADMIN').map(role => [role, catalogForRole(role)]),
  )
  return json({ permissions: PERMISSION_CATALOG.map(item => ({ ...item })), byRole })
}
