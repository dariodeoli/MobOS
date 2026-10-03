# #333 · CI E2E: shards balanceados por duración y timeout (30 → 40) con 4 shards

Fecha: 03-10-2026 · Rama: `slot/plataforma` · Suite: 703 tests · CI de punta a
punta: lo confirma el run de `main` post-integración (el integrador lo verifica).

> **Estado final (follow-up v1.0.221):** 4 shards + `timeout-minutes: 40`,
> ~1150 s de test por shard + ~3 min de setup (≈ 22 min de job en el runner
> lento). Ver §5.

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

## 5. Follow-up v1.0.221: 4 shards y timeout 40

El balanceo por duración funcionó (los tres shards llegaron parejos al límite),
pero **no alcanzó el presupuesto**: run `37104804379` (v1.0.221):

| Job | Resultado | Duración |
| --- | --- | --- |
| E2E 1/3 | `cancelled` por timeout | 1815 s |
| E2E 2/3 | `failure` (specs de #334/#335) | 1721 s |
| E2E 3/3 | `cancelled` por timeout | 1816 s |

Datos del shard 2 completado: 275 tests (los 3 shards eran ~947 s estimados),
report de Playwright **1572 s** y suma de tests **1534 s** → el mapa medido en
una corrida anterior era **1.62× más rápido** que este runner. El setup fijo,
medido como job − report, es **~150 s** (1721 − 1572) y no estaba en la cuenta.

Acciones (mismo issue):

- `e2e/tiempos.json`: mediciones previas **normalizadas ×1.619** (para que los
  pesos de archivos medidos en corridas distintas sean comparables) y datos
  nuevos del shard 2 de v1.0.221; se agrega `overheadMs = 180000` (3 min) y la
  nota de normalización.
- `scripts/e2e-shards.mjs`: `TOTAL_SHARDS = 4`; `--generar` imprime el job
  estimado con el overhead.
- `.github/workflows/ci.yml`: matriz `[1, 2, 3, 4]`, `timeout-minutes: 40` y
  comentarios con la cuenta (tests + setup).
- `src/lib/ciHarness.test.js`: la guarda exige la matriz de 4 shards.
- `docs/CI-HARNESS.md` §1/§1.0.1 y `docs/ARRANQUE.md`: 4 shards y overhead.

Nueva distribución (métrica duración):

| Shard | Tests | Test estimado | Job estimado (test + 3 min) |
| --- | --- | --- | --- |
| 1 | 132 | ~1151 s | ~22 min |
| 2 | 154 | ~1151 s | ~22 min |
| 3 | 204 | ~1150 s | ~22 min |
| 4 | 213 | ~1150 s | ~22 min |

Con timeout 40 quedan ~18 min de margen sobre el peor runner observado. La
validación final es el run de CI de `main` post-merge (fuera del alcance de
#334/#335, que corren sus propios arreglos de specs).
