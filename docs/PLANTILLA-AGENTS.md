# Plantilla portable de reglas para agentes (cualquier app)

Copiá este archivo como `AGENTS.md` en la raíz del repo y reemplazá lo que está
entre `<...>`. Borrá las secciones que no apliquen. Está pensada para un repo
donde **varios agentes trabajan en paralelo** y la integración a `main` la hace
una sola persona (o un agente integrador).

---

## 1. Ramas, worktrees e integración

- Un agente = **un worktree + una rama propia**. Nunca trabajar sobre `main`.
- **Nadie pushea ni mergea a `main` salvo el integrador.** Hay protección de rama
  en el remoto y un hook local `pre-push` que bloquea `main` salvo
  `<VARIABLE_INTEGRADOR>=1` (ej.: `MOBOS_INTEGRATOR=1`).
- Instalar el hook una vez por checkout: `bash scripts/setup-hooks.sh`.
- Sincronizar **antes de empezar y después de cada integración**:
  `git fetch origin --prune && git rebase origin/main`. Force-push solo a la rama
  propia.
- **Conflicto de merge → parar y consultar; nunca resolver en silencio.** Si la
  rama quedó superseded, resolver del lado de `main` y verificar diff neto vacío;
  si hay trabajo real en conflicto, se avisa y se espera.
- **"Integrado" solo se declara tras verificación por contenido** contra
  `origin/main`, nunca de memoria:
  `git merge-base --is-ancestor <commit> origin/main` +
  `git show origin/main:<ruta>` buscando el símbolo propio.

## 2. Commits

- Uno por **unidad de trabajo** (una cosa revisable por commit).
- **Convencionales** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`...), en
  el idioma que use el repo, **sin atribución de IA** (nada de Co-Authored-By).
- **Sin bump de versión** en el trabajo normal; el bump es del release.
- **Nunca** commitear secretos, `.env` ni credenciales.
- No dejar trabajo terminado sin commitear.

## 3. Checks obligatorios antes de entregar la rama

Si alguno falla, la rama **no se entrega**:

1. `<lint>` con **0 errores** (ej.: `npm run lint`).
2. `<build>` exit 0 **y verificando el artefacto de build** (que exista el
   archivo que prueba que compiló de verdad, no solo el cartel de "ok").
   Si hay backend/API: build del backend también.
3. Validación de esquema/BD: `<comando de validación>` (ej. `npx prisma validate`).
4. Tests unitarios en verde: `<test front>` y `<test back>`.
5. Sin marcadores de conflicto: `rg "^<{7}" <carpetas de código>` sin resultados.
6. Reglas de rutas/API y esquema:
   - No exportar símbolos que no sean handlers válidos del framework.
   - No duplicar slugs dinámicos (`[id]` vs `[userId]` para la misma ruta).
   - Toda columna/modelo nuevo del esquema **exige su migración**.
   - Migraciones: **aditivas, idempotentes y re-ejecutables** (`IF NOT EXISTS`
     cuando otro pudo crear el objeto antes).
   - Seeds que puedan correr de nuevo sin duplicar (claves únicas + guardas por
     conteo).

## 4. e2e y entornos aislados

- Los puertos y las bases son **compartidos** entre agentes: aislar por worktree
  con variables de entorno únicas (ej.: `<APP>_E2E_PGDATA`, `<APP>_E2E_PGPORT`,
  `<APP>_E2E_API_PORT`, `<APP>_E2E_WEB_PORT`). Nunca dos worktrees con los mismos
  valores.
- Antes y después de correr e2e: **matar servidores zombie**
  (`lsof -ti :<puerto-api> :<puerto-web> | xargs kill -9` y los procesos del
  framework que queden colgados).
- El e2e completo lo corre el integrador como parte de la integración.

## 5. Entrega y handover

- Pushear **solo la rama propia**: `git push origin <rama>`.
- Avisar con: nombre de rama, `git log --oneline origin/main..HEAD`, qué hace
  cada commit, **rutas tocadas** y **verificaciones** corridas.
- **El deploy es del dueño/integrador**, con un único comando documentado
  (ej.: `<comando de release>`). Los agentes nunca deployan por cuenta propia.
- Ciclo del integrador (un solo comando, ej. `ht`):
  1. Matar zombies y verificar que no haya otro merge en curso.
  2. `git fetch origin --prune`.
  3. Integrar las ramas con trabajo pendiente **una por vez**, backend antes que
     interfaz.
  4. Verificar: lint, builds, integración y e2e.
  5. Pushear `main`.
  6. Deployar con el comando de release y verificar producción (smoke).

## 6. Pedidos y trazabilidad

- Cada pedido vive como **issue** en el tracker (backlog canónico).
- Al empezar: reclamar el issue y marcarlo. Nada se trabaja "de memoria".
- Al entregar: citar los commits en el issue.
- El integrador cierra el issue **solo tras verificar por contenido** contra
  `origin/main`.

## 7. Formularios y UI (si aplica)

- Reglas de campos en `<ruta del doc de campos>` (componentes compartidos antes
  de crear un input nuevo). Versión portable: `docs/PLANTILLA-CAMPOS.md`.
- Antes de crear un componente, mirar los existentes: mismo patrón, mismos
  nombres, misma accesibilidad.

## 8. Reportes al dueño

- **Cortos y en su idioma**, con números concretos. Sin relleno ni adornos.
- Destacar solo si: una decisión suya bloquea trabajo, hay un plazo con fecha, hay
  plata comprometida, o hay un **riesgo/error propio** sobre algo ya visto.
  Máximo tres avisos; no marcar avances ni buenas noticias.

## 9. Nunca

- Pushear o mergear a `main` sin ser el integrador.
- Resolver un conflicto de merge en silencio.
- Commitear marcadores de conflicto, secretos o `.env`.
- Deployar por cuenta propia.
- Declarar "listo/integrado" sin haber corrido los checks y sin verificar contra
  `origin/main`.
- Pisar trabajo de otro agente sin revisar `git log origin/main -- <archivo>`.

---

## Kit mínimo para arrancar en una app nueva

1. `AGENTS.md` (este archivo, adaptado).
2. `.githooks/pre-push` + `scripts/setup-hooks.sh` (bloqueo de `main`).
3. Comando de release del dueño (`npm run release:publish` o equivalente) y un
   smoke de producción (`npm run release:smoke`).
4. Los 6 checks del punto 3 como scripts (`lint`, `build`, `validate`, `test`).
5. Harness e2e con aislamiento por variables de entorno (punto 4).
6. `docs/PLANTILLA-CAMPOS.md` si la app tiene formularios.

### Hook `pre-push` (plantilla)

```bash
#!/usr/bin/env bash
# Bloquea pushes directos a main salvo que la sesión sea del integrador.
set -euo pipefail
main_blocked=0
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  case "$remote_ref" in
    refs/heads/main)
      if [[ "${APP_INTEGRATOR:-}" != "1" ]]; then
        echo "Push directo a main bloqueado. Pusheá a origin/<tu-rama>." >&2
        main_blocked=1
      fi
      ;;
  esac
done
[[ "$main_blocked" == "1" ]] && exit 1
exit 0
```

### `scripts/setup-hooks.sh` (plantilla)

```bash
#!/usr/bin/env bash
# Activa los hooks del repo en este checkout/worktree (una vez por checkout).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chmod +x "$ROOT/.githooks/pre-push"
git config core.hooksPath .githooks
echo "Hooks instalados. Los pushes a main requieren APP_INTEGRATOR=1."
```
