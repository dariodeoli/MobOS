# #185 — Recorrido funcional en producción · módulo **Finanzas**

- **Issue:** #185 (épica POS y finanzas, por módulos) · **Módulo:** Finanzas
- **Versión verificada:** producción **v1.0.137** (`npm run release:smoke` OK)
- **Método:** Playwright **headless** contra `https://app.moboss.online/demo`
  (demo anónima, datos aislados en el navegador; no se tocó ninguna tienda real)
- **Fecha:** 2026-09-22
- **Resultado:** **16/16 pasos OK** · 25 capturas · **0 errores de consola** ·
  **0 respuestas API ≥ 400** · **0 pedidos de red fallidos**

## Qué se verificó (en verde)

| # | Paso | Verificado |
| --- | --- | --- |
| 1 | Entrada a la demo | abre como dueño, menú Finanzas visible |
| 2 | Bancos: estado inicial | 9 cuentas de cobro listadas |
| 3 | Efectivo contextual | campos que corresponden (moneda + moneda personalizada, sin banco/titular/cuenta), nombre automático |
| 4 | Efectivo: guardar | la cuenta queda en la tabla |
| 5 | Transferencia contextual | banco, titular, documento, número de cuenta, comisión y acreditación; nombre automático («Banco Itaú Paraguay - …») |
| 6 | Transferencia: guardar | fila con titular visible |
| 7 | Tarjeta | procesadoras (Bancard/Dinelco/UPay/Pix/Otra), comisión 3% y acreditación 2 días |
| 8 | Pix | moneda **fija BRL** (sin selector) y llave Pix |
| 9 | USDT - Cripto | moneda **fija USD** (sin selector) y referencia |
| 10 | Canje | referencia/valor y guardado (15 cuentas al final) |
| 11 | Tabla completa y edición | al editar precarga procesadora/comisión/acreditación y conserva el nombre manual |
| 12 | Móvil 390 px | **0 px** de desborde horizontal |
| 13 | Conciliación | resumen completo (Ingresos conciliables, Conciliado, Por conciliar, Diferencia de lotes), **21 pagos** y **1 lote** |
| 14 | Caja y auditoría | turno **abierto** (sin botón de apertura), «Entradas por medio de pago» y «Auditoría de efectivo» |
| 15 | Seguro de ventas | sección + toggle + 25% + ayuda de la fórmula; guardar avisa «Modo demo: datos ficticios, no se guardan» |
| 16 | Resumen y Ganancias | Resumen con «Facturado» y Ganancias con «Cómo se calcula» y resultado (Gs 3.255.000) |

Contra el checklist de #185 para Finanzas: cuentas de cobro con **alta contextual
y nombre automático** ✅ · medios **efectivo multimoneda, transferencia,
tarjeta/procesadoras, Pix y USDT-Cripto** ✅ · **conciliación** ✅ ·
**caja/auditoría** ✅ · **seguro y margen** ✅.

## Hallazgos

**Ninguno nuevo en esta pasada** (0 visuales, 0 funcionales, 0 de seguridad).

Observaciones (no son hallazgos, quedan anotadas):
- La demo desplegada todavía muestra los nombres y el turno del seed anterior
  («Comercio demo», «Dueño demo»): el refresco de datos de demo (#190) viaja en
  la ronda **.138**. Con ese cambio la demo se ve como la tienda real.
- El control de medios de caja se titula **«Entradas por medio de pago»** (el
  nombre «Auditoría de medios» ya no se usa).

## Evidencia

`docs/qa/185/produccion/`: 25 capturas (`01-acceso-demo` … `25-ganancias-demo`)
y `resultados.json` con el detalle por paso y los contadores de consola/red.

Reproducir (solo lectura, ~1 min):

```bash
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/185/produccion \
  node scripts/qa-185-finanzas-demo.mjs
```
