# Formato de trabajo con agentes

Reglas de trabajo para el integrador, los escritores, la QA, Codex y las sesiones de diseño. Complementa `AGENTS.md`.

## 1. Qué modelo para cada trabajo

| Rol | Modelo | Cuándo |
|---|---|---|
| **Integrador** (la sesión que habla con Dario) | **Sonnet**. Opus solo para diseñar algo grande o resolver un incidente | Arma los pedidos, junta las ramas, publica e informa |
| **Mapeador** | **Haiku** | Antes de un escritor que tenga que leer 4 archivos o más: devuelve dónde está cada cosa |
| **Escritores** (ui, agenda, crm, ops, pay, infra) | **Sonnet** | Siempre |
| **Arquitecto** | **Opus**, una sola vez por tema | Solo temas grandes de plata, datos de salud, permisos o migraciones riesgosas |
| **QA** | **Sonnet** | Plata, permisos, base de datos, login, seguridad, migraciones |
| **QA** | **Haiku** | Cambios de pantalla, textos, landing, estilos |
| **Reportes y verificaciones simples** | **Haiku** | Estado de producción, contar issues, revisar un despliegue |

**Regla práctica:**
- Si un error **rompe datos o plata**, va Sonnet u Opus.
- Si un error **solo se ve feo**, alcanza con Haiku.

## 2. Flujo de cada versión

1. **Pedido corto al escritor:** rama (`git checkout -b agent/x main`), alcance, qué no tocar, criterios de aceptación y checks. Se indica qué issue leer, sin copiar documentación. Termina con: *"Terminá siempre entregando tu reporte (8 a 12 líneas)"*.
2. **Hasta 3 agentes en paralelo, sobre archivos distintos.** Lo que toca la misma zona va uno después del otro.
3. **El escritor** corre los tests relacionados mientras trabaja y la suite completa **una sola vez**, al final.
4. **El integrador** junta las ramas en `integ/vX` en una copia aparte.
5. **Una sola QA por versión**, sobre el conjunto. La QA no corre la suite: lee el diff y prueba lo de su área.
6. **El integrador** corre la suite completa con base de datos **una vez** y publica.
7. **Los arreglos chicos de QA los hace el integrador**, sin lanzar otro agente.
8. **Se cierra el issue** solo con aceptación y evidencia.

## 3. Lo que más tokens ahorra

- **No retomar un agente que ya pasó los ~300.000 tokens:** se lanza uno nuevo con un pedido de 10 líneas.
- **No repetir builds ni tests** que ya pasaron sin cambios.
- **Un mismo trabajo no se le da a dos agentes**, ni se relanza un agente "por las dudas": se espera su reporte.
- **Máximo 3 capturas por tarea**, y solo si cambia la pantalla. Para verificar, leer texto o medir con JS.
- **Pegar solo las líneas del error**, no el log entero.
- **Pedir el archivo o el tema concreto**, nunca "revisá todo el repo".
- **Decisiones a la memoria** (engram, `docs/`, issues), para no volver a explicarlas.
- **Conversación del integrador muy larga:** traspaso corto y sesión nueva.

## 4. Reglas que salieron de problemas reales

- **Publicar siempre con** `export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8`. Sin eso fallan los tests que arman su propia base.
- **Si una publicación falla:** `git checkout -- package.json package-lock.json` y archivar `publication-state.json`. **Nunca** `git commit -a` antes de hacerlo.
- **Borrar la copia de cada agente apenas se junta su rama.** Si no, el disco se llena.
- **Las migraciones corren al arrancar el servidor:** se publican fuera de la hora par (la limpieza de demos corre a las 00, 02, 04…) y antes se revisan en producción con una consulta de solo lectura.
- **Codex y las sesiones de diseño trabajan en `.worktrees/` y en ramas propias:** no se tocan, y no se publica desde la carpeta principal mientras otra sesión tiene ahí una rama abierta.
- **Las animaciones del rediseño mueven la geometría:** los e2e que miden (44 px, cortes, posiciones) esperan con `e2e/helpers/animaciones.js` antes de medir.
- **Las confirmaciones del Popup único son `alertdialog`;** `SaveActions`/`FormActions` dentro de un `Popup` se importan de `src/components/shared/popupKit.jsx`.
- **`gh pr merge --match-head-commit` necesita el SHA completo.**
- **Un fallo de infraestructura en CI** (Postgres cortado, runner caído) se reintenta con `gh run rerun --failed`; un fallo de test se arregla.

## 5. Formato del reporte

🟢 qué cambió · 📁 archivos · 🧪 pruebas y omisiones · 🚀 versión/SHA/deploy · 🟡 pendientes · 🔴 bloqueos
