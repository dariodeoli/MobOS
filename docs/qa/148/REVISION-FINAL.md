# Épica #148 — revisión final de brechas (dominio POS)

Estados: ✅ completo con evidencia · 🟡 cerrado en rama (falta deploy) · ⏳ pendiente de otro
dominio o de decisión.

| § | Tema | Estado | Evidencia / puntero |
|---|------|--------|---------------------|
| 1–3 | Nombre/ruta `/pos`, layout y carrito siempre visible | ✅ | Capturas `docs/qa/225/03-04` (carrito v2 en producción v1.0.142) |
| 4 | Cliente: búsqueda global, pre-clientes, normalización, facturar a otro | ✅ | `src/lib/preClientes.js` + e2e `pos-busqueda-global`, `pos-campos` |
| 5 | Carrito: modelo/capacidad/stock/descuentos/totales | ✅ | Capturas `docs/qa/225/03-04`, captura `docs/qa/187b/06` |
| 6 | Buscador de productos + escáner con confirmación | ✅ | e2e `pos-checkout` «producto escaneado pide confirmación» (1 passed) · captura pendiente del modal (requiere simular la pistola) |
| 7 | Vendedor automático + métricas del día | ✅ | Barra «TU DÍA» en capturas `docs/qa/187b/03` |
| 8 | Cuentas de cobro con buscador | ✅ | `CuentaCobroCombobox` + capturas `docs/qa/204/01` |
| 9 | Montos de venta 99.000 millones + moneda extranjera | ✅ POS | `docs/qa/204/01` (USD 100 → Gs 730.000) · estándar de 10 mM en Gastos/Pagos/Cuentas/Reportes/Comisiones → **FIN/INV** |
| 10 | Botón principal por estado | ✅ | Capturas `docs/qa/204/01-02` (Crear pedido → Confirmar venta) |
| 11 | Pagos divididos (bloques, agregar, dividir, eliminar) | ✅ + 🟡 | Split `docs/qa/204`; **eliminar bloque** cerrado en rama (`379a14e3`, captura `docs/qa/148-s11/capturas/01-split-usd.jpg`) pendiente de deploy; **estado por bloque / marcar no pagado** → decisión de producto |
| 12 | Estados de entrega sincronizados | ✅ | `docs/qa/148-s12/ESTADO.md`; e2e `public-tracking` + arnés `order-fulfillment` · coordinación **PLT** (notificación in-app) y **DSN** (piloto) |
| 13–15 | Bloqueo de sesión, tres puntos, staff/PIN | ✅ otro dominio | specs `sesion-bloqueo`, `notificaciones`, `seller-pin` en main |
| 16 | Comentarios internos y menciones | ✅ | e2e de menciones (#156) · notificación de menciones → **PLT** |
| 17 | Caja y auditoría de efectivo | ✅ otro dominio | `cash_audit_marks` + `backend/app/api/cash` |
| 18 | Analytics del POS (período, top, por vendedor/cuenta) | ✅ | Captura `docs/qa/187b/15` · «por caja» y gift cards (no existen) → **FIN** |
| 19 | Vista de clientes y seguro | ✅ otro dominio | `insuranceRate/Pct` en schema |
| 20 | Borradores + envío + enlace público con Checkout | ✅ | `docs/qa/148-s20/ESTADO.md`; e2e `pos-qa-173` (borrador sin sesión con Checkout); demo: crear/listar/retomar/descartar ✅ (e2e `demo-anonimo`) |
| 21 | Detalle del pedido: acciones + animación | ✅ | `docs/qa/148-s21/ESTADO.md`; e2e `pos-pedidos` |
| 22 | Lista de pedidos Hoy/Ayer/Anteayer | ✅ | e2e `pos-pedidos` + capturas `docs/qa/187b` |
| 23 | Documentación interna | ✅ otro dominio | spec `documentacion` en main |
| 24 | Orden recomendado | informativo | — |

## Pendientes abiertos (con responsable)

1. **Decisión de producto**: «marcar como no pagado» por bloque (§11).
2. **Deploy**: eliminar bloque de pago (§11) ya está en la rama.
4. **PLT**: notificación in-app de cambios de entrega y menciones.
5. **INV/FIN**: sync inventario→POS (§6), estándar de montos (§9), «por caja»/gift cards (§18).
6. **DSN**: piloto del carrito/seguimiento (§12) y captura del modal del escáner (§6).
