# MobOS v1.0.3

## Alcance

- Vendedor: venta, clientes, pedidos propios, productos, promociones y preparación de canjes; sin panel financiero del dueño.
- Vendedor de cada orden tomado de la sesión PIN, no del formulario.
- Cliente existente o alta con teléfono/dirección al confirmar, en la misma transacción de la orden real.
- Búsqueda visual de productos, precio base y descuentos manuales, por monto o porcentaje.
- Cupones por línea configurados por ADMIN, con vigencia, unidades máximas y validación transaccional contra catálogo. No acumulables con descuento global.
- Ficha de canje transferida al cobro; modelo, serial, condición y valor quedan vinculados al equipo recibido después de confirmar.
- Login Google y alta de empresa preparados; activación externa requiere credenciales privadas y callback autorizado. No se considera verificado con Google real hasta completar esa prueba.

## Verificación local

- Compilación frontend/backend.
- Suite HTTP con PostgreSQL desechable: autenticación, aislamiento, PIN, rollback, pagos concurrentes, caja, compras, garantías y 149 comprobaciones de cliente/checkout.
- Promociones: 36 comprobaciones de rutas y concurrencia.
- Google: 62 comprobaciones con proveedor simulado, no cuentas reales.
- Demo navegador: PIN 2001, carrito conservado entre apartados, alta de cliente, canje Gs 100.000 en venta Gs 220.000 (saldo Gs 120.000), equipo recibido visible para dueño y cupón DEMO10 (Gs 220.000 → Gs 198.000).

## Publicación y reversión

Publicar API antes del frontend. El arranque aplica migraciones antes de aceptar tráfico; las dos migraciones nuevas son aditivas. Verificar salud pública, rutas privadas con 401 y demo con versión v1.0.3. Si falla autenticación, persistencia o aislamiento, detener promoción y volver a la imagen anterior desde Hub; no revertir tablas ni borrar datos.

Demo usa almacenamiento local ficticio: no tiene la atomicidad entre pestañas de PostgreSQL y no sirve para operar ventas reales. El alta con Google no vincula automáticamente empresas preexistentes por coincidencia de correo.
