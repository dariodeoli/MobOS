# #485 · Adaptación móvil sobre el diseño MobOS

Se compararon las referencias Shopify IMG_1697/1699/1711/1719/1718 2.PNG con las capturas reales de MobOS en `outputs/app-store` (Vender y Pedidos), más el problema de Pagos de IMG_1739.PNG. Se conservaron los mosaicos, las hojas compartidas, el estilo y los comprobantes premium de MobOS.

## Cambios de presentación

- La barra existente del carrito usa la reserva inferior del shell (incluida el área segura) y admite que el importe completo pase a otra línea antes de desbordarse. Conserva cantidad y total.
- Las filas de Pedidos muestran número e importe, cliente, fecha/ubicación y dos estados separados de pago y entrega; los artículos siguen en el detalle. Conservan vista rápida, búsqueda y filtros.
- La confirmación muestra cliente y nota cuando el pedido los trae, mantiene vuelto y autorización pendiente, y ofrece comprobante/impresión, Ver pedido, Ver cliente cuando existe una ficha real y Nueva venta.
- Pagos/Cobrar usa `VentanaDetalle`, con resumen compacto Pagado/Pendiente, controles táctiles y sin el prefijo Gs duplicado. El selector muestra tipos de cuenta traducidos. Las cuentas reales, permisos, importes, conversiones y registro de pagos conservan sus funciones previas.
- El encabezado del pedido reúne navegación, comprobante y nueva venta en una fila de acciones táctiles. Devolver/postventa y Nota de entrega quedan en Más acciones, con archivo/anulación según permisos.
- Ver comprobante desde Pagos abre el `ComprobantePreview` compartido, también en demo. La instancia del detalle se reutiliza y Cobrar permanece montado para conservar los datos escritos. Las opciones de tipo/formato se ubican en el cuerpo para que el pie deje más espacio al documento; los nombres de los niveles se leen en móvil.

## Alcance verificado y límites

PASS: seis pruebas Playwright frontend-only cubren 360/390, claro/oscuro, separación de barra inferior, reserva segura, cliente/nota, importes completos, blancos táctiles y recorrido Pedidos → Cobrar → vista previa premium → Cobrar con el monto conservado. Se corrigió además el desmontaje del pedido cuando termina la búsqueda diferida: durante la recarga se conserva la última selección del mismo ID.

Validación: 30 pruebas focalizadas; suite frontend final (1454/1454), lint sin errores y build. Lint conserva una advertencia preexistente en DeliveryOperations.jsx:42. Se mantienen las reglas de stock/IMEI y los tests de cobro dividido/vuelto. No se copian datos, bancos ni imágenes de las referencias.

Límites: la barra de carrito permanece dentro del POS; no se extendió al shell ni a otras secciones. La confirmación se verificó con el componente real y datos de prueba, además de las pruebas existentes de POS; esta unidad no repitió el circuito backend real ni impresión física.

Los builders de comprobante de venta y recibo interno ya usan encabezado/pie comunes; no se reescribieron. No se afirma haber rediseñado cada documento del taller o abastecimiento: permanecen con sus propias pruebas y componentes. Esta unidad no cambia conciliación, reglas monetarias, backend, PIN/login, firma ni la compilación enviada a Apple.

## Novedades para el dueño

- En el celular, Pedidos muestra más información en menos espacio y separa lo cobrado de lo entregado.
- El carrito respeta el espacio inferior y al terminar ves el cliente, la nota y los próximos pasos.
- Cobrar y ver el comprobante usan las ventanas actuales; los importes ya no muestran Gs dos veces.
