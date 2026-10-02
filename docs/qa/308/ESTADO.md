# #308 · POS: venta segura (variante obligatoria, IMEI obligatorio y cobro con carrito)

## El pedido (issue #308)

Hallazgos de la auditoría del demo v1.0.209:

1. Al agregar un producto con «2 variantes», el POS elegía una sola sin preguntar.
2. El botón «Listo» del selector de IMEI quedaba habilitado sin elegir unidad ni marcar
   «vender sin IMEI».
3. Se podían agregar pagos y canjear gift cards con el carrito vacío.

**Criterio**: no se puede cerrar una venta ambigua ni cobrar un carrito vacío.

## Qué se hizo

1. **Variante obligatoria** (`SelectorVariante.jsx` + `PasoProductos`): cuando la familia tiene más
   de una variante, la tarjeta ya no agrega la primera: abre el selector
   (`data-testid="selector-variante"`, una opción por variante con modelo/capacidad/color, SKU,
   precio y stock). El carrito no cambia hasta que el vendedor elige; la tarjeta avisa «elegí la
   variante».
2. **IMEI con decisión explícita** (modal de IMEI en `FormularioVenta`): «Listo» queda deshabilitado
   hasta que la línea tenga una unidad exacta **o** esté marcada «vender sin IMEI» (sobre pedido);
   se muestra la razón (`imei-falta-eleccion`). Con stock la salida «sin IMEI» sigue bloqueada con
   su explicación (regla vigente); sin unidades disponibles —o en la demo— la marca explícita
   habilita el cierre. Cancelar (×/Escape) no decide nada y la línea sigue pendiente.
3. **Cobro solo con productos** (`PasoCobro`): con el carrito vacío, «+ Agregar pago»,
   «+ Canjear gift card» y «Dividir saldo» quedan deshabilitados con su aviso
   (`cobro-sin-productos`); el botón principal ya exigía productos. Al sumar el primero se
   habilitan.
4. **Traza de la decisión (auditada en el pedido)**: la venta sin unidad viaja como
   `backorder`/sobre pedido y el pedido la conserva (`serialsPending`/`stockPending`), visible en
   la lista y el detalle («sin IMEI (sobre pedido)» / «N sobre pedido»). No se agregó un evento de
   auditoría nuevo: si se quiere un registro explícito en la auditoría de la tienda, es un cambio
   del backend de pedidos (fuera del alcance FE de este slot).

## Evidencia

- e2e `e2e/pos-308-venta-segura.spec.js` (5):
  - la familia con 2 variantes abre el selector, el carrito queda vacío y la elección agrega la
    variante exacta (color en la línea);
  - el selector de IMEI no cierra sin elegir la unidad (con stock la salida «sin IMEI» está
    bloqueada y explicada) y la venta guarda el IMEI elegido;
  - en la demo, marcar «vender sin IMEI» habilita «Listo» y la línea queda «Sobre pedido»;
  - la salida explícita «sobre pedido» deja `stockPending = 1` en el pedido;
  - sin productos, pagos y gift cards quedan bloqueados y el botón principal deshabilitado.
- Specs ajustados por el nuevo contrato: `pos-148-s11-sin-stock` y `qa-263-imei-venta` (el modal
  se cancela con Escape cuando no hay decisión).
- Capturas: `docs/qa/309/<etiqueta>/` (sonda `scripts/qa-309-pos-orden.mjs`) suman
  `05-sin-productos`, `06-variantes` y `07-imei-bloqueado` en claro/oscuro y desktop/mobile,
  con las métricas de bloqueo en `resultados.json`.

## Notas para otros dominios

- **INV**: la reserva de una unidad (para el caso «no hay unidades disponibles, la salida es sin
  IMEI») atraviesa el selector de unidades; si se quiere que el POS pueda reservar una unidad
  puntual desde el modal, ya lo hace el selector (Reservar este). El caso «lote en tránsito» del
  #309 queda reportado ahí.
- **DSN/PLT**: la auditoría responsive (`dsn-responsive-mobile`) hoy marca el enlace del pie
  «Desarrollado por Owncoding» (14 px) como target < 44 en mobile: es del footer del shell, no de
  esta entrega.
