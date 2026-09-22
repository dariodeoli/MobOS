# #148 — Brechas en Finanzas (§9, §17, §18, §19)

- **Issue:** #148 (épica POS) · **Dominio:** Finanzas · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-22 · **Entrega:** panel **«Ventas por caja»** (corte por
  sesión, §18) con endpoint, demo, tests y capturas.

## 1. Inventario de brechas

| Sección | Estado | Detalle |
| --- | --- | --- |
| §17 Caja y auditoría | **Completo** | Efectivo inicial/recibido por sesión, filtros de fecha y sucursal, cada operación con pedido/cliente/fecha/monto/vendedor/nota, marcas verificado/pendiente/con diferencia + observación y auditoría de rango. Verificado en #161 y en el recorrido de producción (#185). |
| §18 Analytics del POS | **Faltaba «ventas por caja»** | El tablero del POS (#156) cubre ventas del día vs ayer, pedidos, ítems/pedido, AOV, ventas netas, top productos, ventas por vendedor y por sucursal, y cobros por medio/cuenta. Resumen/Análisis (#171) cubre los cortes ejecutivos. El corte **por caja (sesión)** no existía: **se entrega acá**. |
| §9 Montos y monedas | **Brecha detectada (reportada, no se toca en esta unidad)** | La UI permite hasta 10.000.000.000 (general) y 99.000.000.000 (ventas), pero las columnas de dinero son `Int` y la validación del backend usa `INT_MAX` (2.147.483.647); además `LIMITE_MONTO_VENTAS` no lo pasa ningún input (los campos usan el límite general). Un monto entre 2.1B y 10B/99B se puede escribir y falla al guardar. Salida posible: migrar las columnas a BigInt (épica, cross-dominio) o alinear la UI al tope real con un mensaje claro. Se deja señalado para el dueño de la épica. |
| §19 Customers y seguro | **Completo** | % default por empresa + personalizado por cliente y el impacto en el margen (costo + seguro) con fórmula testeada (#162, #160). |

## 2. Entregado: Ventas por caja (§18)

**Backend** — `GET /api/cash?sesiones=1&from&to&branchId` devuelve el corte por
sesión del período: responsable, apertura/cierre, **pedidos y ventas del
turno**, **efectivo cobrado** (misma base que el esperado), movimientos de caja
cobrados, **esperado** (auditado al cerrar; en vivo si está abierta), contado y
**diferencia**. Límite 100 sesiones y rango máximo 366 días.

> Bug real encontrado y corregido en el camino: la primera versión comparaba
> contra `NOW()` sobre columnas `timestamp` sin zona (que guardan UTC), así que
> con UTC-3 el efectivo del turno daba 0. Ahora usa un parámetro (`Date`) igual
> que el esperado existente.

**Frontend** — panel «Ventas por caja» en **Finanzas → Caja** (con selector de
período recordado, #209) que lista cada caja con estado, pedidos, ventas,
efectivo, esperado, contado y diferencia (verde/rojo). En la demo arma el
histórico con la caja local y los cobros del día (sesión abierta + dos cierres
con diferencias).

## 3. Evidencia

- Sonda: `scripts/qa-148-ventas-por-caja.mjs` → **OK** con capturas
  `docs/qa/148-18-ventas-por-caja/real-caja.jpg` y `demo-caja.jpg`.
- Arnés HTTP: `backend/tests/cash-sessions.mjs` (**9 checks**): turno abierto con
  efectivo/pedidos/esperado, cierre con faltante y diferencia, y bordes de rango
  inválido. Registrado en `integration-http.sh`.
- Unit: `demoCash.test.js` (corte demo) y `finUltimoUsado.test.js` (clave nueva).
- E2E: `finanzas-caja.spec.js` y `demo-finanzas.spec.js` afirman el panel y que
  no pide scroll horizontal; las aserciones de estado de caja quedaron
  escopadas al cartel de estado (el panel agrega insignias Abierta/Cerrada).

## 4. Checks

`lint` 0 errores · `npm test` 505/505 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
`test:unit` 71/71 · arnés de integración HTTP completo **PASS** · e2e de
finanzas/demo 12/12 · `test:e2e:smoke` 7/7.

Reproducir:

```bash
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-148-ventas-por-caja.mjs
```
