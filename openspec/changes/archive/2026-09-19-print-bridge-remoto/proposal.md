# Proposal: print-bridge-remoto

| Campo | Valor |
|---|---|
| Cambio | `print-bridge-remoto` |
| Fecha | 2026-09-19 |
| Baseline | `origin/main` @ `d736d96` (v1.0.102); `MOS-05` == `origin/main`, sin commits propios |
| Issue | **Por crear/vincular** (no existe issue específico de impresión remota; padre #4). Bloquea `apply` |
| Insumos | `exploration.md`; `pending-decisions.md` (6 decisiones cerradas) |

## Intención y problema

La térmica cuelga de la Mac del local vía `print-agent` en `127.0.0.1:17890` (`src/lib/printing/agent.js:16`). Otros dispositivos de la Wi-Fi no imprimen: `127.0.0.1` es ellos mismos y el fetch HTTPS→HTTP LAN es mixed content (`src/lib/printing/puentes.js:5`). La config (impresoras, puentes, tokens) vive en `localStorage` por dispositivo (`agent.js:25-31,57`): el teléfono no ve impresoras y el agente no aprende su allow-list sin navegador abierto (`Impresoras.jsx:758-810`). El camino local de la Mac funciona y no debe romperse.

## Alcance

Dentro:
- Puentes por empresa en backend, token hasheado y revocable.
- Cola remota con lease, idempotencia y estados honestos (`aceptado` ≠ `confirmado`; `incierto` no auto-reintenta, `print-agent/cola.mjs:6-14`).
- Polling 2 s + backoff para reclamar y reportar.
- Config de impresoras en backend, caché offline e import único.
- Instalador versionado servido por backend (tarball + one-liner con checksum).
- UI de pairing, cola/historial remoto y confirmación en papel.

Fuera:
- WebSocket/SSE y long-poll (`exploration.md:63-69`); `.pkg` firmado; app nativa; routing multi-sucursal; cambios al formato ESC/POS o al camino local.

## Enfoque (6 decisiones)

1. **Config**: backend = fuente de verdad por empresa; `localStorage` baja a caché offline con import único.
2. **Distribución**: instalador servido por backend (tarball versionado + one-liner con checksum); el repo sigue para desarrollo (`install-macos.sh:27` copia del clon hoy).
3. **Secreto**: lo genera el cliente (`tickets.js:198-201,234-236`) y lo valida el servidor; nunca se devuelve en listados.
4. **Retención**: solo metadatos; payload ESC/POS borrado al imprimir.
5. **Latencia**: polling cada 2 s con backoff exponencial.
6. **Mac del puente**: local primero (`127.0.0.1`); cada trabajo registra el camino usado (local/remoto).

**Datos (nuevo, aditivo)**: `PrintBridge` (tenant; nombre, `tokenHash` patrón `backend/lib/auth.ts:198-204` + `timingSafeEqual` como `backend/app/api/internal/email-outbox/route.ts:1-11`, `lastSeenAt`, `revokedAt`) y `PrintJob` (tenant; puente/impresora, tipo, estado, `suffix` solo prueba, lease/`attempts`, `path` local/remoto; payload transitorio). Migración aditiva, idempotente y re-ejecutable; hoy no hay modelos de impresión (verificado) y se audita con `auditLog` (`schema.prisma:1308`).

**UI**: impresoras y puentes se editan una vez por empresa y se leen del backend en cualquier dispositivo; la Mac aprende su allow-list sin navegador; la confirmación en papel pasa al backend y el sufijo no se expone en GET.

## Capabilities

- Nuevas: `remote-print-jobs` (puentes, cola remota, polling, confirmación, retención); `print-config-authority` (config por empresa + caché/import); `print-agent-distribution` (tarball, one-liner, checksum).
- Modificadas: ninguna (`openspec/specs/` vacío).

## Slices (presupuesto 400 líneas)

| # | Slice | Contenido | Est. | Depende |
|---|---|---|---|---|
| 1 | Backend puentes | Modelos + migración, `lib/print-bridge.ts`, pairing/list/revoke, tests | ~420 | — |
| 2 | Backend trabajos | Encolar/listar/confirmar, poll/claim/result con token, auditoría, caps, tests | ~450 | 1 |
| 3 | Agente remoto | `print-agent/remoto.mjs` (poll/claim/report), config, cola compartida, tests | ~400 | 2 |
| 4 | App | `src/lib/api/printing.js`, ruteo local/remoto, UI Impresoras, caché + import | ~450 | 2 |
| 5 | Distribución | Endpoint tarball/instalador con checksum, pairing UX, docs | ~300 | 1 |

≈2 000 líneas → PRs encadenados; verificación por slice según `testing.projects`.

## Rollback

- Bandera que desactiva el encolado remoto: la SPA vuelve al camino local + diálogo manual (`imprimirConDialogo`, `agent.js:312`) y el agente deja de reclamar.
- Revocar tokens corta el polling; migración aditiva (tablas sin uso, sin borrado); la Mac conserva su fast path.

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Duplicados tras envío incierto | Media | Lease + idempotencia; `incierto` sin auto-reintento |
| Divergencia backend/caché | Media | Import único; backend manda; caché de solo lectura |
| Jobs reclamados por puente caído | Media | Expiración de lease + requeue acotado |
| PII ESC/POS retenida | Media | Solo metadatos; payload borrado al imprimir |
| Issue canónico ausente en apply | Alta | Crearlo/vincularlo antes de codificar |

## Criterios de aceptación

- [ ] Otro dispositivo encola una prueba y el puente la imprime (~2-4 s) con `path=remoto`.
- [ ] La Mac imprime local sin round-trip, con `path=local`.
- [ ] Confirmar en papel valida contra el servidor; el sufijo no aparece en listados.
- [ ] Sin bytes ESC/POS en la base tras imprimir; metadatos conservados.
- [ ] One-liner instala en Mac limpia sin repo y verifica checksum.
- [ ] Bandera apagada = comportamiento actual (local + diálogo manual).
- [ ] Lint/build/tests verdes; migración idempotente; `npm run db:check` limpio.

## Dependencias

- Issue canónico de GitHub (pendiente; padre #4).
- `origin/main` @ `d736d96`: rebase ya hecho (`MOS-05 == origin/main`).
- Sin dependencias npm nuevas: `fetch` global de Node 20 y polling.
