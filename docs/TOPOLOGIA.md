# Topología de trabajo — Orquestador + Integrador + Slots

Cómo se trabaja MobOS (monorepo: front `src/` + backend `backend/` + `print-agent/` en un solo repo).

```
Dueño ──▶ ORQUESTADOR ──▶ SLOTS (worktrees, ramas persistentes)
               │               │ handover
               └──▶ INTEGRADOR ◀┘
                    (único dueño de main: merge, checks, push, deploy)
```

## Piezas y límites

| Pieza | Dónde vive | Qué hace | Qué NO hace |
|---|---|---|---|
| **Orquestador** | `~/.herdr/worktrees/mobos/orquestador/` (sin repo) | Interlocutor único de Dario: abre issues, elige slot, briefea, sigue handovers, ordena la integración; mantiene el tablero | no mergea, no pushea, no despliega, no edita código |
| **Integrador** | `~/Documents/GitHub/MobOS` (checkout de `main`) | Verifica por contenido, `merge --no-ff` una rama por vez, checks del árbol mergeado, push con `MOBOS_INTEGRATOR=1`, cierra issues, despliega | no implementa features; no resuelve conflictos reales en silencio |
| **Slots** | un worktree por slot | Implementan en su rama persistente; handover con commits/rutas/checks | no mergean ni pushean a `main`, no despliegan, no tocan worktrees ajenos |
| **Campañas** | temporales | Diseño transversal, QA adversarial, infra/seguridad | no reemplazan slots fijos |

Regla: la escala se resuelve sumando slots de dominio, no apilando orquestadores.

## Worktrees y ramas

| Slot | Rama | Worktree | Dominio |
|---|---|---|---|
| MOS-POS | `slot/pos` | `.herdr/worktrees/mobos/MOS-POS` | Ventas, POS, pedidos, cobro, combos, delivery |
| MOS-INV | `slot/inventario` | `.herdr/worktrees/mobos/MOS-INV` | Productos, stock, IMEI, transferencias, compras, proveedores |
| MOS-FIN | `slot/finanzas` | `.herdr/worktrees/mobos/MOS-FIN` | Caja, gastos, cobranzas, cotizaciones, comisiones, créditos |
| MOS-CRM | `slot/clientes` | `.herdr/worktrees/mobos/MOS-CRM` | Clientes, garantías, service-orders, trade-ins, portal |
| MOS-DSN | `slot/diseno` | `.herdr/worktrees/mobos/MOS-DSN` | Identidad visual, sistema de diseño, UI/UX |
| MOS-PLT | `slot/plataforma` | `.herdr/worktrees/mobos/MOS-PLT` | Auth, roles, build, hooks, infra compartida |
| MOS-PRN | `slot/impresion` | `.herdr/worktrees/mobos/MOS-PRN` | print-agent, impresión |

Mapeo fino de carpetas por dominio: `SLOTS.md` en la carpeta de coordinación.

Reglas de rama:

- Rama persistente por slot. **No** se crea rama por tarea.
- Antes de cada tarea: `git fetch origin --prune && git rebase origin/main`; después de cada integración, la rama se reposiciona y sigue viva.
- `--force-with-lease` solo a la rama propia; **jamás** a `main`.

## Guards de `main`

1. **Hook `pre-push`** (`core.hooksPath = .githooks`): bloquea `main` sin `MOBOS_INTEGRATOR=1`. Instalado en el checkout principal y en los worktrees (`bash scripts/setup-hooks.sh`).
2. **Branch protection en GitHub: activa** — checks obligatorios en strict (`Frontend`, `Backend`, `Integration`, `E2E`), force-push y borrado deshabilitados.
3. **El orquestador no tiene checkout**: no puede tocar `main` ni por accidente.

## Ciclo de un pedido

1. Dario cuenta el problema en lenguaje de producto (solo al orquestador).
2. El orquestador abre un issue en `dariodeoli/MobOS` (repo único) y elige el slot por dominio.
3. Brief al slot (`BRIEF.md`): slot, issue, alcance, criterio, rama, checks, handover.
4. El slot hace `fetch + rebase`, implementa, commitea (conventional commits, sin atribución de IA, `Refs #N`), corre los checks, pushea su rama y entrega handover.
5. El orquestador verifica el handover y ordena al integrador: fetch → verificación por contenido → `merge --no-ff` → checks del árbol mergeado → `MOBOS_INTEGRATOR=1 git push origin main` → verificación vs `origin/main` → cierre del issue.
6. **Deploy** solo con pedido explícito: `MOBOS_INTEGRATOR=1 npm run release:publish` + `npm run release:smoke`.

## Checks de entrega

Los checks obligatorios están en `AGENTS.md` (lint · builds FE/BE con `BUILD_ID` · `prisma:validate` · tests · cero marcadores · `db:check` · `pack:agent:check` si toca impresión). El integrador corre los mismos sobre el árbol mergeado.

## Documentos operativos

- Versión versionada (esta): `docs/TOPOLOGIA.md`.
- Operación diaria: `~/.herdr/worktrees/mobos/orquestador/` — `PLAYBOOK.md` (ciclo, brief, checks, integración, deploy), `SLOTS.md` (dominios), `BRIEF.md` (brief estándar), `ESTADO.md` (tablero).
- `hd` (rápido) y `hdd`/`ht` (completo) son los ciclos de deploy del integrador: el rápido integra con los specs afectados y publica; el completo suma suite, CI verde, smoke de producción y cierres (ver `owncoding-ui/docs/COMANDOS.md`).
