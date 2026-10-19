# Facturación mediante proveedores externos

La tienda de módulos separa la futura capacidad en tres módulos de catálogo:

- **Facturación por API**: adaptadores para KudeExpress u otros proveedores.
- **Autofacturación**: flujo comercial para preparar y enviar los datos de una venta.
- **Facturación electrónica**: emisión, firma, CDC, SIFEN/DNIT y KuDE.

Los tres permanecen como **Próximamente** hasta contar con contrato, sandbox,
credenciales y validación fiscal. Ninguno se activa por un preset ni habilita
emisión real.

La ruta `POST /api/orders/:orderId/external-invoice` prepara una solicitud desde los datos guardados del pedido y la envía al adaptador configurado. El payload lleva nombre/razón social y RUC (obligatorios), dirección, correo y teléfono cuando están guardados, además de descripción, cantidad, precio unitario y total de cada línea. El pedido debe pertenecer a la tienda de la sesión y el usuario necesita `orders:manage`.

Cada pedido y proveedor conserva una sola operación. MobOS genera una clave SHA-256 estable por tienda, pedido y proveedor; todo adaptador real deberá enviar esa clave al proveedor y respetarla para que un reintento no duplique documentos. Se guardan el payload asociado, estado (`PENDING`, `ACCEPTED`, `FAILED`), identificador/número/enlace devueltos y eventos de auditoría sin datos personales en el log.

El simulador (`MOBOS_EXTERNAL_INVOICE_PROVIDER=simulated`) solo funciona fuera de producción. Su respuesta se devuelve como `SIMULATED`, no contiene número ni URL y nunca equivale a una factura fiscal. En producción la ruta queda deshabilitada hasta registrar un adaptador real y su configuración protegida. No se implementó ni se verificó integración de Abaco u otro proveedor, envío de correo al cliente, firma fiscal ni cumplimiento tributario; hacen falta contrato/API, credenciales, ambiente de pruebas y validación contable del proveedor.
