# Archive Report: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Issue canónico | #35 (abierto al archivar; el integrador lo cierra tras verificar contra `origin/main`) |
| Baseline | `origin/main` @ `d736d96` (v1.0.102) |
| Rama de trabajo | `MOS-05` |
| Fecha de archivo | 2026-09-19 |
| Store | `openspec` repo-local (`planningHome.mode: repo-local`) |
| Veredicto de verificación | **PASS WITH WARNINGS** (0 críticos, 0 requisitos incumplidos) |
| Ubicación final | `openspec/changes/archive/2026-09-19-print-bridge-remoto/` |

> Este reporte es el registro terminal del ciclo. Describe el estado del cambio al cierre y aplica la jerarquía de autoridad de estado final: hechos de estado final del orquestador (más recientes) > `verify-report`/`apply-progress` (snapshots intermedios, válidos solo para su momento). Las afirmaciones tomadas de snapshots se atribuyen a su fuente y momento.

---

## 1. Alcance entregado

Impresión remota por empresa: cualquier dispositivo de la red encola y la Mac del local (puente) reclama, imprime y reporta, sin romper el camino local `127.0.0.1`.

**3 capacidades nuevas — 14 requisitos, 25 escenarios:**

| Capacidad | Requisitos | Escenarios | Entrega |
|---|---|---|---|
| `remote-print-jobs` | 5 | 10 | Modelos `PrintBridge`/`PrintPrinter`/`PrintJob` + migración aditiva idempotente `20261016000000_print_bridge`; pairing con token hasheado (32 bytes, `timingSafeEqual`, revocable, tope 20/empresa); cola con lease 120 s, claim atómico `FOR UPDATE SKIP LOCKED`, `attempts<3` + requeue, purga 180 días; confirmación en papel por sufijo secreto (nunca expuesto); kill switch `printRemote`; auditoría; API `/api/print/bridges|printers|jobs`, `/api/print/bridge/{pair,heartbeat,claim,result,config}`. |
| `print-config-authority` | 5 | 9 | Backend como fuente de verdad de impresoras y puentes por empresa; caché offline v2 de solo lectura con TTL 60 s; import único desde `localStorage` (`localId→backendId`, 409 salvo `force`); el agente aprende su allow-list sin navegador. |
| `print-agent-distribution` | 4 | 6 | Artefacto versionado `backend/public/print-agent/` (`mobos-print-agent-1.6.0.tgz` + `manifest.json` + `install.sh`), servido por el backend; one-liner con verificación SHA-256 antes de extraer y allow-list del tarball; `pack-agent.mjs` con gate anti-drift; matriz de amenaza en `print-agent/test/instalador.test.mjs`. |

**Otros entregables:** agente `1.6.0` con poller (`remoto.mjs`), pairing (`pair.mjs`), cola con outbox/dedupe/backoff 2→30 s; router local-primero en `src/lib/printing/ruteo.js`; UI de puentes/cola/confirmación en `Impresoras.jsx`; e2e con puente falso (`e2e/impresion-remota.spec.js` + `e2e/helpers/fake-bridge.mjs`); docs (`print-agent/README.md`, `AGENTS.md`).

**Fuera de alcance (declarado):** WebSocket/SSE, `.pkg` firmado, app nativa, routing multi-sucursal, cambios al formato ESC/POS, espejo `LOCAL`/encolado remoto de los tickets del POS (desviación D5 del verify-report).

## 2. Decisión de producto (6 decisiones)

Tomadas en `proposal.md` (basadas en `exploration.md` y `pending-decisions.md`):

1. **Config**: el backend es la fuente de verdad por empresa; `localStorage` baja a caché offline con import único.
2. **Distribución**: instalador servido por el backend (tarball versionado + one-liner con checksum); el repo sigue para desarrollo.
3. **Secreto**: lo genera el cliente y lo valida el servidor; nunca se devuelve en listados.
4. **Retención**: solo metadatos; el payload ESC/POS se borra al imprimir.
5. **Latencia**: polling cada 2 s con backoff exponencial.
6. **Mac del puente**: local primero (`127.0.0.1`); cada trabajo registra el camino usado (`local`/`remoto`).

## 3. Slices y commits (rama `MOS-05`)

| Slice | Contenido | Commits |
|---|---|---|
| 0 — Planificación | propuesta, 3 specs, design, tasks | `7b89eb6` |
| 1 — Backend puentes | modelos + migración, `lib/print-bridge.ts`, API de puentes/impresoras/pairing/revoke, unit | `d600e9b`, `78b83d0` |
| 2 — Backend trabajos | `lib/print-jobs.ts`, pair/heartbeat/claim/result/config, encolado/listado/detalle/confirmación, caps, purga | `6ca6a73`, `747f249` |
| 3 — Agente | config/cola con origen remoto, `remoto.mjs` (poll/outbox/backoff), `pair.mjs`, `/health`, tests | `f4cd2e8`, `0e3bcd6` |
| 4 — App | `api/printing.js`, router local/remoto, store v2 + caché/import, UI Impresoras, e2e config | `bf1ee61`, `873b9f7` |
| 5 — Distribución + docs | `pack-agent.mjs`, instalador one-liner + tests de amenaza, e2e puente falso, docs | `077345f`, `d429a75`, `b7a7b48` |
| Progreso SDD | `apply-progress.md` por slice (49/49 tareas) | `a31fabf`, `b60029c`, `585eb85`, `8aac446` |
| Corrección post-verificación | el fallo terminal borra el payload del trabajo | `c43ed90` |
| Verificación | `verify-report.md` (PASS con advertencias) | `1183a13` |

**Estado de integración al archivar** (refs tras `git fetch origin --prune`): `origin/main` ya contiene los merges `b9be636` y `9943a56` («merge: MOS-05 …») y el release `10550e3` (v1.0.105). Los commits `c43ed90` (fix) y `1183a13` (verify-report) **no** estaban aún en `origin/main` al cierre; su entrega es política de delivery del orquestador, no parte del archivado.

## 4. Verificación final (comandos observados)

`verify-report.md` (`verdict: pass`, 0 críticos, 0 requisitos incumplidos, 19/25 escenarios ✅ y 6/25 ⚠️ parciales) ejecutó y observó:

| Comando | Resultado observado |
|---|---|
| `npm test` | 193 tests, 193 pass, 0 fail |
| `npm --prefix backend run test:unit` | 21 tests, 21 pass, 0 fail |
| `npm --prefix print-agent test` | 32 tests, 32 pass, 0 fail |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | exit 0; `print-bridge-http: … OK.`; migración `20261016000000_print_bridge` aplicada |
| `npm run test:e2e` (suite completa, aislada `mos-05`) | 63 passed, 0 failed (4.2 m); 6/6 de `impresion-remota.spec.js` |
| `npm run lint` | 0 errores y 0 warnings |
| `npm --prefix backend run prisma:validate` | schema válido |
| `npm run build` / `npm --prefix backend run build` | exit 0 / exit 0 con `backend/.next/BUILD_ID` creado |
| `cd backend && npx tsc --noEmit` | 0 errores |
| `rg "<<<<<<<" src backend e2e print-agent` | sin resultados |
| `npm run pack:agent:check` | artefacto v1.6.0 al día |
| `DATABASE_URL=… npm run db:check` | la base coincide con `prisma/schema.prisma` |
| Migración re-ejecutada 2× con `psql` | solo `NOTICE … already exists, skipping` |
| HTTP real: manifest, `install.sh`, tarball | sha256 coincidente (`16da724d…`, 18209 bytes) |

**Corrección posterior (estado final, posterior al snapshot de verificación):** la advertencia 2 del `verify-report` (un trabajo `FALLIDO` por lease vencido conservaba el payload hasta la purga de 180 días) se corrigió en `c43ed90` (`backend/lib/print-jobs.ts` agrega `payload: null` en la transición a `FALLIDO`; `backend/tests/print-bridge-http.mjs` agrega el assert `payload IS NULL`). El arnés de integración se volvió a correr en verde tras el fix: `print-bridge-http: … OK.` (hecho de estado final del orquestador; el diff del commit fue verificado en este archivo).

**Advertencia de admisión nativa:** `gentle-ai sdd-verify-validate` no existe en el binario instalado (gentle-ai 3.0.2); el `verify-report` quedó persistido sin admisión nativa (declarado en su encabezado). No hay hallazgos CRITICAL, por lo que el archivado se ejecutó con la instrucción explícita del orquestador y los hechos de estado final provistos.

## 5. Advertencias abiertas (no bloquean)

1. **Rotación de token sin test propio**: re-parear reemplaza `tokenHash` y el token viejo deja de autenticar (`pair/route.ts:43`, `print-bridge.ts:102`), pero no hay test que lo pruebe (escenario 17 parcial).
2. **Ruta estática del tarball sin assert en CI**: verificada a mano por HTTP real (200 + sha coincidente) durante la verificación; no hay assert automatizado de `/print-agent/<file>.tgz`.
3. **Presencia online y edición de impresora sin e2e**: `online` se cubre a nivel backend/unit; el modal de puentes no se asertó en e2e; la edición de impresora por UI → backend+caché tampoco (escenarios 5 y 12 parciales).
4. **`next dev` de la suite e2e borra `BUILD_ID`**: el build del backend se reconstruye antes de entregar (riesgo operativo conocido).
5. Advertencias menores del `verify-report` que siguen vigentes: purga oportunista solo en `claim`; kill switch en UI sin e2e; rate-limit del pairing en memoria (una instancia); deriva del gate anti-drift si se edita `print-agent/` sin repack; `launchctl`/Mac limpia e impresora física no verificables en este entorno.

## 6. Specs promovidas (source of truth)

Los tres delta specs eran capacidades nuevas (`openspec/specs/` estaba vacío), por lo que se copiaron mecánicamente a `openspec/specs/{domain}/spec.md` (bytes idénticos, sin fusión destructiva):

| Dominio | Acción | `diff -r` (origen vs. destino) |
|---|---|---|
| `remote-print-jobs` | Creado | vacío, exit 0 |
| `print-config-authority` | Creado | vacío, exit 0 |
| `print-agent-distribution` | Creado | vacío, exit 0 |

Artefactos fuente: `openspec/changes/archive/2026-09-19-print-bridge-remoto/specs/{domain}/spec.md`.

## 7. Estado final del cambio y trazabilidad

- El directorio del cambio **se conserva como registro** en `openspec/changes/archive/2026-09-19-print-bridge-remoto/` con `proposal.md`, `exploration.md`, `pending-decisions.md`, `design.md`, `tasks.md`, `specs/`, `apply-progress.md` y `verify-report.md`; nada fue borrado.
- Movimiento mecánico con `git mv` (fuente y destino byte-idénticos: `diff -r` del snapshot previo contra el destino, salida vacía, exit 0).
- `tasks.md`: 59/59 ítems completos. La implementación (49 tareas numeradas) estaba completa desde `sdd-apply`; los 10 ítems del «Checklist final de entrega (repo)» se reconciliaron en archive time (ver 7.1).
- `openspec/changes/` ya no contiene el cambio activo (solo `archive/`).

### 7.1 Reconciliación de tareas en archive time (reparación excepcional)

- **Qué**: se marcaron `[x]` los 10 ítems del checklist final de entrega, que `sdd-apply` dejó sin marcar.
- **Por qué**: el `verify-report` (snapshot de verificación, posterior al cierre de apply) registra «Checklist final de entrega | 10/10 ejecutada y verificada en esta fase» y su tabla de resultados crudos muestra cada comando en verde; el artefacto persistido de tareas es la fuente de visibilidad de completitud y no debe quedar con casillas obsoletas de trabajo ya ejecutado.
- **Prueba citada**: `verify-report.md` §Completitud y §Resultados crudos de los comandos; `git log` (cita del issue #35 en `7b89eb6`); `origin/main` con los merges de MOS-05 (`b9be636`, `9943a56`) y el release v1.0.105 (integración/rebase/push/handover ejecutados por el integrador); `origin/MOS-05` existe.
- **Contradicción registrada (no resuelta en silencio)**: `apply-progress.md` (escrito al cierre del slice 5) decía «Pendiente — Queda para el integrador: commits por unidad, rebase contra `origin/main`, push de la rama y handover citando el issue #35». El `verify-report` (posterior) afirma 10/10. Esa afirmación de «pendiente» era válida para su momento y quedó superada por la ejecución del integrador evidenciada en `origin/main`; el único residual es que `c43ed90` y `1183a13` seguían sin mergear al archivar (política de delivery del orquestador).

### 7.2 Normalización de `tasks.md` (falso positivo nativo)

`gentle-ai sdd-status` reportaba `apply: blocked(edit_authority_missing)` por un falso positivo: los tramos backtickeados que empiezan con `/` (`` `/print` ``, `` `/health` ``) se interpretaban como rutas de edición fuera de los roots (raíz `/`). Se normalizaron a `` `POST /print` `` y `` `GET /health` `` (sin cambio semántico; el parser deja de marcarlos). Tras el cambio: `taskProgress 59/59`, `dependencies.archive: ready`, `nextRecommended: archive`, `blockedReasons: []`.

### 7.3 Evidencia mecánica del archivado

```
$ git mv openspec/changes/print-bridge-remoto openspec/changes/archive/2026-09-19-print-bridge-remoto
git mv: OK (openspec/changes/print-bridge-remoto -> openspec/changes/archive/2026-09-19-print-bridge-remoto)
$ diff -r /var/folders/.../sdd-archive.hGBsEc/source openspec/changes/archive/2026-09-19-print-bridge-remoto
(empty output, exit 0)
```

## 8. `gentle-ai sdd-status` post-archivo

Ejecutado tras el archivado (`gentle-ai sdd-status --cwd "$PWD" --json`), coherente con el cierre del ciclo:

```json
{
  "schemaName": "gentle-ai.sdd-status",
  "schemaVersion": 2,
  "changeName": null,
  "artifactStore": "openspec",
  "planningHome": { "mode": "repo-local" },
  "changeRoot": null,
  "nextRecommended": "sdd-new",
  "blockedReasons": ["No active OpenSpec changes found under openspec/changes."]
}
```

No quedan cambios activos: el ciclo SDD de `print-bridge-remoto` está completo (planificado, implementado, verificado y archivado).
