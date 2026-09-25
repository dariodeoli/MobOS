# Caja y conciliación · verificación en producción (#148 §17 · #144)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-25 · **Resultado:** Caja y
  Conciliación verificadas en producción (demo público) **10/10**, con un
  hallazgo real corregido en Caja (diferencia anticipada sin arqueo).

## Qué se verificó (producción, v1.0.172)

Sonda: `node scripts/qa-253-conciliacion-caja-produccion.mjs` (sin
credenciales, sobre `/demo`).

| Verificación | Resultado |
| --- | --- |
| Demo: se entra como Dueño | ✅ |
| Caja: turno abierto, "Entradas por medio de pago" y "Auditoría de efectivo" | ✅ |
| Caja: un cobro de efectivo se marca Verificado y el botón queda deshabilitado | ✅ |
| Caja: capturas desktop y mobile | ✅ `produccion/caja-produccion-*.png` |
| Conciliación: resumen y filas por cuenta/procesadora | ✅ |
| Conciliación: un lote se concilia y queda registrado (con diferencia) | ✅ |
| Conciliación: capturas desktop y mobile | ✅ `produccion/conciliacion-produccion-*.png` |
| Demo: sin llamadas al API de finanzas ni errores de consola | ✅ |

Los números cuadran entre superficies: ingresos conciliables
(6.850.000 + 41.740.000 = 48.590.000), diferencia de lotes (−50.000 = comisión
bancaria), saldo esperado de caja (apertura 500.000 + efectivo 9.900.000 =
10.400.000) y auditoría de efectivo en 0 diferencias con 9 pendientes.

## Hallazgo corregido — Caja: diferencia anticipada sin arqueo

Con la caja **abierta y sin arqueo**, la tarjeta superior mostraba
**Diferencia −10.400.000** (contado 0 − esperado), con un fondo de alerta,
mientras el resto de la pantalla era honesto: «Ventas por caja» mostraba `—` y
la auditoría de efectivo 0 diferencias. Un número alarmante que todavía no
existe: la diferencia se calcula al cierre.

- **Antes:** `produccion/caja-produccion-desktop.png` (tarjeta roja con
  −10.400.000 y barra del arqueo con «Contado Gs 0 · Diferencia −10.400.000»).
- **Después:** la tarjeta y la barra del arqueo muestran `—` hasta que hay
  conteo (desglose cargado o total tipeado); con el conteo vuelven los números
  en vivo y el tono verde/rojo. Captura local: `despues/caja-despues-desktop.png`.
- **Regresión:** `e2e/finanzas-caja.spec.js` (sesión real) y
  `e2e/demo-finanzas.spec.js` (demo) afirman `—` sin arqueo y número al cargar
  el conteo.

## Verificación del fix

- e2e enfocado (`finanzas-caja`, `demo-finanzas`, `demo-finanzas-anonimo`,
  `finanzas-conciliacion`, `admin`): **46/46 verde** (1.3m).
- `npm test` (**751/751**), `npm --prefix backend run test:unit` (**99/99**),
  `lint` 0 errores y build FE con `BUILD_ID`.
- La sonda corre también contra la demo local
  (`QA_BASE_URL=http://localhost:5175`): **10/10**, con la captura del fix
  (`despues/caja-produccion-desktop.png`: diferencia `—` y barra coherente).

## Reproducir

```bash
# Producción (demo público):
node scripts/qa-253-conciliacion-caja-produccion.mjs
# Local con la demo:
QA_BASE_URL=http://localhost:5175 QA_OUT=docs/qa/finanzas-caja-conciliacion/despues \
  node scripts/qa-253-conciliacion-caja-produccion.mjs
```
