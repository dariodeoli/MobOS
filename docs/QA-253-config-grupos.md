# #253 · Estructura visual de los 7 grupos de Configuración (DSN)

Parte del reparto del issue **#253** (reorganizar Configuración en 7 grupos):
DSN tomó la **estructura visual** —navegación interna, layout e iconos— y cada
slot el contenido de su grupo (PLT lidera e integra la sección).

## Entregado

| Pieza | Antes | Ahora |
|---|---|---|
| **Navegación interna** | lista plana de pestañas (`Subtabs`) que envolvía en 3–4 filas en mobile, sin iconos | **riel vertical** en escritorio (7 filas con icono, activo con degradado y barra) y **tira horizontal desplazable** con iconos en mobile; la sección activa se centra sola al entrar por enlace directo |
| **Layout** | pestañas arriba y contenido debajo a todo el ancho | dos columnas en escritorio (riel `16.5rem` fijo, contenido fluido); en mobile, tira + contenido; el riel queda *sticky* |
| **Contexto del grupo** | ninguna pista de qué abarca la sección | línea con el icono y la **descripción** del grupo activo, arriba del contenido |
| **Iconos** | — | `user` Mi cuenta · `store` Organización · `users` Equipo y acceso · `tag` Comercial · `shield` Seguridad y auditoría · `printer` Dispositivos · `pulse` Sistema |

El orden, los rótulos y la visibilidad siguen saliendo de
`SUBPAGINAS.configuracion.tabs` (`PanelVendedor`); la **fuente única** del icono
y la descripción es `src/components/control/config/gruposConfig.js`, y el
objeto que dibuja la navegación es
`src/components/control/config/NavegacionConfig.jsx`.

## Coordinación con PLT (lead)

- La navegación conserva `role="tablist"`/`role="tab"` + `aria-selected`: los
  e2e existentes que clickean por rol y nombre siguen funcionando.
- El diff en `PanelVendedor.jsx` es mínimo (un import y envolver el bloque de
  Configuración con `<NavegacionConfig>`); los contenidos de cada grupo no se
  tocaron.
- `playwright.config.js` suma el spec nuevo al proyecto `admin` y
  `e2e/sharding.json` se regeneró (155/155/155).
- Para la integración de la sección: si PLT reescribe el bloque de
  Configuración, tiene que preservar ese envoltorio.

## Verificación

- `e2e/qa-253-config-grupos.spec.js` **4/4**: los 7 grupos con icono y enlace
  directo, sin scroll horizontal a 390/1280, **AA en claro y oscuro**
  (0 textos bajos) y las capturas reproducibles.
- Sin regresiones en los e2e de Configuración de PLT:
  `configuracion-lote5.spec.js` + `ia-configuracion.spec.js` **12/12**.

## Actualización 25/09 · capturas finales y barrido responsive

- **Capturas finales** de los 7 grupos (estado actual, incluidos los fixes de
  abajo): `docs/qa/253-config-grupos/finales/` — las 28 por grupo (claro/oscuro
  × escritorio/mobile) más las 7 del barrido a 390 y su JSON. El antes/después
  de la implementación queda en `antes/` y `despues/`.
- **Configuración entra al gate de #249**: el barrido responsive suma
  `configuración: los 7 grupos a 360/390/414/768` (sin scroll, sin cortes,
  topbar y navegación de 44). Con eso, los grupos quedan cubiertos por el mismo
  gate que POS y las páginas clave.
- **Fixes táctiles que destapó el barrido** (el resto es el enlace de crédito,
  H6 pendiente de decisión): “Editar nombre” (Mi cuenta) 28→44, “Copiar prompt”
  (Organización/logo) 24→44 y “Actualizar” de Auditoría (Seguridad) 34→44.

Verificación de esta pasada: barrido + estructura **14/14**, y en mobile cada
grupo queda con un solo target < 44 (el enlace H6).

## Evidencia

`docs/qa/253-config-grupos/antes/` (lista plana, 28 capturas: 7 grupos ×
claro/oscuro × escritorio/mobile) y `.../despues/` (riel, mismas 28). Se
reproducen con:

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  MOBOS_CAPTURAS=docs/qa/253-config-grupos/despues \
  npx playwright test e2e/qa-253-config-grupos.spec.js --project=admin -g capturas
```
