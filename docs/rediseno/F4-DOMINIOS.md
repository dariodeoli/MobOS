# F4 · dominios v2: pedidos, clientes y finanzas (#241)

Segundo paso del rollout F4, detrás del flag `preview v2`: además de heredar
los tokens del shell (paso anterior), las tres pantallas suman los patrones del
mock F3 —chips tipo pill, números de consola y el azul de acción en los activos
internos—. **El default no cambia** (`TEMA_V2_POR_DEFECTO = false`): con el
flag apagado todo queda como está hoy.

## Qué cambia (solo con el flag)

| Patrón | Default | Con `preview v2` | Dónde |
|---|---|---|---|
| Chips de estado | caja redondeada | **pill**, con micro-rótulo (mayúscula + tracking) donde la columna da lugar | filas de pedidos y clientes |
| Activación interna | verde de marca | **azul de acción** (el mismo del ítem activo del shell) | filtros de pedidos, solapas de clientes y finanzas, pasos |
| Números | tabulares | tabulares con tracking de consola; los importes principales de las tarjetas suben un escalón | pedidos, clientes y finanzas |
| Badges | caja redondeada | pill (el chip neutro en oscuro usa texto de primer nivel: el gris quedaba en 4.14:1) | finanzas (caja, conciliación, reportes) |

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

Muestra con el flag **apagado** (default intacto, mismo estado de datos):
[pedidos](c241f4b-pedidos-off-claro-desktop.png) ·
[clientes](c241f4b-clientes-off-claro-desktop.png) ·
[finanzas](c241f4b-finanzas-off-claro-desktop.png).

## Medición

`e2e/dsn-241-dominios.spec.js` recorre las tres pantallas con el flag prendido
en los cuatro combos: **0 textos de shell por debajo de AA** y **0 bajos de
contenido** (el chip neutro en oscuro se ajustó a partir de esta medición).
`e2e/dsn-241-a11y.spec.js` sigue cubriendo el shell, el cajón móvil y el aviso
sin conexión.

## Próximos pasos del rollout

- Pedido abierto y ficha de cliente (detalle): heredan tokens y chips; su
  propio paso de patrones queda para el siguiente lote.
- Carrito POS: espera la guarda de CMP (declarado en el plan F4).
- Promover este bloque y los tonos AA al scope `tema-v2` de `owncoding-ui`
  (CMP) y retirar el scope local.
