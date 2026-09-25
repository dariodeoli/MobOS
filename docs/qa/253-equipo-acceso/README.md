# #253 · Grupo «Equipo y acceso» (Configuración)

## El pedido (reparto del issue)

MOS-POS: grupo **Equipo y acceso** con **integrantes, invitaciones, roles y
permisos, horarios, PIN, metas y comisiones**. PLT integra la sección; cada slot
trabaja en sus archivos. Capturas antes/después por grupo, deep links intactos.

## Qué cambió (`control/Vendedores.jsx`)

- **Integrantes** (antes «Funcionarios y metas»): mismas acciones por persona
  (Historial · Horario · PIN · Permisos · Desactivar/Reactivar) y ahora el
  **Horario** resume lo cargado (`Horario · Lu Ma Mi Ju Vi 08:00–18:00`, o el
  `title` «Sin horario: acceso libre»), y la **meta diaria** se muestra como
  chip con **% de cumplimiento** en lugar del campo suelto.
- **Metas y comisiones** (nuevo): una fila por integrante activo con
  **Meta diaria editable** (persiste en `User.dailyGoalPyg`), **Hoy**,
  **Cumplimiento (%)**, **Comisión hoy** y **Mes** (vendido + comisión del mes);
  dentro de la misma tarjeta viven el **Historial mensual por vendedor** y el
  acceso **«Reglas y liquidaciones →»** (Finanzas → Comisiones), sin duplicar
  la administración de reglas.
- **Invitaciones** y **Roles y permisos** siguen dentro del grupo (roles con su
  matriz; los slugs viejos `/configuracion/roles` siguen entrando al grupo).
- No se agregó navegación interna nueva: la estructura visual de los 7 grupos la
  define DSN (#253, reparto).

## Evidencia (demo pública, sonda `scripts/qa-253-equipo-acceso.mjs`)

| Versión | Encabezado | «Metas y comisiones» | Horario | Desborde / errores |
|---|---|---|---|---|
| **Producción v1.0.172 (antes)** | «Funcionarios y metas» | — | botón «Horario» sin resumen | 0 / 0 |
| **Rama (después)** | «Integrantes» | ✅ 6 filas (1 por integrante activo) | resumen en el `title` | 0 / 0 |

Capturas por variante (desktop claro/oscuro y mobile): `equipo-integrantes-*`,
`integrantes-ficha-*`, `equipo-metas-*`, `metas-tarjeta-*`, `equipo-roles-*`, en
`produccion-1.0.172/` y `rama-253/`. Datos crudos en `resultados-*.json`.

## e2e

- `e2e/qa-253-equipo-acceso.spec.js` (2): el grupo muestra Integrantes + Metas y
  comisiones + Matriz de capacidades, una fila de metas por integrante activo, el
  resumen de horario; y la meta diaria se edita, persiste en el backend y se
  restaura al terminar.
- Actualizados por el rename de la sección: `admin.spec.js` (3),
  `documentacion.spec.js` (1) e `ia-configuracion.spec.js` (1).
