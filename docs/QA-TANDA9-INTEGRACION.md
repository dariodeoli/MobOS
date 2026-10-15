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

## Pagos y permisos (#393/#433)
La edición de políticas exige la cuenta propietaria real vinculada al perfil activo, dentro de la empresa de sesión. QA independiente aprobó los negativos de rol, empresa, perfil y membresía, y la escritura auditada en una transacción. La matriz de políticas públicas y editor aprobó10 escenarios a 360/390/1440, en ambos temas cuando aplica.

Correcciones tardías: reversión y pagos nuevos con fecha actual, cobrador original y motivo/actor auditados; cierre anterior intacto y conteo sin otra venta. La revisión encontró una carrera concreta con el cierre de caja, que se corrigió compartiendo un bloqueo transaccional por empresa/sucursal/cobrador entre apertura, cierre y corrección; la clasificación y la fecha se calculan después. La fecha queda fuera del corte inclusivo del último cierre.

La regresión HTTP de consumidores pasó156 comprobaciones, incluidas cuatro carreras observadas con barreras SQL (ambos órdenes, turno de origen antiguo con otro vigente y apertura sin fila vigente). El harness HTTP completo terminó con exit 0: políticas 22, correcciones 67+156, conciliación de esperados con signo, reportes 764 y consistencia de datos 99 aprobados. Las sesiones sintéticas usan vencimiento UTC; los 401 de sesión inválida se distinguen de los 403 por permisos. El último oráculo de auditoría calcula en JavaScript desde filas crudas; el CI final debe ejecutar también esa actualización.

## Retornos del acceso (#491)
El control de dependencias identificó rutas `next`/`volver` controladas desde query que aceptaban barras invertidas hacia otro origen. App y Login usan ahora el guard común, que rechaza rutas de red, barras invertidas y controles. Las notificaciones aplican además su validación de origen MobOS y el mismo guard. Tres regresiones fallaron antes del arreglo y20unitarios pasaron después;5escenarios frontend comprobaron rechazos y rutas válidas con query/hash. QA independiente aprobada. La dependencia React Router6.30.4 sigue teniendo avisos; no se declara resuelta la alerta de la biblioteca mediante este guard.

## Base de identidades fiscales (#345)
Se ejecutó de forma aislada `node --test backend/tests/billing-identity-default.test.mjs`:3 aprobados,0 fallidos. Reproduce la ruta nueva y la antigua, verifica la reparación dos veces, conserva cada fila y fecha, reproduce la reversión y repara de nuevo, y comprueba los escritores Prisma. El proceso crea y elimina su propio clúster; no hereda credenciales ni URLs reales. Esta prueba no acredita importadores SQL externos ni respaldos de producción.

## Publicación
Builds frontend/backend y Prisma aprobados; 1485 unitarios frontend y 330 backend aprobados (un salto condicional de SQL). Smoke conjunto: 19 aprobados al primer intento. Pendiente CI protegido, deploy y smoke de producción. Este informe no afirma todavía producción229 ni un nuevo build de TestFlight.
