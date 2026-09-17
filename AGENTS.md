# AGENTS.md — reglas de trabajo del repo

- **Al terminar cada tarea autorizada: commitear por unidad de trabajo y mergear/pushear a `main` (API → interfaz) SIEMPRE**, sin esperar pedido explícito y **sin bump de versión**. No dejar trabajo terminado sin mergear. Después del push, sincronizar los checkouts locales de `main` (ff-only).
- **El deploy a producción es exclusivo de `npm run release:publish`** (bump de patch + push + webhook de Coolify), y lo ejecuta solo Dario. Los agentes nunca deployan por cuenta propia.
- **`ht` (comando de Dario al integrador):** ejecutar el ciclo completo — `git fetch origin --prune`, integrar todas las ramas con trabajo pendiente (una por vez, backend antes que frontend), verificar (lint, builds, integración 13/13, e2e 23/23), pushear a `main`, deployar con `npm run release:publish` y verificar producción con `npm run release:smoke`. Sin `ht` no hay deploy.
- Commits convencionales, sin atribución de IA.
- No pushear secretos ni archivos `.env`.
- Campos de formulario: seguí las reglas de docs/CAMPOS.md — se invocan con **rdi** (skill `.claude/skills/rdi`) — y usá los componentes compartidos antes de crear un input.
