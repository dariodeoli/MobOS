# Apply Progress: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Slices | 1 — Backend puentes (PR 1); 2 — Backend trabajos (PR 2) |
| Fecha | 2026-09-19 |
| Modo | Standard (TDD off según `openspec/config.yaml`) |
| Estado | 14/14 tareas del slice 1 completas; 12/12 del slice 2 completas; slices 3-5 pendientes |

## Work Unit Evidence

### Slice 1 — Backend puentes

| Evidencia | Valor |
|---|---|
| Test foco | `npm --prefix backend run test:unit` → 21 tests, 21 pass, 0 fail (incluye `PASS: token, pairing, autenticación multi-puente y validación de impresoras`) |
| Arnés de runtime | `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → exit 0; línea observada: `print-bridge-http: puentes, impresoras, import idempotente, tope y manifest OK.` |
| Frontera de rollback | Migración aditiva `20261016000000_print_bridge` (tablas sin uso hasta el slice 2) + rutas `backend/app/api/print/**`, `backend/app/api/print-agent/manifest`, `backend/lib/print-bridge.ts` y tests. Revertir el slice deja intactos los caminos actuales de impresión local. |

### Slice 2 — Backend trabajos

| Evidencia | Valor |
|---|---|
| Test foco | `npm --prefix backend run test:unit` → 21 tests, 21 pass, 0 fail; línea `PASS: token, pairing, autenticación multi-puente, validación de impresoras y trabajos de impresión` (payload/tope 413, sufijo hasheado, transiciones, requeue 1/3, extensión de lease, whitelist del shape público) |
| Arnés de runtime | `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → exit 0; línea observada: `print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, tope y manifest OK.` Cubre pair (un solo uso, 5 intentos → 429, auditoría), heartbeat (online + lease extendido), encolado/idempotencia/413, espejo LOCAL, claim asignado y SKIP LOCKED concurrente, result ajeno idempotente con borrado de payload, confirmación 400/200 con borrado del hash, requeue/purga/aislamiento, config del puente, kill switch y cap 429 |
| Frontera de rollback | `Tenant.settings.printRemote=false` apaga el encolado/claim y la app vuelve al camino local; revertir el slice elimina `backend/lib/print-jobs.ts`, las rutas `bridge/**` y `print/jobs/**` y sus tests, sin tocar la migración del slice 1. El camino local de la Mac (`127.0.0.1`) nunca se modifica. |

## Tareas completadas — Slice 1

- [x] 1.1 Enums `PrintJobState`/`PrintJobPath` y modelos `PrintBridge`, `PrintPrinter`, `PrintJob` en `backend/prisma/schema.prisma` (campos/índices/FKs de D1).
- [x] 1.2 Migración aditiva, idempotente y re-ejecutable `backend/prisma/migrations/20261016000000_print_bridge/migration.sql` (enums en `DO $$` sobre `pg_type`, `CREATE TABLE/INDEX IF NOT EXISTS`, FKs en `DO $$ pg_constraint`).
- [x] 1.3 `backend/lib/print-bridge.ts`: token de 32 bytes, `hashToken`, `autenticarPuente` (lookup + `timingSafeEqual` + rechazo de revocado), código Crockford TTL 15 min/1 uso/5 intentos, tope de 20 puentes por empresa, validación de impresoras y mapeo legacy.
- [x] 1.4 `backend/tests/print-bridge.test.ts` registrado en `backend/tests/run-unit.cjs`.
- [x] 1.5–1.13 Rutas: `GET/POST /api/print/bridges`, `POST /api/print/bridges/[id]/pairing`, `DELETE /api/print/bridges/[id]`, `GET/POST /api/print/printers`, `PATCH/DELETE /api/print/printers/[id]`, `POST /api/print/printers/import`, `GET /api/print-agent/manifest`.
- [x] 1.14 `backend/tests/print-bridge-http.mjs` enganchado en `backend/tests/integration-http.sh` (tras obtener `ADMIN_TOKEN`).

## Tareas completadas — Slice 2

- [x] 2.1 `backend/lib/print-jobs.ts`: `validarPayload` (≤131072 base64 + regex, 413), `hashSufijo`/`sufijoCoincide` (guarda de longitud + `timingSafeEqual`), `estadoTrasResultado`, `calcularRequeue` (attempts<3), `calcularLeaseExtendido` (5 ventanas de 120 s), `shapePublico`/`shapeAgente` (listas blancas), `purgarMetadatos` (180 días, lote ≤200), `reencolarVencidos` (decisión pura + updateMany condicionado) y `reclamarTrabajo` (`FOR UPDATE SKIP LOCKED`).
- [x] 2.2 `backend/tests/print-bridge.test.ts` ampliado: payload, sufijo de distinto largo, transiciones válidas/inválidas, requeue con attempts 1/2/3, lease extendido y tope de ventanas, whitelist exacta del shape público.
- [x] 2.3 `POST /api/print/bridge/pair`: código normalizado (400), lookup por hash, consumo atómico con `UPDATE ... RETURNING` vía `updateMany` condicionado, token una única vez (201), 401 genérico, intentos 1-5 → 401/429, rate-limit por IP 10/min en memoria, auditoría `PRINT_BRIDGE_PAIRED`/`PRINT_BRIDGE_PAIR_FAILED` (sin código).
- [x] 2.4 `POST /api/print/bridge/heartbeat`: Bearer, `lastSeenAt` throttled a 1 escritura/20 s, `version`/`platform`, extensión del lease 120 s por `jobId` con tope de 5 ventanas, `{ ok, serverTime, leaseExpiresAt? }`.
- [x] 2.5 `POST /api/print/bridge/claim`: kill switch 409, purga oportunista, requeue de vencidos + auditoría, presencia throttled y claim atómico por tenant/puente; `{ jobs: [] }` sin trabajo, payload + lease solo al dueño.
- [x] 2.6 `POST /api/print/bridge/jobs/[id]/result`: valida `leaseId` (falta → 400), estados `ACEPTADO/INCIERTO/FALLIDO`, cierre con `payload=null`, `attempts`/transporte auditados, error truncado a 200, respuesta idempotente con estado actual (lease ajeno/repetido → `applied:false`).
- [x] 2.7 `GET /api/print/bridge/config`: token; impresoras activas `bridgeId = mío OR NULL`, predeterminada, `lan`, `lanCups` (settings o `MobOS_LAN`), `version`, `impresora/ancho/copias` (réplica del sync legacy); kill switch → config vacía con `remoteEnabled:false`.
- [x] 2.8 `POST /api/print/jobs`: sesión, payload con tope 413, replay de `idempotencyKey` (200), espejo LOCAL con `sourceJobId`/sin payload/estado terminal, vínculo al puente de la impresora, cap 200 abiertos → 429, kill switch 409, auditoría `PRINT_JOB_ENQUEUED`; aliases legacy (`destino`, `data`, `ancho`, `copias`, `usuario`, `sufijo`, etc.).
- [x] 2.9 `GET /api/print/jobs`: filtros `state`/`limit≤100`/`before`, shape público y `remoteEnabled`.
- [x] 2.10 `GET /api/print/jobs/[id]`: detalle público, 404 multi-tenant.
- [x] 2.11 `POST /api/print/jobs/[id]/confirm`: `{suffix|sufijo}`; 400 sin exponer el hash, 409 si no es ACEPTADO/sin secreto/ya confirmado, `suffixHash=''` y `confirmedAt` al confirmar, auditoría `PRINT_JOB_CONFIRMED`/`PRINT_JOB_CONFIRM_FAILED` (intentos, nunca el valor).
- [x] 2.12 `backend/tests/print-bridge-http.mjs` completado con el flujo pair→heartbeat→enqueue→claim (asignado y SKIP LOCKED concurrente)→result→confirm, aislamiento multi-tenant, requeue/purga, config, kill switch, cap y revocación.

## Archivos

### Slice 1

| Archivo | Acción |
|---|---|
| `backend/prisma/schema.prisma` | Modificado (+127): relaciones en `Tenant`/`User` y 3 modelos + 2 enums |
| `backend/prisma/migrations/20261016000000_print_bridge/migration.sql` | Creado (126) |
| `backend/lib/print-bridge.ts` | Creado (216) |
| `backend/tests/print-bridge.test.ts` | Creado (132) |
| `backend/tests/run-unit.cjs` | Modificado (+1) |
| `backend/tests/print-bridge-http.mjs` | Creado (144) |
| `backend/tests/integration-http.sh` | Modificado (+1) |
| `backend/app/api/print/bridges/route.ts` | Creado (35) |
| `backend/app/api/print/bridges/[id]/route.ts` | Creado (20) |
| `backend/app/api/print/bridges/[id]/pairing/route.ts` | Creado (19) |
| `backend/app/api/print/printers/route.ts` | Creado (48) |
| `backend/app/api/print/printers/[id]/route.ts` | Creado (70) |
| `backend/app/api/print/printers/import/route.ts` | Creado (64) |
| `backend/app/api/print-agent/manifest/route.ts` | Creado (26) |

Total authored slice 1: ~1029 líneas (900 nuevas + 129 modificadas).

### Slice 2

| Archivo | Acción |
|---|---|
| `backend/lib/print-jobs.ts` | Creado (227) |
| `backend/app/api/print/bridge/pair/route.ts` | Creado (78) |
| `backend/app/api/print/bridge/heartbeat/route.ts` | Creado (44) |
| `backend/app/api/print/bridge/claim/route.ts` | Creado (37) |
| `backend/app/api/print/bridge/config/route.ts` | Creado (38) |
| `backend/app/api/print/bridge/jobs/[id]/result/route.ts` | Creado (61) |
| `backend/app/api/print/jobs/route.ts` | Creado (173) |
| `backend/app/api/print/jobs/[id]/route.ts` | Creado (15) |
| `backend/app/api/print/jobs/[id]/confirm/route.ts` | Creado (52) |
| `backend/tests/print-bridge.test.ts` | Modificado (+99/-2) |
| `backend/tests/print-bridge-http.mjs` | Modificado (+222/-3) |
| `openspec/changes/print-bridge-remoto/tasks.md` | Modificado (2.1–2.12 marcadas) |

Total authored slice 2: ~1046 líneas (725 nuevas + 321 en tests).

## Verificación observada

### Slice 1

| Comando | Resultado |
|---|---|
| `npm --prefix backend run prisma:validate` | `The schema ... is valid` |
| Migración aplicada con `prisma migrate deploy` + re-ejecutada 2 veces con `psql` | OK (solo `NOTICE ... already exists, skipping`) |
| `prisma migrate diff --from-config-datasource --to-schema` | `sin diferencias` |
| `npm run db:check` (cluster temporal con las migraciones aplicadas) | `check-db-schema: la base coincide con prisma/schema.prisma.` |
| `npm --prefix backend run test:unit` | 21 pass, 0 fail |
| `cd backend && npx tsc --noEmit` | sin salida (0 errores) |
| `npm --prefix backend run build` | exit 0 y `backend/.next/BUILD_ID` creado |
| `npm run lint` | sin errores |
| `npm test` | 165 pass, 0 fail |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | exit 0; `print-bridge-http: puentes, impresoras, import idempotente, tope y manifest OK.` |
| `rg "<<<<<<<" src backend e2e print-agent` | sin resultados |

### Slice 2

| Comando | Resultado |
|---|---|
| `npm --prefix backend run test:unit` | 21 pass, 0 fail; `PASS: token, pairing, autenticación multi-puente, validación de impresoras y trabajos de impresión` |
| `cd backend && npx tsc --noEmit` | sin salida (0 errores) |
| `npm --prefix backend run build` | exit 0 y `backend/.next/BUILD_ID` creado (`2ErueWm8TIgwuAz2IeJcx`) |
| `npm run lint` | sin errores |
| `npm test` | 165 pass, 0 fail |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | exit 0; `print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, tope y manifest OK.` |
| `rg "<<<<<<<" src backend e2e print-agent` | sin resultados |

## Desviaciones del diseño

### Slice 1

1. **`online` en el shape del puente**: se agrega un booleano derivado de `lastSeenAt` con la ventana de presencia existente (75 s, `lib/presence.ts`) para cumplir el escenario «El puente aparece online» de `print-agent-distribution`. El diseño listaba `lastSeenAt` sin el derivado.
2. **Tope de puentes**: el diseño no fijaba número; se define `MAX_PUENTES_POR_EMPRESA = 20` (429 al exceder), documentado y cubierto por unit e IT.
3. **`tokenHash` pre-pairing**: D1 exige `tokenHash` único no nulo; al crear el puente se guarda el hash de un token descartable que se reemplaza al canjear el código (slice 2).
4. **`map` del import**: se devuelve `{ printers: {localId→backendId}, bridges: {localId→backendId} }`; el diseño solo decía `map`.
5. **Un único puente predeterminado**: D1 no tiene columna de predeterminado en `PrintBridge`; el invariante se conserva del lado del cliente (`puentes.js:37-44`) y el backend garantiza un solo `PrintPrinter.isDefault`. El import deduplica puentes por nombre.
6. **Manifest tolerante**: lee `public/print-agent/manifest.json` y responde 503 si falta (hoy). El IT acepta 503 (slice 1) o 200 con contrato completo (tras el slice 5) para no romper cuando el packer publique el artefacto.

### Slice 2

1. **`claimedAt`/`updatedAt` como parámetro JS, no `now()`**: las columnas son `TIMESTAMP(3)` sin zona; `createdAt` por defecto usa `CURRENT_TIMESTAMP` (hora local del motor), pero Prisma serializa los `Date` en UTC. Mezclar `now()` en el claim con `calcularLeaseExtendido` (JS) desfasaba el lease horas en `America/Asuncion` y el latido no extendía nada. El claim escribe los instantes con el `ahora` JS; el requeue compara con `leaseExpiresAt` (también escrito por Prisma) y queda consistente. Es la corrección del SQL de D2, sin cambiar su forma.
2. **Extensión del lease sin contador**: no hay columna de extensiones; el tope de 5 se implementa con `calcularLeaseExtendido` (`min(ahora+120 s, claimedAt+5×120 s)`, ~10 min), cubierto por unit. El diseño pedía "hasta 5 veces (máx. ~10 min)".
3. **`pairingCodeHash` se conserva tras el canje**: para poder contar los 5 intentos posteriores a un código ya usado (y responder 429) el hash queda en la fila; `pairingUsedAt` impide el reuso y el endpoint de regeneración lo reemplaza. El diseño no especificaba el borrado.
4. **`lanCups` del config**: el backend no modela la cola CUPS; se devuelve `Tenant.settings.printLanCups` si existe o `'MobOS_LAN'` como default del agente (`print-agent/config.mjs:30`).
5. **`config` agrega `impresora/ancho/copias`/`printers` completos**: la spec `print-config-authority` pide replicar el payload de `sincronizarAgente` (`agent.js:237-248`); el diseño listaba solo `printers, lan, defaultPrinterId, lanCups, version`.
6. **Encolado con aliases legacy**: el body acepta nombres canónicos y los históricos del SPA (`destino`, `data`, `ancho`, `copias`, `usuario`, `sufijo`, `ref`, `tipo`, `validacion`, `puente`, `tokenPista`, `modo`, `equipo`) para no romper el camino de impresión actual en el slice 4.
7. **Jobs atados a la impresora**: si el encolado trae `printerId`, el trabajo hereda el `bridgeId` de la impresora; así el claim solo lo entrega al puente correcto (invariante de `print-config-authority`). El diseño no explicitaba ese vínculo.

## Problemas encontrados

- Ninguno que bloquee. El `ERROR: duplicate key` en el log del arnés es el 409 esperado de destino repetido (Postgres lo registra; la ruta responde 409).
- Slice 2: el tope de intentos del pairing se prueba varias veces con el mismo código; el rate-limit por IP (10/min) no se dispara en el arnés porque no se envía `x-forwarded-for`, por lo que los 5 intentos del código sí alcanzan el 429 (comportamiento real en producción detrás del Hub).

## Workload / PR boundary

- Estrategia: `auto-chain` + `stacked-to-main` (tasks.md). El slice 1 es el PR 1 con base `main`; el slice 2 es el PR 2 apilado sobre el 1.
- Presupuesto: el forecast estimó ~450 líneas para el slice 2 y el resultado real es ~1046 authored (725 nuevas + 321 de tests). El diff no se puede recortar sin borrar tests/validación; se recomienda **`size:exception`** para este PR o partirlo en 2A (lib + unit + rutas de puente) / 2B (rutas de sesión + confirmación + IT).
- Frontera slice 2: arranca en el backend de puentes/impresoras del slice 1 y termina con la cola remota completa (pair, heartbeat, claim, result, config, encolado/listado/detalle/confirmación, caps, purga y auditoría) sin tocar el agente ni la app.

## Pendiente

- Slice 3 (agente: `remoto.mjs`, `pair.mjs`, cola/config/server y bump 1.6.0), slice 4 (app: cliente API, router local/remoto, caché v2, UI) y slice 5 (pack/install/checksum, e2e, docs).
