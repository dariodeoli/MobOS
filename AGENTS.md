# AGENTS.md — reglas de trabajo del repo

Reglas organizadas por rol. **Worktrees = agentes. Orquestador coordina; Integrador = único dueño de `main`.**

---

## Para todos (orquestador, agentes e implementador)

- Commits convencionales, por unidad de trabajo, sin atribución de IA.
- No pushear secretos ni archivos `.env`.
- Campos de formulario: seguí docs/CAMPOS.md (skill **rdi**) y usá los componentes compartidos antes de crear un input. Versión portable: `docs/PLANTILLA-CAMPOS.md`.
- Impresión: seguí `docs/IMPRESION.md` (token del QR impreso vs enlace del panel, cola honesta y qué hacer ante cada error).
- Tokens, enlaces y sesiones: seguí `docs/TOKENS.md` (64 hex, solo `sha256` en la base, reloj de Postgres, un solo uso atómico); los enlaces de correo siempre con enlace de respaldo visible.
- Fotos de personas: usá siempre el `Avatar` compartido (foto subida → foto de Google → iniciales) y seguí `docs/AVATAR.md`; listados y grillas, `docs/TABLAS.md`. Inventario de objetos reutilizables: `docs/PLANTILLA-OBJETOS.md`.
- **Pedidos de Dario:** cada pedido vive como issue de GitHub (backlog canónico) — la abre el orquestador y el slot la cita con commits al entregar. Nada se trabaja "de memoria".
- **Novedades para el dueño:** todo handover y todo cierre de issue incluye un bloque `Novedades para el dueño` (2-5 bullets en lenguaje de producto, sin jerga técnica). El registro acumulativo vive en `docs/NOVEDADES.md` y el integrador lo actualiza en cada integración con la versión publicada.
- **Migraciones:** aditivas, idempotentes y re-ejecutables (`IF NOT EXISTS` cuando otra migración pudo crear el objeto antes). Los seeds no dependen de "si el dato no existe, salir": guards por conteo + `ON CONFLICT`.

---

## Reglas para el ORQUESTADOR (coordinación)

1. **Dónde vive:** `~/.herdr/worktrees/mobos/orquestador/` — carpeta de coordinación **sin repo**: no tiene checkout y no puede tocar código ni `main`.
2. **Qué hace:** es el interlocutor único de Dario: abre issues (plantillas de `.github/ISSUE_TEMPLATE/`), elige el slot por dominio (`SLOTS.md`), briefea (`BRIEF.md`), sigue handovers, ordena la integración al integrador y mantiene `ESTADO.md`.
3. **Qué NO hace:** no mergea, no pushea, no despliega, no edita código; no resuelve conflictos.
4. **Topología y ciclo:** `docs/TOPOLOGIA.md`.

---

## Reglas para los WORKTREES (agentes)

1. **Solo tu rama.** Trabajás únicamente en tu worktree y en tu rama asignada. Pusheás a `origin/<tu-rama>`. **Nunca** mergeás ni pusheás a `main` (el hook `pre-push` lo bloquea y la branch protection exige CI).
2. **Rebase antes de empezar y antes de entregar:** `git fetch origin && git rebase origin/main`. Si después del rebase el diff neto contra `origin/main` queda vacío, la rama quedó superseded: se descarta y se avisa. Trabajar sobre main viejo **revierte features al mergear** — es la causa número uno de trabajo de reparación.
3. **Handover obligatorio:** al terminar, pusheás tu rama y avisás con: rama, `git log --oneline origin/main..HEAD`, qué hace cada commit, rutas tocadas, resultado de verificaciones y un bloque **Novedades para el dueño** (2-5 bullets en lenguaje de producto, ver `docs/NOVEDADES.md`).
4. **Checks de entrega obligatorios antes de pushear** (si alguno falla, la rama no se entrega):
   1. `npm run lint` con 0 errores.
   2. `npm run build` exit 0 y `npm --prefix backend run build` exit 0 **con `backend/.next/BUILD_ID` creado** (el build falla en voz alta aunque imprima "Compiled successfully").
   3. `npm --prefix backend run prisma:validate` (o `npx prisma validate --schema backend/prisma/schema.prisma`).
   4. `npm test` y `npm --prefix backend run test:unit` en verde.
   5. `rg "<<<<<<<" src backend e2e` sin resultados (nunca commits con marcadores de conflicto).
   6. Si tocaste rutas API: no exportar símbolos que no sean handlers de Next (export inválido rompe el build); no duplicar slugs dinámicos (`[id]` vs `[userId]` para la misma ruta); toda columna/modelo nuevo del schema exige su migración.
   7. `npm run db:check` (con `DATABASE_URL` configurada) sin diferencias: compara la base real contra `backend/prisma/schema.prisma` y muestra el SQL que falta aplicar. Cubre **clientes, pedidos, stock/inventario y todo lo demás**.
   8. Si tocaste `print-agent/` (fuentes o `install.sh`): `npm run pack:agent` y commiteá `backend/public/print-agent/`; el gate anti-drift es `npm run pack:agent:check`.
- **Regla de oro de datos (conciliación base ↔ modelo):** lo que el código guarda tiene que existir en la base, y lo que se guarda tiene que poder mostrarse. Un `CREATE TABLE IF NOT EXISTS` sobre una tabla ya creada es **no-op** y deja columnas afuera (caso real: `CustomerBillingIdentity` quedó sin `uses/lastUsedAt/updatedAt`); lo mismo con un `CREATE INDEX IF NOT EXISTS` que no coincide en nombre o columnas. Por eso: (a) después de cambiar el schema o agregar una migración, correr `npm run db:check`; (b) si hay diferencias, agregar una migración **correctiva, aditiva, idempotente y re-ejecutable** (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + re-crear, `DROP INDEX IF EXISTS`) y repetir hasta que coincida; (c) el integrador corre `npm run db:check` contra la base de producción antes de dar por cerrado un deploy.
5. **e2e desde worktrees:** la base y los puertos son compartidos entre agentes. Aislar SIEMPRE con variables únicas por worktree:
   `MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<tu-rama>`, `MOBOS_E2E_PGPORT=<55xx único>`, `MOBOS_E2E_API_PORT=<31xx único>`, `MOBOS_E2E_WEB_PORT=<52xx único>`. Nunca dos worktrees con los mismos valores.
6. **Gate rápido:** usá `npm run test:e2e:smoke` (~20 s) durante el trabajo. La suite completa (`npm run test:e2e`, ~1.5 min) es del implementador antes del release.
7. **Nunca matar procesos por puerto** (`lsof -ti :3001 :5175 | xargs kill -9`): en un worktree esos puertos pueden ser de otro agente. Si abortás una corrida, limpiá solo tus restos (tu cluster `pg_ctl -D /tmp/mobos-e2e-pg-<tu-rama> stop` y tus puertos).
8. **No deployás.** El deploy es exclusivo del implementador con `npm run release:publish`.
9. **Los comandos `hd`/`hdd`/`ht` NO son para vos.** Son exclusivos del implementador: si los ves, NO los ejecutes ni los interpretes (no integrás, no mergeás, no deployás). Solo el implementador responde a ellos.
10. **Estado raro de git** (refs rotas, fetch que falla, merge ajeno en curso): PARÁS y avisás. No borres ni "arregles" refs por tu cuenta.

---

## Reglas para el IMPLEMENTADOR (integrador)

1. **Sos el único que toca `main`.** Pusheás con `MOBOS_INTEGRATOR=1 git push origin main`. Nadie más mergea ni pushea a main. La orden de integración la da el orquestador; la coordinación (issues, briefs, tablero) no es de este rol.
2. **`hd` / `hdd` / `ht` (comandos de Dario, exclusivos de este rol):** `hd` es el **deploy rápido** (merge + specs afectados en verde + push + release, sin suite completa ni smoke) y `hdd` el **completo** (lo de `hd` + suite completa + CI verde + smoke de producción + cierres); `ht` es el alias histórico del completo. Detalle: `owncoding-ui/docs/COMANDOS.md`. Los worktrees nunca los ejecutan ni responden a ellos.
3. **Preámbulo obligatorio (en cualquier modo):**
   - Matar servidores zombies del repo (no de otros proyectos): `next-server` de worktrees de MobOS y, en el checkout principal, `lsof -ti :3001 :5175 | xargs kill -9`.
   - Verificar que no haya otro merge en curso: `.git/MERGE_HEAD` no debe existir. Si existe, PARAR y consultar.
4. **Ciclos:**
   1. `git fetch origin --prune` y relevar ramas con trabajo pendiente.
   2. Verificar e integrar **de a una rama por vez** (backend antes que frontend cuando aplique). Nunca mergear algo sin verificación.
   3. Por integración: `npm run lint` · builds FE/BE (con `BUILD_ID`) · `npm test` + `test:unit` · `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` · y los **specs afectados** por lo que entró (`npm run test:e2e:smoke` o el subset del dominio tocado).
   4. **`hd` corta acá**: push a main con `MOBOS_INTEGRATOR=1` + release (paso 6). **`hdd`/`ht` sigue** con la suite completa `npm run test:e2e` (gate de release).
   5. Push a main con `MOBOS_INTEGRATOR=1`.
   6. Release + deploy: actualizá `docs/NOVEDADES.md` con la sección `## vX — fecha` (novedades en lenguaje de producto, por módulo) y recién después `MOBOS_INTEGRATOR=1 npm run release:publish` (bump de patch + push + webhook de Coolify).
   7. **`hdd`/`ht`**: verificar que el CI quede verde y que producción sirva lo nuevo (`npm run release:smoke`, con reintentos), y cerrar los issues verificando por contenido contra `origin/main` con el bloque «Novedades para el dueño».
5. **Conflictos de merge → PARÁS y consultás con Dario; nunca resolvés en silencio.** Si una rama quedó superseded por main: resolver del lado de main y verificar diff neto vacío; si hay trabajo real en conflicto, se para y se avisa.
6. **Velocidad (implementado):**
   - `hd` (rápido): specs afectados del dominio + push + release; `hdd` (`ht`, completo) suma la suite completa, el CI verde, el smoke de producción y los cierres.
   - Reset por snapshot de la base e2e (`/tmp/mobos-e2e-snapshot-*.dump`, automático en `global-setup`; se invalida solo si cambian las migraciones).
   - Aislamiento por worktree con `MOBOS_E2E_*` (también para tus corridas si usás worktrees).
7. **Sincronizar checkouts locales de `main` (ff-only)** después del push.
8. **Issues:** cerrás issues solo después de verificar por contenido contra `origin/main` (citando el commit que lo implementa) e incluís en el cierre el bloque **Novedades para el dueño** (2-5 bullets, ver `docs/NOVEDADES.md`).
9. **Refs rotas:** backup a /tmp antes de tocar y reportás todo.

---

## Agente de impresión (distribución)

- El agente se distribuye como **artefacto versionado** en `backend/public/print-agent/`
  (`mobos-print-agent-<versión>.tgz` + `manifest.json` + `install.sh`), servido por
  el backend. La Mac se instala sin clonar el repo:
  `curl -fsSL https://api.moboss.online/print-agent/install.sh | bash -s -- --code ABCDE-FGHIJ`
  (el código de vinculación se genera en la app: Configuración → Impresoras → Gestionar puentes).
- El instalador verifica el SHA-256 antes de extraer y solo acepta la allow-list del
  tarball; no ejecuta nada descargado antes del checksum. No cambiar ese orden.
- **Anti-drift:** al tocar `print-agent/` regenerá el artefacto (`npm run pack:agent`) y
  verificá con `npm run pack:agent:check`; la versión de `print-agent/package.json` debe
  coincidir con `server.mjs`. El artefacto se commitea (lo copia el build Docker).
- **Rollback del modo remoto:** `"apiUrl": ""` en `~/.mobos-print/config.json` (vuelve al
  comportamiento 1.5.0 solo local) o revocar el puente en la app (el token deja de autenticar).

---

## Deploy (invariante)

- **El deploy a producción es exclusivo de `npm run release:publish`** (bump de patch + push + webhook de Coolify).
- **Sin `hd`/`hdd` (`ht`) no hay deploy** salvo pedido explícito de Dario.
- Los agentes nunca deployan por cuenta propia.
