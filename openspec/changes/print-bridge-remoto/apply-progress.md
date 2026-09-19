# Apply Progress: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Slice | 1 — Backend puentes (PR 1) |
| Fecha | 2026-09-19 |
| Modo | Standard (TDD off según `openspec/config.yaml`) |
| Estado | 14/14 tareas del slice 1 completas; slices 2-5 pendientes |

## Work Unit Evidence

| Evidencia | Valor |
|---|---|
| Test foco | `npm --prefix backend run test:unit` → 21 tests, 21 pass, 0 fail (incluye `PASS: token, pairing, autenticación multi-puente y validación de impresoras`) |
| Arnés de runtime | `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → exit 0; línea observada: `print-bridge-http: puentes, impresoras, import idempotente, tope y manifest OK.` |
| Frontera de rollback | Migración aditiva `20261016000000_print_bridge` (tablas sin uso hasta el slice 2) + rutas `backend/app/api/print/**`, `backend/app/api/print-agent/manifest`, `backend/lib/print-bridge.ts` y tests. Revertir el slice deja intactos los caminos actuales de impresión local. |

## Tareas completadas

- [x] 1.1 Enums `PrintJobState`/`PrintJobPath` y modelos `PrintBridge`, `PrintPrinter`, `PrintJob` en `backend/prisma/schema.prisma` (campos/índices/FKs de D1).
- [x] 1.2 Migración aditiva, idempotente y re-ejecutable `backend/prisma/migrations/20261016000000_print_bridge/migration.sql` (enums en `DO $$` sobre `pg_type`, `CREATE TABLE/INDEX IF NOT EXISTS`, FKs en `DO $$ pg_constraint`).
- [x] 1.3 `backend/lib/print-bridge.ts`: token de 32 bytes, `hashToken`, `autenticarPuente` (lookup + `timingSafeEqual` + rechazo de revocado), código Crockford TTL 15 min/1 uso/5 intentos, tope de 20 puentes por empresa, validación de impresoras y mapeo legacy.
- [x] 1.4 `backend/tests/print-bridge.test.ts` registrado en `backend/tests/run-unit.cjs`.
- [x] 1.5–1.13 Rutas: `GET/POST /api/print/bridges`, `POST /api/print/bridges/[id]/pairing`, `DELETE /api/print/bridges/[id]`, `GET/POST /api/print/printers`, `PATCH/DELETE /api/print/printers/[id]`, `POST /api/print/printers/import`, `GET /api/print-agent/manifest`.
- [x] 1.14 `backend/tests/print-bridge-http.mjs` enganchado en `backend/tests/integration-http.sh` (tras obtener `ADMIN_TOKEN`).

## Archivos

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

Total authored: ~1029 líneas (900 nuevas + 129 modificadas).

## Verificación observada

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

## Desviaciones del diseño

1. **`online` en el shape del puente**: se agrega un booleano derivado de `lastSeenAt` con la ventana de presencia existente (75 s, `lib/presence.ts`) para cumplir el escenario «El puente aparece online» de `print-agent-distribution`. El diseño listaba `lastSeenAt` sin el derivado.
2. **Tope de puentes**: el diseño no fijaba número; se define `MAX_PUENTES_POR_EMPRESA = 20` (429 al exceder), documentado y cubierto por unit e IT.
3. **`tokenHash` pre-pairing**: D1 exige `tokenHash` único no nulo; al crear el puente se guarda el hash de un token descartable que se reemplaza al canjear el código (slice 2).
4. **`map` del import**: se devuelve `{ printers: {localId→backendId}, bridges: {localId→backendId} }`; el diseño solo decía `map`.
5. **Un único puente predeterminado**: D1 no tiene columna de predeterminado en `PrintBridge`; el invariante se conserva del lado del cliente (`puentes.js:37-44`) y el backend garantiza un solo `PrintPrinter.isDefault`. El import deduplica puentes por nombre.
6. **Manifest tolerante**: lee `public/print-agent/manifest.json` y responde 503 si falta (hoy). El IT acepta 503 (slice 1) o 200 con contrato completo (tras el slice 5) para no romper cuando el packer publique el artefacto.

## Problemas encontrados

- Ninguno que bloquee. El `ERROR: duplicate key` en el log del arnés es el 409 esperado de destino repetido (Postgres lo registra; la ruta responde 409).

## Workload / PR boundary

- Estrategia: `auto-chain` + `stacked-to-main` (tasks.md). El slice 1 se entrega como PR 1 con base `main`.
- Presupuesto: el forecast estimó ~420 líneas y el resultado real es ~1029 authored. No se puede recortar sin borrar tests/validación; se recomienda **`size:exception`** para este PR o, alternativamente, aceptarlo como PR encadenado con revisión por partes (1A: modelo+migración+lib+unit; 1B: rutas+IT).
- Frontera: arranca en `main` @ `d736d96` y termina en el backend de puentes/impresoras/import/manifest sin trabajo de cola remota (slice 2).

## Pendiente

- Slices 2-5 de `tasks.md` (jobs, agente, app, distribución). El `claim` del slice 2 usará `bridgeId IS NULL OR bridgeId = <mío>` (soportado por el índice `[bridgeId, state]` creado acá).
