# #461 · Fechas de las ventas demo

La demo usa el calendario `America/Asuncion`, independiente de la zona horaria del teléfono o computadora. Las semillas conservan sus horarios y datos; al generar ventas/pedidos y pagos para las pantallas, cualquier hora todavía no ocurrida se limita al instante actual. Una lectura captura un único reloj y puede recibir un `Date` explícito para pruebas. El historial de 120 días determina fines de semana/quincenas con el mismo calendario de Paraguay.

Pruebas deterministas en `src/lib/demo/reloj.test.js`: madrugada; medianoche UTC todavía en el día anterior de Paraguay; medianoche de Paraguay; último día de mes y año; inicio de año; febrero bisiesto; pagos/cuotas; coherencia POS/CRM; identidad, numeración, montos y estados sin cambios; diversidad de más de110días; equivalencia entre procesos UTC/Tokio/Los Ángeles. Se mantienen las pruebas previas de historial120 y datos consistentes. No modifica otros fixtures, funciones Apple/Google, interfaz, DB ni publicación.

## Novedades para el dueño

- Las ventas y cobros de la demo ya no aparecen con horas futuras, aunque la abras de madrugada.
- El calendario sigue el día de Paraguay y conserva el historial y los importes de la demo.
