# F4 · dominios v2: pedidos, clientes, finanzas, servicio/garantías, resumen/análisis, compras, configuración e inventario (#241)

Pasos del rollout F4, detrás del flag `preview v2`: además de heredar los
tokens del shell (paso anterior), las pantallas suman los patrones del mock F3
—chips tipo pill, números de consola, azul de acción en los activos internos,
stepper del taller, tiles de KPI, el "x de y" de recepción, los tiles de
rol/acceso y los **tiles de equipo** del inventario—. **El default no cambia**
(`TEMA_V2_POR_DEFECTO = false`): con el flag apagado todo queda como está hoy.

## Qué cambia (solo con el flag)

| Patrón | Default | Con `preview v2` | Dónde |
|---|---|---|---|
| Chips de estado | caja redondeada | **pill**, con micro-rótulo (mayúscula + tracking) donde la columna da lugar | filas de pedidos y clientes |
| Activación interna | verde de marca | **azul de acción** (el mismo del ítem activo del shell) | filtros de pedidos, solapas de clientes y finanzas, pasos |
| Números | tabulares | tabulares con tracking de consola; los importes principales de las tarjetas suben un escalón | pedidos, clientes, finanzas y servicio |
| Badges | caja redondeada | pill (el chip neutro en oscuro usa texto de primer nivel: el gris quedaba en 4.14:1) | finanzas (caja, conciliación, reportes) |
| Stepper del taller | — | flujo Recepción → Diagnóstico → Reparación → Listo → Entrega con la carga por etapa | servicio |
| Tile de KPI | borde verde de marca | superficie de consola (borde propio, esquina 1rem) y número un escalón más | resumen y análisis |
| Resumen de compras | — | unidades por recibir, costo comprado y saldo por pagar con número de consola; "x de y" de recepción con barra en la fila | compras |
| Tiles de rol y equipo | borde verde de marca | **tiles de rol/acceso** (x de y de capacidades + dominios como chips) y fichas del equipo como tiles con importes de consola | configuración (equipo y roles) |
| Tiles de equipo | tarjeta con borde de marca | **tile de consola** (superficie propia, IMEI mono, chips pill de batería/ubicación/proveedor y costo con número de consola) en la vista cuadrícula | inventario |

En pedidos la grilla es fija y «Listo para retirar» en mayúsculas desbordaría su
columna: ahí el chip queda pill sin mayúscula; en clientes, con micro-rótulo.

Implementación: un bloque CSS en `src/index.css` dentro del scope `.tema-v2`
(más la marca `v2-chip` en el objeto `Badge`). **Sin lógica nueva, sin ramas y
sin cambios de datos**; se apaga con el flag o retirando el bloque.

## Capturas

Con el flag prendido, claro/oscuro en 1280 y 390:

| Pantalla | Claro 1280 | Oscuro 1280 | Claro 390 | Oscuro 390 |
|---|---|---|---|---|
| Pedidos | [claro](c241f4b-pedidos-on-claro-desktop.png) | [oscuro](c241f4b-pedidos-on-oscuro-desktop.png) | [claro](c241f4b-pedidos-on-claro-mobile.png) | [oscuro](c241f4b-pedidos-on-oscuro-mobile.png) |
| Clientes | [claro](c241f4b-clientes-on-claro-desktop.png) | [oscuro](c241f4b-clientes-on-oscuro-desktop.png) | [claro](c241f4b-clientes-on-claro-mobile.png) | [oscuro](c241f4b-clientes-on-oscuro-mobile.png) |
| Finanzas (Caja) | [claro](c241f4b-finanzas-on-claro-desktop.png) | [oscuro](c241f4b-finanzas-on-oscuro-desktop.png) | [claro](c241f4b-finanzas-on-claro-mobile.png) | [oscuro](c241f4b-finanzas-on-oscuro-mobile.png) |
| Servicio | [claro](c241f4b-servicio-on-claro-desktop.png) | [oscuro](c241f4b-servicio-on-oscuro-desktop.png) | [claro](c241f4b-servicio-on-claro-mobile.png) | [oscuro](c241f4b-servicio-on-oscuro-mobile.png) |
| Garantías | [claro](c241f4b-garantias-on-claro-desktop.png) | [oscuro](c241f4b-garantias-on-oscuro-desktop.png) | [claro](c241f4b-garantias-on-claro-mobile.png) | [oscuro](c241f4b-garantias-on-oscuro-mobile.png) |
| Resumen | [claro](c241f4b-resumen-on-claro-desktop.png) | [oscuro](c241f4b-resumen-on-oscuro-desktop.png) | [claro](c241f4b-resumen-on-claro-mobile.png) | [oscuro](c241f4b-resumen-on-oscuro-mobile.png) |
| Análisis · Reportes | [claro](c241f4b-analisis-reportes-on-claro-desktop.png) | [oscuro](c241f4b-analisis-reportes-on-oscuro-desktop.png) | [claro](c241f4b-analisis-reportes-on-claro-mobile.png) | [oscuro](c241f4b-analisis-reportes-on-oscuro-mobile.png) |
| Análisis · Ganancias | [claro](c241f4b-analisis-ganancias-on-claro-desktop.png) | [oscuro](c241f4b-analisis-ganancias-on-oscuro-desktop.png) | [claro](c241f4b-analisis-ganancias-on-claro-mobile.png) | [oscuro](c241f4b-analisis-ganancias-on-oscuro-mobile.png) |
| Compras | [claro](c241f4b-compras-on-claro-desktop.png) | [oscuro](c241f4b-compras-on-oscuro-desktop.png) | [claro](c241f4b-compras-on-claro-mobile.png) | [oscuro](c241f4b-compras-on-oscuro-mobile.png) |
| Config · Equipo | [claro](c241f4b-equipo-on-claro-desktop.png) | [oscuro](c241f4b-equipo-on-oscuro-desktop.png) | [claro](c241f4b-equipo-on-claro-mobile.png) | [oscuro](c241f4b-equipo-on-oscuro-mobile.png) |
| Config · Roles y permisos | [claro](c241f4b-roles-on-claro-desktop.png) | [oscuro](c241f4b-roles-on-oscuro-desktop.png) | [claro](c241f4b-roles-on-claro-mobile.png) | [oscuro](c241f4b-roles-on-oscuro-mobile.png) |
| Inventario · Tiles de equipo | [claro](c241f4b-inventario-tiles-on-claro-desktop.png) | [oscuro](c241f4b-inventario-tiles-on-oscuro-desktop.png) | [claro](c241f4b-inventario-tiles-on-claro-mobile.png) | [oscuro](c241f4b-inventario-tiles-on-oscuro-mobile.png) |
| Pedido (contenedor) | [claro](c241f4b-pedido-detalle-on-claro-desktop.png) | [oscuro](c241f4b-pedido-detalle-on-oscuro-desktop.png) | [claro](c241f4b-pedido-detalle-on-claro-mobile.png) | [oscuro](c241f4b-pedido-detalle-on-oscuro-mobile.png) |
| Cliente · resumen rápido | [claro](c241f4b-clientes-resumen-on-claro-desktop.png) | [oscuro](c241f4b-clientes-resumen-on-oscuro-desktop.png) | [claro](c241f4b-clientes-resumen-on-claro-mobile.png) | [oscuro](c241f4b-clientes-resumen-on-oscuro-mobile.png) |
| Finanzas · Conciliación | [claro](c241f4b-finanzas-conciliacion-on-claro-desktop.png) | [oscuro](c241f4b-finanzas-conciliacion-on-oscuro-desktop.png) | [claro](c241f4b-finanzas-conciliacion-on-claro-mobile.png) | [oscuro](c241f4b-finanzas-conciliacion-on-oscuro-mobile.png) |
| Finanzas · Cuentas | [claro](c241f4b-finanzas-cuentas-on-claro-desktop.png) | [oscuro](c241f4b-finanzas-cuentas-on-oscuro-desktop.png) | [claro](c241f4b-finanzas-cuentas-on-claro-mobile.png) | [oscuro](c241f4b-finanzas-cuentas-on-oscuro-mobile.png) |
| Público · Pedido | [claro](c241f4b-pedido-publico-on-claro-desktop.png) | [oscuro](c241f4b-pedido-publico-on-oscuro-desktop.png) | [claro](c241f4b-pedido-publico-on-claro-mobile.png) | [oscuro](c241f4b-pedido-publico-on-oscuro-mobile.png) |
| Público · Landing | [claro](c241f4b-landing-on-claro-desktop.png) | [oscuro](c241f4b-landing-on-oscuro-desktop.png) | [claro](c241f4b-landing-on-claro-mobile.png) | [oscuro](c241f4b-landing-on-oscuro-mobile.png) |

Muestra con el flag **apagado** (default intacto, mismo estado de datos):
[pedidos](c241f4b-pedidos-off-claro-desktop.png) ·
[clientes](c241f4b-clientes-off-claro-desktop.png) ·
[finanzas](c241f4b-finanzas-off-claro-desktop.png) ·
[servicio](c241f4b-servicio-off-claro-desktop.png) ·
[garantías](c241f4b-garantias-off-claro-desktop.png) ·
[resumen](c241f4b-resumen-off-claro-desktop.png) ·
[reportes](c241f4b-analisis-reportes-off-claro-desktop.png) ·
[ganancias](c241f4b-analisis-ganancias-off-claro-desktop.png) ·
[compras](c241f4b-compras-off-claro-desktop.png) ·
[equipo](c241f4b-equipo-off-claro-desktop.png) ·
[roles](c241f4b-roles-off-claro-desktop.png) ·
[tiles de equipo](c241f4b-inventario-tiles-off-claro-desktop.png) ·
[pedido](c241f4b-pedido-detalle-off-claro-desktop.png) ·
[resumen rápido](c241f4b-clientes-resumen-off-claro-desktop.png) ·
[conciliación](c241f4b-finanzas-conciliacion-off-claro-desktop.png) ·
[cuentas](c241f4b-finanzas-cuentas-off-claro-desktop.png) ·
[pedido público](c241f4b-pedido-publico-off-claro-desktop.png) ·
[landing](c241f4b-landing-off-claro-desktop.png).

## Servicio técnico y Garantías (lote E)

Además de heredar los patrones (chips pill, azul de acción y números), el
taller estrena el **stepper del flujo** del mock —Recepción → Diagnóstico →
Reparación → Listo para retirar → Entrega— con la carga de cada etapa y el paso
donde hay trabajo esperando marcado en azul; los importes del resumen
(Facturado / Costos / Utilidad) suben un escalón. El stepper agrupa los estados
reales del pipeline (los mismos que usa el botón de avance) y se dibuja **solo**
con el flag: sin la vista previa la pantalla queda igual. Garantías hereda el
lenguaje y suma su captura. Las capturas de las dos pantallas están en la tabla
de arriba y sus muestras apagadas, en la lista de abajo.

## Resumen y Análisis (lote A)

El tablero de entrada estrena los **tiles de KPI** del mock (superficie de
consola con borde propio y esquina más redonda) y los números de las métricas
suben un escalón en escritorio (24 → 30 px desde `sm`); los chips de tendencia
(↑/↓) pasan al objeto de chips (pill y tinte AA) y el hero y los pendientes del
día suman el número de consola. En Análisis, los KPI compartidos (`Stat`) y el
resultado de Ganancias llevan el mismo tratamiento.

La medición con degradados dejó al descubierto dos fallas que ya existían en el
hero verde (Resumen, POS y KPI destacado): los rótulos al 70–75 % sobre la
parada oscura del degradado quedaban en **4.33:1** en oscuro (y **3.2:1** en
claro, porque el degradado arranca en el verde oscuro). En v2 los rótulos van a
plena opacidad y la superficie usa el verde de marca con una caída suave: AA en
los dos temas. El default queda igual (se reporta como hallazgo).

## Compras (lote C)

La pantalla de compras suma el **resumen en tiles** —unidades por recibir, costo
comprado y saldo por pagar— con los números de consola, y en la fila expandida
el avance de recepción pasa a un **"x de y" con barra** (recibido / falta)
cuando la compra está parcial. Los chips de estado y los importes ya venían del
lenguaje común. Todo con el flag: sin la vista previa la pantalla queda igual.

## Configuración y Equipo (lote F)

La pantalla de **Equipo** pasa las fichas de los funcionarios a tiles de consola
(superficie con borde propio y esquina más redonda) con los importes del día y
del mes en número de consola; **Roles y permisos** estrena los **tiles de rol**:
por cada rol, el "x de y" de capacidades y los dominios habilitados como chips
(verde con acceso, gris sin acceso). La ficha plegable y la matriz de
capacidades quedan igual. La medición dejó dos hallazgos del tema claro que en
v2 quedan AA: el gris fijo de los encabezados de tabla (1.69:1) y el verde vivo
en los importes de las mini-tarjetas del equipo (2.14:1).

## Inventario: tiles de equipo (cierre del lote C)

La vista cuadrícula del inventario pasa sus tarjetas al **tile de equipo** del
mock: superficie de consola, estado como chip pill, IMEI en mono, batería,
ubicación y proveedor como chips y el costo con número de consola. La
verificación (avatar y fecha) queda como estaba. Se prende con el flag y la
vista se captura con la cuadrícula activada (`mobos:inventario-vista`).
Queda pendiente para cuando INV cierre los datos de la inspección (#240): el
**grado** grande y los **chips de locks** (iCloud/MDM) en el tile.

## Pedidos: resumen y stepper de entrega (segunda pasada)

La lista de pedidos suma el **resumen en tiles** —activos, por cobrar y en
reparto— con los números de consola, y el **contenedor del pedido** estrena el
**stepper del flujo de entrega** del mock: cuatro pasos por método (delivery:
Pendiente → Preparando → En camino → Entregado; retiro: Pendiente → Preparando →
Lista para retirar → Retirado), con el paso actual en azul y los ya cumplidos en
verde. Los pasos agrupan los estados reales de `entrega.js` (el mismo grafo que
valida el backend), así el stepper no inventa pasos que no aplican al método.
Las capturas son de la lista y del contenedor (claro/oscuro en 390/1280).

## Clientes: resumen de la lista y resumen rápido (segunda pasada)

La lista de clientes suma el **resumen en tiles** —clientes listados, con deuda
y saldo por cobrar— con los números de consola (saldo en ámbar cuando hay), y la
**captura del resumen rápido** de la fila (el ojito) queda en la evidencia. Los
chips de la fila, los importes y los filtros ya venían del lenguaje común (pill,
tinte AA, número de consola y el alto táctil de #249). Todo con el flag.

### Lote B: ficha del cliente y filas (tercera pasada)

La **ficha** entra al lenguaje: los KPI del Resumen pasan al **tile de consola**
(`v2-tile`) con sus números en `v2-numero` (Total gastado, Saldo pendiente,
Órdenes activas, Pedidos, Última compra y Garantías activas) y las filas de la
lista suman el ancho de consola en Pedidos/Total/Deuda junto al chip de tipo en
pill. Sin cambios de lógica: todo detrás de `temaV2Activo()`.

QA antes/después (`e2e/qa-241-clientes-v2.spec.js`, 8/8): lista y ficha en
claro/oscuro × desktop/mobile con el flag apagado y prendido, **0 textos bajo
AA** en los 4 combos v2 y **sin scroll horizontal**; capturas
`c241f4b-clientes-{lista,ficha}-{antes,despues}-{claro,oscuro}-{desktop,mobile}.png`.
Detalle: `docs/QA-241-clientes-lote-b.md`.

## Finanzas: tiles de caja y "x de y" de conciliación (segunda pasada)

La **Caja** pasa sus tarjetas neutras —saldo esperado, por cobrar, por pagar,
margen real y cheques pendientes— al tile de consola; los números ya llevaban el
tamaño grande del scope. **Conciliación** suma los tiles de consola en su
resumen y el **"x de y"**: una barra con los pagos conciliados sobre el total
del período (ámbar si falta alguno, verde si está al día). La captura dejó ver
un hallazgo preexistente que quedó corregido: los contadores del resumen
mostraban "undefined" antes de que llegaran los datos (ahora se normalizan a 0).

## Finanzas · Cuentas (cierre del lote D)

**Cuentas** (Bancos y cuentas) suma el **resumen en tiles** del mock —cuentas
activas, inactivas (ámbar cuando hay) y monedas en uso— con los números en
consola (`v2-numero`, un escalón más), y hereda el chip pill de estado
(Activa/Inactiva) y el azul de acción de las solapas. La tabla, el formulario y
las plantillas quedan igual.

Con esto el **lote D** (Caja, Conciliación, Cuentas) queda completo: los tres
con capturas claro/oscuro en 1280 y 390, la muestra con el flag apagado y
**0 textos por debajo de AA** en las cuatro combinaciones. El lote suma además
la verificación de **sin scroll horizontal del documento en 360/390/768/1440**
para las tres pantallas (`e2e/dsn-241-dominios.spec.js`), el criterio #3 del
plan.

## Públicas: pedido público y landing (lote G)
Las dos superficies públicas previsualizables entran al lenguaje v2 detrás del
flag: la **página del pedido** (`/pedido/:token`) y la **landing** (en dev,
`/landing-preview`), con el scope aplicado a su raíz (no heredan el del shell).
La medición de la landing dejó ver los **chips y medallas del mock** con fondo
de marca: al 10–15% y con los tonos de marca quedaban en 4.2–4.4:1 en claro; en
v2 usan el verde de texto del scope (ok en claro, verde claro en oscuro) y
vuelven a AA.

## Medición

`e2e/dsn-241-dominios.spec.js` recorre las **diecisiete pantallas** con el flag
prendido en los cuatro combos: **0 textos de shell por debajo de AA** y **0
bajos de contenido**. La medición entiende **degradados** (mide contra la peor
parada del fondo) y de ahí salieron los ajustes de los lotes anteriores: el chip
neutro en oscuro (4.14:1), los tintes de los chips de estado (verde 4.25:1 y
rojo 4.12:1 en oscuro), los rótulos del hero verde (4.33:1 en oscuro, 3.2:1 en
claro) y los encabezados/importes en claro de configuración (1.69:1 y 2.14:1).
`e2e/dsn-241-a11y.spec.js` sigue cubriendo el shell, el cajón móvil y el aviso
sin conexión.

Las capturas del spec van a `test-results/` (gitignore) para no ensuciar el
árbol en cada corrida; para refrescar la evidencia de `docs/rediseno` se corre
con `MOBOS_CAPTURAS=docs/rediseno`.

## Próximos pasos del rollout

- Pedido abierto y ficha de cliente (detalle): heredan tokens y chips; su
  propio paso de patrones queda para el siguiente lote.
- Carrito POS: espera la guarda de CMP (declarado en el plan F4).
- Dominios que faltan: Públicas y Prints (lotes G y H del plan); los hallazgos
  de contraste del default (hero verde y encabezados de tabla) quedan para una
  pasada del default, y el grado/locks del tile esperan los datos de #240.
- Promover este bloque y los tonos AA al scope `tema-v2` de `owncoding-ui`
  (CMP) y retirar el scope local.

## Paso 3 · tablero operativo (`/ops`)

El tablero de operaciones es la pantalla completa del rediseño (sin shell) y ya
está **activo**: `/ops` dejó de depender de `VITE_OPS_V2` con la aprobación del
rollout y `VITE_OPS_V2=0` sigue siendo la salida de emergencia sin tocar código.
Los patrones del paso 3, con datos reales (rack #240, pedidos y consultas IMEI):

| Patrón | Cómo se ve | Datos |
|---|---|---|
| **KPIs grandes** | Números de consola en `text-3xl` con su detalle al pie | cobrado hoy, pedidos, en taller y listos (`resumenOps`) |
| **Stepper del lote** | Tres tarjetas (por verificar → verificado → listo) con la carga de cada etapa; el paso con trabajo va en azul y los cumplidos con tilde | `pasosDelLote(resumen)` |
| **Tiles de equipo en proceso** | Alterna los que esperan verificación con los ya verificados (no solo la fila de entrada), con estado del rack, grado y batería | `equiposEnProceso` |
| **«x de y» del checklist** | «8 de 10 pasan» + barra y porcentaje por equipo (ámbar si hay fallas) | `checklistDe(unit)` sobre `inspection.items` |
| **Chips de locks** | iCloud/Find My, MDM, ESN/blacklist y carrier en verde/rojo; sin consulta, chip gris «Locks sin verificar» | `locksDeConsulta` con la última consulta IMEI del equipo (`/api/imei`) |

El tablero pide la última consulta IMEI solo de los equipos en proceso (hasta 6)
y solo cuando el serial es un IMEI de 15 dígitos: el backend ignora el filtro si
el IMEI no valida y devolvería consultas de otros equipos. La máscara del
registro (últimos 4 dígitos) se contrasta con el serial antes de mostrar chips, y
una consulta sucia pinta el chip en rojo (nunca «libre» sin dato).

Capturas: `c241f4b-ops-on-{claro,oscuro}-{desktop,mobile}.png` y
`c241f4b-ops-off-claro-desktop.png` (idéntica a la prendida: el tablero es v2 por
diseño y no depende del opt-out del panel). Medición AA: 35 textos por combo, 0
por debajo de AA en los cuatro combos.

Guarda: `e2e/dsn-241-dominios.spec.js` (proyecto admin) prepara un equipo con
consulta IMEI e inspección con fallas y mide el tablero; los helpers tienen tests
en `src/lib/opsTablero.test.js`.

La medición encontró un hallazgo: el chip verde del tile («Verificado») quedaba
en **4.46:1** en claro porque el tablero no vive bajo `.tema-v2` y no recibía los
tintes AA de los chips v2 (los tintes `/10`). Se aplicaron las mismas reglas a
`.v2-piloto` en `src/index.css` y el chip quedó en 4.74:1; los cuatro combos
vuelven a 0 textos por debajo de AA.
