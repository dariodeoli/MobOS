# Cierre del dominio **Finanzas** (slot/finanzas)

- **Rama:** `slot/finanzas` · **Verificación definitiva:** producción
  **v1.0.141** (`release:smoke` OK) · **Fecha:** 2026-09-22
- **Última revisión:** 2026-09-23 (v1.0.152) — verificación de márgenes con
  costo real: el **descuento del carrito**, la **pérdida de una línea bajo
  costo** y las **ventas con costo pendiente** ya no inflan la ganancia ni la
  comisión; el arnés **recalcula reportes y comisiones desde la base**; y se
  suman el **responsive mobile de Finanzas (#249)** y la **sonda de la cadena de
  costo real** para producción (`148-19-*.md`, `249-finanzas.md`).
- Índice de todo lo entregado y verificado en el dominio, con la evidencia y la
  versión en la que quedó integrado. Sirve de punto de entrada para auditoría.

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
| #185 Recorrido de Finanzas en producción | 16/16 pasos, 4 corridas (v1.0.137, v1.0.139, v1.0.140 y v1.0.141) | `185/produccion/reporte.md`, `185/produccion-1.0.139/`, `185/produccion-1.0.140/`, `185/produccion-1.0.141/` |

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
  dinero a BigInt (plan en `148-9-montos-monedas.md`).
- **Gift cards reales** (código, saldo, vencimiento): el producto no las tiene;
  el equivalente es el saldo a favor, ya visible y documentado en la app.
