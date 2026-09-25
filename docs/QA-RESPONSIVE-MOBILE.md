# Auditoría responsive mobile — POS y pantallas clave

Pedido de Dario (issue **#249**): verificar la responsividad mobile del POS y
las páginas clave —inventario, pedidos, clientes, finanzas, demo y
landing/portal— y corregir lo que falle, a **360 / 390 / 414 px** y tablet.
Este documento es el registro de la auditoría, de los fixes P1/P2 de la primera
pasada y del **cierre del 25/09/2026** (segunda vuelta + gate).

## Cómo se mide

- **Panel** (POS, inventario, pedidos, clientes, finanzas, acceso del demo y
  vista previa de la landing): `e2e/dsn-responsive-mobile.spec.js` (proyecto
  `admin`; 4 anchos + modal a 390 + oscuro a 390 por pantalla). En cada
  combinación mide:
  1. **scroll horizontal** del documento (`scrollWidth − innerWidth`);
  2. **elementos cortados**: cajas visibles que se salen del viewport, sin
     contar las que viven dentro de un contenedor con scroll propio;
  3. **targets < 44 px**, con el **área táctil efectiva**: si el control
     expande su zona con `::after` (patrón `.toque-44`), se mide esa área y no
     la caja dibujada;
  4. **modal principal** de la pantalla a 390.
- **Landing en producción**: `scripts/qa-responsive-landing.mjs` (misma
  medición contra `moboss.online`; en local `/` cae al acceso y por eso su
  vista previa se audita en el spec).
- Capturas y datos crudos: `docs/qa/responsive-mobile/antes/` (pre-fix) y
  `docs/qa/responsive-mobile/despues/` (post-fix). Los conteos son indicativos:
  las secciones perezosas varían el total entre corridas.

## Resultado de la primera pasada (antes → después)

| Pantalla | Scroll H | Cortados | Targets < 44 px (360/390/414/768) |
|---|---|---|---|
| POS (con carrito en 390) | 0 px | 0 | 9/14/14/19 → **5/10/10/12** |
| Inventario | 0 px | 0 | 71/71/71/81 → **64/64/64/71** |
| Pedidos | 0 px | 0 | 14/–/14/17 → **1/–/9/9** |
| Clientes | 0 px | 0 | 61/61/61/66 → **53/53/53/55** |
| Finanzas (Caja) | 0 px | 0 | 30/15/30/37 → **2/9/9/22** |
| Demo (acceso) | 0 px | 0 | 3/3/3/3 → **3/3/3/3** |
| Landing | 0 px | 0 | 9/9/9/11 → **7/7/7/9** |

Los modales auditados (“Ventas suspendidas”, “Recibir unidad”) entran en 390
sin cortes ni scroll propio, antes y después.

## Fixes de esta pasada (P1/P2)

| Hallazgo | Fix aplicado | Efecto medido |
|---|---|---|
| **H1 (P1) Topbar del shell** | Utilidad **`.toque-44`** (pseudo-elemento centrado de `max(100%, 44px)`, sin cambiar el dibujo) aplicada por CSS a **todos los botones del `header`**; el hueco del grupo de acciones en mobile pasa de 6 a **8 px** para que las áreas no se solapen | Los controles del topbar (menú, notificaciones, acciones, tema, ayuda, salir, sucursal y buscar) dejan de aparecer como targets chicos **en todas las pantallas** (5–8 controles menos por pantalla) |
| **H3 (P2) Chips/segmentados compartidos** | `SegmentedField` y `Subtabs` con **`min-h-11`** (44 px visibles); `ListGridToggle` crece dibujado a **44×44** (sus botones están pegados: con `.toque-44` las áreas se solaparían) | Finanzas: 30/15/30/37 → **2/9/9/22** (las solapas de sección ya cumplen) |
| **H5 (P2) Landing** | CTA **“Probar demo”** con `min-h-11` (44 px) | Landing: 9/9/9/11 → **7/7/7/9**; quedan los botones de texto (H6) |

Medición: el auditor ahora cuenta el **área táctil efectiva**, así el “después”
refleja la zona real de toque y no la caja dibujada.

## Cierre #249 — 25/09/2026

Segunda pasada de DSN sobre lo que quedaba del issue, con las entregas de
INV/CRM/POS ya en `main`: se midieron las **superficies que faltaban**, se
aplicó el patrón a los controles que seguían por debajo de 44 y el spec pasó de
informe a **gate**.

### Gate

`e2e/dsn-responsive-mobile.spec.js` ahora **falla** si aparece scroll
horizontal, un elemento cortado, un botón del topbar del shell sin área de 44 o
un **control clave** por debajo de 44 (menú de tres puntos y sus ítems). Corre
en el proyecto `admin` y quedó **9/9 en verde** (8 pantallas × 4 anchos + modal
+ oscuro + las 4 superficies de la segunda vuelta).

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  npx playwright test e2e/dsn-responsive-mobile.spec.js --project=admin
```

### Resultado (mobile, targets < 44 px)

| Pantalla | 360 | 390 | 414 | 768 |
|---|---|---|---|---|
| POS | 4 → **1** | 5 → **1** | 5 → **1** | 10 → 10 |
| Inventario | 2 → **1** | 2 → **1** | 2 → **1** | 66 → **9** |
| Pedidos | 9 → **1** | 9 → **1** | 1 → **1** | 9 → 9 |
| Clientes | 8 → **1** | 8 → **1** | 8 → **1** | 10 → **4** |
| Finanzas | 1 → **1** | 1 → **1** | 1 → **1** | 16 → 15 |
| Demo | 3 → 3 | 3 → 3 | 3 → 3 | 3 → 1 |
| Portal público (pedido) | 0 | 0 | 0 | 0 |
| Landing | 7 → **6** | 7 → **6** | 7 → **6** | 9 → 8 |

El **portal público** (la página que el cliente abre desde el enlace o el QR del
pedido) entró al gate con esta pasada: 0 scroll, 0 cortados y 0 targets chicos
en los cuatro anchos, sin fixes.

Scroll horizontal y elementos cortados: **0 en todas las combinaciones**, antes
y después. Lo que queda en mobile es el pie “Desarrollado por Owncoding” y los
enlaces de texto del demo/landing (**H6**, ver abajo): en los 768 conviven con
la densidad de escritorio de las tablas, que va dentro de un contenedor con
scroll horizontal propio y por eso ya no se cuenta como target mobile.

### Superficies de la segunda vuelta (390)

| Superficie | Hallazgo | Ahora |
|---|---|---|
| Menú de tres puntos (shell) | ítems dibujados de **36** de alto | **230×44** dibujados (sin solapes; el disparador ya medía 44 efectivos) |
| Bloqueo / PIN | ya cumplía (input de **181×66**) | sin cambios; capturas en la evidencia |
| Detalle de pedido | Archivar 34 y Regenerar acceso QR 30 | **44 en mobile**, compacto desde 768 |
| Ficha de unidad | cerrar × 36, copiar IMEI 22, Consultas IMEI 28, adjuntar foto 30 | **≥44** (×/copiar con `.toque-44`, el resto con el alto del `Button`) |

### Fixes de esta pasada

- **Shell / compartidos**: ítems del menú de tres puntos e íconos varios del
  flujo (patrón `min-h-11` + `.toque-44`); botones **×** del `Modal` y el
  `Drawer` compartidos con área efectiva de 44 (arregla todas las pantallas).
- **POS**: “Analytics”, “Ventas suspendidas” y “Suspender venta” (el `h-9`
  pisaba el alto mobile del `Button`), “Nuevo producto”.
- **Pedidos**: chips de filtro, “Actualizar” y la **fila de pedido** (42 → 44).
- **Clientes**: encabezados ordenables (20 → 44 mobile), “Copiar teléfonos”,
  “Exportar CSV” de la barra de lote y del encabezado.
- **Inventario**: “Exportar CSV”; **Certificaciones**: “Solo pendientes” y
  “Exportar CSV”. **Productos**: “Exportar CSV”.
- **Landing**: logo del encabezado con área efectiva de 44.
- **Medición**: las casillas se miden por el `<label>` que las envuelve (el
  target real del toque); los controles `sr-only` y los que viven dentro de una
  tabla con scroll horizontal quedan fuera del conteo de targets, igual que el
  criterio de “cortados”.

Evidencia: `docs/qa/249-cierre-responsive/antes/` (medición previa a los fixes,
incluido el menú con ítems de 36) y `.../despues/` (gate verde). Cada carpeta
lleva las capturas por pantalla y el JSON crudo de la auditoría.

## Patrón para POS / INV / CRM / FIN (y la biblioteca)

1. **Acciones de ícono** (topbar, herramientas densas): sumar **`.toque-44`**.
   El dibujo y el layout no cambian; el toque llega a 44×44. Vale cuando el
   vecino más cercano está a **≥8 px** (si no, ver el punto 3).
2. **Chips y filtros de texto**: **`min-h-11 px-3`** o directamente el objeto
   compartido `SegmentedField` (ya sale con 44). Es el caso “el control se
   agranda de verdad”.
3. **Grupos pegados** (toggle lista/cuadrícula, segmentados sin gap): **no**
   usar `.toque-44` (las áreas se solaparían y el toque ambiguo cae siempre en
   el hermano posterior); ahí el botón crece dibujado (`h-11 w-11`) o el grupo
   se separa a ≥8 px.
4. **Filas de tabla**: si la fila es el target (`role="button"`), ≥44 de alto;
   las acciones por fila van con `.toque-44` o se agrupan en un menú en mobile
   (definición para el lote de POS/INV/CRM/FIN).
5. **Checkboxes**: envolverlos en `<label>`/botón con 44 px de área (H4).

**Decisiones de patrón (respuesta a CMP, #249):**
- `min-h-11` va en **todos los breakpoints**, no solo mobile: la app es
  touch-first (POS/mostrador, tablets) y el criterio cubre tablet; la densidad
  de escritorio se resuelve con `.toque-44` en los controles chicos, no
  bajando el alto de los segmentados.
- En grupos con botones adyacentes, **sin solape**: se agranda el control
  dibujado o se separa a ≥8 px.

## Estado de los hallazgos

- **H1 (P1) Topbar** ✅ cerrado en la primera pasada; el gate lo cuida (todos
  los botones del `header` con área efectiva de 44).
- **H2 (P1) Acciones por fila** ✅ cerrado: INV y CRM en sus ramas, POS en la
  suya (carrito y cobros) y esta pasada sumó “Nuevo producto”, la fila de
  pedido, el menú de tres puntos y los controles de la ficha y el detalle.
- **H3 (P2) Chips y segmentados** ✅ cerrado (`SegmentedField`/`Subtabs` con
  `min-h-11` + usos locales de POS/CRM; esta pasada sumó los filtros de Pedidos).
- **H4 (P2) Checkboxes** ✅ cerrado en INV/CRM (label de 44) y la medición ahora
  los mide por su label.
- **H5 (P2) Landing** ✅ CTA del demo en 44; esta pasada sumó el logo del
  encabezado.
- **H6 (P3) Links de texto** ⏳ **decisión de Dario**: crédito del pie, “Volver
  a la landing”, “Copiar enlace”/“Regenerar” del detalle de pedido y los enlaces
  de texto de la landing. Hoy no se tocan.
- **Superficies de la segunda vuelta** ✅ medidas: menú desplegado, bloqueo/PIN,
  detalle de pedido y ficha de unidad (capturas y JSON en la evidencia).
- **Portal público** ✅ medido e incorporado al gate: la página del pedido que
  abre el cliente no tiene scroll, cortes ni targets chicos.
- **Configuración (7 grupos)** ✅ incorporada al gate tras #253: los 7 grupos
  miden 0 scroll y 0 cortes a 360/390/414/768, y el barrido destapó tres fixes
  táctiles en las secciones (Editar nombre, Copiar prompt y Actualizar de
  Auditoría), que quedaron en 44. En mobile solo queda el enlace H6 de crédito.
- **Demo (local)** ✅ verificada con los fixes aplicados: POS con carrito,
  Pedidos, Clientes, Inventario y Finanzas + el menú de tres puntos desplegado,
  a 360/390/414/768. 0 scroll y 0 cortes; el botón «Cómo funciona» del banner
  demo pasó de 22 a 44 en esta pasada y mobile queda solo con el enlace H6.
  Evidencia: `docs/qa/249-cierre-responsive/demo-antes/` y `.../demo-despues/`.

## Plan

1. ~~Pos/inv/crm/fin: patrón en acciones por fila y checkboxes.~~ ✅
2. **CMP**: la utilidad `.toque-44` y el `min-h-11` de segmentados ya viajan a
   la biblioteca; falta la regla de “sin solape en grupos pegados”.
3. ~~Assertions: el spec pasa de informe a gate.~~ ✅ Falla por scroll, cortes y
   controles clave < 44.
4. **Producción**: correr `scripts/qa-responsive-landing.mjs` después del
   próximo deploy para dejar la verificación de la landing contra el host real.

## Lo que ya está bien (para no tocarlo)

- **Cero scroll horizontal** y **cero elementos cortados** en todas las
  combinaciones medidas (panel y landing).
- Los **modales** entran en el viewport de 390 sin cortar contenido.
- El **acceso del demo** es la pantalla más limpia (solo enlaces de texto).
