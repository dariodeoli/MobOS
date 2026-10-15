# Tanda 9: verificación de integración

## Novedades para el dueño
- Los botones de cobro indican cuándo están disponibles y aceptan el primer toque habilitado, sin registrar pagos duplicados.
- Productos, Compras y Taller conservan filas compactas y botones fáciles de tocar.
- Stock mantiene legibles sus estados y fechas en ambos temas; sus controles de color tienen mayor superficie táctil.
- Clientes permite editar y abrir acciones con controles del tamaño adecuado.

## Evidencia de frontend
Auditoría inicial de navegación, POS, ventas y clientes: 227 escenarios, 188 aprobados y 39 fallos investigados. Se corrigieron errores reales del guard temporal de cobro, controles pequeños y densidad de filas. Los tests desactualizados se adaptaron al carrito móvil actual, fixtures monetarios coherentes y truncado permitido únicamente para SKU/proveedor con tooltip; los importes y los IMEI reales conservan sus verificaciones completas. Cada caso fallido se volvió a ejecutar en su conjunto afectado y pasó.

QA independiente aprobó las matrices de Stock claro/oscuro y las filas de Productos, Compras y Taller (≤48px con controles44px). El último fallo de fechas de vendidos en oscuro se corrigió con el color secundario adaptativo existente y pasó en375/768/1280/1440. Se conservan las pruebas existentes de contraste≥4.5 y geometría; no se relajaron umbrales.

Cobro móvil: siete escenarios de envío real o fallido aprobados; dos regresiones deterministas a320/390px verifican con teclado que a349ms la acción siga deshabilitada, a350ms esté disponible y la primera activación produzca exactamente un envío. El árbol accesible expone el botón y su estado disabled; no sustituye una prueba física con VoiceOver.

Puertas locales anteriores a integrar backend393/433:1485 unitarios frontend aprobados;330 backend aprobados y1salto condicional SQL; builds y Prisma aprobados; lint sin errores, una advertencia previa en DeliveryOperations. Harness HTTP completo aprobado. Los cambios posteriores de backend requieren volver a ejecutar sus puertas antes de publicar.

Responsividad de suministro y QR/IMEI: ver docs/QA-COMPRAS-450-396.md. Taller/Productos/Comparador: ver docs/QA-396-responsive.md. Cámara simulada; no acredita lectura óptica en un teléfono físico. La cobertura revisada no representa el cierre global de todos los criterios de396/370.

## Pagos y permisos (#393/#433)
La edición de políticas exige la cuenta propietaria real vinculada al perfil activo, dentro de la empresa de sesión. QA independiente aprobó los negativos de rol, empresa, perfil y membresía, y la escritura auditada en una transacción. La matriz de políticas públicas y editor aprobó10 escenarios a 360/390/1440, en ambos temas cuando aplica.

Correcciones tardías: reversión y pagos nuevos con fecha actual, cobrador original y motivo/actor auditados; cierre anterior intacto y conteo sin otra venta. La revisión encontró una carrera concreta con el cierre de caja, que se corrigió compartiendo un bloqueo transaccional por empresa/sucursal/cobrador entre apertura, cierre y corrección; la clasificación y la fecha se calculan después. La fecha queda fuera del corte inclusivo del último cierre.

La regresión HTTP de consumidores pasó156 comprobaciones, incluidas cuatro carreras observadas con barreras SQL (ambos órdenes, turno de origen antiguo con otro vigente y apertura sin fila vigente). El harness HTTP completo terminó con exit 0: políticas 22, correcciones 67+156, conciliación de esperados con signo, reportes 764 y consistencia de datos 99 aprobados. Las sesiones sintéticas usan vencimiento UTC; los 401 de sesión inválida se distinguen de los 403 por permisos. El último oráculo de auditoría calcula en JavaScript desde filas crudas; el CI final debe ejecutar también esa actualización.

## Retornos del acceso (#491)
El control de dependencias identificó rutas `next`/`volver` controladas desde query que aceptaban barras invertidas hacia otro origen. App y Login usan ahora el guard común, que rechaza rutas de red, barras invertidas y controles. Las notificaciones aplican además su validación de origen MobOS y el mismo guard. Tres regresiones fallaron antes del arreglo y 20 unitarios pasaron después; 5 escenarios frontend comprobaron rechazos y rutas válidas con query/hash. QA independiente aprobada. La dependencia React Router 6.30.4 sigue teniendo avisos; no se declara resuelta la alerta de la biblioteca mediante este guard.

## Base de identidades fiscales (#345)
Se ejecutó de forma aislada `node --test backend/tests/billing-identity-default.test.mjs`:3 aprobados,0 fallidos. Reproduce la ruta nueva y la antigua, verifica la reparación dos veces, conserva cada fila y fecha, reproduce la reversión y repara de nuevo, y comprueba los escritores Prisma. El proceso crea y elimina su propio clúster; no hereda credenciales ni URLs reales. Esta prueba no acredita importadores SQL externos ni respaldos de producción.

## Publicación
Builds frontend/backend y Prisma aprobados; 1490 unitarios frontend y 330 backend aprobados (un salto condicional de SQL). Smoke conjunto: 19 aprobados al primer intento. Pendiente CI protegido, deploy y smoke de producción. Este informe no afirma todavía producción229 ni un nuevo build de TestFlight.

## Criterios finales antes del merge
#489: teclado y árbol accesible a320/390px aprobados (2 escenarios, reloj349/350ms, un solo envío). Se conserva el ensayo físico con VoiceOver como límite de la evidencia automatizada.
#433: se agregan alias /p/:slug/politicas y detalle en ambas ramas de rutas, manteniendo la vista y enlaces canónicos. La prueba de app cubre360/1440; el ensayo exploratorio de hostname portal falló en el proxy Vite antes de cargar React y no se cuenta como aprobación de ese hostname. Los cuatro Route comparten PoliticasPublicas y fueron revisados.

## Ampliación final de responsividad y demo
La demo nueva contiene 60 teléfonos. QA independiente comparó con reloj fijo las 24 unidades originales completas y comprobó que una sesión guardada conserva sus mutaciones sin escrituras ni reset. Pruebas relacionadas: 60 aprobadas; reportes y pantallas de demo: 6 aprobadas. Los trackers globales #350/#461 no se cierran sin cotejar todos sus criterios.

Páginas de cliente #403: 66 casos nuevos aprobados (8 vistas por 3 anchos y 2 temas, acceso restringido de Producto, acciones, errores y pantalla/impresión), 27 regresiones previas y 22 unitarios relacionados. QA independiente aprobó los cambios. El informe mejora solo en pantalla; impresión conserva tamaño y ajuste anteriores. Los contratos completos de API, contacto/marca y routing real del hostname de Entrada siguen siendo límites explícitos. El contrato aislado del carrito público pasó 24 comprobaciones y ahora lo ejecuta el arnés de integración.

#492: se reprodujo la ausencia del ícono en Vender cuando falta una foto. FotoProducto se monta siempre con su fallback de categoría; el nombre conserva todo el ancho móvil y precio/stock pueden envolver sin cambiar valores. Matriz de 6 escenarios a 320/390/1440 en ambos temas y regresión de fotos incluidas dentro de 49 casos completos de POS aprobados. La prueba de densidad distingue fotos reales de iconos; no se quitó el límite de altura. QA de fuente aprobada; no equivale a instalar el siguiente build en un teléfono.

El CI de 89447282 detectó cuatro selectores antiguos de Taller/Comparador. Se adaptaron al menú vigente y al nombre accesible del color, preservando las comprobaciones funcionales; los cuatro casos pasaron en su base aislada. La publicación quedó detenida y requiere CI nuevo del SHA final. Fuente final: 1490 unitarios frontend aprobados, lint sin errores con una advertencia previa, build frontend aprobado.

El último shard del CI anterior detectó otros 15 recorridos que abrían Taller por la barra anterior. Se adaptaron al helper del menú vigente y todos pasaron localmente al primer intento (15/15, 0 reintentos), con contraste, contadores, avance e historial intactos. Junto con los cuatro casos del otro shard quedan 19 fallos investigados y revalidados. El arnés detuvo su clúster y servidor propios al terminar.
