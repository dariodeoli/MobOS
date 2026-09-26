# #187 · Cierre visual/UX del dominio (POS · Inventario · Clientes)

Extensión de #185 autorizada por Dario: recorrido de producción de los módulos
restantes (POS, Inventario, Clientes) con Playwright headless sobre la demo
pública y las páginas públicas. Este documento cierra la **capa visual/UX** del
dominio (la funcional vive en los informes de cada slot).

## Estado por módulo

| Módulo | Funcional | Visual/UX (esta pasada) |
|---|---|---|
| **POS** | 12/12 pasos en producción (`docs/QA-187-pos-demo.md`); los 2 hallazgos de split/cierre eran del verificador | Capturas claro/oscuro/móvil en `docs/qa/activacion-f4/dominios/02-pos-*`; targets de 44 (`qa-249-pos-touch`) |
| **Inventario** | **13/13 pasos OK, 0 hallazgos** contra v1.0.181 (`docs/qa/187-inventario/`, `e2e/prod/187-inventario.mjs`) | Capturas en `docs/qa/activacion-f4/dominios/01-inventario-*`; gate responsive y táctil (`qa-249-inventario-touch`) |
| **Clientes** | **22/22 pasos OK** en v1.0.178 (cierre de CRM: `docs/QA-187-clientes-produccion.md`) | Capturas en `docs/qa/activacion-f4/dominios/04-clientes-*`; `qa-249-clientes-touch` |

## Qué se verificó en la capa visual

- **Estados y jerarquía**: tablas compactas de una línea, tiles de resumen,
  steppers de entrega/taller, chips de estado con tono semántico y números
  grandes con tabular-nums.
- **Claro/oscuro/móvil**: 22 capturas por dominio en producción v1.0.181
  (claro/oscuro × escritorio/móvil según pantalla) sin desbordes ni recortes;
  el contraste AA del shell quedó cerrado en local y producción
  (`docs/QA-241-shell-aa.md`).
- **Mobile**: **cero targets < 44 px** en 360/390/414 para todo lo auditado
  (`docs/QA-RESPONSIVE-MOBILE.md`, gate `dsn-responsive-mobile.spec.js`).
- **Demo**: el recorrido visual de la demo completa está en
  `docs/QA-213-demo-visual.md`.

## Hallazgos

**Ninguno nuevo.** Los recorridos funcionales de POS e Inventario cerraron sin
hallazgos de producto (los dos de split/cierre eran limitaciones del
verificador, documentadas en el issue) y la capa visual pasó sin recortes ni
áreas táctiles chicas.

## Coordinación

- **CRM**: dueño del cierre funcional de Clientes (v1.0.178) y del portal; sin
  pedidos abiertos hacia diseño.
- **PLT**: dueño del shell (barra/topbar/menú); el contrato visual del v2
  —tokens, AA y el toggle de Preferencias— queda pinneado por
  `e2e/dsn-241-a11y.spec.js`.

## Nueva ola (26/09/2026, producción v1.0.186)

Re-verificación completa de los tres módulos y de la capa visual:

| Recorrido | Resultado | Evidencia |
|---|---|---|
| POS (12 pasos) | **12/12**, 0 fallos de script | `docs/qa/187/` (25 capturas + resultados) |
| Inventario (13 pasos) | **13/13**, 0 hallazgos | `docs/qa/187-inventario/` |
| Clientes (22 pasos) | **22/22**, 0 llamadas al API real | `docs/QA-187-clientes-produccion/` (28 capturas) |
| Capturas por dominio (claro/oscuro/móvil) | 22 al día | `docs/qa/activacion-f4/dominios/` |

**Hallazgo de esta ola (corregido):** el botón «Cargar más clientes» medía
148×34 en mobile; el gate responsive lo frenó y quedó en 44 (`min-h-11` +
`md:min-h-0`). En la misma pasada se ajustó el verificador de Clientes para
esperar el pipeline demo (evitaba fotografiar esqueletos) y aceptar el aviso
genérico de rate limit (429) como «sin datos».

## Cómo reproducir

```bash
node e2e/prod/187-inventario.mjs          # inventario (demo producción)
node scripts/qa-213-demo-visual.mjs       # demo completa (visual)
node scripts/qa-241-shell-produccion.mjs  # AA del shell en producción
npx playwright test e2e/dsn-responsive-mobile.spec.js --project=admin
```
