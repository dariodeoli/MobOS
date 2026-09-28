# Cierre #286 · En el POS no se muestran las unidades

Reproducción con el arnés local (vendedor **y** dueño, con unidades cargadas) y
corrección de la causa raíz en el dominio de Inventario. Las piezas de POS/PLT
que quedan afuera se **reportan** (abajo), no se tocaron.

## Causas raíz encontradas

1. **El selector de IMEI descartaba unidades por sucursal.** `SerialUnitPicker`
   filtraba `(branchId ? true : !unit.branchId)`: cuando la venta no tenía
   sucursal (vendedor sin sucursal asignada, o una sesión donde la sucursal no
   llegó), el pedido a la API va sin `branchId` —y el servidor acota por la
   sesión—, pero el filtro local exigía `unit.branchId` vacío: **descartaba
   todas las unidades** y mostraba «No hay unidades disponibles…» aunque el
   equipo estuviera en stock. Reproducido: un vendedor sin sucursal veía el
   catálogo del POS vacío y, con el producto en el carrito, el selector vacío.
2. **El detalle de producto mentía en silencio.** `ProductoDetalle` («Equipos
   por estado») pedía las unidades por texto (`q=SKU`) —con el alcance de la
   sucursal **de la sesión**, no de la sucursal activa— y con `catch { setUnits([]) }`:
   cualquier fallo o desalineación de sucursal quedaba como «Este producto no
   tiene unidades serializadas cargadas».
3. **Los fallos del API se mostraban crudos.** El selector mostraba
   `cause.message` tal cual (p. ej. «No autorizado para esa sucursal.») sin
   salida para el vendedor.

También se verificó el **demo** (candidato 3): `listDemoUnits` + el filtro del
recurso devuelven las unidades del producto en la sucursal demo; el filtro se
extrayó a `filtrarUnidadesDemo` (una sola definición) y quedó con test.

## Qué se cambió (dominio INV)

- `src/components/inventory/SerialUnitPicker.jsx`
  - La elegibilidad vive en `utils/inventario.js` (`unidadesElegibles`): solo
    unidades del producto vendibles (o la ya elegida). **Sin filtro de
    sucursal en el cliente**: con sucursal, la API ya devuelve solo esas; sin
    sucursal, el selector lo dice en vez de inventar stock.
  - Estado nuevo **sin sucursal**: «Tu usuario no tiene sucursal asignada:
    pedile a administración que te asigne una para elegir el equipo físico.
    Mientras tanto, podés vender «sobre pedido» y asignar el IMEI al entregar.»
    (`data-testid="picker-sin-sucursal"`, con **Reintentar**).
  - Fallos con mensaje accionable (`mensajeDeCarga`): sesión vencida (401) y
    sucursal sin permiso (403) se explican y siempre queda el camino «sobre
    pedido»; el aviso tiene **Reintentar** (`data-testid="picker-error"`).
- `src/components/productos/ProductoDetalle.jsx`
  - Las unidades se piden **por `productId`** (no por texto) y con la
    **sucursal activa** (`useSesion`), el mismo alcance que el POS.
  - El fallo ya no se silencia: aviso con el motivo y **Reintentar**.
  - Vacío honesto: «No hay unidades de este producto en la sucursal activa.
    Cambiá de sucursal para ver otras o revisá que la compra esté recibida.»
- `backend/app/api/inventory-units/route.ts`: un lector **sin sucursal
  asignada** (VENDEDOR/CAJERA) recibe `[]` en vez de unidades de todas las
  sucursales (mismo criterio que el catálogo de productos, que les oculta los
  productos con sucursal).
- `src/lib/demoInventory.js` + `src/lib/api/index.js`: `filtrarUnidadesDemo`
  (producto/sucursal/estado) con una sola definición.

## Mensajes al usuario (antes → después)

| Caso | Antes | Ahora |
|---|---|---|
| Venta sin sucursal | «No hay unidades disponibles de este modelo en tu sucursal…» (aunque hubiera stock) | «Tu usuario no tiene sucursal asignada: pedile a administración…» + Reintentar |
| 403 de sucursal | «No autorizado para esa sucursal.» (crudo) | «No podés ver el stock de esa sucursal. Revisá tu sucursal activa o pedile a administración que te asigne una. Mientras tanto, podés marcar la venta «sobre pedido»…» + Reintentar |
| Sesión vencida | el texto del API | «Tu sesión venció: volvé a entrar para elegir el equipo.» |
| Detalle sin unidades en la sucursal activa | «Este producto no tiene unidades serializadas cargadas.» | «No hay unidades de este producto en la sucursal activa. Cambiá de sucursal…» |
| Detalle con la carga fallada | silencio (parecía vacío) | aviso con el motivo + Reintentar |

## Tests

- Unit `src/utils/inventario.test.js`: `unidadesElegibles` (no filtra por
  sucursal; solo vendibles o la elegida) y `serialNormalizado`.
- Unit `src/lib/demoInventory.test.js`: `filtrarUnidadesDemo`.
- Regla de objetos (`src/lib/objetosReglas.test.js`): el selector no vuelve a
  filtrar por sucursal, usa la elegibilidad compartida, tiene los avisos
  (`picker-sin-sucursal`, `picker-error`) y el detalle no silencia errores ni
  vuelve a buscar por texto.
- e2e `e2e/qa-286-unidades-pos.spec.js` (**4/4**):
  1. vendedor con sucursal: el selector lista la unidad, reserva y libera;
  2. 403 del stock: mensaje accionable + Reintentar (nunca el texto crudo);
  3. dueño: «Equipos por estado» sigue la sucursal activa (no muestra equipos
     de otra sucursal y reaparecen al volver);
  4. vendedor sin sucursal: `GET /api/inventory-units` responde `[]`.

## Capturas

`docs/qa/286-unidades-pos/` (claro/oscuro): `pos-picker-{light,dark}.png`,
`pos-picker-error-{light,dark}.png`, `producto-equipos-sucursal-1-{light,dark}.png`,
`producto-equipos-sucursal-2-light.png`.

## Fuera de INV (reportado, no tocado)

- **POS/PLT — vendedor sin sucursal**: `GET /api/products` filtra a
  VENDEDOR/CAJERA por `{ OR: [{ branchId: null }, { branchId: null }] }`; con
  `branchId` nulo eso deja solo productos **sin sucursal** → el catálogo del POS
  queda vacío (reproducido) y, si el producto se agrega por caché, la venta
  muere en el API con «El producto pertenece a otra sucursal.» (orders/route.ts
  §407). Decisión de producto: o se exige sucursal al crear el vendedor
  (equipo), o el POS bloquea la venta con un aviso claro («tu usuario no tiene
  sucursal asignada»). Candidato de PLT/POS.
- **POS — errores silenciados**: `FormularioVenta` (detección de unidades y el
  recuento del modal) hace `catch { … }` sin avisar; con mi selector el mensaje
  accionable aparece al abrir el IMEI, pero la guía inline del carrito podría
  decir lo mismo antes de intentar guardar.

## Verificaciones

- `npm run lint` **0 errores** · `npm run build` ✓ · `npm --prefix backend run build` ✓ con `BUILD_ID` · `prisma:validate` ✓.
- `npm test` **862/862** · backend `test:unit` **133/133** · shards OK (193/193/193).
- `rg "<<<<<<<" src backend e2e` → 0.
- e2e afectados: `qa-286` **4/4**, `qa-263-imei-venta`, `pos-148-s11-sin-stock`,
  `pos-checkout`, `pos-148-cobro-ux`, `pos-241-v2`, `qa-249-pos-touch`,
  `qa-257-inventario-pos`, `qa-140-inventario`, `kardex-producto`,
  `inventario-importacion`, `inventario-pos-sync`, `menu-ia`, `permissions`,
  `demo-anonimo`, `demo-publico`, `demo-imei-conciliacion` → **93 en verde**.
- Ajeno y preexistente: `dsn-responsive-mobile › demo: 360/390/414 + tablet`
  falla por targets < 44 en la cáscara de demo/login (#282); se verificó el
  mismo fallo sin este cambio.
