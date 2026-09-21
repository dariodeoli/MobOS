# QA #144 — Conciliación y trazabilidad (verificación de cierre)

- **Issue:** #144 (cerrada) · **Versión verificada:** producción v1.0.132.
- **Método:** demo público (solo lectura) + suite local (unit + integración + e2e).

## Criterios

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Ingresos por cuenta/medio/procesadora con montos y diferencias | ✅ | Portada de Conciliación en producción (`conciliacion-resumen.jpg`) y verificación SQL de los cortes por cuenta/procesadora (`docs/qa/171`, 55/55) |
| Conciliación en lote con estados claros | ✅ | Lote conciliado en el demo (`conciliacion-lote-antes.jpg`, `conciliacion-lote.jpg`) + `e2e/finanzas-conciliacion.spec.js` (2/2) + regla de lotes no reasignables (#204) en `backend/tests/reconciliation-http.mjs` |
| Trazabilidad pago → venta/pedido | ✅ | «Ver pedido» abre el detalle (`conciliacion-trazabilidad.jpg`) y el payload por ítem está cubierto por `reconciliation-http.mjs` |
| Checks de AGENTS.md + e2e smoke | ✅ | `lint` 0 · `npm test` 461/461 · `test:unit` 71/71 · arnés de integración HTTP completo en verde · e2e 30/30 · smoke 7/7 |

## Sonda re-ejecutable

```bash
node scripts/qa-finanzas-demo-produccion.mjs   # 6/6, capturas en docs/qa/144, 161 y 162
```

Capturas: `conciliacion-resumen.jpg`, `conciliacion-lote-antes.jpg`,
`conciliacion-lote.jpg`, `conciliacion-trazabilidad.jpg` · `resultados.json`.
