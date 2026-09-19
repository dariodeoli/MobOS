```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7f07c901b34d3955651b3ee857603227ea344ea8a11e85e81bcbf6d378ef4c13
verdict: pass
blockers: 0
critical_findings: 0
requirements: 8/14
scenarios: 19/25
test_command: npm test && npm --prefix backend run test:unit && npm --prefix print-agent test && MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh && npm run test:e2e
test_exit_code: 0
test_output_hash: sha256:65b65e0f8bbd4cbe8509e7e516e02c871c8020f548b435b2871d2d3fe8871412
build_command: npm run build && npm --prefix backend run build
build_exit_code: 0
build_output_hash: sha256:4df36ca86723822d023307e38a3b6faa17d635dc259886f2da207634f94114f5
```

# Verification Report

**Change**: `print-bridge-remoto`
**Version**: N/A (`openspec/specs/` vacío; delta specs del cambio)
**Mode**: Standard (TDD off según `openspec/config.yaml`)
**Fecha**: 2026-09-19
**Baseline verificado**: rama `MOS-05`, HEAD `8aac4463105e479b920f68fa401feb3f2d890e1c`, 7 commits sobre `origin/main` (`d736d96`). Worktree sin cambios de producción (solo `.atl/` sin trackear).

> **Aviso de admisión (⚠️)**: el validador nativo `gentle-ai sdd-verify-validate` **no está registrado** en el binario instalado (gentle-ai 3.0.2; `gentle-ai help` imprime la línea "Validate exact verification-report bytes without persistence" pero el comando responde `unknown command`). Este reporte se persistió por pedido explícito del orquestador **sin admisión nativa**. Antes de `sdd-archive`, el orquestador debe correr el validador con `--requirements 14 --scenarios 25` cuando el build que lo exponga esté disponible, o iterar hasta obtener admisión nativa. Fórmula de `evidence_revision`: `sha256("MOS-05@<HEAD-SHA>;diff=<sha256(git diff HEAD)>;untracked=<lista>")`.

## Resumen ejecutivo

La implementación existe y funciona: **todas las suites verdes** (193 raíz + 21 backend + 32 agente + el arnés IT completo —13 pasos + `print-bridge-http`— y 63 e2e), builds FE/BE exit 0 con `BUILD_ID`, `db:check` limpio, migración re-ejecutable verificada por mí (dos corridas `psql` sin error), distribución versionada servida con checksum coincidente verificado por HTTP real. Los controles de seguridad pedidos están cubiertos por tests que pasan: payload borrado al cerrar el trabajo (`payload IS NULL` en base), listados/detalle sin `payload`/`suffixHash`/`leaseId`, token solo hasheado y nunca en respuestas de listado ni logs, claim atómico con `FOR UPDATE SKIP LOCKED` (dos puentes concurrentes: uno solo gana), kill switch y tope de 20 puentes por empresa, local primero sin round-trip remoto, y checksum del instalador verificado antes de extraer. **Veredicto: PASS WITH WARNINGS** — 19/25 escenarios totalmente cubiertos, 6 parciales (ninguno ausente y ninguno con test rojo), 0 hallazgos críticos, 0 requisitos incumplidos.

## Completitud

| Métrica | Valor |
|---|---|
| Tareas numeradas completas | 49/49 (`tasks.md`, todas `[x]`) |
| Checklist final de entrega | 10/10 ejecutada y verificada en esta fase (eran los 10 ítems sin marcar) |
| `gentle-ai sdd-status` | reporta `49/59` (`allComplete: false`) porque cuenta los 10 ítems del checklist final como tareas |
| Capacidades | 3 (14 requisitos, 25 escenarios) |

Nota: `gentle-ai sdd-status` marca `apply: blocked(edit_authority_missing)` por un falso positivo de parseo de rutas en `tasks.md` (toma `/` de algún comando como ruta de edición); no refleja un pendiente de implementación. Los 10 ítems del checklist final se ejecutaron en esta verificación con resultado verde (ver tabla de comandos).

## Verificación por capacidad y escenario

Leyenda: ✅ cubierto (test que pasa) · ⚠️ parcial (test pasa pero cubre parte del escenario, o la capa declarada no es la que lo cubre) · ❌ ausente/fallido.

### Capacidad `print-agent-distribution` (4 requisitos, 6 escenarios) — ⚠️ 1/4 requisitos completos

| # | Requisito / Escenario | Resultado | Evidencia observada |
|---|---|---|---|
| 1 | Instalador servido por el backend / **Descarga versionada (unit backend)** | ⚠️ parcial | `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` sección 9 (`backend/tests/print-bridge-http.mjs:353-361`) verifica `/api/print-agent/manifest` con `{version,file,sha256,size,installUrl}`. En esta fase levanté el backend construido (`next start`) y verifiqué por HTTP real: manifest v1.6.0, `/print-agent/install.sh` 200 y tarball 200 con sha256 `16da724d…` **idéntico** al manifest (`HTTP SHA MATCH`). `npm run pack:agent:check` → "el artefacto v1.6.0 está al día". No hay test automatizado de la ruta estática del tarball. |
| 2 | Instalación con checksum verificado / **Checksum inválido aborta (unit backend)** | ✅ | `print-agent/test/instalador.test.mjs:106-113` — "un checksum que no coincide aborta sin instalar" (pasa, `instalado=false`, `config=null`). También `:98-104` filename alterado. Capa real: unit del agente (ejecuta `install.sh` de verdad), no unit backend como sugiere la etiqueta. |
| 3 | Instalación con checksum verificado / **Mac limpia sin repo (e2e)** | ⚠️ parcial | `print-agent/test/instalador.test.mjs:140-154` corre el instalador real con `HOME` sandbox contra backend falso: instala, canjea el código, guarda `bridgeToken`, conserva config legacy `usb:`. Usa `--no-service`: **no se verifica el arranque del servicio (`launchctl load`) en una Mac limpia**; imposible de verificar en este entorno. |
| 4 | Vinculación sin clonar el repo / **Código de un solo uso (unit backend)** | ✅ | IT `print-bridge-http.mjs:144-162`: código usado → 401, 5 intentos → 429, `pairingUsedAt` no nulo, auditorías 1 y 5. Vencimiento por unidad pura: `backend/tests/print-bridge.test.ts:56-62` (`codigoVinculacionVigente` con vencido/borde/usado/agotado). |
| 5 | Vinculación sin clonar el repo / **El puente aparece online (e2e)** | ⚠️ parcial | IT `:165-172` verifica `online:true` tras heartbeat y unidad `print-bridge.test.ts:97-102` (online/offline/revocado). **No hay aserción e2e/UI**: el puente falso (`e2e/helpers/fake-bridge.mjs`) no late y `impresion-remota.spec.js` no asserta presencia en la UI. |
| 6 | Versión reportada / **Versión visible (unit agente)** | ✅ | `print-agent/test/remoto.test.mjs:233-240` verifica `latido.version === '1.6.0'` y `platform`; IT `:317` verifica `config.version === '1.6.0'`; `print-agent/test/agente.test.mjs:109` `/health` 1.6.0. |

### Capacidad `print-config-authority` (5 requisitos, 9 escenarios) — ✅ 4/5 requisitos completos

| # | Requisito / Escenario | Resultado | Evidencia observada |
|---|---|---|---|
| 7 | Autoridad del backend / **Dos dispositivos ven lo mismo (e2e)** | ✅ | e2e `impresion-remota.spec.js:120-136` (contexto nuevo sin localStorage ve la impresora del backend); cache v2 verificada. Pasó en la suite completa (63 passed). |
| 8 | Autoridad del backend / **Rol sin permiso no edita (unit backend)** | ✅ | IT `:38-39` (VENDEDOR POST bridges → 403) y `:68-69` (POST printers → 403). PATCH/DELETE exigen ADMIN en código (`backend/app/api/print/printers/[id]/route.ts:13,65`; `backend/app/api/print/bridges/[id]/route.ts:10`), sin test específico de VENDEDOR sobre PATCH/DELETE. |
| 9 | Caché offline / **El backend pisa la caché (e2e)** | ✅ | e2e `impresion-remota.spec.js:138-158`: caché vieja con "Impresora vieja" desaparece y queda la del backend. |
| 10 | Caché offline / **Sin backend se ve la última caché (e2e)** | ✅ | e2e `:160-186`: aborta `/api/print/**`, marca testigo `no-tocar` y `syncedAt` intactos tras reload. |
| 11 | Import único desde localStorage / **Import repetido no duplica (unit backend)** | ✅ | IT `:107-123`: 409 sin `force`; con `force` los conteos de impresoras y puentes quedan iguales y devuelve mapa `localId→backendId`. |
| 12 | Import único desde localStorage / **La caché pasa a solo lectura (e2e)** | ⚠️ parcial | Implementado (`Impresoras.jsx:181-198` API primero + `refrescarDesdeBackend`; unit `puentes.test.js:62-75`). El e2e solo prueba el lado "no escribe con backend caído"; **ningún e2e edita una impresora por UI y verifica backend+caché actualizados**. |
| 13 | Sincronización del agente sin navegador / **Allow-list sin SPA (unit agente)** | ✅ | `remoto.test.mjs:298-324` aplica `impresora`, `ancho`, `copias` y `lan` desde el backend y conserva lo ausente; IT `:311-318` verifica la config servida al puente (impresoras activas propias/`NULL`, predeterminada, `lan`, `lanCups`, `version`). |
| 14 | Sincronización del agente sin navegador / **Backend caído no rompe lo local (unit agente)** | ✅ | `remoto.test.mjs:283-296` (no crashea, backoff, se recupera), `:197-221` (outbox sobrevive y reporta antes de reclamar), `:169-195` (dedupe tras reinicio). El camino local no se toca (`cola.mjs` ignora remotos en `procesar`/`programar`). |
| 15 | Multi-puente acotado / **Puentes no se pisan (unit backend)** | ✅ | IT `:174-185` (impresora asignada al puente A), `:227-254` (A recibe su trabajo, B 0; job libre repartido con `SKIP LOCKED`), `:311-318` (config filtrada al tenant/puente). Esquema: `PrintPrinter.bridgeId` único por fila. |

### Capacidad `remote-print-jobs` (5 requisitos, 10 escenarios) — ⚠️ 3/5 requisitos completos

| # | Requisito / Escenario | Resultado | Evidencia observada |
|---|---|---|---|
| 16 | Ciclo de vida de puentes / **Alta, tope y rol sin permiso (unit backend)** | ✅ | IT `:33-51` (401/200/403, código una vez), `:347-351` (20 activos → 429); unit `print-bridge.test.ts:92-94` (`MAX_PUENTES_POR_EMPRESA === 20`). |
| 17 | Ciclo de vida de puentes / **Rotación y revocación (unit backend)** | ⚠️ parcial | Revocación cubierta: IT `:126-135` (revocado fuera de lista, pairing → 409, re-delete 404), `:339-345` (heartbeat y claim → 401). Regeneración de código cubierta: IT `:59-65`. **Falta el tramo de rotación de token**: re-parear el mismo puente y verificar 401 del token viejo + autenticación del nuevo. El código lo garantiza (`pair/route.ts:43` reemplaza `tokenHash`; `print-bridge.ts:102` resuelve por hash) pero no hay test. |
| 18 | Ciclo de vida de puentes / **Presencia por lastSeenAt (unit backend)** | ✅ | IT `:165-172` (heartbeat → `online:true` en la lista); unit `print-bridge.test.ts:97-102` (latido reciente online, sin latidos offline, revocado nunca online). La ventana exacta (75 s) no se simula en HTTP. |
| 19 | Encolado desde cualquier dispositivo / **Encolar y repetir (unit backend)** | ✅ | IT `:187-209`: 201 `PENDIENTE/REMOTO`, replay de `idempotencyKey` → 200 mismo id, payload >128 KB → 413, espejo LOCAL sin payload (`payloadBytes=0`), espejo repetido por `sourceJobId` no duplica. |
| 20 | Lease, requeue y estados / **Claim concurrente, vencimiento y requeue (unit backend)** | ✅ | IT `:229-254`: assigned + concurrente (`Promise.all`, un solo ganador), `{jobs:[]}` sin trabajo; `:257-263` lease ajeno no aplica y heartbeat extiende; `:270-272` reporte repetido idempotente; `:295-308` vencido con attempts 1 → PENDIENTE y attempts 3 → FALLIDO, purga 180 días, aislamiento por empresa; unidad `print-bridge.test.ts:167-183` (requeue/extensión/topes). |
| 21 | Lease, requeue y estados / **Sin bytes tras imprimir (unit backend)** | ✅ | IT `:268` `payload IS NULL` tras ACEPTADO; `:216`/`:221` listado y detalle sin `payload`/`suffixHash`/`leaseId`; `:269` sufijo sigue hasheado; unidad `print-bridge.test.ts:215-224` (whitelist exacta del shape público). Riesgo residual: ver "Riesgos residuales" #1 (fallo por vencimiento sin reporte conserva payload). |
| 22 | Confirmación en papel con secreto / **Validación del sufijo (unit backend)** | ✅ | IT `:279-293`: sufijo incorrecto 400 sin devolver el hash, contador de fallos auditado, correcto 200 → `CONFIRMADO` con `suffixHash=''`, re-confirmar 409, espejo LOCAL también confirma. e2e `:219-227` valida el flujo por UI (malo falla, bueno confirma, "✓ en papel"). |
| 23 | Local primero y respaldo manual / **Local sin round-trip remoto (e2e)** | ✅ | e2e `impresion-remota.spec.js:259-292`: agente 127.0.0.1 interceptado, `locales > 0` y `remotos === 0` (ningún POST a `/api/print/jobs`). Nota: no existe fila con `path=local` porque, por diseño, no se encola nada; el `path` solo aplica a registros remotos/espejados. |
| 24 | Local primero y respaldo manual / **Envío remoto sin diálogo automático (e2e)** | ⚠️ parcial | e2e `:194-231` encola desde la UI y verifica `path=REMOTO`, `state=ACEPTADO` y confirmación por sufijo. La **ausencia del diálogo** no se asserta en e2e; la verifiqué por código: `imprimirConDialogo` es manual (`agent.js:527-533`), el camino remoto solo muestra toast (`Impresoras.jsx:404-405`) y `imprimirTicketOFallback` nunca abre el diálogo (`agent.js:510-525`). |
| 25 | Local primero y respaldo manual / **Bandera apagada (unit backend)** | ✅ | IT `:319-331`: con `{"printRemote":false}` el encolado → 409, claim → 409, config del puente vacía con `remoteEnabled:false`, la app lo ve en `GET /api/print/printers`, y al limpiar settings vuelve a `true`. Unidad `print-bridge.test.ts:105-109`. |

**Resumen de compliance**: 19/25 escenarios ✅ · 6/25 ⚠️ · 0/25 ❌ · 8/14 requisitos con todos sus escenarios cubiertos.

## Corrección (evidencia estática de los puntos sensibles pedidos)

| Punto | Estado | Evidencia |
|---|---|---|
| Payload borrado al imprimir | ✅ | `backend/app/api/print/bridge/jobs/[id]/result/route.ts:35` (`payload: null` en la transacción de cierre) + IT `:268` (`payload IS NULL` en base). El espejo LOCAL nunca guarda payload (`jobs/route.ts:54-59`, IT `:204`). |
| Listados sin `suffixHash`/`payload`/`leaseId` | ✅ | Whitelist `shapePublico` (`backend/lib/print-jobs.ts:91-115`) usada por `GET /jobs` (`jobs/route.ts:165`) y `GET /jobs/[id]`; IT `:193`, `:216`, `:221`; test de claves exactas `print-bridge.test.ts:216-220`. |
| Token del puente fuera de logs/respuestas | ✅ | `shapePuente` sin `tokenHash` ni código (`print-bridge.ts:113-125`); IT `:51`, `:57`, `:90`; pair solo devuelve el token una vez (`pair/route.ts:55`) y audita sin código (`:30`, `:51`); sin `console.*` en rutas/`lib` de impresión; `pair.mjs` no loguea el token (`remoto.test.mjs:351`); `config.json` 0600 (`instalador.test.mjs:152`, `remoto.test.mjs:350`). |
| Claim sin duplicar (lease + SKIP LOCKED) | ✅ | `reclamarTrabajo` (`print-jobs.ts:203-226`, `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`) + IT concurrente `:245-253`; transiciones idempotentes `:270-272`; requeue con `updateMany` condicionado (`print-jobs.ts:184-189`). |
| Kill switch y tope de puentes | ✅ | `remoteEnabledDeTenant` (`print-bridge.ts:129-132`); corte en encolado (`jobs/route.ts:31-32`), claim (`claim/route.ts:12-13`) y config (`config/route.ts:20-22`); tope `MAX_PUENTES_POR_EMPRESA=20` (`print-bridge.ts:12`, `bridges/route.ts:25`) con IT `:347-351`. |
| Local primero sin duplicar | ✅ | `resolverCamino` (`src/lib/printing/ruteo.js:24-30`) + router que **no** cae al remoto si el local aceptó/encoló/incierto (`agent.js:427-451`); unit `ruteo.test.js:16-51`; e2e `:259-292` (0 POST remotos). |
| Checksum antes de extraer | ✅ | `print-agent/install.sh:93-107` (descarga, `shasum -a 256`, aborta si no coincide) y allow-list `:109-126` **antes** de extraer en `:130`; tests `instalador.test.mjs:98-138` (filename, checksum, código inválido sin red, rutas `..`/absolutas). |
| Migración aditiva/idempotente/re-ejecutable | ✅ | Corrí `migration.sql` dos veces con `psql ON_ERROR_STOP=1` sobre la base e2e ya migrada: exit 0 ambas, solo `NOTICE … already exists, skipping`; columnas de `PrintJob` completas (32, todas las de D1). `npm run db:check` contra esa base: "la base coincide con prisma/schema.prisma". |

## Resultados crudos de los comandos (ejecutados en esta fase)

| Comando | Resultado observado | Exit |
|---|---|---|
| `npm test` | 193 tests, 193 pass, 0 fail | 0 |
| `npm --prefix backend run test:unit` | 21 tests, 21 pass, 0 fail; línea `PASS: token, pairing, autenticación multi-puente, validación de impresoras y trabajos de impresión` | 0 |
| `npm --prefix print-agent test` | 32 tests, 32 pass, 0 fail (incluye 5 del instalador y los de outbox/backoff/latido/dedupe/pairing) | 0 |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | exit 0; `print-bridge-http: puentes, impresoras, import idempotente, trabajos con lease y confirmación, tope y manifest OK.`; migración `20261016000000_print_bridge` aplicada | 0 |
| `npm run test:e2e` (suite completa, puertos/DB aislados `mos-05`) | **63 passed, 0 failed** (4.2m), sin flaky; 6/6 de `impresion-remota.spec.js` | 0 |
| `npm run lint` | sin errores ni warnings de ESLint | 0 |
| `npm --prefix backend run prisma:validate` | `The schema at prisma/schema.prisma is valid 🚀` | 0 |
| `npm run build` | `✓ built in 9.41s` (warning de tamaño de chunk, preexistente) | 0 |
| `npm --prefix backend run build` | exit 0 y `backend/.next/BUILD_ID` creado (`gTUTs8lL-73wMuK7BZCJ1`; el primer build de la fase dio `PGxykDT6HbSKz5I2gJ9dc`, luego el `next dev` del e2e pisó `.next` y lo reconstruí) | 0 |
| `cd backend && npx tsc --noEmit` | sin salida (0 errores) | 0 |
| `rg "<<<<<<<" src backend e2e print-agent` | sin resultados | 1 (sin match) |
| `npm run pack:agent:check` | `pack-agent: el artefacto v1.6.0 está al día.` | 0 |
| `DATABASE_URL=… npm run db:check` (base e2e migrada) | `check-db-schema: la base coincide con prisma/schema.prisma.` | 0 |
| Migración re-ejecutada 2× con `psql` | solo `NOTICE … already exists, skipping` | 0 |
| HTTP real contra backend construido: `/api/print-agent/manifest`, `/print-agent/install.sh`, `/print-agent/mobos-print-agent-1.6.0.tgz` | manifest v1.6.0; sha256 manifest = sha256 tarball (`16da724d…`, 18209 bytes); `install.sh` servido; copia publicada idéntica a `print-agent/install.sh` | 0 |

## Desviaciones del diseño (no rompen el spec)

| # | Desviación | Impacto |
|---|---|---|
| D1 | "Un solo puente predeterminado por empresa" no se persiste en el backend: se deriva en el cliente como el primero por `createdAt` (`agent.js:191`) y `normalizarPuentes` garantiza uno (`puentes.js:37-44`, test `puentes.test.js:62-75`). | El invariante "a lo sumo uno" se cumple por dispositivo y es determinista (mismo orden del backend), pero no está garantizado por el servidor. Ya documentado en `apply-progress.md` (slice 1, dev. 5). |
| D2 | `claimedAt`/`updatedAt` del claim se escriben con el instante JS en vez de `now()` SQL. | Corrección necesaria por zona horaria (`America/Asuncion`); verificada por IT (latido extiende el lease). |
| D3 | `pairingCodeHash` se conserva tras el canje para contar los 5 intentos. | No se expone en ninguna respuesta; `pairingUsedAt` impide el reuso. |
| D4 | El instalador valida el formato del `--code` antes de tocar la red; `--no-service` existe para tests. | Mejora de seguridad; el servicio sigue siendo el default. |
| D5 | El espejo `LOCAL` y el encolado remoto de tickets del POS quedan fuera (solo la prueba de impresoras usa el router). | Declarado en `apply-progress.md` (slice 4, dev. 5); no contradice ningún escenario del spec. |

## Riesgos residuales

1. **Payload retenido en fallo por vencimiento**: `reencolarVencidos` (`backend/lib/print-jobs.ts:184-189`) pasa a `FALLIDO` al agotar intentos sin limpiar `payload`. El spec solo exige borrarlo al llegar a `impreso`, y el diseño D6 dice "borrado al reportar resultado terminal"; un trabajo que nunca se reporta conserva bytes hasta la purga de 180 días. Sugerencia: `payload: null` también al transicionar a `FALLIDO` por vencimiento.
2. **Rotación de token sin test**: re-parear un puente reemplaza `tokenHash` y el token viejo deja de autenticar (`pair/route.ts:43`, `print-bridge.ts:102`), pero no hay test que lo pruebe. Riesgo bajo, cobertura incompleta del escenario 17.
3. **Ruta estática de distribución sin test automatizado**: el manifest API está en IT y el artefacto en `pack:agent:check`; el tarball servido lo verifiqué manualmente en esta fase (HTTP 200 + sha coincidente). Considerar un assert de la ruta estática en IT si se quiere cubrir en CI.
4. **Presencia en la UI sin e2e**: `online` se prueba a nivel backend/unidad, no en la UI del modal de puentes (el puente falso no late).
5. **Purga oportunista**: solo corre en `claim`; sin polls no se purga (por diseño). Retención de metadatos a 180 días queda supeditada a actividad.
6. **Kill switch en la UI**: el backend está cubierto por IT; el fallback de la UI a `sincronizarAgente` con `remoteEnabled:false` (`Impresoras.jsx:188-192`) no tiene e2e; sí tiene el comportamiento de caché de solo lectura.
7. **Rate-limit del pairing en memoria**: válido con instancia única (nota ya abierta en `design.md`); escalado horizontal lo debilita.
8. **Deriva del gate anti-drift**: verificada hoy con `pack:agent:check`; cualquier edición futura de `print-agent/` sin repack la romperá (el CI del repo debería correrlo).

## No verificable en este entorno (declarado explícitamente)

- **Arranque real del servicio en una Mac limpia**: `launchctl load` + plist + primer arranque del agente no se ejercitan (los tests usan `--no-service`). El resto del one-liner sí se ejecuta en sandbox.
- **Impresora física real**: la impresión remota se prueba con puente falso y la local con socket TCP falso que cuenta bytes (`remoto.test.mjs:26-42`).
- **Admisión nativa del reporte**: `gentle-ai sdd-verify-validate` no existe en el binario instalado (gentle-ai 3.0.2); este reporte quedó persistido sin admisión.
- **Ventana de presencia completa (75 s) y ventana de purga (180 días) en tiempo real**: se prueban como funciones puras y con filas inyectadas por SQL, no con reloj real.

## Hallazgos

**CRITICAL**: ninguno. 0 tests rojos, 0 escenarios sin cobertura, 0 requisitos incumplidos.

**WARNING**:
1. 6 escenarios parciales: #1 descarga estática sin test automatizado; #3 Mac limpia sin servicio (`launchctl`); #5 presencia online sin aserción e2e/UI; #12 edición de impresora → caché de solo lectura sin e2e; #17 rotación de token sin test; #24 ausencia de diálogo sin aserción e2e.
2. `payload` no se limpia al pasar a `FALLIDO` por lease vencido sin reporte (`print-jobs.ts:184-189`); retención hasta la purga de 180 días.
3. Validador nativo `gentle-ai sdd-verify-validate` no disponible en gentle-ai 3.0.2: reporte persistido sin admisión nativa (ver aviso al inicio).

**SUGGESTION**:
1. Agregar `payload: null` en la transición a `FALLIDO` por vencimiento y un assert en IT.
2. Agregar a `print-bridge-http.mjs` una aserción de la ruta estática `/print-agent/<file>.tgz` (HTTP 200 + sha igual al manifest).
3. Agregar un caso de re-pairing (token viejo 401 / nuevo 200) al arnés IT.

## Veredicto final

**PASS WITH WARNINGS.** La implementación cumple el comportamiento especificado en los 14 requisitos: las 5 suites pasan (193 + 21 + 32 unit, IT completo y 63 e2e), los builds y `db:check` están limpios, la migración es re-ejecutable y los controles de seguridad clave (payload borrado, listados sin secretos, token hasheado/sin logs, claim atómico, kill switch, tope, local primero, checksum antes de extraer) están cubiertos por tests que corrí yo mismo. Las advertencias son de cobertura (6 escenarios parciales: rotación de token, presencia/edición/caché en e2e, Mac limpia con servicio, descarga estática automatizada y ausencia de diálogo assertada) y un riesgo real menor de retención de payload en fallos por vencimiento. No hay hallazgos críticos ni requisitos incumplidos. **No archivar sin admisión nativa del reporte.**
