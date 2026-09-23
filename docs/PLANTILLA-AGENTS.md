# Reglas operativas — <APP>

Plantilla portable: copiá este archivo como `AGENTS.md` en la raíz del repo y
reemplazá los placeholders `<APP>`, `<PUERTO_APP>`, `<PUERTO_API>` y
`<schema validate>` por los valores reales. Borrá lo que no aplique.

## Comandos abreviados del dueño

Los comandos con los que Dario ordena el trabajo (detalle en
`owncoding-ui/docs/COMANDOS.md`, que es la fuente portable y tiene el
**glosario en simple** para el dueño):

| Comando | Qué hace |
| --- | --- |
| `pp` | Resumen de pendientes: producción, ramas, agentes, issues y pendientes de Dario. |
| `pd` | Pendiente de deploy: tabla commit → qué cambia con su tipo (`feature`/`fix`/`test`/`docs`). |
| `al` | Agentes libres y cómo repartir el trabajo. |
| `hd` | **Deploy rápido**: merge + specs afectados en verde + push + release (sin suite completa ni smoke). |
| `hdd` | **Deploy completo**: `hd` + suite completa + CI verde + smoke + cierres (alias histórico: `ht`). |

Reglas: **nada se mergea, pushea ni despliega sin un ciclo (`hd`/`hdd`, o `ht`)
o una ronda ordenada**; los conflictos se resuelven en el worktree del slot que
rebasea (nunca en main); el orquestador no toca código. **Política automática:**
con ≥ 15 commits nuevos sin integrar y el integrador libre, el orquestador
dispara un `hd` automático — el modo rápido (cooldown 20 min, un ciclo a la
vez); el `hdd` completo lo pide el dueño para la ronda con smoke y cierres.
Script de referencia para copiar: `owncoding-ui/tools/auto-ht.sh`.

## Comandos `hd` (rápido) y `hdd` (completo) — integrar y desplegar

- **`hd` (rápido, rutina):** (0) preámbulo: matar servidores zombies (`lsof -ti :<PUERTO_APP> :<PUERTO_API> | xargs kill -9` y procesos de dev de worktrees) y verificar que no haya otro merge en curso (`.git/MERGE_HEAD` ajeno); (1) `git fetch origin --prune` en cada repo y relevar ramas con trabajo pendiente; (2) integrar a main una rama por vez (API antes que frontend), verificando el árbol mergeado (lint, builds con `BUILD_ID` y tests del proyecto) y corriendo los **specs afectados** por lo que entró (unitarios y e2e del dominio tocado), todos en verde; (3) conflictos: si la rama quedó superseded por main, resolver del lado de main y verificar diff neto vacío; si hay trabajo real en conflicto, parar y preguntar; (4) pushear con `<APP>_INTEGRATOR=1`; (5) release: bump + `NOVEDADES.md` + push/tag (y el deploy del proyecto si corresponde). Reportar qué ramas integró y la versión publicada. **No** corre la suite completa, **no** espera el CI y **no** hace smoke ni cierres.
- **`hdd` (completo, ronda de release):** todo lo del `hd` y además: **suite completa** en verde; **CI verde** en GitHub para el push; **smoke de producción** reintentando hasta que sirva la versión nueva; y **cierre de issues** verificando por contenido contra `origin/main` (citando el commit) con el bloque «Novedades para el dueño». Cuando Dario escribe solo `ht`, ejecutar este ciclo completo sin preguntar.

## Hook y protección de main (regla obligatoria)
- Nadie pushea ni mergea a `main` salvo el integrador. El hook local `pre-push` bloquea pushes a main sin `<APP>_INTEGRATOR=1`; instalar en cada checkout con `bash scripts/setup-hooks.sh` (deja `core.hooksPath = .githooks`).
- La protección de rama en GitHub exige los checks de CI en modo strict y tiene force-push deshabilitado.
- Conflicto de merge → parar y consultar con Dario; nunca resolver en silencio.

## Despliegues (regla obligatoria)
- Cada deploy a producción incrementa la versión. Usar siempre el comando de release del proyecto: árboles limpios, bump de versión, sincronización de versiones visibles, regresiones y build, push en orden API → frontend y deploy vía webhook/plataforma; el smoke valida las URLs públicas al final.
- No publicar sin bump de versión ni sin los artefactos de versión regenerados.
- Las sesiones de worktree nunca despliegan. El deploy es exclusivo del integrador, y solo con pedido explícito.

## Integración a main (regla obligatoria)
- main pertenece al integrador. Ningún agente de worktree hace `git merge`, edita main ni pushea a main: los cambios se integran únicamente a través del integrador.
- Antes de tocar archivos: `git fetch origin --prune && git rebase origin/main`. Conflicto → se resuelve en la rama propia; force-push solo a la rama propia, jamás a main.
- Entrega (handover): commitear por unidad de trabajo (conventional commits, sin atribución de IA), correr la verificación mínima, pushear la rama propia y avisar con: nombre de rama, `git log --oneline origin/main..HEAD`, qué hace cada commit, rutas tocadas y resultado de las verificaciones.
- Después de una integración anunciada, verificar por contenido contra `origin/main` (`git merge-base --is-ancestor <sha> origin/main` + `git show origin/main:<ruta>`), no por memoria. Si algo falta, reaplicarlo sobre main actualizado.
- Estado raro de git (fetch que falla, refs rotas): parar y avisar al integrador. No borrar ni arreglar refs por cuenta propia.
- Matá tus servidores zombies al terminar: `lsof -ti :<PUERTO_APP> :<PUERTO_API> | xargs kill -9`.

## Issues (backlog)
- Cada pedido se trabaja desde un issue: abrirlo en el repo donde vive el cambio principal (frontend o API) y referenciar el otro si aplica. Nunca duplicar el mismo pedido en los dos backlogs.
- En commits y handover citar `Refs #<n>`; el integrador cierra el issue solo después de verificar por contenido contra `main`.

## Checks de entrega obligatorios
1. Suite de tests del proyecto en verde.
2. Build exit 0 con artefacto verificado (no alcanza el mensaje de éxito; confirmar que el archivo de salida existe).
3. Cero marcadores de conflicto en todo el código: `rg "^<{7}" <src tests tooling>` sin resultados.
4. Si tocaste el API: suite del API en verde; toda columna/tabla nueva exige su migración idempotente; no exportar símbolos que no sean handlers; no duplicar slugs dinámicos; los seeds usan guards por conteo + `on conflict do nothing`, nunca «si el dato no existe, salir».
5. Versión y artefactos sincronizados según el comando de check del proyecto.
6. Validación del schema (`<schema validate>`) si tocaste el schema o sus migraciones.
- Si alguno falla, no entregues la rama.

## Migraciones
- Aditivas, idempotentes y re-ejecutables. Los seeds nunca dependen de «si el dato no existe, salir»: usan guards por conteo.

## Roles y permisos (fuente única)
- La matriz de capacidades vive en el backend con overrides por empresa/entidad; el menú se filtra en el frontend según el rol.
- Regla: **Rol → módulos → acciones → campos**. Todo control mutante nace con gate de rol/capacidad y el backend revalida siempre; los roles sin permiso nunca ven acciones (ocultas, no deshabilitadas).
- Campos sensibles: definidos por capacidad; el backend los sirve en `null` a los roles sin acceso y rechaza su edición (403).
- Preferencias personales pertenecen a cada usuario y no dependen de su rol.

## Diseño y campos (fuente única)
- No duplicar identidad ni datos en el shell: entidad activa, usuario autenticado y versión en un solo lugar cada uno.
- Montos, fechas y códigos nunca se cortan (nowrap + tabular-nums). Usar las clases/tokens compartidos del design system; nada de estilos inline salvo valores dinámicos.
- Los datos que muestra la UI vienen del contrato real del API; nunca inventar estados, totales ni métricas.
- Un componente por tipo de dato (teléfono, correo, serial, moneda, contraseña, fechas): antes de escribir un input a mano, usá el componente compartido; si no existe, creálo y adoptálo en TODOS los lugares.
- Contenedores y acciones: alineación consistente en cuadrícula y lista; acciones en una sola línea como iconos con tooltip; sello de verificación (check + foto + nombre + fecha/hora) junto al contenido; selección múltiple en lote donde haya listas.
- Mensajes de error: uno por regla, en el módulo compartido; el backend revalida siempre.
- Checklist antes de entregar: ¿usa el componente compartido? ¿respeta defaults? ¿el backend revalida? ¿suite y build verdes?

---

## Kit mínimo para una app nueva

1. `AGENTS.md` (este archivo, adaptado) + `.githooks/pre-push` + `scripts/setup-hooks.sh`.
2. Comando de release del dueño + smoke de producción + check de versión/artefactos.
3. Los checks de entrega como scripts (`test`, `build`, `validate-schema`, `sin-marcadores`).
4. Harness e2e aislado por worktree (puertos y datos únicos por variables de entorno).
5. `docs/PLANTILLA-CAMPOS.md` si la app tiene formularios.
