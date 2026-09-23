# F4 · dominios v2: pedidos, clientes, finanzas, servicio/garantías, resumen/análisis, compras y configuración (#241)

Pasos del rollout F4, detrás del flag `preview v2`: además de heredar los
tokens del shell (paso anterior), las pantallas suman los patrones del mock F3
—chips tipo pill, números de consola, azul de acción en los activos internos,
stepper del taller, tiles de KPI, el "x de y" de recepción y los tiles de
rol/acceso—. **El default no cambia** (`TEMA_V2_POR_DEFECTO = false`): con el
flag apagado todo queda como está hoy.

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
[roles](c241f4b-roles-off-claro-desktop.png).

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

## Medición

`e2e/dsn-241-dominios.spec.js` recorre las **once pantallas** con el flag
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
- Lote C completo: los **tiles de equipo** del inventario (la tabla y la ficha
  ya tienen los tokens del piloto).
- Dominios que faltan: Públicas y Prints (lotes G y H del plan); los hallazgos
  de contraste del default (hero verde y encabezados de tabla) quedan para una
  pasada del default.
- Promover este bloque y los tonos AA al scope `tema-v2` de `owncoding-ui`
  (CMP) y retirar el scope local.
