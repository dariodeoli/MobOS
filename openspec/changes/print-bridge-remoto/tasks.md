# Tasks: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Fecha | 2026-09-19 |
| Baseline | `origin/main` @ `d736d96` (v1.0.102); issue #35 |
| Estrategia | `auto-chain` — 5 PRs encadenados, presupuesto 400 líneas por PR |
| TDD | off (`openspec/config.yaml`); igual cada tarea declara su verificación |

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| Slice (PR) | Est. líneas | Riesgo >400 | Encadenar | Test foco |
|---|---|---|---|---|
| 1 Backend puentes | ~420 | High | Sí | `npm --prefix backend run test:unit` |
| 2 Backend trabajos | ~450 | High | Sí; partir en 2A sesión / 2B puente si el diff supera 400 | `npm --prefix backend run test:unit` |
| 3 Agente | ~400 | Medium | Sí; borde si suma tests | `npm --prefix print-agent test` |
| 4 App | ~450 | High | Sí; partir API+router / UI si supera 400 | `npm test` |
| 5 Distribución + docs | ~300 | Low | No (entra solo) | `node scripts/pack-agent.mjs --check` |

Base de cada PR: `main` con los slices previos ya mergeados (stacked). 3 y 4 son paralelizables tras 2; el ritmo auto-chain los ejecuta 1→2→3→4→5.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Puentes, impresoras, import y manifest | PR 1 | `npm --prefix backend run test:unit` | `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | rutas/tablas sin uso; migración aditiva |
| 2 | Cola remota con lease y confirmación | PR 2 | idem + caso IT completo | idem pair→claim→result→confirm | flag `Tenant.settings.printRemote=false` |
| 3 | Poller y pairing del agente | PR 3 | `npm --prefix print-agent test` | backend falso `node:http` + socket contador | `apiUrl:''` = comportamiento 1.5.0 |
| 4 | Router local/remoto, caché v2, UI | PR 4 | `npm test` | `npm run test:e2e` (config) | revertir SPA; backend intacto |
| 5 | Pack/install/checksum, e2e, docs | PR 5 | `node scripts/pack-agent.mjs --check` | `npm run test:e2e` (puente falso) | borrar `backend/public/print-agent/` |

## Slice 1 — Backend puentes (PR 1) — depende: —

- [x] 1.1 Agregar enums `PrintJobState`/`PrintJobPath` y modelos `PrintBridge`, `PrintPrinter`, `PrintJob` a `backend/prisma/schema.prisma` según D1 (campos, índices, FKs Cascade/SetNull). Verifica: `npm --prefix backend run prisma:validate`.
- [x] 1.2 Crear migración idempotente `backend/prisma/migrations/20261016000000_print_bridge/migration.sql` (`CREATE TABLE/INDEX IF NOT EXISTS`, `DO $$ pg_constraint`) calcada de `backend/prisma/migrations/20261012000000_presence/migration.sql:3-40` (read-only). Sin seed: no hay datos iniciales. Verifica: `npm run db:check` limpio y re-ejecutar la migración dos veces sin error.
- [x] 1.3 Crear `backend/lib/print-bridge.ts`: token 32 bytes + `tokenHash` patrón `backend/lib/auth.ts:200-206` (read-only), `autenticarPuente` con lookup + `timingSafeEqual` y rechazo de `revokedAt`, código Crockford `ABCDE-FGHIJ` (TTL 15 min, un uso, 5 intentos), tope de puentes por empresa. Verifica: `npm --prefix backend run test:unit` (casos de `backend/tests/print-bridge.test.ts`).
- [x] 1.4 Escribir `backend/tests/print-bridge.test.ts` (RED): normalización de código, un solo uso, vencido, token inválido/revocado, aislamiento multi-puente; registrarlo en `backend/tests/run-unit.cjs`. Verifica: `npm --prefix backend run test:unit`.
- [x] 1.5 `GET /api/print/bridges` en `backend/app/api/print/bridges/route.ts`: sesión, lista sin `tokenHash`, presencia por `lastSeenAt`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.6 `POST /api/print/bridges` (mismo archivo): ADMIN, 201 con código de pairing una única vez, 400/401/403 y tope, auditoría `PRINT_BRIDGE_CREATED`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.7 `POST /api/print/bridges/[id]/pairing` en `backend/app/api/print/bridges/[id]/pairing/route.ts`: ADMIN, regenera código, 404/409 revocado. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.8 `DELETE /api/print/bridges/[id]` en `backend/app/api/print/bridges/[id]/route.ts`: soft revoke (`revokedAt`), 404, auditoría `PRINT_BRIDGE_REVOKED`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.9 `GET /api/print/printers` en `backend/app/api/print/printers/route.ts`: sesión, impresoras + puentes de la empresa. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.10 `POST /api/print/printers` (mismo archivo): ADMIN, 403 a VENDEDOR, 409 por único `[tenantId,destination]`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.11 `PATCH`/`DELETE /api/print/printers/[id]` en `backend/app/api/print/printers/[id]/route.ts`: ADMIN, 403/404, validación de campos del formulario según `docs/CAMPOS.md` (read-only). Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.12 `POST /api/print/printers/import` en `backend/app/api/print/printers/import/route.ts`: import único idempotente, 409 si ya importó salvo `force`, devuelve mapa localId→backendId. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.13 `GET /api/print-agent/manifest` en `backend/app/api/print-agent/manifest/route.ts`: 200 `{version,file,sha256,size,installUrl}`, 503 si falta el artefacto. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 1.14 Crear `backend/tests/print-bridge-http.mjs` con el flujo completo de puentes/impresoras/import/manifest y engancharlo en `backend/tests/integration-http.sh`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.

## Slice 2 — Backend trabajos (PR 2) — depende: 1

- [x] 2.1 Crear `backend/lib/print-jobs.ts`: `validarPayload` (≤131072 base64, regex), `hashSufijo`/comparación `timingSafeEqual` con guarda de longitud (patrón `backend/app/api/internal/email-outbox/route.ts:5-12`, read-only), `estadoTrasResultado`, `calcularRequeue` (attempts<3), `shapePublico` (sin `payload`/`suffixHash`/`leaseId`), cap 200 abiertos, purga 180 días ≤200 en claim, claim atómico `FOR UPDATE SKIP LOCKED`. Verifica: `npm --prefix backend run test:unit`.
- [x] 2.2 Ampliar `backend/tests/print-bridge.test.ts` (RED): attempts 1/3 y requeue, sufijo de longitud distinta, transiciones inválidas, whitelist. Verifica: `npm --prefix backend run test:unit`.
- [x] 2.3 `POST /api/print/bridge/pair` en `backend/app/api/print/bridge/pair/route.ts`: consume el código (`UPDATE ... RETURNING`), escribe `tokenHash`, 201 con token una vez, 401 genérico, 429 por intentos. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.4 `POST /api/print/bridge/heartbeat` en `backend/app/api/print/bridge/heartbeat/route.ts`: Bearer, `lastSeenAt` throttle 1/20 s, extiende lease 120 s (máx. 5). Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.5 `POST /api/print/bridge/claim` en `backend/app/api/print/bridge/claim/route.ts`: claim atómico por tenant/puente, devuelve job con lease y payload, `{jobs:[]}` sin trabajo. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.6 `POST /api/print/bridge/jobs/[id]/result` en `backend/app/api/print/bridge/jobs/[id]/result/route.ts`: valida `leaseId`, estados `ACEPTADO/INCIERTO/FALLIDO`, `payload=null` al cerrar, respuesta idempotente con estado actual, auditoría. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.7 `GET /api/print/bridge/config` en `backend/app/api/print/bridge/config/route.ts`: token; impresoras activas asignadas (`bridgeId = mío OR NULL`), predeterminada, `lan`, `lanCups`, `version`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.8 `POST /api/print/jobs` en `backend/app/api/print/jobs/route.ts`: sesión; payload base64 con tope 413, replay de `idempotencyKey` 200, espejo `LOCAL` con `sourceJobId` y sin payload, cap 429, kill switch 409, auditoría `PRINT_JOB_ENQUEUED`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.9 `GET /api/print/jobs` (mismo archivo): filtros `state`/`limit≤100`/`before`, shape público y `remoteEnabled`. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.10 `GET /api/print/jobs/[id]` en `backend/app/api/print/jobs/[id]/route.ts`: detalle público, 404. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.11 `POST /api/print/jobs/[id]/confirm` en `backend/app/api/print/jobs/[id]/confirm/route.ts`: `{suffix}`; incorrecto 400 sin exponerlo, no confirmable 409, limpia `suffixHash` al confirmar, auditoría sin valor. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.
- [x] 2.12 Completar `backend/tests/print-bridge-http.mjs`: pair→enqueue→claim→result→confirm malo 400/bueno 200, GET sin `payload`/`suffixHash`, revoke 401, claim ajeno rechazado. Verifica: `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`.

## Slice 3 — Agente (PR 3) — depende: 2

- [x] 3.1 Modificar `print-agent/config.mjs`: `apiUrl` (default `''`), `bridgeToken`, `remotoActivo`, `intervaloPollMs`; con `apiUrl` vacío, comportamiento 1.5.0 intacto. Verifica: `npm --prefix print-agent test`.
- [x] 3.2 Modificar `print-agent/cola.mjs`: `origen`, `leaseId`, `reportado` persistido, `encolarRemoto()` con dedupe por `id`, `pendientesDeReporte()`; payload local borrado tras el intento; archivos `mode 0o600`. Verifica: `npm --prefix print-agent test`.
- [x] 3.3 Crear `print-agent/remoto.mjs`: `crearRemoto({apiUrl, token, cola, enviar, fetchImpl, log, baseMs=2000, maxMs=30000})` con `iniciar/detener/sincronizarConfig/pendientesDeReporte`; poll 2 s, backoff 2→4→8→16→30 s ±20 %, reporta antes de reclamar, nunca bloquea `/print` local. Verifica: `npm --prefix print-agent test`.
- [x] 3.4 Crear `print-agent/pair.mjs`: canjea código por token, escribe `apiUrl`+`bridgeToken` en `config.json`, nunca loguea el token. Verifica: `npm --prefix print-agent test`.
- [x] 3.5 Modificar `print-agent/server.mjs`: arranca `remoto` solo con `apiUrl`+`bridgeToken`; `/health` agrega `remoto:{activo,apiUrl,ultimoContacto,pendientesDeReporte,backoffMs}`; endpoints locales intactos. Verifica: `npm --prefix print-agent test`.
- [x] 3.6 Crear `print-agent/test/remoto.test.mjs` (RED): poll 2 s, claim→print→result una vez, dedupe tras reinicio, outbox y secuencia de backoff, lease extendido, `usb:` legacy; backend falso `node:http` y socket de impresora que cuenta escrituras. Verifica: `npm --prefix print-agent test`.
- [x] 3.7 Subir versión a 1.6.0 en `print-agent/package.json` y `print-agent/server.mjs:9`, manteniéndolas iguales. Verifica: `npm --prefix print-agent test`.

## Slice 4 — App (PR 4) — depende: 2

- [x] 4.1 Crear `src/lib/api/printing.js` (patrón `src/lib/api/presence.js:1-9`, read-only): `puentes`, `crearPuente`, `revocarPuente`, `impresoras`, `guardarImpresora`, `importar`, `encolar`, `trabajos`, `confirmar`. Verifica: `npm test` + `npm run lint`.
- [x] 4.2 Modificar `src/lib/printing/agent.js`: `resolverCamino(store, impresora)` (loopback `127.0.0.1|localhost` + `estadoAgente()`); local primero; encola remoto solo si el local falla antes de aceptar, nunca en `encolado`/`incierto`. Verifica: nuevo `src/lib/printing/ruteo.test.js` con `npm test`.
- [x] 4.3 Modificar `src/lib/printing/agent.js`: store `version:2`, `refrescarDesdeBackend(tenantId)`, `importarConfigUnaVez(tenantId)` (409 = ya importado), TTL 60 s, caché de solo lectura; `guardarImpresoras` deja de ser la vía de escritura de la UI. Verifica: `npm test` + `npm run test:e2e` (config).
- [x] 4.4 Regresión en `src/lib/printing/puentes.test.js`/`puentes.js`: `usb:`→`cups:` y un solo puente predeterminado por empresa. Verifica: `npm test`.
- [x] 4.5 `Impresoras.jsx` `consultar()` (80-99): config y jobs del backend + historial local. Verifica: `npm run lint` + `npm run test:e2e`.
- [x] 4.6 `Impresoras.jsx` `persistir()` (107-111): API primero; quitar el `sync` al agente salvo fallback con remoto apagado. Verifica: `npm run test:e2e`.
- [x] 4.7 `Impresoras.jsx` `confirmarEnPapel()` (158-170): job remoto/espejado → `printingApi.confirmar`; solo-local → `confirmarJob`. Verifica: `npm run test:e2e`.
- [x] 4.8 `Impresoras.jsx` modal de puentes (758-810): listar puentes del backend, generar código de pairing, revocar; eliminar edición manual de URL/token. Verifica: `npm run lint` + `npm run test:e2e`.
- [x] 4.9 `Impresoras.jsx` formulario de impresora (1071-1082): reemplazar dirección de puente en solo lectura por "gestionar puentes", siguiendo `docs/CAMPOS.md` (read-only). Verifica: `npm run lint`.
- [x] 4.10 **Fix del sufijo (explícito)**: en `Impresoras.jsx:264-275` `enviarPrueba()` agregar `sufijo: ticket.sufijo` (`tickets.js:363`) y hacer que el encolado remoto persista el sufijo como `suffixHash` en el servidor; así `print-agent/cola.mjs:160` (read-only) valida de verdad en ambos caminos. Verifica: `npm test`, confirmación malo/bueno en `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` y e2e del slice 5.
- [x] 4.11 Crear `e2e/impresion-remota.spec.js` (config): dos dispositivos ven lo mismo, backend pisa caché vieja, sin backend se muestra la última caché sin escribir. Verifica: `npm run test:e2e`.

## Slice 5 — Distribución + docs (PR 5) — depende: 1 (UX de pairing también: 4)

- [x] 5.1 Crear `scripts/pack-agent.mjs`: tarball con allow-list, sha256, `manifest.json` en `backend/public/print-agent/`, nombre fijo y gate `--check` contra fuentes y versión (`print-agent/package.json` + `server.mjs:9`). Verifica: `node scripts/pack-agent.mjs --check`.
- [x] 5.2 Crear `print-agent/test/instalador.test.mjs` (RED, matriz de amenaza): filename del manifest alterado aborta, checksum corrupto aborta sin instalar, `--code` inválido no escribe token, tarball con rutas absolutas/`..` rechazado, `usb:` legacy aceptado. Verifica: `npm --prefix print-agent test` (falla hasta 5.3).
- [x] 5.3 Crear `print-agent/install.sh` + generar `backend/public/print-agent/install.sh`, `mobos-print-agent-1.6.0.tgz` y `manifest.json`: Node ≥ 20, descarga el `file` del manifest, `shasum -a 256` antes de extraer, extrae en `$HOME/Library/Application Support/MobOS Print`, corre `pair.mjs --code`, plist + `launchctl load`; conserva `--from-repo`. Verifica: `npm --prefix print-agent test` + `node scripts/pack-agent.mjs --check`.
- [x] 5.4 Crear `e2e/helpers/fake-bridge.mjs` y completar `e2e/impresion-remota.spec.js`: ADMIN ve el código, puente falso pareado por API, prueba encolada pasa a `ACEPTADO` con `path=remoto`, sufijo incorrecto falla/correcto pasa, revocar corta el claim. Verifica: `npm run test:e2e`.
- [x] 5.5 Actualizar `print-agent/README.md`, `AGENTS.md` y `README.md` (one-liner, pairing, operación y flag de rollback). Verifica: `npm run lint`.

## Checklist final de entrega (repo)

- [ ] `npm run lint` con 0 errores.
- [ ] `npm run build` exit 0 y `npm --prefix backend run build` exit 0 con `backend/.next/BUILD_ID` creado.
- [ ] `npm --prefix backend run prisma:validate` (o `npx prisma validate --schema backend/prisma/schema.prisma`).
- [ ] `cd backend && npx tsc --noEmit`.
- [ ] `npm test`, `npm --prefix backend run test:unit` y `npm --prefix print-agent test` en verde.
- [ ] `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` en verde.
- [ ] `npm run test:e2e:smoke` durante el trabajo; `npm run test:e2e` completo antes de entregar.
- [ ] `npm run db:check` sin diferencias contra la base real.
- [ ] `rg "<<<<<<<" src backend e2e print-agent` sin resultados.
- [ ] Rebase `git fetch origin && git rebase origin/main`, push de la rama y handover citando issue #35 y commits por slice.
