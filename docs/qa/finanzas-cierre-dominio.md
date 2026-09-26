# Cierre del dominio **Finanzas** (slot/finanzas)

- **Rama:** `slot/finanzas` · **Verificación definitiva:** producción
  **v1.0.175** (`release:smoke` OK) · **Fecha:** 2026-09-22
- **Última revisión:** 2026-09-26 (post v1.0.178) — verificación de
  conciliación/caja/márgenes **15/15** y barrido #185 **16/16** sobre la versión
  publicada, con la sonda del seguro ya estricta en Configuración → Comercial;
  antes: barrido y sondas en verde sobre v1.0.175, grupo **Comercial** (#253),
  **Ganadores por margen**, fix de la **diferencia de caja** sin arqueo, runner
  de reportes en el gate y sonda de **márgenes con costo real**.
- Índice de todo lo entregado y verificado en el dominio, con la evidencia y la
  versión en la que quedó integrado. Sirve de punto de entrada para auditoría.

## Verificación v1.0.175 (2026-09-26) — sondas del dominio en verde

| Sonda | Resultado |
| --- | --- |
| Recorrido #185 de Finanzas (`qa-185-finanzas-demo.mjs`) | **16/16** · 25 capturas · 0 errores de consola · 0 API ≥400 · 0 pedidos fallidos |
| §9 montos (`qa-148-montos-produccion.mjs`) | **5/5** |
| §17/§18/§19 (`qa-148-17-18-19-produccion.mjs`) | **8/8** · **11/11** cortes del analytics |
| §18 ventas por caja (`QA_SOLO_DEMO=1`) | **2/2** |
| Caja + conciliación + márgenes con costo real (`qa-253-finanzas-produccion.mjs`) | **15/15** |

Evidencia: `185/produccion-1.0.175/` (capturas + `resultados.json`),
`finanzas-produccion/1.0.175-*/` y `finanzas-produccion/produccion/`.

En esta pasada se corrigieron las **sondas** que quedaron desactualizadas por el
IA de Configuración y el shell (`/configuracion/negocio` → `comercial`, el
ítem «Análisis» del menú ahora tiene grupo homónimo) y la carrera al cerrar la
guía de la demo (patrón robusto de `e2e/helpers/demo.js`); ningún hallazgo
funcional nuevo en el producto.

## Verificación definitiva (v1.0.143) — sin gaps reales

Corrida de cierre sobre la última versión publicada (que ya incluye los costos
reales al margen), todo en verde:

| Sonda | Resultado |
| --- | --- |
| `release:smoke` | ✅ v1.0.143 publicada |
| §9 montos (`qa-148-montos-produccion.mjs`) | **5/5** |
| §17/§18/§19 (`qa-148-17-18-19-produccion.mjs`) | **8/8** · **11/11** cortes del analytics |
| §18 ventas por caja / analytics (`QA_SOLO_DEMO=1`) | **2/2** · **1/1** |
| Recorrido de Finanzas #185 | **16/16** · 25 capturas · 0 errores |
| Resumen/Análisis (#171) y último usado (#209) | **6/6** · **6/6** |
| Tokens v2 en Finanzas (`qa-finanzas-tokens-v2.mjs`) | **8/8** · sin roturas (montos, fechas y tablas) |

Cadena de costos reales cubierta por el arnés: unidad por IMEI (reparaciones y
repuestos cargados en Inventario), **repuestos no-OEM de la inspección
PhoneCheck** (`costoRepuestosPyg`) y trade-in (valor + reparaciones). Evidencia:
`148-19-costo-unidad-reparaciones.md`, `148-19-repuestos-no-oem.md` y
`148-19-trade-in-costo.md`.

Evidencia de la ronda: `produccion-1.0.143/`, `185/produccion-1.0.143/` y
`tokens-v2-finanzas/1.0.143/`.

**Queda asentado: al 2026-09-22 no hay ningún gap funcional abierto de #148
§17/§18/§19 en el dominio.** Lo único pendiente son dos decisiones de producto
(abajo), ninguna es un defecto.

Actualización 2026-09-23 (v1.0.144): la revisión de márgenes con costo real
encontró un gap real —**el descuento del carrito no bajaba la ganancia por
vendedor/día ni la comisión liquidada**—, ya corregido y con evidencia en
`148-19-descuento-margen.md`.

## Secciones de la épica #148 en el dominio

| Sección | Estado | Evidencia |
| --- | --- | --- |
| §9 Montos y monedas | ✅ v1.0.140 | `148-9-montos-monedas.md` (fix + plan BigInt pendiente de producto) · sonda `qa-148-montos-produccion.mjs` **5/5** |
| §17 Caja y auditoría de efectivo | ✅ v1.0.139/v1.0.140 | `148-17-18-19.md` · sonda `qa-148-17-18-19-produccion.mjs` **8/8** · panel con fecha/hora, pedido, cliente, vendedor, monto, nota, marca y observación |
| §18 Analytics del POS | ✅ v1.0.140 | `148-18-analytics-pos.md` · `148-18-ventas-por-caja.md` · sonda **8/8** con **11/11** cortes · gift cards → saldo a favor (`148-18-gift-cards/`) |
| §19 Customers y seguro | ✅ v1.0.140 | `148-17-18-19.md` · % de empresa + override por cliente + margen (costo real = costo + seguro) · vista por actividad y alta con nombres/email/teléfono verificadas |

## Unidades entregadas

| Unidad | Qué resolvió | Evidencia |
| --- | --- | --- |
| #161 Caja y auditoría de efectivo | Caja del día, turnos, arqueo, auditoría por rango | `161/` |
| #144 Conciliación por cuenta/medio/procesadora | Lotes, trazabilidad y diferencias | `144/` |
| #162 Seguro y margen | Seguro por empresa/cliente, costo real y margen | `162/` |
| #171 Resumen y Análisis unificados | Aviso de reporte truncado + coherencia 55/55 SQL · 14/14 UI | `171/` |
| #169 Lote 6-C | Conciliación sin scroll a 1280 + testids + e2e | `169/` |
| #190 Demo al día | Cuentas/caja/conciliación con datos reales, AUR-####, sesión demo | `190/` |
| #209 Último usado | Último medio/cuenta en Gastos, Conciliación y período | `209/` |
| #204 / #205 | Seguro persistente, lotes no reasignables, pulido de caja | `204/`, `205/` |
| #148 §19 · #83 (2026-09-23) | Descuento del carrito en la ganancia, la comisión y la liquidación | `148-19-descuento-margen.md` |
| #148 §19 · #83 (2026-09-23) | Una sola fórmula de margen por venta (reporte = comisiones = liquidación) | `148-19-margen-por-venta.md` |
| #148 §19 · #122 (2026-09-23) | Ventas con costo pendiente fuera de la ganancia (Ganancias = Reportes) | `148-19-ganancia-sin-costo.md` |
| #148 §19 · #83 (2026-09-23) | Verificación independiente: reportes y comisiones recalculados contra la base (sonda en CI) | `148-19-verificacion-reportes-db.md` |
| #249 (2026-09-23) | Responsive mobile de Finanzas (H2/H3) con capturas y gate e2e | `249-finanzas.md` + `249-finanzas/` |
| #249 (2026-09-23) | Sonda de la cadena de costo real (repuestos → margen/seguro) para producción | `249-finanzas.md` + `249-costo-real-prod/` |
| #83 (2026-09-24) | Comisiones al día: la liquidación arranca donde terminó el último corte | `83-comisiones-al-dia.md` |
| #148 §17 · #244 (2026-09-24) | Día operativo de la auditoría de caja en UTC-3 (último `-04` del backend) + reembolsos | `148-17-auditoria-dia-utc3.md` |
| #83 (2026-09-24) | Control de créditos: la lista se corta, los totales incluyen a todos los deudores | `83-creditos-totales.md` |
| #83 (2026-09-24) | KPI de Finanzas (por cobrar, por pagar, margen) sobre todo el historial | `83-finanzas-kpi-exactos.md` |
| #241 (2026-09-24) | Lote D v2 (Caja, Conciliación, Cuentas): tiles, números de consola y chips + QA antes/después | `rediseno/F4-DOMINIOS.md` + `rediseno/c241f4b-finanzas-cuentas-*` |
| #162 · #241 (2026-09-24) | Config → Seguro y límites: guardar con Enter, estado Guardado/Error por grupo y reautenticación resuelta en el lugar (antes: Enter no guardaba, un guardado pisaba el otro grupo y el 403 de reautenticación quedaba fuera de la sección) | `seguro-limites/` |
| #185 Recorrido de Finanzas en producción | 16/16 pasos, 4 corridas (v1.0.137, v1.0.139, v1.0.140 y v1.0.141) y **16/16 en v1.0.175** | `185/produccion/reporte.md`, `185/produccion-1.0.175/` |
| #253 (2026-09-25) | **Comercial** en archivo propio: precios, seguro, límites/autorizaciones, fidelización y mora | `config-comercial/README.md` |
| #148 §19 · #171 (2026-09-25) | **Ganadores por margen real** (ranking por ganancia y margen por producto) | `finanzas-ganadores/README.md` |
| #148 (2026-09-26) | **Caja**: la diferencia no anticipa un número sin arqueo (fix verificado en producción) | `finanzas-produccion/antes/` + `produccion/` |
| #148 · #171 (2026-09-25) | Runner de reportes al gate (`test:unit`) y sonda de márgenes por **sucursal y cliente** | `reportes-margenes-ci.md` |
| #148 · #144 (2026-09-26) | Sonda de **finanzas en producción** (caja, conciliación y márgenes con costo real) | `finanzas-produccion/README.md` |

## Sondas re-ejecutables (producción)

```bash
npm run release:smoke
node scripts/qa-version.mjs 1.0.140
QA_BASE_URL=https://app.moboss.online node scripts/qa-148-montos-produccion.mjs
QA_BASE_URL=https://app.moboss.online node scripts/qa-148-17-18-19-produccion.mjs
QA_SOLO_DEMO=1 QA_BASE_URL=https://app.moboss.online node scripts/qa-148-ventas-por-caja.mjs
QA_SOLO_DEMO=1 QA_BASE_URL=https://app.moboss.online node scripts/qa-148-analytics-pos.mjs
QA_BASE_URL=https://app.moboss.online node scripts/qa-185-finanzas-demo.mjs
```

Verificación independiente (no producción, con seed propio): el arnés de
integración recalcula reportes y comisiones contra la base —
`MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` termina con
`reports-margen-db.mjs` (evidencia: `148-19-verificacion-reportes-db.md`).

Comparativos antes/después: `produccion-1.0.139/` (línea base) y
`produccion-1.0.140/` (post-deploy).

## Pendientes de producto (no bugs)

- **Montos de 10B/99B**: hoy el tope real es 2.147.483.647 (columnas enteras de
  32 bits). Para aceptar los límites de §9 hace falta migrar las columnas de
  dinero a BigInt (plan en `148-9-montos-monedas.md`). **Estado 2026-09-26: no
  se tomó en esta pasada** — relevado: los campos de dinero se usan en ~140
  puntos de ~20 archivos de varios dominios (cash, finance, purchases,
  delivery, exports, suppliers), así que una migración por mitades dejaría
  topes inconsistentes y riesgo de serialización de BigInt. Es una **unidad
  propia cross-dominio** (POS/INV/FIN) con `db:check`, como pide el plan; queda
  para coordinarla con el orquestador.
- **Gift cards reales** (código, saldo, vencimiento): el producto no las tiene;
  el equivalente es el saldo a favor, ya visible y documentado en la app.
