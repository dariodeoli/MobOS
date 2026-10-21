# Formato de trabajo y entrega

Acuerdo operativo del dueño, registrado en [#661](https://github.com/dariodeoli/MobOS/issues/661).
Complementa [AGENTS.md](../../AGENTS.md): el orquestador coordina y el integrador es otro responsable, único dueño de `main` y de la publicación. El proceso técnico vigente es [RELEASE.md](../RELEASE.md); sus protecciones, checks y verificación de producción prevalecen sobre resúmenes históricos de comandos. Este formato no autoriza saltarlos.

## Elegir el trabajo antes de ampliar contexto

1. Vincular cada pedido a un issue; revisar estado, PRs y evidencia existentes antes de abrir una tarea equivalente.
2. Antes de leer cuatro o más archivos del dominio, dejar un mapa breve: objetivo, rutas candidatas, responsable, dependencias y comprobación esperada. Buscar primero nombres y símbolos; leer sólo lo necesario, ampliar cuando aparezca una dependencia concreta.
3. Trabajar con hasta tres agentes simultáneos en total, incluido quien coordina. No es obligatorio ocupar los tres. En MobOS, orquestador e integrador siguen separados; se pueden ejecutar unidades secuenciales para respetar el límite.
4. Elegir el modelo de menor costo que pueda resolver la unidad con fiabilidad. Si el proveedor ofrece Haiku, Sonnet u Opus, son preferencias para tareas acotadas, implementación y decisiones complejas, respectivamente; confirmar disponibilidad y compatibilidad antes de seleccionarlos. No inventar equivalencias con otros modelos ni cambiar una selección explícita del dueño. Sin esos modelos, usar los realmente disponibles y declarar la elección si resulta relevante.

## Responsabilidades y brief

| Rol | Entrega | Límite |
| --- | --- | --- |
| Orquestador | Issue, mapa, brief, prioridad y estado con evidencia | No edita fuentes, integra ni publica |
| Agente de unidad | Cambio acotado en rama/worktree propios, verificaciones y PR | No toca `main` ni trabajo ajeno |
| Integrador | Revisión conjunta, integración ordenada y publicación autorizada | Respeta RELEASE.md, CI y protecciones |

Brief reutilizable, corto y concreto:

```text
Issue y objetivo:
Base, rama/worktree y rutas previstas:
Alcance y exclusiones:
Dependencias / decisiones que requieren revisión:
Aceptación y checks afectados:
Entrega: commit, PR, evidencia, pendientes y Novedades para el dueño.
```

Asignar una sola unidad por responsable; registrar quién posee cada archivo compartido o ventana de metadatos. No delegar la misma tarea a dos agentes ni repetir una investigación ya respaldada por evidencia vigente. Una revisión independiente tiene una pregunta acotada y no duplica la implementación.

## Verificar una vez donde corresponde

Durante la unidad, ejecutar las pruebas afectadas por el cambio. Registrar comando, SHA, entorno, resultado y limitaciones. Reutilizar evidencia sólo mientras sigan iguales el código, las dependencias y el entorno relevantes; repetir ante cambios, fallos o dudas nuevas. No afirmar que pasó un check que no se ejecutó.

Coordinar una QA conjunta por versión sobre el candidato integrado, en vez de lanzar suites completas repetidas por cada agente. Esa QA no sustituye pruebas específicas ni los checks obligatorios de PR, push a `main`, builds con procedencia, conciliación y smoke exigidos por RELEASE.md. Si cambia el candidato, revisar el impacto y volver a validar lo afectado y los gates que correspondan.

En una unidad exclusivamente documental, la validación local puede limitarse a revisión del diff, enlaces, UTF-8 y `git diff --check`, cuando el alcance lo autorice; no ejecutar builds o suites de runtime sin motivo. Esto no altera el CI obligatorio ni los gates de una publicación.

## Datos, migraciones y recuperación

- Antes de migrar, inspeccionar en modo de sólo lectura el esquema real, diferencias, dependencias y estado de la operación; mantener migraciones aditivas, idempotentes y re-ejecutables según AGENTS.md. Coordinar con el integrador una ventana fuera de la limpieza de demos, comprobando primero el horario y la configuración actuales. No afirmar un cron fijo sin verificarlo ni ejecutar migraciones de producción desde un agente de unidad. Las pruebas aisladas conservan sus procedimientos y recursos propios.
- Ante un problema, inspeccionar el diff y respaldar los cambios antes de proponer una reversión. Revertir únicamente cambios propios identificados, con autorización aplicable; nunca aplicar un rollback destructivo automático, borrar cambios ajenos o restaurar todo el checkout por comodidad.
- Retirar un worktree sólo después de comprobar que su trabajo está integrado por contenido y que no está en uso. Inventariar commits, archivos privados/ignorados, capturas, permisos y enlaces antes de cualquier operación; coordinar registros compartidos con los agentes activos. Preferir un archivo recuperable con manifiesto y pasos de restauración. No perder secretos ni archivos ignorados, no tocar worktrees activos, no eliminar ramas o ejecutar limpiezas generales como consecuencia automática de un merge.
- No copiar credenciales, PIN, cookies, tokens ni contenido de `.env` a briefs, logs, documentación o memorias. Las evidencias de configuración privada usan únicamente metadatos necesarios.

## Reporte de entrega: 8–12 líneas

Usar lenguaje directo y mantener 8–12 líneas no vacías; incluir los seis indicadores, enlaces y pendientes. El bloque de novedades tiene 2–5 bullets en lenguaje de producto. Ejemplo de diez líneas:

```text
🟢 Estado: preparado / PR abierto / integrado / publicado, según evidencia.
📁 Issue y PR: enlaces; rama y SHA; rutas tocadas y propósito.
🧪 Validación: checks ejecutados, resultado y límites.
🚀 Publicación: versión/SHA verificados o “sin integrar ni desplegar”.
🟡 Pendiente: próxima acción, responsable y dependencia real.
🔴 Bloqueo: causa comprobada y qué falta; “ninguno” si corresponde.
Novedades para el dueño:
- Mejora visible para quien usa el producto.
- Cambio de comportamiento o límite relevante.
Evidencia: rutas/enlaces; no presentar CI, preparación o merge como deploy.
```

El integrador acumula las novedades en [NOVEDADES.md](../NOVEDADES.md) al integrar con la versión correspondiente. Cerrar un issue requiere verificar sus criterios contra `origin/main`; publicado exige comprobar la versión y el SHA servidos en producción, además de los flujos afectados.
