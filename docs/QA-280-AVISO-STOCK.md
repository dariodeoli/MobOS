# Cierre #280 · Aviso de INV al vendedor (cross-dominio INV→POS)

Cuando cambia el **stock o la disponibilidad de un producto comprometido** —una
necesidad de abastecimiento nacida de una **venta sin stock** (`SALE_NO_STOCK`,
`ORDER_COMMITTED`, `QUANTITY_OVER_STOCK`)—, **su vendedor** recibe una novedad en
la bandeja interna del panel, con el pedido como destino. La unidad de INV de
#280 quedó entregada; el ítem de gift cards del mismo issue no es de este slot.

## 1. Contrato (para el POS)

- **Dónde aparece:** campana del panel (`GET /api/notifications`), junto a los
  avisos de pedidos, tareas, aprobaciones y menciones. El POS ya la muestra:
  no requiere pantalla nueva.
- **Kinds nuevos:** `STOCK` («Ya hay stock para tu pedido») y `SIN_STOCK`
  («Tu pedido quedó sin stock»), con ícono propio en `PanelNotificaciones`.
- **Item:** `{ id: "stock-<orderId>-<productId>", kind, title, detail, at, href }`.
  `href` es `/pedidos/<orderId>`: el vendedor actúa sobre su pedido.
- **Detalle:** producto · pedido · cliente · disponibilidad («N disponible(s)» o
  «se dio de baja lo último disponible»).
- **Alcance:** solo el **vendedor del pedido** (quien tiene que actuar). No se
  replica a toda la empresa.

## 2. Cómo funciona (registro y sin spam)

- **Derivado, sin tabla nueva:** el aviso se calcula en el GET de
  notificaciones a partir de las necesidades del vendedor, la disponibilidad
  actual y la **auditoría del inventario** (ese es el registro: recepción de
  unidades, restauración, ajuste de estado, baja, venta de unidades y edición
  del stock de un producto sin seriales).
- **Un aviso por pedido + producto**: si hay varias necesidades del mismo
  producto en el pedido, se muestra una sola novedad.
- **Solo el último cambio** de la ventana (7 días, igual que el resto de la
  bandeja) y solo si es **posterior al compromiso**.
- **Solo si invierte la disponibilidad**: llegó lo que faltaba (hay unidades o
  stock) o se dio de baja lo último disponible (no hay nada). Un cambio que no
  mueve la aguja no avisa.
- **El cambio propio no vuelve como aviso** (`ignorarUsuarioId`): si el propio
  vendedor movió el inventario, ya lo sabe.
- **En vivo:** `useNotificaciones` pide el listado sin caché (`cacheMs: 0`) para
  que el «Actualizar» del panel no quede atrás con la caché corta de GET.

Fuera de alcance por ahora: devoluciones y traspasos (no tienen un evento por
unidad/producto) y las reservas sin stock sin pedido.

## 3. Evidencia

- **Unit:** `backend/tests/stock-notices.test.ts` (14 casos: alta con/sin
  disponibilidad, baja, cambio previo al compromiso, ventana, cambio propio,
  otra sucursal, dedupe por pedido+producto, tope, mapeo de la auditoría).
- **Arnés HTTP:** `backend/tests/stock-notices.mjs` — **12 chequeos**: venta sin
  stock del vendedor, llegada de la unidad → `STOCK`, baja → `SIN_STOCK`, un
  solo aviso, registro en la auditoría y que el stock de otro producto no avise.
- **e2e:** `e2e/qa-280-aviso-stock.spec.js` (**1/1**, proyecto vendedor): el
  contexto de administración mueve el inventario y el vendedor ve el aviso en su
  campana, el cambio de título tras la baja y la navegación al pedido.
- **Capturas:** `docs/qa/280-aviso-stock/`
  - `aviso-llegada-claro-desktop.png` / `aviso-llegada-claro-mobile.png`
  - `aviso-sin-stock-claro-desktop.png`

## 4. Cómo re-verificar

```sh
# puertos aislados del worktree (MOBOS_E2E_*)
npx playwright test e2e/qa-280-aviso-stock.spec.js
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh   # incluye el bloque #280
npm --prefix backend run test:unit                          # stock-notices.test.ts
```
