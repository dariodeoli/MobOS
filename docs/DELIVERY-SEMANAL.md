# Reparto: tarifas, viajes y cierre semanal (#394 / #395)

La pestaña **Entregas → Viajes y cierres** convive con asignación y rendiciones.
Los honorarios del repartidor son independientes de `Order.deliveryPyg` (lo que
paga el cliente por envío). Registrar un viaje o avisar al grupo no crea pedidos,
ventas, pagos, movimientos de caja ni ingresos.

## Tarifas explícitas

El dueño real guarda nombre, inicio y fin inclusivos de vigencia, y entre 1 y
28 tramos ordenados por km. El último cubre 28 km. Cada precio es el honorario
por un viaje en ese tramo, no un precio por km acumulable. No hay seeds ni
precios predeterminados. Cero requiere guardarlo explícitamente. No se admiten
vigencias activas superpuestas por empresa. Para corregir precios se desactiva
la versión con motivo y se guarda otra; los viajes anteriores conservan su foto.

## Viajes y entregas sin venta

Un registro representa uno o varios viajes realizados de la misma ruta/línea,
fecha, distancia y repartidor (1–100 viajes; distancia >0 y hasta 28 km, hasta 3
decimales). La tarifa vigente se congela en cada registro. El pedido es opcional.
El dueño debe resolver cada viaje sin venta: vincularlo a un pedido existente de
la misma empresa/sucursal, o descartarlo con motivo. Descartar conserva el
registro y excluye sus honorarios. El circuito no crea una venta automáticamente.

Los viajes no dueños se limitan a su sucursal; los vendedores a pedidos propios
(o viajes sin pedido que registraron) y los repartidores a sí mismos/pedidos
asignados. Un identificador de otra empresa/sucursal nunca sirve para vincular.
La cola Sin venta se filtra en el servidor; al resolver 200 pendientes se puede
actualizar para continuar con los siguientes.

## Semana y dinero

La semana empieza el lunes y termina el domingo según `America/Asuncion`. Solo
se cierran semanas terminadas, por empresa+sucursal+repartidor. El cierre es
único e idempotente. Después no se agregan viajes ni se resuelven los incluidos;
las correcciones son ajustes con motivo, actor, fecha y clave de operación.

- Honorarios: suma de las fotos de viajes completados y vinculados.
- Cobros: cada `Payment` del repartidor se incluye una vez por fecha de cobro,
  aunque su pedido tenga múltiples viajes. No se multiplica por viajes.
- Sin rendir: cobros `PENDING`; `CONFIRMED` ya están entregados/verificados en la
  tienda y `REJECTED` no producen deuda.
- Saldo = honorarios − sin rendir + ajustes firmados. Positivo: empresa debe al
  repartidor; negativo: repartidor debe a la empresa. Los valores son Gs enteros.

El cierre guarda una **foto inmutable** de viajes, tarifas y cobros, con su saldo
original. Se permite cerrar con deuda. El **saldo actual** se calcula con esos
mismos IDs y sus estados actuales: una rendición verificada después reduce la
deuda; un rechazo la elimina. Sus IDs permiten seguir el cambio hasta el pago y
la rendición original. La foto y el saldo original no se reescriben. Un pago que
se borre externamente conserva su foto en el cálculo y genera un aviso; no se
perdona deuda silenciosamente. No se vuelven a registrar ingresos.

## Permisos y auditoría

Tarifas, cierre, ajustes y resolución sin venta requieren una pertenencia OWNER
activa de la cuenta vinculada al perfil vendedor de la sesión actual. Ser ADMIN
o conocer la contraseña compartida no basta. Ajustes y resoluciones exigen un
motivo de 3–500 caracteres. Las operaciones y sus actores quedan en auditoría.
No se cambia el circuito previo de rendición/verificación de cobros.

La migración es aditiva, reejecutable, sin tarifas iniciales; conserva las tablas
y registros de rendiciones previos. La demo informa que no configura tarifas
reales, sin confirmar acciones ficticias.

## Verificación del área

La suite `npm --prefix backend run test:unit` incluye
`backend/tests/delivery-operations.test.ts`. El flujo HTTP/UI de
`e2e/delivery.spec.js` cubre vigencia, 28 km, tarifas sin seed, honorarios congelados,
multiviaje/cobro único, permisos, tenancy/sucursal, vínculo/descarte sin ventas,
concurrencia e idempotencia, foto inmutable, rendición/rechazo posterior y ajuste.
Usar las variables aisladas `MOBOS_E2E_*` al correrlo desde worktrees.

`e2e/frontend/delivery-scope.frontend.spec.js`, con
`--config=e2e/nav-v2.frontend.config.js`, mantiene montada la instancia y demora
un refresh manual antes de cambiar empresa, usuario o sucursal. Comprueba que
filas, tarifas, pedidos, equipo y permisos anteriores no vuelven al contexto
nuevo. También demora una mutación de la empresa anterior, con éxito o error,
mientras guarda la nueva: no debe cerrar su modal, mostrar avisos, disparar
refresh ni alterar su bloqueo. Todas las cargas y finalizaciones se ligan a
una generación invalidada al cambiar contexto y al desmontar.

## Novedades para el dueño

- Podés guardar los honorarios de delivery por distancia y vigencia, sin precios inventados.
- Registrás varios viajes de una misma ruta y ves cuánto corresponde al repartidor.
- Cerrás cada semana con sus cobros y deudas, conservando la foto original y el saldo actualizado.
- Corregís saldos y resolvés viajes sin venta con un motivo que queda registrado.
- Al cambiar de empresa, sucursal o usuario, las respuestas anteriores no mezclan sus datos ni interrumpen lo que estás guardando.
