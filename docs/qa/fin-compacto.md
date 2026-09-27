# Finanzas · batch compacto (#241 · F4) — métricas claras, controles agrupados y tablas densas

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-27 · **Alcance:** las cinco
  pantallas de Finanzas que faltaban del lenguaje v2 (Gastos, Créditos, Cuotas,
  Publicidad y Comisiones); Caja/Conciliación/Cuentas ya venían del lote D.
- Sin cambios de negocio, permisos ni datos: solo presentación.

## Qué cambió por pantalla

| Pantalla | Métricas claras | Controles agrupados | Tablas densas |
| --- | --- | --- | --- |
| **Caja** (continuación) | Los cuatro totales del bloque «Repuestos y proveedores» pasan a tiles v2 | «Registrar compra» y el encabezado del bloque quedan igual | **Repuestos/proveedores** (`proveedores-tabla`) y **repuestos del taller** (`taller-tabla`) pasan a grillas densas: una fila por compra/repuesto con proveedor/chips · concepto/detalle · pendiente/deuda · acciones |
| **Gastos** | Tiles `gastos-total` / `gastos-cheques` / `gastos-movimientos` (el total existía como chip en el libro) | El libro mantiene su alta arriba; el resumen queda a la vista antes del formulario | Filas del libro con `data-testid="gasto-fila"` y superficie v2 |
| **Créditos** | Los cuatro números pasan a tiles con `v2-tile`/`v2-numero` y testids (`creditos-por-cobrar`, `creditos-en-mora`, `creditos-clientes`, `creditos-clientes-mora`) | «Actualizar» (ahora `Button` outline) y el aviso de corte viven en la misma fila del encabezado | La grilla densa ya existía: se conserva y suma la superficie v2 |
| **Cuotas (Cobranzas)** | Tiles `cuotas-pendiente` / `cuotas-vencidas` / `cuotas-proximas` / `cuotas-recargo` (reemplazan los chips del encabezado; vencidas y próximas muestran monto en el subtexto) | «Actualizar» agrupado a la derecha del encabezado | La tarjeta por cuota pasa a **fila densa** de una línea (cliente · pedido · estado · cuota/vence/recargo/teléfono · saldo · acciones), conservando `cuota-fila`, los textos y los botones |
| **Publicidad** | Tiles `ads-total` / `ads-mes` / `ads-promedio` / `ads-inversiones` | El alta queda en una sola fila en desktop (`lg:grid-cols-4`) | Las dos tablas (mensual e historial) ya eran densas: suman la superficie v2 |
| **Comisiones** | Tiles `comisiones-reglas` / `comisiones-liquidaciones` / `comisiones-liquidado` / `comisiones-por-pagar` | Los formularios existentes quedan igual | Reglas y liquidaciones pasan a **grillas densas** (`comisiones-reglas-tabla` y `comisiones-liquidaciones-tabla`): una fila por regla (vendedor · tipo · % · acciones) y una por liquidación (vendedor · total · período · % · estado · acciones), conservando testids, badges y acciones |

## Evidencia

- e2e `e2e/qa-fin-compacto.spec.js` (proyecto `admin`): **capturas antes/después**
  por pantalla — Caja, Gastos, Créditos, Cuotas, Publicidad y Comisiones —, el
  «después» con v2 en claro/oscuro desktop y mobile, el «antes» con v2 apagado
  en claro/oscuro desktop —, contraste del shell exigido AA en el «después» y
  **sin scroll horizontal del documento en 360/390/768/1440**.
  Capturas versionadas en `docs/qa/fin-compacto/`
  (`fin-compacto-<pantalla>-{antes,despues}-{claro,oscuro}-{desktop,mobile}.png`).
- Regresión de las pantallas tocadas: `finanzas-ultimo-usado` (Gastos),
  `finanzas-comisiones`, `cobro-cuotas` y `cobranzas-whatsapp` en verde.
- `npm run lint` 0 errores · `npm test` 804/804 · builds FE/BE con `BUILD_ID`.

## Notas

- **Comisiones** entra con sus métricas, la superficie v2 y las dos listas en
  grillas densas (reglas y liquidaciones).
- El detalle del idioma v2 vive en `docs/rediseno/F4-DOMINIOS.md` (lote D y este
  batch compacto).
