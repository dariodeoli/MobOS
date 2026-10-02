# #313 · Pedidos y Clientes — códigos humanos, una acción principal y listas legibles

Parte de la auditoría del demo v1.0.209 (02/10/2026). Hallazgos sobre las dos
listas del CRM:

- La lista de Pedidos mostraba **ids internos truncados** (`demo−ven…`) en vez
  del número de pedido.
- La fila de Clientes acumulaba cuatro iconos (WhatsApp enviar + plantilla,
  resumen rápido y ficha) que **pisaban la columna «Deuda»/«Sin deuda»**, y los
  montos no cerraban a la derecha.
- En móvil las dos listas eran **tablas comprimidas** con scroll horizontal.
- La **vista rápida** repetía el detalle completo (cliente: últimas compras y
  notas; pedido: todas las secciones de la página).

## Entregado

| Hallazgo | Ahora | Dónde |
|---|---|---|
| Códigos humanos | Los pedidos demo sin número se numeran una sola vez con el contador del POS (`AUR-#0001` y siguientes, migración `demoSeedVersion 7`); `addVenta` asigna número si falta y la lista **nunca** cae al id interno | `src/lib/storage.js`, `SellerOrders.orderFields` |
| Dinero a la derecha | Las celdas de Total y Deuda de Clientes usan `flex justify-end` (antes el `inline-flex` de `CeldaMoneda` quedaba a la izquierda); el total de Pedidos ya cerraba a la derecha | `src/components/customers/ClientesTabla.jsx` |
| Una acción visible + «…» | La fila muestra el **resumen rápido** (ojito) y un menú `…` con «Ver ficha completa», «Enviar WhatsApp» y «Elegir plantilla…» (44 px por ítem). `WhatsAppMenu` suma el modo `variant="items"` | `ClientesTabla.jsx`, `src/components/shared/WhatsAppMenu.jsx` |
| Sin superposición | Con dos controles (ojito + `…`) la columna de acciones (8 rem) entra completa: la deuda ya no queda tapada por los iconos | `ClientesTabla.jsx` |
| Tarjetas en móvil | Debajo de `md` las dos listas se renderizan como tarjetas (una por registro, montos a la derecha, sin tabla comprimida); de `md` para arriba sigue la grilla. Se resuelve con `usePantallaAngosta` para no duplicar DOM | `ClientesTabla.jsx`, `SellerOrders.jsx` |
| Vista rápida sin duplicar | Cliente: contacto + tres cifras (total, pedidos, deuda) + acciones; se quitaron «Últimas compras», notas, seguro y tipo. Pedido: panel compacto con cliente/artículos/totales y «Ver pedido completo»; se quitaron las secciones largas del detalle | `ClienteResumenPopup.jsx`, `VistaRapidaPedido` en `SellerOrders.jsx` |

Notas de implementación:

- La numeración demo es una migración genérica: numera cualquier pedido demo
  sin `orderNumber` (idempotente, consume el mismo contador que el POS). Si
  #324 reemplaza fixtures con números propios, la migración no hace nada.
- El menú `…` es local a Clientes (no hay objeto compartido todavía); cuando
  CMP/DSN lo estandaricen, se reemplaza por el de la biblioteca.
- `qa-160` se volvió determinista: espera la métrica de Estadísticas en vez del
  timeout fijo (flaqueaba al correr después de tandas grandes).

## Evidencia

| Captura | Qué muestra |
|---|---|
| `antes/desktop-01-clientes.png` · `antes/desktop-02-cliente-popup.png` | **Antes**: iconos sobre «Sin deuda»/montos; popup con últimas compras y notas |
| `antes/desktop-03-pedidos.png` · `antes/movil-03-pedidos.png` | **Antes**: `demo−ven…` (id truncado) en la columna Pedido |
| `antes/movil-01-clientes.png` | **Antes**: tabla comprimida a 390 (solo cliente/tipo a la vista) |
| `antes/desktop-04-pedido-panel.png` · `antes/movil-04-pedido-panel.png` | **Antes**: panel con el detalle completo (mismas secciones que la página) |
| `claro-01-clientes.png` · `claro-02-clientes-menu.png` | Después: una acción + menú `…`; montos alineados a la derecha |
| `claro-03-cliente-popup.png` | Después: vista rápida de cliente acotada |
| `claro-04-pedidos.png` · `claro-05-pedido-panel.png` | Después: `AUR-#0001` y panel de pedido compacto |
| `oscuro-01..05-*.png` | Los mismos estados en tema oscuro |
| `movil-01..05-*.png` | Después en 390: tarjetas en ambas listas, menú y vistas rápidas |

Gate reproducible (demo, sin sesión; falla si aparece un id interno, si los
montos no cierran a la derecha, si los accesos pisan la deuda, si la vista
rápida repite el detalle o si una lista scrollea en horizontal a 390):

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-313-listas.spec.js
```

Capturas: `MOBOS_CAPTURAS=docs/QA-313-listas npx playwright test e2e/qa-313-listas.spec.js`.

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes ajenos) · `npm run build` ✓ ·
`npm --prefix backend run build` ✓ con `backend/.next/BUILD_ID`
(`FTh6uRr9zyyHmkY7vO_5X`) · `npm --prefix backend run prisma:validate` ✓ ·
`npm test` 868/868 · `npm --prefix backend run test:unit` 138/138 ·
`rg "<<<<<<<" src backend e2e` sin resultados · `npm run db:check` «la base
coincide con prisma/schema.prisma» · `npm run test:e2e:smoke` 19/19 ·
`e2e/qa-313-listas.spec.js` 3/3 · specs del dominio sin regresiones (16/16 en
`qa-236-clientes`, `qa-249-clientes-touch`, `demo-crm`, `pos-pedidos`,
`qa-160-perfil`, `qa-312-ficha-accesos`; y 17/17 sumando `admin` mini-CRM,
`qa-241-clientes-v2`, `qa-268-unificar-clientes`, `modales-tamanos`).
