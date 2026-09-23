# Auditoría responsive mobile — POS y pantallas clave

Pedido de Dario (issue nuevo, 23-09): recorrido a **360 / 390 / 414 px** y
**tablet (768)** del POS y las pantallas clave —inventario, pedidos, clientes,
finanzas, demo y landing—, con **capturas por pantalla** y una **lista de
hallazgos priorizada**. Este pase entrega la **auditoría**; los **fixes** van
después, coordinando con POS / INV / CRM / FIN lo de cada dominio.

## Cómo se hizo

- **Panel** (POS, inventario, pedidos, clientes, finanzas y acceso del demo):
  `e2e/dsn-responsive-mobile.spec.js` (proyecto `admin`; la corrida toca 4
  anchos + modal + oscuro por pantalla). En cada combinación mide:
  1. **scroll horizontal** del documento (`scrollWidth − innerWidth`);
  2. **elementos cortados**: cajas visibles que se salen del viewport, sin
     contar las que viven dentro de un contenedor con scroll propio (tablas
     anchas, carruseles);
  3. **targets < 44 px** en controles interactivos, agrupados por patrón;
  4. **modal principal** de la pantalla a 390 (encaje, cortados y targets).
- **Landing**: `scripts/qa-responsive-landing.mjs`, porque la landing se sirve
  en el host público (`moboss.online`) y en local `/` cae al acceso. Misma
  medición y capturas.
- Capturas: `docs/qa/responsive-mobile/<pantalla>-<ancho>.png`, más
  `-390-oscuro` y `-390-modal`. Datos crudos: `auditoria-<pantalla>.json`
  (los conteos son indicativos: las secciones perezosas pueden variar el total).
- Sesión: dueño de la tienda E2E. El **POS se audita con una línea en el
  carrito** en 390 (estado del mostrador); en los otros anchos, el inicio.

## Resultado por pantalla

| Pantalla | Scroll H | Cortados | Targets < 44 px (360/390/414/768) | Modal a 390 |
|---|---|---|---|---|
| POS (con carrito en 390) | 0 px | 0 | 9 / 14 / 14 / 19 | “Ventas suspendidas”: entra, sin cortes |
| Inventario | 0 px | 0 | 71 / 71 / 71 / 81 | “Recibir unidad”: entra, sin cortes |
| Pedidos | 0 px | 0 | 14 / 6 / 14 / 17 | — |
| Clientes | 0 px | 0 | 61 / 61 / 61 / 66 | — |
| Finanzas (Caja) | 0 px | 0 | 30 / 15 / 30 / 37 | — |
| Demo (acceso) | 0 px | 0 | 3 / 3 / 3 / 3 | — |
| Landing (producción) | 0 px | 0 | 9 / 9 / 9 / 11 | — |

**Los modales auditados entran en mobile** (sin cortes ni scroll horizontal
propio) y sus controles son los del objeto `Modal` compartido.

## Hallazgos priorizados

### H1 · Topbar del shell: botones de 36 px y selector de 34 px (P1)
Menú, notificaciones, “más acciones”, tema, ayuda y salir miden **36×36**; el
selector de sucursal y el botón POS, **34 px de alto**. Es el patrón más
repetido (todas las pantallas: POS, pedidos, finanzas, clientes, inventario).
El criterio pide **≥44 px**. Dueño: **DSN** (estilos del shell) con **PLT**
(estructura del topbar). Fix: área táctil de 44 sin cambiar el dibujo
(padding/`min-h-11` invisible) o agrandar en mobile.

### H2 · Acciones por fila en tablas densas (P1)
- **Inventario**: editar costo **14×14**, verificar **24×24**, “Acciones”
  **28×28**, “Editar” **47×30** (×10 filas). Dueño: **INV**.
- **Clientes**: “Resumen rápido” **36×36** (×22 filas), WhatsApp **32×32**,
  elegir plantilla **16×20**. Dueño: **CRM**.
- **POS**: “Analytics” **104×36** (×3); en el **carrito**, “Nuevo producto”
  **135×30**, “Vaciar carrito” **100×26**, la fila “Falta elegir IMEI”
  **99×20** y “Eliminar Cable USB-C E2E” **28×28**. Dueño: **POS**.
Fix sugerido (con DSN): área táctil de 44 con el mismo ícono, o agrupar las
acciones de fila en un menú único en mobile.

### H3 · Chips de filtros y solapas de 28–36 px (P2)
Pedidos **28**, inventario **32**, clientes **32** y finanzas **36**. Dueño: por
dominio (**POS**, **INV**, **CRM**, **FIN**) sobre los objetos compartidos
(`SegmentedField`, chips). Fix: alto mínimo 44 en mobile (o 40 con separación, a
definir con Dario).

### H4 · Checkboxes sin área táctil ampliada (P2)
Los selectores de lote de inventario y clientes son **16×16** y la celda que los
contiene no amplía el toque (el clic selecciona la fila). Dueño: **INV** /
**CRM**. Fix: envolver en `<label>`/botón con 44 px de área.

### H5 · Landing: CTA de 36 px y botones de texto de 17–20 px (P2/P3)
“Probar demo” (**120×36**) es la acción principal y queda corta; “Ver caso
pendiente” (**102×17**), “Otro ejemplo” (**84×17**) y “Ver cómo funciona”
(**278×20**) son botones de texto. Dueño: **DSN** (landing, lote G).

### H6 · Links de texto (P3, a confirmar)
El crédito del pie y “Volver a la landing” (demo) miden 15–20 px de alto. Son
enlaces dentro de un párrafo: el criterio de 44 px suele exceptuar el texto en
línea. **Confirmar con Dario** antes de tocarlos.

## Plan de fixes (siguiente pase)

1. **DSN**: topbar del shell (H1), alto de los chips/segmentados compartidos
   (H3) y la landing (H5), con capturas antes/después.
2. **POS / INV / CRM / FIN**: acciones por fila (H2) y checkboxes (H4) de su
   dominio, con el patrón que salga del punto 1.
3. **Assertions**: cuando los fixes entren, el spec pasa de informe a gate
   (sin scroll, sin cortes y targets ≥44 en los flujos principales). Hoy la
   única aserción es que la auditoría corra completa en cada combinación.

### Superficies que faltan medir (segunda vuelta del POS)

La primera pasada cubre POS (inicio + carrito con línea + modal de ventas
suspendidas), inventario, pedidos, clientes, finanzas, acceso del demo y
landing. Quedan por medir, como pedía el issue #249: **cobros y split**,
**entrega**, **teclado en pantalla**, **menú de tres puntos** desplegado y
**pantalla de bloqueo/PIN** (y el detalle de pedido y la ficha de unidad con el
checklist en mobile). Se suman a la herramienta en la próxima vuelta, con la
misma medición y sus capturas.

## Lo que ya está bien (para no tocarlo)

- **Cero scroll horizontal en las 28 combinaciones** (panel + landing) y
  **cero elementos cortados** en toda la auditoría.
- Los **modales** auditados entran en el viewport de 390 sin cortar contenido.
- El **acceso del demo** es la pantalla más limpia (3 targets, todos enlaces de
  texto) y el **POS con carrito** no suma cortes.
