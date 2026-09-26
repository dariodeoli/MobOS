# #148 · Cierre de los restos POS (épica «POS completo»)

Fecha: 26/09/2026 · Versión de referencia: producción **v1.0.175** (main `c14f110b`) ·
Rama de esta entrega: `slot/pos`.

## Qué queda cerrado del lado POS

| § | Tema | Estado | Evidencia |
|---|---|---|---|
| §5/§7 | Carrito y métricas del día | ✅ La línea colapsada muestra lo esencial (#243) y **ventas/pedidos del día cuentan por orden, no por unidad**, también en la demo | `docs/qa/243/1.0.175-produccion/` · `docs/qa/187-1.0.175-rama/` (TU DÍA 3→4) · `src/utils/resumenVentasDia.test.js` |
| §9 | Montos y monedas | ✅ El POS **bloquea el guardado** con montos sobre el tope almacenable y explica cuál monto revisar | `docs/qa/148-9-pos-tope/` (post-deploy v1.0.172) · `e2e/qa-148-9-pos-montos.spec.js` |
| §11 | Pagos divididos / no pagado | ✅ Split con saldo precargado, estados por bloque y pedido parcial | `e2e/pos-qa-173.spec.js` (split + no pagado) |
| §12 | Entrega | ✅ Delivery con costo; **retiro no cobra envío** (corregido en #187) | `docs/qa/187-1.0.172*/` · regresión en `pos-qa-173` |
| §20 | Borradores y enlace | ✅ Suspender/listar/recuperar en demo y servidor; «Enlace público» avisa en demo | `docs/QA-187-pos-demo.md` (pasada v1.0.172) |
| §22 | Lista y detalle del pedido | ✅ Cubierto por `pos-checkout`, `pos-qa-173` y `qa-241-*` en verde | e2e POS 31/31 |
| #251 | Menú nuevo (verificación en producción) | ✅ 8 grupos, Taller, `/ops`, menú del vendedor | `docs/qa/menu-ia/1.0.175-produccion/` |

## Pendientes que NO son del POS (para la épica)

- **§9 BigInt**: habilitar los 10B/99B de producto exige migrar las columnas de
  dinero (unidad cross-dominio con `db:check`). Hasta entonces el POS bloquea con
  mensaje claro en vez de fallar en silencio.
- **Gift cards reales**: decisión de producto (hoy el equivalente es el saldo a favor).
- **INV**: el rechazo de precio/stock dice «Precio y stock deben ser enteros válidos»
  (cosmético, del catálogo).
- **Sesión real**: borradores en servidor, analytics real y cierre con comprobante
  quedan listados en `docs/QA-187-pos-demo.md` para cuando haya acceso a una cuenta real.

Con esto el dominio POS de #148 queda sin restos abiertos; el cierre formal del
issue queda para el integrador con esta evidencia.
