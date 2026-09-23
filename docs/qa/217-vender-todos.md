# «Vender todos» del inventario → POS (#217/§8)

Cierra el ítem que quedaba abierto de la épica de inventario (#215): la acción
masiva **Vender todos** carga la venta en el POS y el vendedor solo revisa y cobra.

## Cómo funciona

- Con unidades seleccionadas, la barra del lote muestra **Vender todos** (primera
  acción, con tooltip «Cargar la venta de todas las seleccionadas en el POS»).
- Se agrupan las unidades **disponibles** por producto: una línea por producto con
  `cantidad` + los **IMEI** de cada unidad y el **precio de lista** de la ficha.
- Antes de navegar se refresca el catálogo (`refrescar()`): el POS arma el carrito
  con el espejo local y así aparecen también los productos recién ingresados.
- Usa el contrato de POS `prepararVentaDesdeInventario({ empresaId, sucursalId, items })`
  (`src/lib/posCart.js`) y navega a `/pos`; el POS levanta el carrito al montar
  (`leerCarritoInicial`) y lo limpia al guardar la venta.
- Las unidades que no están disponibles (reservadas, en revisión, en tránsito) no
  se venden: si quedaron en la selección, se avisa cuántas quedaron fuera.

## Verificación

- e2e `e2e/inventario-unidades.spec.js` › *vender todos deja el lote elegido en el
  POS con producto, cantidad e IMEI*: 3 unidades propias del spec, se eligen 2,
  se pulsa **Vender todos** y en `/pos` queda **1 línea** con **cantidad 2**, los
  **dos IMEI** en el detalle y el total **6.000.000** (2 × 3.000.000 de lista).
- El carrito de prueba se limpia al final para no contaminar otros specs.

## Pendiente

- Nada de este ítem. La venta real la sigue cobrando el POS (no se adelanta stock:
  al confirmar la venta el backend descuenta las unidades por IMEI).
