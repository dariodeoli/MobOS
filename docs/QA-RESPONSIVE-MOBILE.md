# Auditoría responsive mobile — POS y pantallas clave

Pedido de Dario (issue **#249**): verificar la responsividad mobile del POS y
las páginas clave —inventario, pedidos, clientes, finanzas, demo y
landing/portal— y corregir lo que falle, a **360 / 390 / 414 px** y tablet.
Este documento es el registro de la auditoría **y de los fixes P1/P2 de la
primera pasada**.

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

## Resultado (antes → después de esta pasada)

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

## Hallazgos que siguen abiertos

- **H2 (P1) Acciones por fila**: inventario (costo 14×14, verificar 24×24,
  acciones 28×28, editar 47×30), clientes (resumen rápido 36×36 ×22, WhatsApp
  32×32, plantilla 16×20) y carrito POS (“Nuevo producto” 30 px, “Vaciar
  carrito” 26 px, fila IMEI 20 px, eliminar 28×28). Dueños: **POS / INV / CRM**
  con el patrón de arriba.
- **H4 (P2) Checkboxes** de inventario y clientes (16×16 sin área ampliada).
  Dueños: **INV / CRM**.
- **H6 (P3) Links de texto** (crédito del pie, “Volver a la landing”):
  **confirmar con Dario** si el criterio de 44 px aplica al texto en línea.
- Superficies del POS que faltan medir (segunda vuelta): cobros y split,
  entrega, teclado, menú de tres puntos desplegado y pantalla de bloqueo/PIN;
  más el detalle de pedido y la ficha de unidad con checklist en mobile.

## Plan

1. **POS / INV / CRM / FIN**: aplicar el patrón a acciones por fila y
   checkboxes (H2/H4), con capturas antes/después por pantalla.
2. **CMP**: la utilidad `.toque-44` y el `min-h-11` de segmentados ya viajan a
   la biblioteca; falta la regla de “sin solape en grupos pegados”.
3. **Assertions**: con los fixes de dominio, el spec pasa de informe a gate
   (sin scroll, sin cortes y targets ≥44 en los flujos principales). Hoy la
   única aserción es que la auditoría corra completa en cada combinación.

## Lo que ya está bien (para no tocarlo)

- **Cero scroll horizontal** y **cero elementos cortados** en todas las
  combinaciones medidas (panel y landing).
- Los **modales** entran en el viewport de 390 sin cortar contenido.
- El **acceso del demo** es la pantalla más limpia (solo enlaces de texto).
