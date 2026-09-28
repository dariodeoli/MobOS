# Sucursal efectiva (#286)

Regla de producto (decisión de Dario, 28/09): un usuario **sin sucursal
asignada** no queda bloqueado. Se resuelve su **sucursal efectiva** así:

1. **La sucursal asignada** (si el usuario la tiene) siempre manda.
2. Sin asignada, **la última que usó** (preferencia por usuario).
3. Si no usó ninguna, **la primera sucursal creada** de la empresa
   (`Branch.createdAt` ascendente; desempate por `id`).

## Dónde se aplica

La resolución vive en `backend/lib/sucursal-efectiva.ts`
(`sucursalEfectiva(session)`) y se usa donde la sesión/POS necesitaba la
sucursal:

| Superficie | Ruta |
| --- | --- |
| Sesión (el POS toma la sucursal de acá) | `GET /api/auth/me` |
| Catálogo del POS | `GET /api/products` (vendedor/cajera) |
| Unidades serializadas | `GET /api/inventory-units` |
| Venta | `POST /api/orders` (el pedido queda en la efectiva) |
| Listado de pedidos del vendedor/cajera | `GET /api/orders` |
| Alta/edición de productos donde ya se resolvía | `POST/PATCH /api/products` |

Para roles operativos (`VENDEDOR`, `CAJERA`) el filtro por sucursal ya no
puede caer en `branchId IS NULL` cuando el usuario no tiene sucursal: usa la
efectiva (y sigue ocultando el catálogo de otras sucursales). Un pedido de
otra sucursal sigue respondiendo 403 («No autorizado para esa sucursal.»).

El usuario con sucursal asignada conserva su comportamiento: la efectiva es
la asignada y la preferencia «última usada» no se consulta. Los dueños y
gerentes que eligen sucursal con el selector siguen mandándola explícita en
los endpoints que la aceptan (`branchId` del cuerpo/consulta).

## Persistencia

`UserBranchUsage` (migración `20260928090000_user_branch_usage`, aditiva e
idempotente): una fila por `(userId, branchId)` con `usedAt`. La resolución
registra el uso **solo cuando la efectiva cambia** respecto de la última
registrada: no hay escrituras por request. `ensureStoreBranch` se mantiene
para su caso (ADMIN/GERENTE con una sola sucursal: se la asigna y persiste).

## Pruebas

- `backend/tests/sucursal-efectiva.test.ts` (unit): la regla pura
  asignada → última usada → primera creada.
- `backend/tests/sucursal-efectiva.mjs` (arnés de integración, corre dentro de
  `backend/tests/integration-http.sh`): siembra un vendedor **sin** sucursal
  con dos sucursales y dos productos, y verifica sesión, catálogo, unidades,
  venta y listado de pedidos con la efectiva; después registra un uso en la
  segunda sucursal y verifica que la preferencia manda. También comprueba que
  pedir explícitamente otra sucursal sigue dando 403.

## Pendiente / fuera de alcance

Otras superficies que hoy usan `session.user.branchId` directo (caja, gastos,
auditorías) siguen con el comportamiento previo: si el caso de un usuario sin
sucursal aparece ahí, conviene migrarlas a `sucursalEfectiva`.
