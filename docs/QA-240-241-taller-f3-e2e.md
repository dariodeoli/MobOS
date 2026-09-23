# QA #240 §4 / #241 — taller en serie y tablero F3 con datos reales (e2e)

Verificación **end-to-end en el arnés local del repo**: base PostgreSQL y API
reales, tenant sembrado, un worker y puertos aislados por worktree
(`MOBOS_E2E_*`). La impresión no tiene impresora física: un **agente falso** en
`127.0.0.1:17890` contesta `/health` y captura el `POST /print`, así el trabajo
sale por el camino real de la app (ticket ESC/POS o HTML A4) y se inspecciona el
contenido.

- **Specs de la verificación:** `e2e/inventario-unidades.spec.js` (taller en
  serie + impresión) y `e2e/ops.spec.js` (tablero F3 con datos reales).
- **Corrida completa:** `MOBOS_E2E_BACKEND=prod npm run test:e2e` →
  **254 passed · 4 skipped**, 6.6 min, **0 reintentos y 0 ruido** de abortos en
  el log del backend (el modo `prod` evita la compilación por ruta de `next dev`).
- **Rama/commit verificado:** `slot/plataforma` sobre `origin/main` `685ed284`
  (v1.0.144).

## Qué quedó verificado

| Paso | Resultado | Evidencia |
| --- | --- | --- |
| Estaciones del taller (carriles y stepper por verificar → verificado → listo, una estación a la vez) | ✅ | `docs/qa/240-taller/02-despues-rack.jpg`, `04-rack-estacion.jpg` |
| Filtros del rack (IMEI/modelo y ubicación) | ✅ | `docs/qa/240-taller/05-rack-busqueda.jpg` |
| **Impresión por estación**: «Imprimir (n)» del carril manda **un trabajo directo** `etiquetas-stock` con las etiquetas de la estación, sin modal ni diálogo de respaldo | ✅ | payload verificado en el test |
| **Impresión en serie por selección** con alcance (selección / estación / todo lo filtrado): **un solo trabajo** con las 3 unidades, IMEI completo y `MOBOS:<serial>` | ✅ | `docs/qa/240-taller/06-rack-imprimir-serie.jpg`, `08-rack-etiquetas-enviadas.jpg` |
| **Hoja de estación A4** (mismo camino que la app: `printHtml` sobre el iframe oculto): los 3 equipos, estado y ubicación | ✅ | `docs/qa/240-taller/07-hoja-estacion.html` |
| Verificación en serie: las 3 pasan a «verificado» con el paso 2 del stepper | ✅ | `docs/qa/240-taller/03-rack-verificado.jpg` |
| Tablero F3 detrás del flag `VITE_OPS_V2`: KPIs y colas desde `/api/inventory-units` y `/api/orders` (nada del mock) | ✅ | `docs/qa/241-ops-tablero/tablero-claro.jpg` (claro/oscuro/móvil) |
| **Datos reales de punta a punta**: unidad recibida desde la UI de inventario → «En taller» 10 → 11 y la unidad en las colas del tablero | ✅ | `docs/qa/241-ops-tablero/tablero-datos-reales.jpg` |
| `/ops-preview` sigue siendo el mock sin API (para la aprobación del piloto) | ✅ | `docs/qa/241-ops-preview/` |

## Notas de la verificación

- **Caché corta de consultas (3 s) del cliente:** el botón «Actualizar» del
  tablero comparte la caché de GET, así que una unidad creada por otra vía
  (p. ej. API desde otro dispositivo) puede tardar hasta 3 s en verse; recibirla
  desde la misma app invalida la caché al instante. Se observó durante la
  verificación, sin impacto práctico (por eso el test elige el camino de la UI).
- **F3 sigue apagada en producción** sin `VITE_OPS_V2`; la prueba de que `/ops`
  y `/ops-preview` vuelven a la app sin flag vive en
  `docs/QA-228-235-232-produccion.md` (v1.0.143).

## Pendientes (fuera de este alcance)

- **Impresión física real** (agente + impresora): el harness solo simula el
  agente; la evidencia de producción vive en `docs/qa/240-impresion-prod/`.
- **F3 en producción:** requiere la aprobación del piloto y cargar
  `VITE_OPS_V2=1` en Coolify (ver `docs/rediseno/PILOTO-241-F3-OPS.md`).

## Cómo repetir

```bash
# Suite completa (gate end-to-end). En CI el backend corre en modo prod:
# sin compilación por ruta y sin ruido de abortos en el log.
MOBOS_E2E_BACKEND=prod npm run test:e2e

# Solo esta verificación (dev alcanza: los specs no dependen del modo)
npx playwright test e2e/ops.spec.js e2e/inventario-unidades.spec.js
```

Las capturas se regeneran en `test-results/qa-240-taller/` y
`test-results/qa-241-ops-tablero/` (y `docs/qa/241-ops-preview/`).
