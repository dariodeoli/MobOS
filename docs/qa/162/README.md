# QA #162 — Seguro y efecto en el margen (verificación de cierre)

- **Issue:** #162 (cerrada) · **Versión verificada:** producción v1.0.132.
- **Método:** demo público (solo lectura) + suite local (fórmula testeada + integración).

## Criterios

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| % de seguro de la empresa (y personalizado por cliente) | ✅ | Captura `seguro-config.jpg` (demo, 25%); persistencia real del `insurancePct` verificada en `backend/tests/authorization-limits.mjs` (GET lo devuelve) y el fix de #204 (`docs/qa/204`) |
| Fórmula costo real = costo + seguro | ✅ | `backend/tests/finance-insurance.test.ts` + `insurance.test.ts` (71/71 unit) y la sonda de #204 con la API real: costo 100.000 + 25% → real 125.000 y margen 25.000 |
| Reflejo en los cálculos/indicadores de margen | ✅ | Reportes/`/api/reports` con `costPyg`/`profitPyg` que incluyen el costo congelado (`docs/qa/171`, SQL 55/55) y captura `ganancias-margen.jpg` con el aviso «Incluye seguro 25% (demo)» |
| Checks + e2e smoke | ✅ | `lint` 0 · `npm test` 461/461 · `test:unit` 71/71 · arnés de integración HTTP completo en verde · e2e 30/30 · smoke 7/7 |

## Sonda re-ejecutable

```bash
node scripts/qa-finanzas-demo-produccion.mjs   # 6/6, capturas en docs/qa/144, 161 y 162
```

Capturas: `seguro-config.jpg`, `ganancias-margen.jpg` · `resultados.json`.
