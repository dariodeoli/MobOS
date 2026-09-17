# AGENTS.md — reglas de trabajo del repo

- **Al terminar cada tarea autorizada: commitear por unidad de trabajo y mergear/pushear a `main` (API → interfaz) SIEMPRE**, sin esperar pedido explícito y **sin bump de versión**. No dejar trabajo terminado sin mergear. Después del push, sincronizar los checkouts locales de `main` (ff-only).
- **El deploy a producción es exclusivo de `npm run release:publish`** (bump de patch + push + webhook de Coolify), y lo ejecuta solo Dario. Los agentes nunca deployan por cuenta propia.
- **`ht` (comando de Dario al integrador):** ejecutar el ciclo completo — `git fetch origin --prune`, integrar todas las ramas con trabajo pendiente (una por vez, backend antes que frontend), verificar (lint, builds, integración 13/13, e2e), pushear a `main`, deployar con `npm run release:publish` y verificar producción con `npm run release:smoke`. Sin `ht` no hay deploy. **Preámbulo obligatorio:** matar servidores zombies (`lsof -ti :3001 :5175 | xargs kill -9` y `next-server` de worktrees de MobOS) y verificar que no haya otro merge en curso (`.git/MERGE_HEAD`).
- **Nadie pushea ni mergea a `main` salvo el integrador.** Hay protección de rama en GitHub (checks de CI obligatorios) y un hook local `pre-push` que bloquea pushes a main sin `MOBOS_INTEGRATOR=1`. Instalar el hook en cada checkout: `bash scripts/setup-hooks.sh`.
- **Conflicto de merge → parar y consultar con Dario; nunca resolver en silencio.** Si una rama quedó superseded por main, resolver del lado de main y verificar diff neto vacío; si hay trabajo real en conflicto, se para y se avisa.
- **Checks de entrega obligatorios antes de pushear tu rama** (si alguno falla, la rama no se entrega):
  1. `npm run lint` con 0 errores.
  2. `npm run build` exit 0 y `npm --prefix backend run build` exit 0 **con `backend/.next/BUILD_ID` creado** (el build falla en voz alta aunque imprima "Compiled successfully").
  3. `npx prisma validate --schema backend/prisma/schema.prisma`.
  4. `npm test` y `npm --prefix backend run test:unit` en verde.
  5. `rg "<<<<<<<" src backend e2e` sin resultados (nunca commits con marcadores de conflicto).
  6. Si tocaste rutas API: no exportar símbolos que no sean handlers de Next (export inválido rompe el build); no duplicar slugs dinámicos (`[id]` vs `[userId]` para la misma ruta); toda columna/modelo nuevo del schema exige su migración.
- **Migraciones:** aditivas, idempotentes y re-ejecutables (`IF NOT EXISTS` cuando otra migración pudo crear el objeto antes). Los seeds NO deben depender de "si el tenant existe, salir": deben poder correr después sin duplicar (ON CONFLICT + guardas por conteo).
- **e2e desde worktrees:** la base y los puertos son compartidos entre agentes; aislar con variables de entorno por worktree: `MOBOS_E2E_PGDATA`, `MOBOS_E2E_PGPORT`, `MOBOS_E2E_API_PORT`, `MOBOS_E2E_WEB_PORT`. Nunca dos worktrees con los mismos valores.
- **Pedidos de Dario:** cada pedido vive como issue de GitHub (backlog canónico). Al empezar, reclamá un issue y marcalo; al entregar, citá commits. Nada se trabaja "de memoria". El integrador cierra issues solo después de verificar por contenido contra `origin/main`.
- Commits convencionales, sin atribución de IA.
- No pushear secretos ni archivos `.env`.
- Campos de formulario: seguí las reglas de docs/CAMPOS.md — se invocan con **rdi** (skill `.claude/skills/rdi`) — y usá los componentes compartidos antes de crear un input. Para apps nuevas, la versión portable es `docs/PLANTILLA-CAMPOS.md`.
