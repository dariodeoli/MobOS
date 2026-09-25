# Inventario · carga más rápida (#247, seguimiento)

**Pedido**: la pantalla de Inventario demora en cargar; medir y optimizar
(consultas/índices, paginación, caché/hidratación, secciones diferidas) con
evidencia antes/después.

## Qué se midió

`e2e/perf-247.spec.js` (la auditoría de #247: carga fría/caliente/segunda con CPU
4×, mediana de 3, tiempos hasta el marcador «listo» de cada pantalla y peso de
las APIs). Corridas en el harness local (Vite dev; ver nota de modo más abajo):

- **antes**: `antes/perf-247.{md,json}`
- **después**: `despues/perf-247.{md,json}`

## Qué cambiaba antes

La lista de Unidades pagaba **nueve** consultas antes de pintar la primera fila:

| Consulta | ¿La lista la necesita para la primera fila? |
|---|---|
| `/api/inventory-units` | **sí** |
| `/api/inventory-units?view=removed` | no (pestaña Eliminados) |
| `/api/inventory-reservations` | no (pestaña Reservas) |
| `/api/transfers` | no (pestaña Traslados) |
| `/api/stock-locations` | no (modales/ficha) |
| `/api/inventory-branches` | no (**ya venían en la sesión**, se repetía) |
| `/api/suppliers` | no (modal de recepción; 361–595 ms) |
| `/api/fx` | no (se usa al editar el costo; 231–664 ms) |
| `/api/stock-alerts` | no (pestaña Alertas; 594 ms) |

Además el listado remoto no tenía tope por página y el estado de carga mostraba
el vacío (se corrigió en el paso anterior, `unidades-cargando`).

## Qué se hizo

1. **Primer pintado con una sola consulta**: `refresh()` pide las unidades (y el
   catálogo local). El resto se hidrata cuando el hilo queda libre
   (`requestIdleCallback`, con tope de 2,5 s) y **se adelanta** si se abre esa
   pestaña o el modal de recepción.
2. **Sin consultas duplicadas**: las sucursales salen de la sesión (el selector
   del shell ya las hidrata), no se vuelven a pedir en cada carga.
3. **Datos al momento**: la cotización del día se pide solo si alguien guarda un
   costo antes de que llegue la hidratación diferida; la búsqueda del tab
   Eliminados refresca su propio listado.
4. **Backend/índices**: la consulta de unidades ya usa `(tenantId, status,
   updatedAt)`; se midió `EXPLAIN ANALYZE` sin *sequential scans* sobre las
   tablas grandes (ver más abajo). No hizo falta migración.

## Resultado (misma máquina, mismo harness)

| Métrica (inventario) | Antes | Después |
|---|---|---|
| Consultas que bloquean la primera fila | **9** | **1** |
| Llamadas API en la ventana de carga (fría) | 18 | **12** |
| Tiempo total de API (fría) | 2743 ms | **1741 ms** (−37 %) |
| Tiempo total de API (caliente) | 2769 ms | **978 ms** (−65 %) |
| Tiempo total de API (segunda) | 2558 ms | **1056 ms** (−59 %) |
| «Listo» caliente | 1674 ms | **1579–1612 ms** |
| «Listo» segunda | 2210 ms | **1842–1865 ms** |
| «Listo» fría | 1857 ms | 1940–2023 ms (sin mejora consistente) |

La **fría** no baja: está dominada por el *bundle* que sirve el harness en modo
dev (227 módulos sueltos, ~9,8 MB) y por la **primera compilación** de la ruta;
los cambios de arranque/caché de ese tramo son de PLT (#247, nota de
coordinación en el issue). Con el bundle de producción y la caché de la PWA esa
parte es otra historia: se recomienda medir con `MOBOS_E2E_FRONTEND=preview`.

## Índices (medido con `EXPLAIN ANALYZE`)

La lista ordena por `status ASC, "updatedAt" DESC`. El índice existente era
`(tenantId, status, reservedUntil)`: el plan salía con **Incremental Sort** (orden
en memoria) porque la tercera columna no es la del orden. Se agregó el índice que
sí lo sirve:

```sql
CREATE INDEX IF NOT EXISTS "InventoryUnit_tenantId_status_updatedAt_idx"
  ON "InventoryUnit"("tenantId", status, "updatedAt" DESC);
```

Verificación en la base e2e (481 filas de la pantalla): con este volumen el
planner elige ordenar en memoria (0,25 ms, es la opción más barata), pero
**forzando el plan se ve que el índice sirve el orden completo**:

```
SET enable_sort=off;
Index Scan using "InventoryUnit_tenantId_status_updatedAt_idx" on "InventoryUnit"
  (actual time=0.012..0.084 rows=481)
```

Los chips de locks usan `ImeiCheckQuery_tenantId_imei_requestedAt_idx` con
`Index Only Scan Backward` (0,004 ms) y las relaciones del listado (producto,
ubicación, sucursal) van por clave primaria. `npm run db:check` queda en verde
con la migración aditiva `20260925000000_inventory_unit_list_index`.

## Nota para PLT (#247)

Lo que queda del tramo frío no es del Inventario:

- `/api/notifications` (~480 ms) y **dos** `presence/heartbeat` en la misma
  carga (el shell); `/api/orders?filtro=todos` en caliente.
- El bundle de la ruta y la caché de la PWA: medir en `preview` y evaluar
  *runtime caching* de los GET del panel (unidades, sucursales, productos).
