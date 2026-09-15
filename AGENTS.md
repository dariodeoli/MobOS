# AGENTS.md — reglas de trabajo del repo

- **Al terminar cada tarea autorizada: commitear por unidad de trabajo y mergear/pushear a `main` (API → interfaz) SIEMPRE**, sin esperar pedido explícito y **sin bump de versión**. No dejar trabajo terminado sin mergear. Después del push, sincronizar los checkouts locales de `main` (ff-only).
- **El deploy a producción es exclusivo de `npm run release:publish`** (bump de patch + push + webhook de Coolify), y lo ejecuta solo Dario. Los agentes nunca deployan por cuenta propia.
- Commits convencionales, sin atribución de IA.
- No pushear secretos ni archivos `.env`.
