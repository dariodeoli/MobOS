# #160 / #194 — CRM demo vivo: la venta del POS entra en la ficha del cliente

Brecha de la épica **#148 §19** (Customers) en el dominio CRM, identificada y
cerrada sobre la **demo (#194)**. Capturas en `docs/QA-160-demo-crm-actividad/`.

## Qué faltaba (auditoría)

- **Cuenta real (§19 / #160):** la vista por actividad reciente, el perfil
  completo (antigüedad, total gastado, órdenes, últimas órdenes, direcciones,
  notas, RUC, tags, minorista/mayorista, paga impuestos) y el seguro del cliente
  están desplegados y verificados (issue #160 cerrado en v1.0.121; re-verificado
  en `docs/QA-187-clientes-produccion.md`). El impacto del seguro en el margen
  es de FIN (#162) y también está cerrado.
- **Demo (#194), el hueco real:**
  1. **El POS no veía la cartera demo.** `CheckoutCustomer` buscaba solo en
     `clientesDemoGuardados()` (lo creado en la pestaña, #201), así que los
     clientes sembrados (Lucía, Distribuidora, Carlos…) no se podían elegir: la
     venta quedaba como “cliente nuevo”.
  2. **La venta no tocaba la ficha.** Nada agregaba el pedido a los pedidos del
     cliente, así que en la demo la **vista por actividad reciente** no movía al
     cliente y el perfil seguía con los números del seed (total gastado,
     órdenes, últimas órdenes, deuda, estadísticas #221 y portal).

## Entregado

| Archivo | Cambio |
|---|---|
| `src/lib/demoClientes.js` | `listarClientesDemo()` (seeds + creados), `buscarClienteDemo()`, `actualizarClienteDemo()` (reemplaza por id, sin duplicar) y `registrarPedidoDemoDeVenta()`: construye el pedido con la forma canónica de los seeds, lo pone al frente de los pedidos del cliente y suma el evento “Pedido creado” a la cronología |
| `src/lib/demoTenant.js` | `tomarNumeroPedidoDemo()`: consume `AUR-#0001`, `AUR-#0002`… (misma numeración que configura la demo) |
| `src/components/ventas/CheckoutCustomer.jsx` | en demo busca en **toda** la cartera (los seeds ya se pueden elegir; el auto-bind por nombre exacto también los encuentra) |
| `src/components/ventas/FormularioVenta.jsx` | la venta demo resuelve el cliente contra la cartera completa, registra el pedido en la ficha y el comprobante/aviso del POS usan el número demo |
| `e2e/demo-crm.spec.js` (+ `playwright.config.js`) | e2e del recorrido completo, sin llamadas al API real |
| `src/lib/demoClientes.test.js` | 4 tests unitarios del helper (pedido al frente, agregados, cronología, cliente inexistente) |

Todo vive en la memoria de la pestaña (demo #204): nada sale del navegador.

## Evidencia (demo, sin sesión real)

| Captura | Qué muestra |
|---|---|
| `01-antes-lista.png` | Lucía con **5 compras · Gs 7.750.000** (seed #221) |
| `02-pos-venta.png` | POS demo con Lucía **elegida desde la cartera sembrada** (chip de cliente con RUC/crédito) y la venta de Gs 180.000 |
| `03-despues-lista.png` | Lucía **primera por actividad reciente** con **6 compras · Gs 7.930.000** (7.750.000 + 180.000), aviso “DEMO · NO SE GUARDÓ EN LA TIENDA” |
| `04-despues-ficha.png` | Ficha: total **Gs 7.930.000**, saldo **Gs 1.680.000** (deuda + 180.000), órdenes activas **2**, pedidos **7**, última compra **hoy** |

## Verificación

- `node --test src/lib/demoClientes.test.js` 4/4 · `npm test` **504 ✓** ·
  backend `test:unit` **71 ✓**.
- `npx playwright test e2e/demo-crm.spec.js` ✓ (con el harness aislado del
  worktree) · lote `demo: ficha con deuda`, `mini CRM`, `POS checkout`,
  `cliente del portal` y `carrito` **7 ✓** · `npm run test:e2e:smoke` **7 ✓**.
- Builds FE y BE exit 0 con `BUILD_ID` · `prisma:validate` ✓ · sin marcadores.
- El e2e asserta que la demo **no llama** a `/api/customers` ni `/api/orders`.

## Observaciones (ya reportadas, no bloquean)

- La ficha de demo sigue avisando “No hay pedidos, pagos, deuda, cronología ni
  portal” aunque los muestre (texto genérico del modo demo).
- El KPI “Pedidos” de la ficha cuenta el historial completo (incluye la venta
  cancelada) y el listado/estadísticas cuentan compras válidas (#221).
