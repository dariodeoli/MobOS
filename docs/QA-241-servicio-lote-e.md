# #241 · Lote E (Servicio técnico y Garantías) — tokens v2

Cuarto paso del F4 por dominio: el taller y las garantías entran al lenguaje v2
(cierra el pendiente del dominio E del plan), sin cambios de lógica.

## Qué cambió

| Superficie | Cambio |
|---|---|
| **Servicio · taller** (`ServicioTecnico`) | Ya tenía el **stepper del flujo** y los tiles de totales (pasada de DSN); esta entrega suma `v2-numero` al **precio y la utilidad de cada fila** |
| **Servicio y Garantías · Todo** (`ServicioGarantias`) | Resumen en **tiles** con `v2-numero`: Registros, En taller (órdenes activas), Garantías (casos abiertos) y **Desde garantía** (los que pasaron al taller) |
| **Garantías** (`Garantias`) | Resumen en **tiles**: Casos, En proceso (recibidos/diagnóstico), Listos y **Por vencer** (7 días o menos, en ámbar); los chips de estado ya son v2 (`Badge` con `v2-chip` automático) |
| **AA** | El detalle de la fila de Garantías (`Resp:`, `Repuestos:`…) pasa de `text-mute/70` a `text-mute`: en v2 el 70% quedaba en 3.44:1; el hallazgo se veía también en el tema anterior |
| **Sin lógica** | Solo clases condicionadas por `temaV2Activo()`; con el flag apagado todo queda como antes |

## QA antes/después (claro/oscuro · desktop/mobile)

`e2e/qa-241-servicio-v2.spec.js` (admin, **8/8**) recorre 2 vistas × 2 temas ×
flag apagado/prendido y captura **Servicio**, **Todo** y **Garantías** con la
medición AA real del contenido: **0 textos bajo AA con el v2 prendido** en las
tres pantallas y **sin scroll horizontal**; con el flag apagado solo informa.

| Pantalla | Antes (flag off) | Después (flag on) |
|---|---|---|
| Servicio (stepper) | `c241f4e-servicio-antes-{claro,oscuro}-{desktop,mobile}.png` | `c241f4e-servicio-despues-…` |
| Todo (unificado) | `c241f4e-todo-antes-…` | `c241f4e-todo-despues-…` |
| Garantías | `c241f4e-garantias-antes-…` | `c241f4e-garantias-despues-…` |

```bash
MOBOS_CAPTURAS=docs/rediseno \
  npx playwright test e2e/qa-241-servicio-v2.spec.js --project=admin
```

## Checks

`npm run lint` 0 errores · `npm test` **678 ✓** · backend `test:unit` **75 ✓** ·
builds FE/BE con `BUILD_ID` ✓ · `test:e2e:smoke` **19/19** · shards regenerados
(122/122/122) · sin cambios de schema.
