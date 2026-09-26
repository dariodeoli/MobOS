# Finanzas en producción — caja, conciliación y márgenes con costo real

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-26 · **Producción:** v1.0.175
  (incluye el fix de caja de la ronda anterior).
- **Resultado:** sonda sin credenciales sobre el demo público **15/15**, con
  capturas desktop/mobile por pantalla.

## Qué se verificó

Sonda: `node scripts/qa-253-finanzas-produccion.mjs` (sobre
`https://app.moboss.online/demo`; también corre contra la demo local con
`QA_BASE_URL`).

| Bloque | Verificación | Resultado |
| --- | --- | --- |
| Caja | Turno abierto, «Entradas por medio de pago» y «Auditoría de efectivo» | ✅ |
| Caja | La diferencia **no anticipa** un número sin arqueo (`—`, «se calcula al cierre») | ✅ fix confirmado en producción |
| Caja | Un cobro de efectivo se marca Verificado y el botón queda deshabilitado | ✅ |
| Caja | Capturas desktop y mobile | ✅ `produccion/caja-produccion-*.png` |
| Conciliación | Resumen, filas por cuenta/procesadora y estados honestos | ✅ |
| Conciliación | Lote conciliado con diferencia y trazabilidad | ✅ |
| Conciliación | Capturas desktop y mobile | ✅ `produccion/conciliacion-produccion-*.png` |
| Márgenes | El seguro de ventas se configura en Comercial (25%) | ✅ |
| Márgenes | Ganancias usa el costo real: badge «Incluye seguro 25% (demo)» y la cadena cuadra | ✅ `Ingresos 14.280.000 − Costo 13.781.250 = Resultado 498.750` |
| Márgenes | Reportes no inventa cifras en la demo («Reportes sobre datos reales») | ✅ |
| Márgenes | Ganadores ordenado por ganancia real, con margen por producto | ✅ 3 productos, ranking decreciente |
| General | La demo no llama al API de finanzas ni ensucia la consola | ✅ |

Capturas: `produccion/ganancias-produccion-desktop.png`,
`produccion/reportes-produccion-desktop.png`,
`produccion/ganadores-produccion-desktop.png` (+ las de caja y conciliación).

## Hallazgo (ronda anterior, corregido y confirmado acá)

Con la caja **abierta y sin arqueo**, la tarjeta superior mostraba
`contado 0 − esperado` como **Diferencia −10.400.000** con fondo de alerta,
mientras «Ventas por caja» y la auditoría mostraban `—` / 0. El fix hace que la
tarjeta y la barra del arqueo muestren `—` hasta que hay conteo (desglose o
total tipeado).

- Antes: `antes/caja-diferencia-antes-desktop.png` (tarjeta roja con
  −10.400.000 y «Contado Gs 0 · Diferencia −10.400.000»).
- Ahora (v1.0.175): `produccion/caja-produccion-desktop.png` con
  `Diferencia —` y «Contado — · Esperado Gs 500.000 · Diferencia —» en la barra
  del arqueo. ✅ verificado en producción.
- Regresión: `e2e/finanzas-caja.spec.js` y `e2e/demo-finanzas.spec.js`.

## Verificación

- Sonda en producción: **15/15** (v1.0.175).
- Sonda en demo local: **15/15** (`despues/`).
- `npm test` **751/751** · `npm --prefix backend run test:unit` **99/99** ·
  `lint` 0 errores · build FE/BE con `BUILD_ID` (última corrida verde en la
  ronda anterior; esta pasada solo toca sonda y docs).

## Reproducir

```bash
# Producción (demo público):
node scripts/qa-253-finanzas-produccion.mjs
# Local con la demo:
QA_BASE_URL=http://localhost:5175 QA_OUT=docs/qa/finanzas-produccion/despues \
  node scripts/qa-253-finanzas-produccion.mjs
```
