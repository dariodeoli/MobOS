# #333 · CI E2E: timeout 30 min y shards balanceados por duración medida

Fecha: 03-10-2026 · Rama: `slot/plataforma` · Suite: 703 tests · CI de punta a
punta: lo confirma el run de `main` post-integración (el integrador lo verifica).

## 1. Problema

Run `37100897610` (v1.0.220, `1c96b464`): **E2E 1/3 y 2/3 `cancelled` a ~1215 s**
por el `timeout-minutes: 20` del job; **E2E 3/3 terminó en 771 s**. La causa no
era el flake ni la concurrencia: `e2e/sharding.json` repartía **por cantidad** de
tests (235/234/234) y la suite tiene archivos de duración muy dispar.

Pesados medidos (duración por test de los `playwright-report` de CI):

| Archivo | Tests | Duración |
| --- | --- | --- |
| `pos-241-v2.spec.js` | 4 | **361 s** (4 × 90 s) |
| `dsn-241-dominios.spec.js` | 46 | 181 s |
| `qa-325-roles-movil.spec.js` | 6 | 103 s |
| `qa-323-prn.spec.js` | 4 | 100 s |
| `precios-listas.spec.js` | 1 | 92 s |
| `dsn-responsive-mobile.spec.js` | 12 | 83 s |

## 2. Diagnóstico con duraciones medidas

Se extrajo el `report.json` que Playwright embebe en base64 dentro del
`index.html` de cada artifact `playwright-report-N` de los runs `36986742477`,
`36996423132`, `37046366592`, `37079240562` y `37100897610`. La **última
medición por archivo** quedó versionada en `e2e/tiempos.json` (ms por test y
fallback para specs sin reporte). El mapa reproduce exactamente el shard 3 de
v1.0.220: 625 s estimados vs 647 s del report (+ setup ≈ 771 s de job).

| Distribución | Shard 1 | Shard 2 | Shard 3 |
| --- | --- | --- | --- |
| **Antes** (por cantidad) | 235 tests · ~1176 s | 234 tests · ~1041 s | 234 tests · ~625 s |
| Job estimado (test + ~124 s de setup) | ~1300 s ❌ | ~1165 s ❌ | ~749 s ✅ |
| **Después** (por duración) | 192 tests · ~947 s | 275 tests · ~947 s | 236 tests · ~948 s |
| Job estimado | ~1071 s (~18 min) ✅ | ~1071 s ✅ | ~1072 s ✅ |

Desbalance después: **0.1 %**. La distribución se regenera con
`node scripts/e2e-shards.mjs --generar` y la guarda `--check` (que corre
`npm test`) valida cobertura, duplicados y balance **por duración**.

## 3. Cambios

- `.github/workflows/ci.yml`: `timeout-minutes` de E2E **20 → 30** y comentarios
  al día (la suite completa mide ~47 min en un runner).
- `scripts/e2e-shards.mjs`: el peso de cada archivo es su duración medida
  (`e2e/tiempos.json`); sin medición usa el fallback y, sin archivo de tiempos,
  vuelve a balancear por cantidad.
- `e2e/tiempos.json`: nuevo, `ms` por test y por archivo.
- `e2e/sharding.json`: regenerado (métrica `duracion`).
- `docs/CI-HARNESS.md`: §1 y §1.0.1 (cómo refrescar los pesos).

No se tocó ningún test ni la suite.

## 4. Medición local

La corrida local de los 3 shards se lanzó con backend prod (como CI) y se cortó a
propósito en el shard 1 (test 37/192) para no bloquear la entrega: la duración
absoluta y el verde final los confirma el **run de CI post-merge**.

| Shard | Tests | Tiempo local | Resultado |
| --- | --- | --- | --- |
| 1 | 192 | — (cortada a los ~2 min, test 37/192) | 35 ✓ · 2 ✘ transitorios |
| 2 | 275 | — (no se corrió) | — |
| 3 | 236 | — (no se corrió) | — |

Los 2 rojos de `pos-checkout.spec.js:158/196` (buscador global y clic en la fila)
**no se reprodujeron**: el archivo completo pasa **18/18** aislado y
`permissions + pos-checkout` pasa **24/24** en la misma secuencia que el shard 1.
Son la clase de flake transitorio de estado compartido, no del rebalanceo (no se
tocó ningún test ni código de app).

Comando por shard:

```bash
npm --prefix backend run build
MOBOS_E2E_BACKEND=prod npx playwright test $(node scripts/e2e-shards.mjs --shard N)
```

> La máquina local es más rápida que el runner de CI (~1.5× en el control
> `demo-anonimo`: 44 s local vs 67 s CI), así que los tiempos locales sirven para
> validar el **balance relativo**; la duración absoluta la confirma el CI.
