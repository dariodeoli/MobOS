# Design: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Fecha | 2026-09-19 |
| Baseline | `origin/main` @ `d736d96` (v1.0.102) |
| Issue | #35 |
| Insumos | `proposal.md`, `exploration.md`, `pending-decisions.md` (6 decisiones cerradas) |
| Nota | `openspec/specs/` vacío: este diseño se verifica contra el código y la propuesta; si `sdd-spec` corre en paralelo, sus requisitos deben citar las mismas rutas. |

## Enfoque técnico

El backend pasa a ser la autoridad de configuración de impresión por empresa y el
intermediario de la cola remota. El agente de la Mac abre una conexión saliente
(polling) al backend, reclama trabajos con lease, imprime por los transportes que ya
existen (`transportes.mjs`) y reporta el resultado. La app encola por HTTPS con la
sesión normal; en la Mac del puente el camino local `127.0.0.1` sigue ganando. La
caché de `localStorage` baja a espejo de solo lectura con import único. El sufijo de
"confirmar en papel" se genera en el cliente (decisión 3) y se valida contra el
servidor con hash; el payload ESC/POS se borra al reportar (decisión 4). Sin
dependencias npm nuevas: `fetch` global de Node 20.

## Decisiones de arquitectura

### D1 — Modelo de datos

**Elección**: tres modelos nuevos en `backend/prisma/schema.prisma` (no existe ningún
modelo de impresión: verificado por búsqueda), tablas `PrintBridge`, `PrintPrinter`,
`PrintJob`, con enums `PrintJobState` y `PrintJobPath`. Migración aditiva, idempotente
y re-ejecutable `backend/prisma/migrations/20261016000000_print_bridge/migration.sql`
(estilo `20261012000000_presence/migration.sql:3-40`: `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `DO $$ ... pg_constraint`).

**Alternativas rechazadas**: (a) guardar la config en `Tenant.settings` JSON — sin
índices ni FKs, y `jobs` crecería sin control; (b) una tabla única `PrintJob` con
columnas de impresora embebidas — impide que el teléfono liste impresoras sin abrir
un trabajo.

**Rationale**: la propuesta exige tenant + idempotencia + lease consultable; un
modelo relacional con índices es la única forma barata de garantizar claim atómico y
borrado selectivo del payload. La FK a `Tenant` con `onDelete: Cascade` sigue el
patrón del repo (`schema.prisma:1311`).

Campos y claves:

| Modelo | Campos | Índices / FKs |
|---|---|---|
| `PrintBridge` | `id` (cuid), `tenantId`, `name`, `tokenHash` (único), `pairingCodeHash?`, `pairingExpiresAt?`, `pairingUsedAt?`, `pairingAttempts` (default 0), `createdByUserId?`, `version?`, `platform?`, `lastSeenAt?`, `revokedAt?`, `createdAt`, `updatedAt` | FK `tenantId → Tenant` (Cascade); índices `[tenantId, revokedAt]`, `[pairingCodeHash]` |
| `PrintPrinter` | `id`, `tenantId`, `bridgeId?`, `name`, `brand`, `model`, `location`, `connection` (`lan`\|`cups`), `destination`, `width`, `copies`, `cut`, `density`, `characters`, `isDefault`, `isActive`, `lastTest Json?`, `createdAt`, `updatedAt` | FK `tenantId`, FK `bridgeId → PrintBridge` (SetNull); único `[tenantId, destination]`; índice `[tenantId, isActive]` |
| `PrintJob` | `id`, `tenantId`, `bridgeId?`, `printerId?`, `destination`, `kind`, `state`, `path`, `payload String?`, `payloadBytes`, `validation`, `suffixHash` (default `''`), `reference`, `requestedByUserId?`, `requestedByName`, `deviceName`, `bridgeName`, `tokenHint`, `mode`, `width`, `copies`, `attempts`, `leaseId?`, `leaseExpiresAt?`, `claimedAt?`, `acceptedAt?`, `confirmedAt?`, `error`, `idempotencyKey?`, `sourceJobId?`, `createdAt`, `updatedAt` | FKs `tenantId` (Cascade), `bridgeId`/`printerId` (SetNull); únicos `[tenantId, idempotencyKey]` y `[tenantId, sourceJobId]` (nullables: Postgres admite múltiples NULL); índices `[tenantId, state, createdAt]`, `[bridgeId, state]`, `[tenantId, createdAt DESC]` |

**Sufijo**: nunca se guarda en claro. `suffixHash = hashToken(sufijo)`
(`backend/lib/auth.ts:200-202`) y la comparación es
`timingSafeEqual(Buffer.from(hashToken(intento)), Buffer.from(job.suffixHash))` con
verificación previa de longitud, calcada de
`backend/app/api/internal/email-outbox/route.ts:5-12`. Se borra (`suffixHash=''`) al
confirmar.

**Token del puente**: 32 bytes aleatorios hex generados con el patrón `newToken()`
(`auth.ts:204-206`); al servidor solo va `tokenHash`. Se devuelve una única vez en el
pairing.

**Qué se borra al imprimir**: al reportar un resultado terminal
(`ACEPTADO`/`INCIERTO`/`FALLIDO`) el servidor hace `payload = null` en la misma
transacción; `suffixHash` se limpia al confirmar. Los trabajos `LOCAL` espejados
nunca guardan payload.

### D2 — API backend

Sesión: `requireSession` (cookie/Bearer, `auth.ts:364-384`). Puente: Bearer del token,
helper `autenticarPuente(request)` en `backend/lib/print-bridge.ts` (lookup por
`tokenHash` + `timingSafeEqual`, rechaza `revokedAt`). ADMIN para puentes,
impresoras y el kill switch; cualquier sesión activa para encolar/listar/confirmar.

| Método y ruta | Auth | Body | Éxito | Errores |
|---|---|---|---|---|
| `GET /api/print/bridges` | sesión | — | 200 `{ bridges:[{id,name,version,platform,lastSeenAt,revokedAt,createdAt}] }` | 401 |
| `POST /api/print/bridges` | ADMIN | `{ name }` | 201 `{ bridge:{id,name}, pairingCode, expiresAt }` (código solo acá) | 400, 401, 403 |
| `POST /api/print/bridges/{id}/pairing` | ADMIN | — | 200 igual al anterior, regenera código | 404, 409 revocado |
| `DELETE /api/print/bridges/{id}` | ADMIN | — | 200 `{ ok:true }` (soft revoke) | 404 |
| `POST /api/print/bridge/pair` | ninguna (código) | `{ code, name?, version?, platform? }` | 201 `{ token, bridgeId }` | 400, 401 genérico, 429 |
| `POST /api/print/bridge/heartbeat` | token | `{ version?, platform?, jobId? }` | 200 `{ ok, serverTime, leaseExpiresAt? }` | 401 |
| `POST /api/print/bridge/claim` | token | `{ capacity? }` (1) | 200 `{ jobs:[job+leaseId+leaseExpiresAt+payload] }`; `{jobs:[]}` si no hay | 401 |
| `POST /api/print/bridge/jobs/{id}/result` | token | `{ leaseId, state:'ACEPTADO'\|'INCIERTO'\|'FALLIDO', error?, transport? }` | 200 `{ ok, state }` | 401, 404, 409 lease inválido → 200 con estado actual (reconciliación) |
| `GET /api/print/bridge/config` | token | — | 200 `{ printers, lan, defaultPrinterId, lanCups, version }` | 401 |
| `POST /api/print/jobs` | sesión | job remoto con `payload` base64 o espejo `LOCAL` (ver abajo) | 201 `{ job: público }` (200 si replay idempotente) | 400, 401, 413, 429 |
| `GET /api/print/jobs?state=&limit=&before=` | sesión | — | 200 `{ jobs:[público], remoteEnabled }` (limit ≤ 100) | 401 |
| `GET /api/print/jobs/{id}` | sesión | — | 200 `{ job: público }` | 401, 404 |
| `POST /api/print/jobs/{id}/confirm` | sesión | `{ suffix }` | 200 `{ ok, state:'CONFIRMADO' }` | 400 sufijo incorrecto, 409 no confirmable, 404 |
| `GET /api/print/printers` | sesión | — | 200 `{ printers, bridges, remoteEnabled }` | 401 |
| `POST /api/print/printers` | ADMIN | campos de impresora | 201 impresora | 400, 403, 409 `[tenantId,destination]` |
| `PATCH\|DELETE /api/print/printers/{id}` | ADMIN | campos / — | 200 impresora / `{ok}` | 403, 404 |
| `POST /api/print/printers/import` | ADMIN | `{ printers, bridges }` | 200 `{ printers, bridges, map }` | 409 si ya hay impresoras (`force` para reintentar) |
| `GET /api/print-agent/manifest` | ninguna | — | 200 `{ version, file, sha256, size, installUrl }` | 503 artefacto ausente |

**Shape público del job** (lista blanca explícita): `id, state, path, kind, printerId,
destination, validation, reference, requestedByName, deviceName, bridgeName, tokenHint,
mode, width, copies, attempts, error, payloadBytes, createdAt, acceptedAt, confirmedAt`.
NUNCA `payload`, `suffixHash`, `leaseId`, `tokenHash` (el sufijo local se expone hoy en
`cola.mjs:230`; el camino remoto no debe repetirlo).

**Enqueue** (`backend/lib/print-jobs.ts` valida): `payload` base64 ≤ 128 KB
(`PAYLOAD_MAX_B64 = 131072`, ~96 KB crudos) y `^[A-Za-z0-9+/=]+$` (espejo de
`server.mjs:268`); con `idempotencyKey` se devuelve el existente; `LOCAL` exige
`sourceJobId`, `state ∈ {ACEPTADO,INCIERTO,FALLIDO}` y rechaza `payload`; cap de
abiertos por empresa = 200 (`PENDIENTE`+`RECLAMADO`) → 429. Errores con `error(msg,status)`
(`lib/http.ts`) y mensajes en español.

**Claim atómico** (raw SQL, patrón `$queryRaw` de `auth.ts:232-235`):

```sql
UPDATE "PrintJob" SET state='RECLAMADO', "leaseId"=$1, "leaseExpiresAt"=$2,
  "claimedAt"=now(), attempts=attempts+1
WHERE id = (SELECT id FROM "PrintJob"
  WHERE "tenantId"=$3 AND state='PENDIENTE' AND ("bridgeId" IS NULL OR "bridgeId"=$4)
  ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```

**Pairing**: código de 10 caracteres Crockford (`ABCDE-FGHIJ`), TTL 15 min, un solo
uso, 5 intentos y se invalida; respuesta 401 genérica (sin oráculo). Antes de
responder, el par consume el código con un `UPDATE ... WHERE pairingUsedAt IS NULL AND
pairingExpiresAt > now() ... RETURNING` y escribe `tokenHash`.

**Sincronización de configuración con el agente**: `GET /api/print/bridge/config`
devuelve solo las impresoras activas asignadas al puente (`bridgeId = mío OR NULL`),
la predeterminada, `lan` (destinos LAN permitidos) y `lanCups`. Reemplaza el sync del
navegador (`agent.js:237-248`, `Impresoras.jsx:758-810`) y permite que la Mac aprenda
su allow-list sin navegador abierto.

### D3 — Ciclo de vida del trabajo

Máquina de estados (sin `CANCELADO`: no hay requisito ni UI de cancelación; YAGNI):

```
PENDIENTE ──claim──▶ RECLAMADO ──result ACEPTADO──▶ ACEPTADO ──confirm──▶ CONFIRMADO
    ▲                     ├──result INCIERTO──────▶ INCIERTO  (solo manual)
    │                     ├──result FALLIDO───────▶ FALLIDO   (solo manual)
    └── lease vencido: attempts<3 ── PENDIENTE ; attempts>=3 ── FALLIDO
```

- **Lease**: 120 s desde el claim. `heartbeat` con `jobId` lo extiende 120 s hasta 5
  veces (máx. ~10 min), para impresiones lentas.
- **Requeue sin duplicar**: al vencer, si `attempts < 3` vuelve a `PENDIENTE`
  (mismo `id`); si no, `FALLIDO` con error honesto. El servidor solo cambia de estado
  por un `result` reportado; un lease vencido nunca invalida un `ACEPTADO`.
- **Idempotencia por trabajo**: (a) el agente persiste el claim antes de imprimir y
  deduplica por `jobId` (`cola.mjs` ya tiene ids; si el trabajo ya está en
  trabajos/historial, reporta el estado existente y no reimprime); (b) el `result` es
  idempotente con `leaseId` y devuelve el estado actual si ya no aplica, para que el
  agente vacíe su outbox; (c) `INCIERTO` no se auto-reintenta jamás
  (`cola.mjs:6-14,78-93`); el "reintentar" del operador re-encola un trabajo nuevo
  desde la app (el payload ya se borró), con `idempotencyKey = jobId+'-retry-N'`.
- **Puente caído con trabajo reclamado**: al reiniciar, el agente reconcilia su cola
  local contra el servidor (reporta lo impreso, suelta lo no impreso); si no vuelve,
  el lease vence y el job se reencola/pasa a `FALLIDO`.
- **Backend caído**: el poller retrocede con backoff 2→4→8→16→30 s (±20 % jitter,
  techo 30 s, decisión 5) y la cola local conserva los resultados no reportados
  (`reporte-pendiente`); al recuperar, reporta antes de reclamar. La Mac sigue
  imprimiendo local: el poller nunca bloquea `/print` local.

### D4 — Agente

**Elección**: módulo nuevo `print-agent/remoto.mjs` con
`crearRemoto({ apiUrl, token, cola, enviar, fetchImpl, log, baseMs=2000, maxMs=30000 })`
que expone `iniciar()`, `detener()`, `sincronizarConfig()` y `pendientesDeReporte()`.
Reutiliza `cola.mjs` (persistencia y semántica) y `transportes.mjs` (envío) sin
tocarlos; `server.mjs` solo lo arranca cuando `config.apiUrl && config.bridgeToken`,
deja intactos los endpoints locales (`server.mjs:158-307`) y suma al `/health` un
bloque `remoto: { activo, apiUrl, ultimoContacto, pendientesDeReporte, backoffMs }`.
`config.mjs:16-32` gana `apiUrl` (default `''`), `bridgeToken`, `remotoActivo` y
`intervaloPollMs`; con `apiUrl` vacío el comportamiento es exactamente el actual
(compatibilidad con el server de hoy).

`cola.mjs` gana: `origen` (`local`/`remoto`), `leaseId`, `reportado` persistido,
dedupe por `id` en `encolarRemoto()` y `pendientesDeReporte()`; el payload local se
borra tras el intento de impresión (solo metadatos para reportar). Archivos de estado
se escriben con `mode: 0o600`.

**Destinos**: `lan:host:puerto` y `cups:<cola>`; `usb:` legacy se acepta
(`transportes.mjs:137`, `server.mjs:141`) y la normalización `usb:`→`cups:` sigue en
`puentes.js:30-34`. **Local primero** en la Mac: el `/print` local existente no
cambia y el poller remoto solo actúa sobre trabajos encolados por el servidor.

**Pairing**: `print-agent/pair.mjs` (nuevo) intercambia el código por el token,
escribe `apiUrl`+`bridgeToken` en `config.json` y no imprime el token en el log.

### D5 — App

**Elección**: cliente fino `src/lib/api/printing.js` (patrón
`src/lib/api/presence.js:1-9`) con `puentes`, `crearPuente`, `revocarPuente`,
`impresoras`, `guardarImpresora`, `importar`, `encolar`, `trabajos`, `confirmar`.

**Resolución local vs remoto** (nueva `resolverCamino(store, impresora)` en
`agent.js`): es local si el puente de la impresora apunta a loopback
(`/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/`, hoy constante en `agent.js:16`) y
`estadoAgente()` responde (`agent.js:189-206`); en cualquier otro dispositivo no hay
agente local y todo va remoto. Si el intento local falla **antes** de aceptar, se
encole remoto; si quedó `encolado`/`incierto`, NO se encola remoto (riesgo de
duplicado, misma regla que `imprimirTicketOFallback`, `agent.js:297-308`).
`Impresoras.jsx:258-298` pasa a usar este router y muestra el camino usado.

**Caché**: la clave por tenant (`agent.js:34`) sube a `version: 2`:
`{ version:2, syncedAt, importedAt, localBridgeId, agentUrl, agentToken, impresoras:[...campos backend + origen:'backend'], bridges:[espejo de solo lectura] }`.
`cargarImpresoras` sigue leyendo; `refrescarDesdeBackend(tenantId)` sobrescribe;
`guardarImpresoras` ya no es la vía de escritura de la UI: se escribe por API y luego
se refresca (backend manda; caché de solo lectura, propuesta §1).
**Import único** `importarConfigUnaVez(tenantId)`: si `importedAt == null` y hay
impresoras locales, `POST /api/print/printers/import` (el backend devuelve el mapa
localId→backendId); si responde 409, otro dispositivo ya importó: se marca y se
refresca. **Invalidación**: cada mutación exitosa llama `refrescarDesdeBackend`; el
cliente API ya invalida GET en mutaciones (`client.js:111-114`) y la clave cambia con
el tenant. TTL de la caché: 60 s, el mismo orden que el refresco de la página
(`Impresoras.jsx:101-105`).

**Cambios puntuales en `Impresoras.jsx`**: `consultar()` 80-99 (config y jobs del
backend + historial del agente local); `persistir()` 107-111 (API primero; quitar el
`sync` al agente, que ahora lo hace el poller; `sincronizarAgente` queda solo como
fallback si remoto está apagado); `confirmarEnPapel()` 158-170 (job remoto/espejado →
`printingApi.confirmar`; job solo-local → `confirmarJob` del agente, `agent.js:232`);
modal de puentes 758-810 (listar puentes del backend, generar código de pairing,
revocar; se elimina la edición manual de URL/token remotos); formulario de impresora
1071-1082 (la dirección del puente en solo lectura se reemplaza por "gestionar
puentes"); `enviarPrueba()` 258-298 debe enviar además `sufijo: ticket.sufijo`
(hoy `Impresoras.jsx:264-275` no lo manda y `cola.mjs:160` nunca valida el sufijo en
la práctica: **corrección obligatoria en el camino remoto**). `tickets.js:198-201,
233-236` no se toca (decisión 3).

### D6 — Seguridad y privacidad

| Tema | Decisión |
|---|---|
| Tamaño máximo del ticket | 128 KB base64 por job (413 al exceder); cap de 200 jobs abiertos por empresa (429) |
| TTL del código de vinculación | 15 min, un solo uso, 5 intentos y se invalida; rate-limit por IP 10/min (bucket en memoria, instancia única) |
| Token del puente | 256 bits, hash SHA-256 en reposo, `timingSafeEqual` tras lookup, TLS obligatorio, revocable |
| Retención | payload borrado al reportar resultado terminal; `suffixHash` borrado al confirmar; metadatos 180 días con purga oportunista en `claim` (lote ≤ 200) |
| `auditLog` (acción, entidad, metadata) | `PRINT_BRIDGE_CREATED` (name), `PRINT_BRIDGE_PAIRED` (bridgeId), `PRINT_BRIDGE_PAIR_FAILED` (ip, intentos), `PRINT_BRIDGE_REVOKED`, `PRINT_JOB_ENQUEUED` (jobId, path, kind, printerId, bytes), `PRINT_JOB_ACCEPTED`/`INCIERTO`/`FAILED` (jobId, attempts, transport), `PRINT_JOB_REQUEUED`, `PRINT_JOB_CONFIRMED`, `PRINT_JOB_CONFIRM_FAILED` (jobId, intentos — nunca el valor) |
| NO se loguea | bytes ESC/POS, sufijo (ni hash), token del puente, código de pairing, cuerpos completos; `error` del puente truncado a 200 caracteres |
| Reclamo de claim | no se audita cada poll (2 s): solo `lastSeenAt` throttled a 1 escritura/20 s |

### D7 — Distribución

**Elección**: artefacto versionado dentro de `backend/public/print-agent/` y servido
estático por Next (`GET /print-agent/install.sh`,
`GET /print-agent/mobos-print-agent-<version>.tgz`, `GET /print-agent/manifest.json`),
más `GET /api/print-agent/manifest` para que la UI muestre versión/checksum.
**Rationale**: el contexto de build Docker es `backend/` (`backend/Dockerfile:1-27`) y
ya copia `public/` al runner; un `agent-dist/` fuera de `public/` exigiría cambiar el
contexto de Coolify. El tarball (~20-60 KB) se versiona con el release y
`scripts/pack-agent.mjs --check` falla si no coincide con las fuentes (anti-drift).

**Evitar código arbitrario**: no hay rutas construidas con input del usuario (sirve el
estático de Next), el `manifest.json` se genera en el pack con nombre fijo, el
instalador descarga exactamente el `file` del manifest y verifica `shasum -a 256`
antes de extraer; el tarball contiene solo la allow-list del agente. `install.sh`
exige Node ≥ 20 (`install-macos.sh:19-22`), extrae en
`$HOME/Library/Application Support/MobOS Print`, corre `pair.mjs --code`, escribe el
plist (`install-macos.sh:57-74`) y `launchctl load` (76-77). One-liner:

```
curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ
```

Versión única: `print-agent/package.json` (`1.6.0`); el packer verifica que
`server.mjs:9` coincida. El camino por repo sigue para desarrollo
(`install-macos.sh --from-repo`).

### D8 — Rollback

Bandera de empresa `Tenant.settings.printRemote` (`schema.prisma:40`, JSON: sin
migración). En `false`: `POST /api/print/jobs` y `claim`/`config` responden 409/cfg
vacía; la app ve `remoteEnabled:false` en `GET /api/print/printers` y vuelve al
camino local + diálogo manual (`imprimirConDialogo`, `agent.js:312-315`); el poller
del agente no recibe trabajos. Revocar tokens corta el polling. La migración es
aditiva y no borra datos.

## Flujo de datos

```
Remoto:  SPA ──cookie HTTPS──▶ POST /api/print/jobs ──▶ PrintJob(PENDIENTE,payload)
                                                                  ▲
         agente ──Bearer, poll 2 s──▶ claim ──▶ imprime ──▶ result ─┘ (payload=null)
            │                                   │
            └──config sync◀── GET /bridge/config  └── transportes.mjs ──▶ térmica
Local:   SPA (Mac) ──x-mobos-print-token──▶ 127.0.0.1:17890 /print ──▶ cola local
            └──espejo best-effort, sin payload──▶ POST /api/print/jobs (path=LOCAL)
```

## Cambios por archivo

| Archivo | Acción | Qué hace |
|---|---|---|
| `backend/prisma/schema.prisma` + `migrations/20261016000000_print_bridge/migration.sql` | Modificar / Crear | D1 |
| `backend/lib/print-bridge.ts`, `backend/lib/print-jobs.ts` | Crear | auth de puente, pairing, estados puros, caps |
| `backend/app/api/print/**` (15 archivos de ruta del cuadro D2) | Crear | API de sesión y de puente |
| `backend/app/api/print-agent/manifest/route.ts` | Crear | manifest público |
| `backend/public/print-agent/` | Generar | tarball + install.sh + manifest |
| `scripts/pack-agent.mjs`, `package.json` | Crear / Modificar | pack + `--check` |
| `backend/tests/print-bridge.test.ts`, `print-bridge-http.mjs`, `run-unit.cjs` | Crear / Modificar | unit + integración |
| `print-agent/remoto.mjs`, `pair.mjs`, `install.sh` | Crear | poller, pairing, instalador servible |
| `print-agent/config.mjs`, `cola.mjs`, `server.mjs`, `package.json` | Modificar | remoto + dedupe + outbox + versión |
| `print-agent/test/remoto.test.mjs`, `test/instalador.test.mjs` | Crear | unit del agente |
| `src/lib/api/printing.js` | Crear | cliente API |
| `src/lib/printing/agent.js`, `puentes.js` | Modificar | router local/remoto y helpers |
| `src/lib/printing/ruteo.test.js`, `puentes.test.js` | Crear / Modificar | unit raíz |
| `src/components/control/Impresoras.jsx` | Modificar | D5 (líneas citadas) |
| `e2e/impresion-remota.spec.js`, `e2e/helpers/fake-bridge.mjs` | Crear | e2e con puente falso |
| `print-agent/README.md`, `AGENTS.md`, `README.md` | Modificar | instalación y operación |

## Threat Matrix

| Boundary | Aplicabilidad | Respuesta de diseño | Tests RED |
|---|---|---|---|
| Documentation-like paths | N/A: no hay clasificación de rutas documentales | — | — |
| Git repository selection | N/A: el cambio no toca selección de repo | — | — |
| Commit state / Push state / PR commands | N/A: no hay automatización VCS/PR | — | — |
| Distribución de ejecutable y shell (`install.sh`, tarball, pairing) | **Aplicable** | nombre del artefacto fijo desde manifest, checksum SHA-256 antes de extraer, allow-list de archivos, token solo por pairing TLS, `--code` nunca logueado | Manifest con filename alterado → el instalador aborta; checksum corrupto → aborta sin instalar; `--code` inválido → sin token escrito; tarball con rutas absolutas/`..` → rechazado por allow-list; `usb:` legacy aceptado (regresión `puentes.js:30-34`) |

## Estrategia de tests

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Backend unit (`npm --prefix backend run test:unit`, `run-unit.cjs:7-15`) | `validarPayload`, `hashSufijo`/comparación, `calcularRequeue` (vencido con attempts 1/3), `estadoTrasResultado`, `normalizarCodigoVinculacion`, transiciones inválidas | `backend/tests/print-bridge.test.ts` (estilo `presence.test.ts`), registrado en `run-unit.cjs` |
| Backend integración (`MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh`) | create bridge → pair → enqueue → claim con token → result → confirm sufijo malo (400) y bueno (200) → GET sin `payload`/`suffixHash` → revoke (401) → claim ajeno (401/404) | `backend/tests/print-bridge-http.mjs` |
| Agente unit (`npm --prefix print-agent test`, `node --test`) | poll 2 s; claim→print→result una sola vez; dedupe por `jobId` tras reinicio; outbox cuando el backend cae y backoff 2/4/8/16/30; lease extendido; `usb:` legacy | `print-agent/test/remoto.test.mjs` con backend falso en `node:http` y socket de impresora falso que cuenta escrituras; `instalador.test.mjs` | 
| Raíz unit (`npm test`) | `resolverCamino` (loopback+agente vs otro dispositivo), fallback remoto solo si el local no aceptó, normalización de destinos | `src/lib/printing/ruteo.test.js`, `puentes.test.js` |
| E2E (`npm run test:e2e`) | ADMIN crea puente y ve el código; el **puente falso** (`e2e/helpers/fake-bridge.mjs`: poll + claim + "imprime" + result) pareado por API; la app encola una prueba y la fila pasa a `ACEPTADO` con `path=remoto`; confirmación con sufijo incorrecto falla y con el correcto pasa; revocar corta el claim | `e2e/impresion-remota.spec.js` (el smoke de ~20 s no lo incluye; la suite completa es el gate) |

Por slice: S1 unit+integración de puentes/impresoras; S2 unit+integración de jobs;
S3 unit del agente; S4 unit raíz + e2e de configuración; S5 e2e del puente falso +
`pack-agent --check`.

## Slices encadenados (~400 líneas cada uno)

| # | Slice | Contenido exacto | Depende |
|---|---|---|---|
| 1 | Backend puentes (~420) | modelos + migración idempotente; `lib/print-bridge.ts`; rutas `bridges` (list/create/pairing/revoke), `printers` (CRUD/import), `print-agent/manifest`; `print-bridge.test.ts` | — |
| 2 | Backend trabajos (~450) | `lib/print-jobs.ts`; `POST/GET /jobs`, `GET /jobs/{id}`, `confirm`; `bridge/pair|heartbeat|claim|config`, `bridge/jobs/{id}/result`; auditoría, caps, purga; `print-bridge-http.mjs` | 1 |
| 3 | Agente (~400) | `remoto.mjs`, `pair.mjs`, config remota, `cola.mjs` (dedupe/outbox), `server.mjs` (arranque + `/health`), bump 1.6.0, `remoto.test.mjs` | 2 |
| 4 | App (~450) | `printing.js`; router local/remoto en `agent.js`; store v2 + import único + invalidación; `Impresoras.jsx` (líneas D5); `ruteo.test.js`; e2e de configuración | 2 |
| 5 | Distribución + docs (~300) | `pack-agent.mjs` + artefactos en `backend/public/print-agent/`; `install.sh`; UX de pairing; e2e con puente falso; README/AGENTS | 1 (4 para la UX de pairing) |

Total ≈ 2 020 líneas. Los slices 3 y 4 son paralelizables tras el 2; el 5 requiere 1
y la UX de pairing del 4.

## Open Questions

- [ ] Confirmar 180 días de retención de metadatos (la propuesta solo fija "payload borrado al imprimir").
- [ ] Rate-limit por IP en memoria: aceptable con instancia única; revisar si Coolify escala horizontalmente.
- [ ] `Tenant.settings.printRemote` como kill switch: ¿lo expone la UI o queda solo operativo?
