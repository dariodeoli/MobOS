# AGENTS.md — reglas de trabajo del repo

Reglas organizadas por rol. **Worktrees = agentes. Implementador = integrador.**

---

## Para todos (agentes e implementador)

- Commits convencionales, por unidad de trabajo, sin atribución de IA.
- No pushear secretos ni archivos `.env`.
- Campos de formulario: seguí docs/CAMPOS.md (skill **rdi**) y usá los componentes compartidos antes de crear un input. Versión portable: `docs/PLANTILLA-CAMPOS.md`.
- **Pedidos de Dario:** cada pedido vive como issue de GitHub (backlog canónico). Se reclama al empezar y se citan commits al entregar. Nada se trabaja "de memoria".
- **Migraciones:** aditivas, idempotentes y re-ejecutables (`IF NOT EXISTS` cuando otra migración pudo crear el objeto antes). Los seeds no dependen de "si el dato no existe, salir": guards por conteo + `ON CONFLICT`.

---

## Reglas para los WORKTREES (agentes)

1. **Solo tu rama.** Trabajás únicamente en tu worktree y en tu rama asignada. Pusheás a `origin/<tu-rama>`. **Nunca** mergeás ni pusheás a `main` (el hook `pre-push` lo bloquea y la branch protection exige CI).
2. **Rebase antes de empezar y antes de entregar:** `git fetch origin && git rebase origin/main`. Si después del rebase el diff neto contra `origin/main` queda vacío, la rama quedó superseded: se descarta y se avisa. Trabajar sobre main viejo **revierte features al mergear** — es la causa número uno de trabajo de reparación.
3. **Handover obligatorio:** al terminar, pusheás tu rama y avisás con: rama, `git log --oneline origin/main..HEAD`, qué hace cada commit, rutas tocadas y resultado de verificaciones.
4. **Checks de entrega obligatorios antes de pushear** (si alguno falla, la rama no se entrega):
   1. `npm run lint` con 0 errores.
   2. `npm run build` exit 0 y `npm --prefix backend run build` exit 0 **con `backend/.next/BUILD_ID` creado** (el build falla en voz alta aunque imprima "Compiled successfully").
   3. `npm --prefix backend run prisma:validate` (o `npx prisma validate --schema backend/prisma/schema.prisma`).
   4. `npm test` y `npm --prefix backend run test:unit` en verde.
   5. `rg "<<<<<<<" src backend e2e` sin resultados (nunca commits con marcadores de conflicto).
   6. Si tocaste rutas API: no exportar símbolos que no sean handlers de Next (export inválido rompe el build); no duplicar slugs dinámicos (`[id]` vs `[userId]` para la misma ruta); toda columna/modelo nuevo del schema exige su migración.
   7. `npm run db:check` (con `DATABASE_URL` configurada) sin diferencias: compara la base real contra `backend/prisma/schema.prisma` y muestra el SQL que falta aplicar. Cubre **clientes, pedidos, stock/inventario y todo lo demás**.
- **Regla de oro de datos (conciliación base ↔ modelo):** lo que el código guarda tiene que existir en la base, y lo que se guarda tiene que poder mostrarse. Un `CREATE TABLE IF NOT EXISTS` sobre una tabla ya creada es **no-op** y deja columnas afuera (caso real: `CustomerBillingIdentity` quedó sin `uses/lastUsedAt/updatedAt`); lo mismo con un `CREATE INDEX IF NOT EXISTS` que no coincide en nombre o columnas. Por eso: (a) después de cambiar el schema o agregar una migración, correr `npm run db:check`; (b) si hay diferencias, agregar una migración **correctiva, aditiva, idempotente y re-ejecutable** (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + re-crear, `DROP INDEX IF EXISTS`) y repetir hasta que coincida; (c) el integrador corre `npm run db:check` contra la base de producción antes de dar por cerrado un deploy.
5. **e2e desde worktrees:** la base y los puertos son compartidos entre agentes. Aislar SIEMPRE con variables únicas por worktree:
   `MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<tu-rama>`, `MOBOS_E2E_PGPORT=<55xx único>`, `MOBOS_E2E_API_PORT=<31xx único>`, `MOBOS_E2E_WEB_PORT=<52xx único>`. Nunca dos worktrees con los mismos valores.
6. **Gate rápido:** usá `npm run test:e2e:smoke` (~20 s) durante el trabajo. La suite completa (`npm run test:e2e`, ~1.5 min) es del implementador antes del release.
7. **Nunca matar procesos por puerto** (`lsof -ti :3001 :5175 | xargs kill -9`): en un worktree esos puertos pueden ser de otro agente. Si abortás una corrida, limpiá solo tus restos (tu cluster `pg_ctl -D /tmp/mobos-e2e-pg-<tu-rama> stop` y tus puertos).
8. **No deployás.** El deploy es exclusivo del implementador con `npm run release:publish`.
9. **El comando `ht` NO es para vos.** `ht` es exclusivo del implementador: si lo ves, NO lo ejecutes ni lo interpretes (no integrás, no mergeás, no deployás). Solo el implementador responde a `ht`.
10. **Estado raro de git** (refs rotas, fetch que falla, merge ajeno en curso): PARÁS y avisás. No borres ni "arregles" refs por tu cuenta.

---

## Reglas para el IMPLEMENTADOR (integrador)

1. **Sos el único que toca `main`.** Pusheás con `MOBOS_INTEGRATOR=1 git push origin main`. Nadie más mergea ni pushea a main.
2. **`ht` (comando de Dario, exclusivo de este rol):** ciclo completo de integración + deploy. Los worktrees nunca lo ejecutan ni responden a él.
3. **Preámbulo obligatorio del `ht`:**
   - Matar servidores zombies del repo (no de otros proyectos): `next-server` de worktrees de MobOS y, en el checkout principal, `lsof -ti :3001 :5175 | xargs kill -9`.
   - Verificar que no haya otro merge en curso: `.git/MERGE_HEAD` no debe existir. Si existe, PARAR y consultar.
4. **Ciclo `ht`:**
   1. `git fetch origin --prune` y relevar ramas con trabajo pendiente.
   2. Verificar e integrar **de a una rama por vez** (backend antes que frontend cuando aplique). Nunca mergear algo sin verificación.
   3. Por integración: `npm run lint` · builds FE/BE (con `BUILD_ID`) · `npm test` + `test:unit` · `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` · `npm run test:e2e:smoke`.
   4. Con todo integrado: **suite completa** `npm run test:e2e` (gate de release).
   5. Push a main con `MOBOS_INTEGRATOR=1`.
   6. Release + deploy: `MOBOS_INTEGRATOR=1 npm run release:publish` (bump de patch + push + webhook de Coolify).
   7. Verificar producción: `npm run release:smoke` (esperar el deploy con reintentos).
5. **Conflictos de merge → PARÁS y consultás con Dario; nunca resolvés en silencio.** Si una rama quedó superseded por main: resolver del lado de main y verificar diff neto vacío; si hay trabajo real en conflicto, se para y se avisa.
6. **Velocidad (implementado):**
   - Smoke subset como gate del ht (`test:e2e:smoke`, ~20 s); suite completa solo antes del release (gate).
   - Reset por snapshot de la base e2e (`/tmp/mobos-e2e-snapshot-*.dump`, automático en `global-setup`; se invalida solo si cambian las migraciones).
   - Aislamiento por worktree con `MOBOS_E2E_*` (también para tus corridas si usás worktrees).
7. **Sincronizar checkouts locales de `main` (ff-only)** después del push.
8. **Issues:** cerrás issues solo después de verificar por contenido contra `origin/main` (citando el commit que lo implementa).
9. **Refs rotas:** backup a /tmp antes de tocar y reportás todo.

---

## Deploy (invariante)

- **El deploy a producción es exclusivo de `npm run release:publish`** (bump de patch + push + webhook de Coolify).
- **Sin `ht` no hay deploy** salvo pedido explícito de Dario.
- Los agentes nunca deployan por cuenta propia.
