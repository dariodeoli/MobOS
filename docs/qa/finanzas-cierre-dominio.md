# Cierre del dominio **Finanzas** (slot/finanzas)

- **Rama:** `slot/finanzas` · **Verificación definitiva:** producción
  **v1.0.141** (`release:smoke` OK) · **Fecha:** 2026-09-22
- Índice de todo lo entregado y verificado en el dominio, con la evidencia y la
  versión en la que quedó integrado. Sirve de punto de entrada para auditoría.

## Verificación definitiva (v1.0.141) — sin gaps reales

Corrida de cierre sobre la última versión publicada, todo en verde:

| Sonda | Resultado |
| --- | --- |
| `release:smoke` | ✅ v1.0.141 publicada |
| §9 montos (`qa-148-montos-produccion.mjs`) | **5/5** |
| §17/§18/§19 (`qa-148-17-18-19-produccion.mjs`) | **8/8** · **11/11** cortes del analytics |
| §18 ventas por caja / analytics (`QA_SOLO_DEMO=1`) | **2/2** · **1/1** |
| Recorrido de Finanzas #185 | **16/16** · 25 capturas · 0 errores |
| Resumen/Análisis (#171) y último usado (#209) | **6/6** · **6/6** |

Evidencia: `produccion-1.0.141/` y `185/produccion-1.0.141/`.

**Queda asentado: al 2026-09-22 no hay ningún gap funcional abierto de #148
§17/§18/§19 en el dominio.** Lo único pendiente son dos decisiones de producto
(abajo), ninguna es un defecto.

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

Comparativos antes/después: `produccion-1.0.139/` (línea base) y
`produccion-1.0.140/` (post-deploy).

## Pendientes de producto (no bugs)

- **Montos de 10B/99B**: hoy el tope real es 2.147.483.647 (columnas enteras de
  32 bits). Para aceptar los límites de §9 hace falta migrar las columnas de
  dinero a BigInt (plan en `148-9-montos-monedas.md`).
- **Gift cards reales** (código, saldo, vencimiento): el producto no las tiene;
  el equivalente es el saldo a favor, ya visible y documentado en la app.
