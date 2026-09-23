# #243 · Carrito ultra-colapsado + verificación post-deploy

## Qué se pidió (issue #243 + agregados de Dario)

- **Colapso máximo por defecto**: la línea colapsada muestra solo nombre/modelo,
  estado del IMEI y total de la línea (con el descuento individual visible,
  #148 §5) + chevron. **Cantidad y Precio de venta no aparecen colapsados**.
- **Al expandir**: cantidad, precio de venta, color/variante, precio de lista,
  descuento de línea, cupón, stock y eliminar.
- **Flechita**: abajo colapsada (desplegar), arriba expandida (cerrar).
- **Encabezado “Total de esta venta”** con color de marca, siempre arriba.
- **Rediseño** del carrito más limpio y menos alto, alineado al lenguaje v2
  cuando el preview está activo (#241).
- Criterios: la línea colapsada ocupa **la mitad o menos** que antes; capturas
  antes/después; e2e del flujo de venta; demo igual.

## Verificación post-deploy (producción v1.0.144)

Capturas del carrito tal como estaba desplegado (demo pública, desktop 1280):

| Estado | Captura | Alto de la línea |
|---|---|---|
| Colapsado | [`1.0.144-produccion/carrito-desktop-claro-v2-off-colapsado.jpg`](1.0.144-produccion/carrito-desktop-claro-v2-off-colapsado.jpg) | **248 / 249 px** |
| Expandido | [`1.0.144-produccion/carrito-desktop-claro-v2-off-expandido.jpg`](1.0.144-produccion/carrito-desktop-claro-v2-off-expandido.jpg) | 456 px |

Datos crudos: `1.0.144-produccion/resultados-1.0.144-produccion.json`
(sin desborde horizontal y sin errores de página).

## Después (rama `slot/pos`)

Capturas con el colapso máximo y el preview v2 en las dos direcciones
(claro/oscuro, desktop 1280 y mobile 390):

| Variante | Colapsado | Expandido | Alto colapsado |
|---|---|---|---|
| Desktop claro (v2 off) | [jpg](rama-243/carrito-desktop-claro-v2-off-colapsado.jpg) | [jpg](rama-243/carrito-desktop-claro-v2-off-expandido.jpg) | **58 px** |
| Desktop claro (v2 on) | [jpg](rama-243/carrito-desktop-claro-v2-on-colapsado.jpg) | [jpg](rama-243/carrito-desktop-claro-v2-on-expandido.jpg) | 58 px |
| Desktop oscuro (v2 on) | [jpg](rama-243/carrito-desktop-oscuro-v2-on-colapsado.jpg) | [jpg](rama-243/carrito-desktop-oscuro-v2-on-expandido.jpg) | 58 px |
| Mobile claro (v2 off) | [jpg](rama-243/carrito-movil-claro-v2-off-colapsado.jpg) | [jpg](rama-243/carrito-movil-claro-v2-off-expandido.jpg) | 58 px |
| Mobile claro (v2 on) | [jpg](rama-243/carrito-movil-claro-v2-on-colapsado.jpg) | [jpg](rama-243/carrito-movil-claro-v2-on-expandido.jpg) | 58 px |
| Mobile oscuro (v2 on) | [jpg](rama-243/carrito-movil-oscuro-v2-on-colapsado.jpg) | [jpg](rama-243/carrito-movil-oscuro-v2-on-expandido.jpg) | 58 px |

- **La línea colapsada pasó de 248 px a 58 px** (23% del alto anterior).
- Sin desborde horizontal (desktop y 390) y sin errores de página en las 6 variantes.
- El scope v2 se aplica solo con el flag `mobos:tema-v2` (verificado en las capturas
  `-v2-on` y en `resultados-rama-243.json`).
- Flechita y encabezado con color de marca: capturas `01-antes.jpg`, `02-despues.jpg`
  y `03-despues-expandida.jpg` (pasada previa, mismos criterios).

## Lenguaje v2 en el POS (flag `preview v2`)

- El POS hereda el scope `.tema-v2` del shell (F3) y suma los patrones v2:
  números grandes (`v2-numero`) en el total de la venta, el total del carrito,
  el total de cada línea y los tiles de cobro (total/pagado/pendiente).
- Capturas con el flag apagado/prendido en claro y oscuro, desktop y mobile
  (tabla de arriba). Inventario y ficha ya estaban cubiertos (#241).

## Cómo re-ejecutar la sonda

```bash
# Post-deploy en producción (demo pública, sin tocar datos reales)
QA_BASE_URL=https://app.moboss.online QA_ETIQUETA=1.0.145 node scripts/qa-243-carrito-colapso.mjs

# Contra un entorno local (worktree con el harness e2e levantado)
QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=local node scripts/qa-243-carrito-colapso.mjs

# Una sola variante
QA_VARIANTES=desktop-claro-v2-on QA_BASE_URL=... QA_ETIQUETA=... node scripts/qa-243-carrito-colapso.mjs
```

Salida: `docs/qa/243/<etiqueta>/carrito-*.jpg` +
`resultados-<etiqueta>.json` (altos, desborde, scope v2 y errores).

## Checks de la pasada

- `npm run lint` 0 errores · `npm test` 617/617 · build FE ✓ · `prisma validate` ✓
- e2e: `pos-checkout` (seller), `pos-qa-173` y `precios-listas` (admin) en verde;
  smoke del harness en verde.
- La demo pública se verificó con la sonda (sin errores de página).
