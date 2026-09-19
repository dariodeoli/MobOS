# Apply Progress: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Slices | 1 — Backend puentes (PR 1); 2 — Backend trabajos (PR 2); 3 — Agente (PR 3); 4 — App (PR 4) |
| Fecha | 2026-09-19 |
| Modo | Standard (TDD off según `openspec/config.yaml`) |
| Estado | 14/14 tareas del slice 1 completas; 12/12 del slice 2; 7/7 del slice 3; 11/11 del slice 4; slice 5 pendiente |

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

### Slice 3 — Agente

| Evidencia | Valor |
|---|---|
| Test foco | `npm --prefix print-agent test` → 27 tests, 27 pass, 0 fail (backend falso `node:http`, impresora socket real vía `transportes.mjs`, dedupe/outbox/backoff/lease/config/pairing) |
| Arnés de runtime | Tests con backend HTTP falso + socket de impresora que cuenta bytes: claim→impresión real→result una sola vez; reinicio con el mismo id no reimprime; backend caído deja el resultado en el outbox y al volver reporta antes de reclamar; latido con `jobId` durante una impresión lenta; arranque de `server.mjs` con `apiUrl`+`bridgeToken` exponiendo `remoto` en `/health` (proceso real por `spawn`). `npm test` raíz → 181 pass, 0 fail |
| Frontera de rollback | `apiUrl:''` (o borrar `bridgeToken`) deja el agente en el comportamiento 1.5.0: el poller ni se arranca. Revertir el slice elimina `remoto.mjs`/`pair.mjs` y sus tests; `cola.mjs` conserva el camino local intacto (`origen:'local'`) |

### Slice 4 — App

| Evidencia | Valor |
|---|---|
| Test foco | `npm test` (raíz) → 188 tests, 188 pass, 0 fail. Nuevos: 6 de `src/lib/printing/ruteo.test.js` (sin agente → remoto; loopback + agente → local; puente LAN → remoto; impresora de otro puente → remoto; espejo del backend sin URL usa el agente local; `localhost`/HTTPS/barra y host parecido) y 1 de `puentes.test.js` (el espejo del backend no se descarta ni inventa dirección; un solo predeterminado) |
| Arnés de runtime | `npx playwright test e2e/impresion-remota.spec.js` → 3 pass, 0 fail (dos dispositivos ven lo mismo, el backend pisa la caché vieja, sin backend se muestra la última caché sin escribir). `npm run test:e2e` → 58 passed, 0 failed (2 flaky ajenos a impresión: checkout POS y solicitudes de admin, verdes en retry). `npm run test:e2e:smoke` → 7 passed. `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → exit 0; línea `print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, tope y manifest OK.` (confirma sufijo malo 400 / bueno 200 del backend que consume la app) |
| Frontera de rollback | Revertir `src/lib/api/printing.js`, `src/lib/printing/ruteo.js`, los cambios de `agent.js`/`Impresoras.jsx`, `e2e/impresion-remota.spec.js` y el `testMatch` de `playwright.config.js`. Backend, migración y agente quedan intactos; con el backend apagado la app vuelve a leer la última caché y el camino local 127.0.0.1 sigue funcionando |

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

## Tareas completadas — Slice 3

- [x] 3.1 `print-agent/config.mjs`: `apiUrl` (default `''`, `MOBOS_PRINT_API_URL`), `bridgeToken` (`MOBOS_PRINT_BRIDGE_TOKEN`), `remotoActivo` derivado y `intervaloPollMs` (default 2000, clamp 250 ms–60 s); `config.json` con `mode 0o600`.
- [x] 3.2 `print-agent/cola.mjs`: `origen` por trabajo, `encolarRemoto()` (dedupe por id contra cola + historial remoto), `resultadoRemoto()` (borra `data` y persiste el resultado), `marcarReportado()` (outbox → historial con `resultado:'remoto'`), `pendientesDeReporte()`, `reconciliarRemotos()` (reclamado tras reinicio = INCIERTO, nunca reimprime); la cola local ignora remotos en `procesar`/`programar`/`reintentarFallidos`/`limpiarFallidos`; `cola.json`/`historial.json` con `mode 0o600`.
- [x] 3.3 `print-agent/remoto.mjs`: `crearRemoto(...)` con `iniciar/detener/sincronizarConfig/pendientesDeReporte/atender/estado`; `calcularBackoff` (2→4→8→16→30 s ±20 %, techo), `canjearCodigo`, `aplicarConfigRemota`; reporta antes de reclamar, reporte inmediato best-effort tras imprimir, latido con `jobId` cada 45 s (extiende lease), timeout HTTP de 15 s, ningún error de red propaga al proceso.
- [x] 3.4 `print-agent/pair.mjs`: CLI `--code/--api-url/--version`, `normalizarCodigo` espejo del backend (I/L→1, O→0), `vincular()` persiste `apiUrl`+`bridgeToken` y jamás imprime el token.
- [x] 3.5 `print-agent/server.mjs`: arranca el poller solo con `apiUrl`+`bridgeToken`; aplica la config del backend (`aplicarConfigRemota` + `guardarConfig`); `/health` agrega `remoto:{activo,apiUrl,ultimoContacto,pendientesDeReporte,backoffMs,ultimoError}`; `/print`, `/jobs`, `/config`, `/confirmar`, `/health` locales intactos.
- [x] 3.6 `print-agent/test/remoto.test.mjs` + ampliación de `cola.test.mjs` y `agente.test.mjs`: backend falso `node:http`, impresora socket real, claim→print→result una vez, dedupe tras reinicio, outbox con payload borrado, secuencia de backoff, lease extendido por latido, `usb:` legacy, copias, config sin navegador, pairing y permisos 0600.
- [x] 3.7 Versión 1.6.0 en `print-agent/package.json` y `print-agent/server.mjs:9` (test de `/health` actualizado).

## Tareas completadas — Slice 4

- [x] 4.1 `src/lib/api/printing.js`: `puentes`, `crearPuente`, `regenerarCodigo`, `revocarPuente`, `impresoras`, `guardarImpresora` (POST si el id es local, PATCH si es del backend), `eliminarImpresora`, `importar`, `encolar`, `trabajos`, `confirmar` (patrón `presence.js`); lecturas de config/cola con `cacheMs: 0`.
- [x] 4.2 `src/lib/printing/ruteo.js` (módulo puro, re-exportado por `agent.js`): `esLoopback`, `resolverCamino(store, impresora, {disponible})`, `urlDePuente`; local solo con agente loopback y puente propio; `imprimirTicketRouter` usa el remoto únicamente si el local falla antes de aceptar (nunca en encolado/incierto).
- [x] 4.3 `agent.js` store v2 (`version:2`, `syncedAt`, `importedAt`, `localBridgeId`, `remoteEnabled`) + mapas `impresoraDesdeBackend`/`impresoraHaciaBackend`/`puenteDesdeBackend`, `refrescarDesdeBackend` (backend manda), `importarConfigUnaVez` (409 = otro dispositivo, no vuelve a intentar; otros errores reintentan), `registrarUltimaPrueba`; `guardarImpresoras` queda como caché interna, no como vía de escritura de la UI.
- [x] 4.4 `puentes.test.js`: el espejo del backend sin URL se conserva, no se descarta ni inventa dirección, y mantiene un solo predeterminado; regresión de `usb:`→`cups:` ya existente.
- [x] 4.5 `Impresoras.jsx` `consultar()`: import único + `refrescarDesdeBackend` + `GET /api/print/jobs` + historial/cola del agente local + sesiones; con el backend caído muestra la última caché.
- [x] 4.6 `persistir()`: diff contra la lista anterior → POST de altas, PATCH de cambios reales (firma de campos) y DELETE de bajas; luego refresca la caché. El `sync` directo al agente queda solo como fallback con `remoteEnabled:false`. `duplicar` abre el formulario (el destino es único por empresa).
- [x] 4.7 `confirmarEnPapel()`: trabajo del backend (remoto o espejado) → `printingApi.confirmar`; solo-local → `confirmarJob` del agente.
- [x] 4.8 Modal de puentes: lista del backend con presencia (`online`/`lastSeenAt`, versión, plataforma), «Código» regenera el pairing (se muestra una vez con vencimiento), «Agregar puente» crea y muestra el código, «Revocar» pide confirmación; se eliminó la edición manual de URL/token y el sondeo local.
- [x] 4.9 Formulario de impresora: el Select de puente usa el espejo del backend y «Gestionar puentes» reemplaza el campo de dirección en solo lectura (sin inputs nuevos).
- [x] 4.10 Sufijo corregido: `imprimirTicketRouter` pasa `ticket.sufijo` al camino local (`imprimirDirecto`) y `encolarRemoto` lo manda como `suffix` (el backend ya lo guarda como `suffixHash`); la confirmación de la prueba ya se valida en ambos caminos.
- [x] 4.11 `e2e/impresion-remota.spec.js` (proyecto `admin`): dos dispositivos ven la misma configuración del backend, el backend pisa la caché vieja y sin backend se muestra la última caché sin escribirla (marca testigo intacta).

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

### Slice 3

| Archivo | Acción |
|---|---|
| `print-agent/remoto.mjs` | Creado (265) |
| `print-agent/pair.mjs` | Creado (55) |
| `print-agent/test/remoto.test.mjs` | Creado (361) |
| `print-agent/cola.mjs` | Modificado (+147/-14) |
| `print-agent/config.mjs` | Modificado (+19/-2) |
| `print-agent/server.mjs` | Modificado (+30/-2) |
| `print-agent/test/agente.test.mjs` | Modificado (+61/-1) |
| `print-agent/test/cola.test.mjs` | Modificado (+91/-13) |
| `print-agent/package.json` | Modificado (versión 1.6.0) |
| `openspec/changes/print-bridge-remoto/tasks.md` | Modificado (3.1–3.7 marcadas) |

Total authored slice 3: ~1037 líneas (681 nuevas + 356 en diff: 325 altas y 31 bajas).

### Slice 4

| Archivo | Acción |
|---|---|
| `src/lib/api/printing.js` | Creado (30) |
| `src/lib/printing/ruteo.js` | Creado (38) |
| `src/lib/printing/ruteo.test.js` | Creado (58) |
| `src/lib/printing/agent.js` | Modificado (+243/-14) |
| `src/lib/printing/puentes.test.js` | Modificado (+15) |
| `src/components/control/Impresoras.jsx` | Modificado (+377/-134) |
| `e2e/impresion-remota.spec.js` | Creado (137) |
| `playwright.config.js` | Modificado (+1/-1) |
| `openspec/changes/print-bridge-remoto/tasks.md` | Modificado (4.1–4.11 marcadas) |

Total authored slice 4: ~770 líneas (255 nuevas + 515 en diffs: 407 altas y 108 bajas). Excede el presupuesto de 400: el mensaje de error honesto, la confirmación por origen y el diff de escritura no se pueden recortar sin romper escenarios; se recomienda **`size:exception`** o partir el PR en 4A (cliente API + router + store v2 + unit) y 4B (UI + e2e de configuración).

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

### Slice 3

| Comando | Resultado |
|---|---|
| `npm --prefix print-agent test` | 27 tests, 27 pass, 0 fail |
| `node --test "print-agent/test/*.test.mjs"` | 27 pass, 0 fail (forma explícita; en Node 25 `node --test print-agent/test` trata el directorio como módulo y falla, es del runner, no del slice) |
| `npm test` (raíz, incluye `print-agent/**/*.test.mjs`) | 181 pass, 0 fail |
| `npm run lint` | 0 errores |
| `node --check` de los 7 archivos modificados/creados | OK |
| `rg "<<<<<<<" print-agent` | sin resultados |

### Slice 4

| Comando | Resultado |
|---|---|
| `npm test` (raíz) | 188 pass, 0 fail (7 nuevos: 6 de ruteo + 1 de puentes) |
| `npm run lint` | 0 errores |
| `npm run build` | exit 0; chunk `Impresoras-*.js` regenerado sin errores |
| `npx playwright test e2e/impresion-remota.spec.js` | 3 passed (configuración remota) |
| `npm run test:e2e:smoke` | 7 passed |
| `npm run test:e2e` (suite completa) | 58 passed, 0 failed; 2 flaky ajenos a impresión (checkout POS y solicitudes de admin) verdes en retry |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | exit 0; `print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, tope y manifest OK.` |
| `npm --prefix backend run build` | exit 0 con `backend/.next/BUILD_ID` creado (requisito del arnés IT) |
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

### Slice 3

1. **Firma de `crearRemoto` ampliada con `version`/`plataforma`/`latidoMs`**: el diseño listaba `apiUrl, token, cola, enviar, fetchImpl, log, baseMs, maxMs`. `version`/`platform` viajan en el body del heartbeat (contrato del slice 2) y `latidoMs` (default 45 s) hace testeable la extensión del lease. Extra: `atender()` y `estado()` expuestos (el segundo lo necesita `/health`).
2. **`enviar` es el transporte del poller, no la cola**: a diferencia del camino local, el poller imprime el claim con `transportes.enviar` inyectado y persiste el resultado vía `cola.resultadoRemoto`; así el `encolarRemoto` deduplica y el payload se borra en el mismo paso. Si se usara la cola local para imprimir remotos, `procesar()` no podría reportar al backend.
3. **Reporte inmediato best-effort tras imprimir**: el diseño solo exigía "reportar antes de reclamar" en cada ciclo; se agrega el envío inmediato del resultado recién producido para no esperar el próximo poll (2 s). Si falla, el outbox lo reintenta en el próximo ciclo, siempre antes de reclamar.
4. **`sincronizarConfig(aplicar)` con callback**: la firma de fábrica del diseño no incluía acceso al archivo de config; el servidor pasa `(datos) => aplicarConfigRemota(config, datos) + guardarConfig`, y `aplicarConfigRemota` queda exportada para tests. Un payload incompleto conserva la config vigente.
5. **Reconciliación al reiniciar = INCIERTO**: el backend no tiene endpoint de "release"; un reclamado sin resultado se reporta INCIERTO (pudo haber salido papel) en vez de "soltarlo". El diseño decía "reporta lo impreso, suelta lo no impreso": sin release, lo no impreso confluye en la misma decisión conservadora.
6. **Copias**: el claim trae `copies`; el poller imprime el payload esa cantidad de veces (≤5) en un solo intento, espejo del loop de `/print` local (`server.mjs:272`). El diseño no detallaba el manejo de copias del lado remoto.
7. **`usb:` legacy**: el poller no normaliza destinos (los pasa tal cual a `transportes.enviar`, que ya acepta `usb:`); la normalización a `cups:` sigue siendo de la app (`puentes.js`).
8. **404 en el reporte descarta el outbox**: si el backend ya no conoce el trabajo (purga a 180 días), se marca reportado localmente para no bloquear la cola; el diseño no cubría ese caso.

### Slice 4

1. **`resolverCamino` vive en `src/lib/printing/ruteo.js` y `agent.js` lo re-exporta**: `agent.js` importa `@/utils/printHtml` y `@/lib/api/printing` (alias de Vite) y no se puede cargar con `node --test`; el módulo puro sigue el precedente de `puentes.js` («sin dependencias de la app para poder testearlo»). El contrato del diseño (`resolverCamino(store, impresora)`) se conserva desde `agent.js`.
2. **`imprimirDirecto` marca `incierto` cuando no hay respuesta** (timeout/red): sin respuesta no se sabe si el agente aceptó y encolar remoto duplicaría. Es la condición que el router usa para no caer al remoto.
3. **Escritura por diff (`difundirCambios`)**: como los handlers mueven la lista completa, `persistir` compara firmas de campos (sin `ultimaPrueba`) y emite POST/PATCH/DELETE; después refresca. Evita reescribir todo y conserva el comportamiento de los formularios existentes. Las bajas van al final para no chocar con altas/ediciones.
4. **`duplicar` abre el formulario en vez de crear la copia**: `[tenantId,destination]` es único en el backend y la copia traía el mismo destino (409 garantizado). Ahora se revisa antes de guardar.
5. **No se crean espejos `LOCAL` desde la app en este slice**: la ruta existe (slice 2) y la UI sabe confirmar un job espejado contra la API (`fila.remoto`), pero el espejado best-effort de cada impresión local queda fuera de las tareas 4.x. Los flujos del POS/etiquetas siguen usando `imprimirTicketOFallback` local (sin encolado remoto); el ruteo remoto se cableó en la prueba de impresoras, que es el flujo del escenario 4/5.
6. **El espejo de puentes no trae URL ni token**: el backend no los expone (el agente abre la conexión saliente). La tarjeta y el modal muestran presencia/versión del backend; la dirección local 127.0.0.1 sigue viniendo de `agentUrl` y el sondeo `/health` local quedó sin uso en la UI.
7. **`lastTest` se persiste best-effort** con `registrarUltimaPrueba` (PATCH parcial) para que la última prueba se vea desde cualquier dispositivo; si el PATCH falla, la prueba ya ocurrió y no se rompe el flujo. La UI solo actualiza el estado de pantalla: no escribe la caché (el próximo refresco trae el dato del backend).

## Problemas encontrados

- Ninguno que bloquee. El `ERROR: duplicate key` en el log del arnés es el 409 esperado de destino repetido (Postgres lo registra; la ruta responde 409).
- Slice 2: el tope de intentos del pairing se prueba varias veces con el mismo código; el rate-limit por IP (10/min) no se dispara en el arnés porque no se envía `x-forwarded-for`, por lo que los 5 intentos del código sí alcanzan el 429 (comportamiento real en producción detrás del Hub).
- Slice 3: `node --test print-agent/test` (forma de directorio) falla en Node 25 porque el runner intenta cargar el directorio como módulo; `npm --prefix print-agent test` (script del paquete) y `node --test "print-agent/test/*.test.mjs"` corren los 27 tests en verde. No es un problema del código.
- Slice 3: el registro en `config.json` de `remotoActivo` es informativo; al cargar se recalcula desde `apiUrl`+`bridgeToken` para que un token borrado apague el poller.
- Slice 4: `npm run test:e2e` completo dio 58 passed con 2 flaky ajenos a impresión (checkout POS y solicitudes de admin) que pasaron en el retry; la nueva spec de impresión pasó limpia en la primera corrida.
- Slice 4: el arnés IT exige un build Next previo (`backend/.next/BUILD_ID`); se corrió `npm --prefix backend run build` para habilitarlo. No es un defecto del slice.

## Workload / PR boundary

- Estrategia: `auto-chain` + `stacked-to-main` (tasks.md). El slice 1 es el PR 1 con base `main`; el slice 2 es el PR 2 apilado sobre el 1.
- Presupuesto: el forecast estimó ~450 líneas para el slice 2 y el resultado real es ~1046 authored (725 nuevas + 321 de tests). El diff no se puede recortar sin borrar tests/validación; se recomienda **`size:exception`** para este PR o partirlo en 2A (lib + unit + rutas de puente) / 2B (rutas de sesión + confirmación + IT).
- Frontera slice 2: arranca en el backend de puentes/impresoras del slice 1 y termina con la cola remota completa (pair, heartbeat, claim, result, config, encolado/listado/detalle/confirmación, caps, purga y auditoría) sin tocar el agente ni la app.
- Slice 3: PR 3 apilado sobre el 2. Estimado ~400, real ~1037 authored (265 de `remoto.mjs` + 55 de `pair.mjs` + 361 de tests nuevos + 356 de diff en config/cola/server/tests). El núcleo de producción son ~509 líneas; el resto es la batería que exige el escenario (dedupe, outbox, latido, pairing, permisos). Se recomienda **`size:exception`** o partir en 3A (`remoto.mjs` + `pair.mjs` + config) y 3B (cola outbox + server + tests de integración).
- Frontera slice 3: arranca en el backend de trabajos del slice 2 y termina con el agente vinculable, poller con outbox y backoff, y `npm --prefix print-agent test` en verde, sin tocar la app ni la distribución.
- Slice 4: PR 4 apilado sobre el 2 (paralelo al 3). Estimado ~450, real ~770 authored (255 nuevas + 515 en diffs). Núcleo de producción ~610 y ~160 de tests/e2e. Se recomienda **`size:exception`** o partir en 4A (cliente API + router + store v2 + unit de ruteo) y 4B (UI + e2e de configuración).
- Frontera slice 4: arranca en el backend de trabajos del slice 2 y termina con la app leyendo/escribiendo la config por API, el router local/remoto con fallback seguro, la caché de solo lectura y los e2e de configuración en verde, sin tocar backend ni agente.
- Riesgo de slice 5: el escenario «local sin round-trip remoto» y «envío remoto sin diálogo automático» con el puente falso quedan como e2e del slice 5; el espejo `LOCAL` y el encolado remoto de los tickets del POS no están cableados todavía (ver desviación 5).

## Pendiente

- Slice 5 (pack/install/checksum, e2e con puente falso, docs).
