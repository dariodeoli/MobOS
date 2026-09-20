# Reglas de permisos granulares (MobOS)

Regla viva del proyecto, hermana de `docs/TOKENS.md` y `docs/AVATAR.md`. El
backend es la **autoridad**: la interfaz dibuja lo que el servidor decide, nunca
al revés. Antes de agregar una ruta sensible o un permiso nuevo, seguí este
contrato.

## 1. Dónde vive el mapa

`backend/lib/auth.ts` es la **única** fuente de verdad:

| Pieza | Qué es |
| --- | --- |
| `PERMISSION_CATALOG` | Catálogo visible (`id` + `label`) que la UI muestra en Equipo → Permisos. |
| `ROLE_PERMISSIONS` | Línea base por rol. `ADMIN` es `['*']` (dueño: todo). |
| `OWNER_ONLY_PERMISSIONS` | Permisos que no están en la base de ningún rol operativo: solo el dueño. |
| `effectivePermissions(rol, configurado)` | Base del rol ∩ lo configurado. **Solo recorta, nunca concede.** |
| `hasPermission(usuario, permiso)` / `canAccessAny(usuario, [...])` | Chequeo server-side por ruta. |

Los permisos efectivos viajan en la sesión: `requireSession` devuelve
`session.user.permissions` (así la UI no duplica la lógica) y
`GET /api/permissions` (solo dueño) entrega el catálogo y la base por rol.

## 2. Cómo se aplica en una ruta

```ts
import { canAccessAny, requireSession } from '../../../lib/auth'

const session = await requireSession(request)
if (!session) return error('Falta sesión.', 401)
if (!canAccessAny(session.user, ['finance:manage'])) return error('No autorizado.', 403)
```

Reglas duras:

- El chequeo de permiso va **después** de resolver la sesión y **antes** de
  validar el cuerpo o tocar la base (así el 403 no depende de los datos).
- Multi-tenant: el `tenantId` sale siempre de la sesión, nunca del body.
- Los permisos configurados por integrante **solo recortan** la base del rol.
  Si un permiso no está en la base de ningún rol, la UI no puede concederlo.
- Los roles siguen existiendo para **alcance de datos** (sucursal propia,
  "solo mis ventas"), no para autorizar: eso es del permiso.

## 3. Grupos migrados (referencia)

| Grupo | Permiso(s) | Base |
| --- | --- | --- |
| Caja y finanzas | `finance:read`, `finance:manage` | GERENTE, CAJERA |
| Caja (auditoría, historial, gastos) | `cash:manage`, `payments:manage` | GERENTE / CAJERA |
| Cuentas de cobro | `finance:config` | Solo dueño |
| Equipo | `team:manage` | Solo dueño |
| Impresoras y puentes | `print:manage` | Solo dueño |
| Métricas de impresión | `print:metrics` | GERENTE |
| Marketing y campañas | `marketing:manage` | GERENTE |
| Cobranzas por WhatsApp | `collections:manage` | GERENTE, CAJERA |
| Compras y proveedores | `purchases:manage` | GERENTE |
| Autorizaciones | `authorizations:resolve` | GERENTE |
| Comisiones (liquidar y pagar) | `commissions:settle` | GERENTE |
| Reparto | `delivery:use`, `delivery:manage` | REPARTIDOR / VENDEDOR, CAJERA, GERENTE |

## 4. Cómo extenderlo

1. Agregar el `id` y su `label` a `PERMISSION_CATALOG`.
2. Agregarlo a la línea base de los roles que ya podían hacer la acción
   (agregarlo es **ampliar**: verificá que sea intencional).
3. Reemplazar el chequeo de rol de las rutas por `hasPermission`/`canAccessAny`.
4. Cubrir el borde en `backend/tests/permissions.test.ts` (mapa) y, si toca una
   ruta, en `backend/tests/permissions-http.mjs` (matriz por rol + recorte).
5. Si la UI necesita esconder una acción, usar `useSesion().puede('id:accion')`;
   nunca repetir listas de roles en el cliente.
