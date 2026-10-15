# Tanda 9: verificación de integración

## Novedades para el dueño
- Los botones de cobro indican cuándo están disponibles y aceptan el primer toque habilitado, sin registrar pagos duplicados.
- Productos, Compras y Taller conservan filas compactas y botones fáciles de tocar.
- Stock mantiene legibles sus estados y fechas en ambos temas; sus controles de color tienen mayor superficie táctil.
- Clientes permite editar y abrir acciones con controles del tamaño adecuado.

## Evidencia de frontend
Auditoría inicial de navegación, POS, ventas y clientes: 227 escenarios, 188 aprobados y 39 fallos investigados. Se corrigieron errores reales del guard temporal de cobro, controles pequeños y densidad de filas. Los tests desactualizados se adaptaron al carrito móvil actual, fixtures monetarios coherentes y truncado permitido únicamente para SKU/proveedor con tooltip; los importes y los IMEI reales conservan sus verificaciones completas. Cada caso fallido se volvió a ejecutar en su conjunto afectado y pasó.

QA independiente aprobó las matrices de Stock claro/oscuro y las filas de Productos, Compras y Taller (≤48px con controles44px). El último fallo de fechas de vendidos en oscuro se corrigió con el color secundario adaptativo existente y pasó en375/768/1280/1440. Se conservan las pruebas existentes de contraste≥4.5 y geometría; no se relajaron umbrales.

Cobro móvil: siete escenarios de envío real o fallido aprobados; regresión determinista adicional verifica que a349ms la acción siga deshabilitada, a350ms esté disponible y el primer toque produzca exactamente un envío.

Puertas locales anteriores a integrar backend393/433:1485 unitarios frontend aprobados;330 backend aprobados y1salto condicional SQL; builds y Prisma aprobados; lint sin errores, una advertencia previa en DeliveryOperations. Harness HTTP completo aprobado. Los cambios posteriores de backend requieren volver a ejecutar sus puertas antes de publicar.

Responsividad de suministro y QR/IMEI: ver docs/QA-COMPRAS-450-396.md. Taller/Productos/Comparador: ver docs/QA-396-responsive.md. Cámara simulada; no acredita lectura óptica en un teléfono físico. La cobertura revisada no representa el cierre global de todos los criterios de396/370.

## Base de identidades fiscales (#345)
Se ejecutó de forma aislada `node --test backend/tests/billing-identity-default.test.mjs`:3 aprobados,0 fallidos. Reproduce la ruta nueva y la antigua, verifica la reparación dos veces, conserva cada fila y fecha, reproduce la reversión y repara de nuevo, y comprueba los escritores Prisma. El proceso crea y elimina su propio clúster; no hereda credenciales ni URLs reales. Esta prueba no acredita importadores SQL externos ni respaldos de producción.

## Publicación
Pendiente del árbol final, CI protegido, deploy y smoke. Este informe no afirma todavía producción229 ni un nuevo build de TestFlight.
