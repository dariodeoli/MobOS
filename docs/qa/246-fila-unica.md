# Tabla de inventario: fila única y sin variante duplicada (#246)

Pedido de Dario (Ref #239): una sola línea por fila y sin la columna
«Modelo / variante» (la capacidad ya viaja en el nombre del producto).

## Qué cambió

- **Columna de variante eliminada** de la tabla (`EncabezadoUnidades` + la fila):
  la capacidad ya está en el nombre (`nombreProducto`) y la condición queda en el
  punto de color de la celda de producto (con su tooltip «Condición: …»).
- **Batería compacta**: el chip de salud pasa a la celda de producto (junto al
  serial), como pide la épica («batería compacta»), sin ocupar una línea propia.
- **Estado en una línea**: badge + «Garantía vencida/vigente» + cliente de la
  reserva + «Consignado» + fecha de venta como avisos inline (con tooltip para el
  detalle completo). Antes eran hasta 4 líneas apiladas.
- **Acciones en una línea**: en unidades reservadas la acción primaria es
  «Finalizar venta» (el acceso a editar queda en la ficha, que se abre con el
  clic en la fila). El resto suma «Editar» + menú.
- **Checkboxes**: `min-h-0` para que la regla global `input { min-height: 2.75rem }`
  (target táctil de 44 px) no estire la fila ni el encabezado.
- Grid nuevo: 55 rem mínimos (antes 66 rem) — entra más tabla sin scroll
  horizontal; los avisos del estado truncan con tooltip, nunca envuelven.

## Medición (demo, 23 filas, 1440 px)

| | Antes | Después |
|---|---|---|
| Alto de fila | 64–78 px (desparejas) | **44 px (todas iguales)** |
| Líneas por fila | 2 (variante + estado) | **1** |
| Columnas | 9 | 8 |

Capturas: `docs/qa/246-fila-unica/antes/` y `.../despues/`
(`tabla-completa.png`, `fila-1.png`, `fila-4.png`).

## Verificación

- e2e `inventario-unidades.spec.js` + `admin.spec.js` (inventario): **17/17**.
- e2e `demo-anonimo.spec.js` (la tabla del demo): **14/14**.
- La reserva sigue mostrando «Reservado» + «Finalizar venta» (`admin.spec.js`).
- Sin pérdida de datos: capacidad (nombre), condición (punto + tooltip), batería
  (chip), garantía/reserva/consignación/venta (avisos inline con tooltip).
