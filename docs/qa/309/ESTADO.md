# #309 · POS: orden de trabajo, densidad y feedback (auditoría del demo v1.0.209)

## El pedido (issue #309)

- Producto y búsqueda antes que el resto.
- Cliente colapsado a una línea tras seleccionarlo.
- Carrito fijo a la derecha en escritorio; en móvil, Total + acción principal fijos abajo.
- Evitar repetir el total en header y carrito; total más destacado.
- Gift cards · Analytics · Suspendidas a herramientas o «Más».
- Feedback visible al imprimir, guardar o enviar (toast/estado).
- Diferenciar carrito privado (por vendedor) de carrito guardado compartido.
- Soporte: venta en tránsito, asignación anticipada, reserva vinculada al lote entrante,
  aviso al llegar, cambio de color/capacidad propuesto por Compras y aceptado por Ventas.

**Criterio**: el flujo de venta se completa sin scroll cruzado y con confirmación visible de
cada acción.

## Qué se hizo (FE de ventas)

| Punto | Cambio |
|---|---|
| Producto primero | `PasoProductos`: el bloque **Productos** (buscador + catálogo) va antes del bloque **Cliente**; el cliente define la lista de precios pero ya no encabeza la pantalla. |
| Cliente en una línea | `CheckoutCustomer`: con la ficha elegida (o al ligarse sola por nombre exacto) el bloque se lee en **una línea** (nombre, documento, teléfono, mayorista/lista/crédito, factura a otro) con **Editar datos** y **× Quitar**; el formulario completo (contacto, direcciones, facturación) queda detrás de «Editar datos». |
| Carrito fijo (escritorio) | `PasoCarrito`: `lg:sticky lg:top-24` — el carrito queda clavado a la derecha mientras se recorre el catálogo; el cobro sigue debajo en la misma columna. |
| Total + acción fijos (celular) | `PasoCobro`: barra fija al pie (`pos-barra-accion`) con **Total**, **Carrito (N)** y el botón principal (mismo submit del formulario); `VistaCargarVenta` pierde la barra superior que duplicaba el total. |
| Total una sola vez | El total dejó de repetirse en la franja del encabezado (`ResumenVenta`, que ahora muestra «Esta venta · N productos · N unidades · Descuento/Entrega · Tu día») y vive **más destacado** en el pie del carrito (`carrito-total`, `text-3xl`); en el celular también en la barra fija. |
| Herramientas en «Más» | Gift cards, Analytics y Ventas suspendidas salen de la barra del módulo y viven en el menú **Más** (`pos-mas`); «Suspender venta» queda a mano junto al flujo. |
| Feedback visible | Guardar ya confirmaba con el aviso de venta registrada; se suman avisos al **imprimir** (toast «Comprobante abierto» + los del comprobante) y al **enviar** (WhatsApp del seguimiento y del enlace público); copiar el enlace ya avisaba. |
| Carrito privado vs compartido | El estado vacío del carrito y el modal de Ventas suspendidas explican la diferencia (privado de la sesión vs compartido con el equipo, con quién lo creó/retomó). |
| En tránsito (POS) | La guía de líneas bloqueadas suma **Llega en tránsito**: la línea queda `sobrePedido` + `enTransito` (chip «En tránsito», `data-estado="en-transito"`), el pedido viaja con `backorder`, `enTransito` y `asignacionAnticipada`, y la fila permite destildarlo. |

### Dependencias de otros dominios (reportadas, no implementadas acá)

- **INV**: vincular la reserva al **lote entrante** (cantidad/fecha/estado del tránsito), el
  **aviso al llegar** y la conciliación de la reserva anticipada al recibir. El POS ya marca la
  intención (`enTransito` + `asignacionAnticipada` en la línea) y la muestra; falta que Inventario
  la lea y la cierre.
- **INV/Compras**: el **cambio de color/capacidad propuesto por Compras y aceptado por Ventas**
  vive del lado del abastecimiento (propuesta del lote) y de la ficha/orden (Ventas); no hay
  contrato de datos todavía.
- El backend de pedidos hoy ignora los campos nuevos de la línea (los guarda el flujo existente
  como **sobre pedido**): si INV los necesita persistidos, hace falta la columna y su migración.

## Evidencia

- e2e `e2e/pos-309-orden.spec.js` (5): orden producto→cliente + cliente en una línea con «Editar
  datos»; carrito sticky y total único; barra fija del celular (Total + acción) y sin barra
  superior duplicada; herramientas bajo «Más» con sus modales; línea «en tránsito» (chip + payload
  `backorder/enTransito/asignacionAnticipada` + `stockPending`); confirmación visible al guardar e
  imprimir.
- Specs actualizados por el cambio de layout: `pos-checkout` (total en el carrito, «Editar datos»
  para facturar, herramientas en «Más»), `pos-resumen-fijo` (barra fija del celular en vez de la
  superior), `pos-148-cobro-ux` (franja sin total + barra fija), `pos-qa-173` (total del carrito),
  `inventario-unidades` (total del carrito), `demo-anonimo` (herramientas en «Más»), `demo-crm` y
  `pos-precios-lista` (cliente en una línea).
- Capturas antes/después: `docs/qa/309/<etiqueta>/` (sonda `scripts/qa-309-pos-orden.mjs`):
  arranque del POS, carrito fijo + total único, barra del celular y menú «Más», en claro/oscuro y
  desktop/mobile.
