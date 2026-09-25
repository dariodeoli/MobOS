# Racha de CI (#245) — 3 corridas completas verdes

Evidencia de estabilidad sobre el código de esta entrega, en modo CI
(`MOBOS_E2E_BACKEND=prod`), **sin reintentos** (`retries: 0`) y sin cuarentena.

> Las 3 corridas se hicieron sobre la base v1.0.170 + los commits de esta rama.
> Después, `main` siguió avanzando (v1.0.171) y la rama se rebasó sobre ese tip
> para no pisar merges ajenos; el CI de `main` tras la integración es la
> verificación final de la racha.

| Corrida | Resultado | Duración | Exit |
| --- | --- | --- | --- |
| 1 | 447 passed · 6 skipped · 0 failed | 12.0m | 0 |
| 2 | 447 passed · 6 skipped · 0 failed | 12.2m | 0 |
| 3 | 447 passed · 6 skipped · 0 failed | 12.5m | 0 |

- Resúmenes: [`racha-1-resumen.md`](racha-1-resumen.md) ·
  [`racha-2-resumen.md`](racha-2-resumen.md) ·
  [`racha-3-resumen.md`](racha-3-resumen.md).
- Los `racha-N.log` completos quedan locales (`.gitignore` ignora `*.log`); el
  resumen es el cierre textual de cada corrida.
- Con `retries: 0`, un test que falla hace fallar la corrida y no hay "verde
  por reintento": la racha no tiene flakies que esconder. (La racha se lanzó con
  `--reporter=list`; el reporte de flakiness del arnés queda para las corridas
  de CI, que sí corren con los reporters de la config.)

Reproducir:

```bash
for i in 1 2 3; do
  MOBOS_E2E_BACKEND=prod npx playwright test --reporter=list
done
```

Los 6 salteados son los mismos en las 3 corridas:

- 2 de `e2e/perf-247.spec.js` (la auditoría solo corre con `MOBOS_PERF_AUDIT=1`),
- 3 de `e2e/demo-publico.spec.js` (flujos de demo que se saltean sin el modo demo),
- 1 de `e2e/qa-140-inventario.spec.js`.
