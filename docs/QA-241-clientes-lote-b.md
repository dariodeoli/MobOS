# #241 · Lote B (Clientes/CRM) — tokens v2 en filas, chips y tiles

Tercer paso del F4 por dominio sobre la épica del rediseño: llevar el lenguaje
v2 a la **ficha del cliente** (tiles de cliente, filas y chips) y dejar la
**lista** con los números de consola, sin tocar la lógica.

## Qué cambió

| Superficie | Cambio |
|---|---|
| **Ficha · Resumen** (`CustomerProfile`) | Los KPI pasan al **tile de consola** (`v2-tile`) y sus números al ancho de consola (`v2-numero`): Total gastado, Saldo pendiente, Órdenes activas, Pedidos, Última compra y Garantías activas. Los tonos (deuda en ámbar, órdenes/garantías activas en verde de marca) se mantienen |
| **Lista · filas** (`ClientesTabla`) | Pedidos, Total gastado y Deuda usan `v2-numero`; el chip de tipo (mayorista/cliente final) es pill (`v2-chip`) |
| **Lista · resumen** (`SellerCustomers`) | El resumen en tiles ya venía de la segunda pasada; se le agregó `data-testid` para la QA |
| **Chips** | Los `Badge` ya son v2 (`v2-chip` automático); los chips de la fila toman el radio pill del scope |
| **Sin lógica** | Solo clases condicionadas por `temaV2Activo()`; con el flag apagado la ficha y la lista quedan exactamente como antes |

## QA antes/después (claro/oscuro · desktop/mobile)

`e2e/qa-241-clientes-v2.spec.js` (admin, **8/8**) recorre 2 vistas (1280 y 390) ×
2 temas × flag apagado/prendido: captura la **lista** y la **ficha (Resumen)**,
mide el contraste AA real del contenido (helper del piloto) y exige
**0 textos bajo AA con el v2 prendido**, además de **sin scroll horizontal** del
documento. Con el flag apagado solo informa (el default anterior no cambia).

| Antes (flag off) | Después (flag on) |
|---|---|
| `c241f4b-clientes-lista-antes-{claro,oscuro}-{desktop,mobile}.png` | `c241f4b-clientes-lista-despues-{claro,oscuro}-{desktop,mobile}.png` |
| `c241f4b-clientes-ficha-antes-{claro,oscuro}-{desktop,mobile}.png` | `c241f4b-clientes-ficha-despues-{claro,oscuro}-{desktop,mobile}.png` |

Mediciones de la corrida: los 4 combos v2 (lista y ficha) quedaron con
`contenido bajos=0`; el "antes" conserva sus hallazgos previos solo como
informe. Para refrescar las capturas:

```bash
MOBOS_CAPTURAS=docs/rediseno \
  npx playwright test e2e/qa-241-clientes-v2.spec.js --project=admin
```

## Checks

`npm run lint` 0 errores · `npm test` **678 ✓** · backend `test:unit` 75 ✓ ·
builds FE/BE con `BUILD_ID` ✓ · `test:e2e:smoke` ✓ · shards regenerados
(120/119/119) · sin cambios de schema ni de lógica.
