# Centro de Abastecimiento · Fase 1 (demanda y tablero) — spec técnica

Baja a la arquitectura de MobOS el plan de #250 (flujo venta/reserva sin stock →
necesidad → compra → lote → recepción → depósito → stock). **Esta entrega es la
base de F1**: modelo + migración aditiva + API mínima «Por comprar» con
consolidación y tests. **Sin UI y sin activar** (nada la llama todavía) para
revisión de Dario.

## 1. Alcance de esta entrega

| Incluye | No incluye (fases siguientes) |
|---|---|
| Tabla `SupplyNeed` (migración aditiva e idempotente) | UI del panel y de la tarjeta de compra |
| Carga manual de necesidades (`POST`) | Generación automática al vender/reservar (F2) |
| Vista «Por comprar» consolidada (`GET`) | Compra, proveedor/costo, stock adicional (F2) |
| Asignación a comprador y cancelación auditadas (`PATCH`) | IMEI/etiquetas (F3), lotes (F4), recepción (F5) |

Reglas no negociables que ya respeta la base: **no se crea stock** (solo la
recepción lo hará), toda necesidad conserva su vínculo con la venta/reserva, y
toda corrección deja **auditoría**.

## 2. Modelo `SupplyNeed`

| Campo | Tipo | Notas |
|---|---|---|
| `tenantId` / `branchId` | text | el destino final de las unidades |
| `productId` | text | producto del catálogo |
| `condition` | `ProductCondition` | variante a comprar; **nunca se mezcla** en la consolidación |
| `quantity` | int | 1..9999 |
| `source` | text | `SALE_NO_STOCK` · `RESERVATION_NO_STOCK` · `QUANTITY_OVER_STOCK` · `BELOW_REORDER` · `ORDER_COMMITTED` · `MANUAL` |
| `priority` | text | `BAJA` · `NORMAL` · `ALTA` · `URGENTE` (default `NORMAL`) |
| `status` | text | `ABIERTA` · `ASIGNADA` · `COMPRADA` · `RECIBIDA` · `CANCELADA` (hoy solo se usan ABIERTA/ASIGNADA/CANCELADA) |
| `promisedAt` | datetime? | fecha prometida al cliente (prioriza la compra) |
| `orderId` / `orderItemId` | text? | vínculo con la venta o reserva original |
| `customerId` | text? | cliente (el nombre viaja solo a ADMIN/GERENTE) |
| `assignedToId` | text? | comprador asignado |
| `notes`, `createdById`, `createdAt`, `updatedAt` | | auditoría básica |
| `dedupeKey` | text? | clave única por tenant para las automáticas (repetir la misma demanda no duplica la fila) |

Índices: `(tenantId, status, priority, createdAt)` para el panel,
`(tenantId, productId, condition, status)` para la consolidación y
`(tenantId, branchId, status)` por sucursal. `source`, `priority` y `status` son
texto (no enums de Postgres) para poder sumar orígenes/estados sin migración; los
valores válidos viven en `backend/lib/supply.ts`.

## 3. Consolidación (#250 §5)

`consolidarNecesidades()` (pura, en `backend/lib/supply.ts`):

- Agrupa por **producto + condición** (jamás mezcla color/capacidad/condición).
- Suma cantidades, deja la **prioridad más alta** y la **fecha prometida más
  próxima**.
- **Conserva los destinos**: cada necesidad aporta su pedido (con cliente) o su
  reposición por sucursal; las del mismo pedido/sucursal se fusionan sumando.
  Ejemplo del plan: 6 iguales → `1 pedido A · 2 pedido B · 3 stock`.
- Orden del panel: prioridad ↓, fecha prometida ↑, cantidad ↓.

## 4. API (mínima, gateada por `stock:manage`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/supply/needs` | lista consolidada. Filtros: `status`, `branchId`, `productId`, `assignedToId`, `limit`. Por defecto solo lo que falta comprar (ABIERTA/ASIGNADA); lo COMPRADO se pide con `?status=COMPRADA` |
| `POST` | `/api/supply/needs` | carga manual (`MANUAL`): `{ productId, quantity, branchId?, condition?, priority?, promisedAt?, notes? }` |
| `PATCH` | `/api/supply/needs` | `{ id, action: 'assign', assignedToId }` o `{ id, action: 'cancel', reason }` |

Respuesta del listado:

```json
{
  "fecha": "2026-09-24T12:00:00.000Z",
  "totales": { "necesidades": 6, "grupos": 2, "unidades": 9 },
  "grupos": [{
    "productoId": "p1", "producto": "iPhone 15", "condicion": "NEW", "cantidad": 6,
    "prioridad": "URGENTE", "prometidaEl": "2026-10-01T10:00:00.000Z",
    "origenes": ["SALE_NO_STOCK", "BELOW_REORDER"],
    "destinos": [
      { "tipo": "PEDIDO", "etiqueta": "Pedido MOB-0048 · Juan Pérez", "cantidad": 1, "pedidoId": "o1", "clienteId": "c1", "prometidaEl": "…" },
      { "tipo": "STOCK", "etiqueta": "Reposición · Casa Central", "cantidad": 3, "sucursalId": "b1", "prometidaEl": null }
    ],
    "necesidades": ["n1", "n2", "n3"]
  }]
}
```

Permisos: `stock:manage` para leer y escribir (vendedor → 403; sin sesión → 401).
El **nombre del cliente** solo se incluye para ADMIN/GERENTE (el resto ve el id).
La cancelación exige motivo (≥3 caracteres) y la asignación valida que el
comprador sea de la empresa. Cada alta/asignación/cancelación escribe su
`auditLog` (`SUPPLY_NEED_CREATED` · `SUPPLY_NEED_ASSIGNED` ·
`SUPPLY_NEED_CANCELLED`, área **Abastecimiento**).

## 5. Dónde se enganchará la demanda automática (F2)

Sin tocar nada todavía; puntos de enganche previstos:

- **Venta sin stock / cantidad > stock**: en el checkout (`POST /api/orders`),
  cuando la línea no tiene unidad/serial y el stock no alcanza.
- **Reserva sin unidad**: al crear la reserva; una reserva de una unidad
  existente **no** genera necesidad (solo la diferencia faltante).
- **Bajo punto de reposición**: el mismo barrido que arma las alertas de stock
  (`reorderPoint`), agrupando por producto + sucursal.
- **Pedido comprometido con fecha**: `ORDER_COMMITTED` con `promisedAt`.

Todas usarán `dedupeKey` (p. ej. `SALE_NO_STOCK:<orderItemId>`) para no repetir
la fila si el evento se procesa dos veces.

## 6. Tests

- Unit `backend/tests/supply.test.ts`: consolidación (agrupación, prioridad,
  fecha más próxima, destinos fusionados y orden) y validaciones de la carga
  manual. Registrado en `run-unit.cjs`.
- API `backend/tests/supply-needs.mjs` (arnés HTTP, `MOBOS_IT_EXECUTE=1`): alta
  manual (3 para el mismo producto, 1 con otra condición), consolidación, filtro
  por producto, asignación/cancelación auditadas, y 400/401/403.
- `npm run db:check`: la migración aplicada coincide con el modelo.

## 7. Estado y rollback

- **No activado**: ninguna pantalla ni automatismo llama a la API (no hay UI).
- La migración es aditiva: si se descarta, la tabla queda sin uso y se puede
  borrar sin afectar datos existentes.

---

# Motor de demanda (cierre de F1) — #250/#254

La API «Por comprar» ya existía; con esta entrega **nada queda manual**: las
necesidades nacen de los eventos reales y llegan al panel con su centro de
compra. Implementado en `backend/lib/supply-demand.ts` y enganchado en la venta
(`api/orders`), la reserva (`api/inventory-reservations`) y los mínimos.

## 1. Fuentes automáticas

| Fuente | Cuándo | Cantidad |
| --- | --- | --- |
| `SALE_NO_STOCK` | Venta sobre pedido de un producto sin unidades o serializado sin unidad disponible | Lo que quedó sin cubrir (`stockPending + serialsPending`) |
| `QUANTITY_OVER_STOCK` | Venta offline que descontó solo lo disponible | El faltante real |
| `ORDER_COMMITTED` | La venta/pedido trae `promisedAt` | Lo que quedó sin cubrir; prioridad por la promesa |
| `RESERVATION_NO_STOCK` | Reserva/backorder con menos unidades que las pedidas | Solo la diferencia |
| `BELOW_REORDER` | Al vender, el producto queda en `stock <= reorderPoint` | `punto - stock + 1` (una por producto/sucursal/semana) |

- Prioridad: promesa vencida ⇒ `URGENTE`; ≤ 48 h ⇒ `ALTA`; ≤ 7 días y sin fecha
  ⇒ `NORMAL`; faltante offline ⇒ `ALTA`.
- Deduplicación por `dedupeKey` (único por empresa): repetir el evento no
  duplica. Cada alta deja auditoría `SUPPLY_NEED_AUTO`.
- **No crea stock**: la unidad sigue apareciendo recién en la recepción (F5).

## 2. Centros de compra (origen)

- `SupplyNeed.origin`: `CDE · USA · LOCAL` + códigos nuevos de 2 a 8 letras o
  números (centros futuros). Migración `20261205000000_supply_need_origin`.
- `GET /api/supply/needs?origin=USA` filtra por centro; los grupos exponen
  `centros[]` y cada destino su `centro`.
- `PATCH /api/supply/needs { id, action: 'assign', assignedToId?, origin? }`
  asigna comprador y/o centro (audita ambos).

## 3. Entradas nuevas de la API

- `POST /api/orders` acepta `promisedAt` (ISO, opcional): marca el pedido
  comprometido con fecha y prioriza su demanda.
- `POST /api/inventory-reservations` acepta `productId` + `quantity` junto a los
  IMEI: reserva lo existente y genera `RESERVATION_NO_STOCK` por la diferencia.
  Sin esos campos el comportamiento es el de siempre.

## 4. Para PLT (panel/móvil) y CMP (objetos)

- **PLT**: pestaña **Por comprar** con tarjetas por **grupo consolidado**
  (producto + condición, destinos conservados: pedido A / pedido B / stock),
  prioridad, fecha prometida, centros, estado y acciones (asignar comprador o
  centro, cancelar con motivo); filtros por centro y comprador; móvil sin scroll
  horizontal.
- **CMP**: objeto **tarjeta de necesidad** (badge de prioridad, chips de
  origen/centro, bloque de destinos y acciones) para reutilizar en el panel y en
  “Comprando”.

## 5. Verificación del cierre

- `backend/tests/supply-demand.test.ts`: prioridades, fuentes, dedupe, centros,
  semana de mínimos (8 casos).
- `backend/tests/supply-needs.mjs` (arnés HTTP): venta sobre pedido con fecha →
  `ORDER_COMMITTED` + `BELOW_REORDER` conviviendo con destinos conservados,
  idempotencia, centro asignado/filtrado, y reserva con faltante →
  `RESERVATION_NO_STOCK` (36 chequeos).
