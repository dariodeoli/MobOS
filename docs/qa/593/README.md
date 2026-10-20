# #593 — edición explícita de variante del catálogo Apple

## Unidad preparada

Modelo, capacidad y color viven en `Product`, compartido por sus unidades. Esta unidad **edita explícitamente el catálogo completo del producto**, desde la ficha de una unidad; no reasigna un IMEI a otro SKU ni crea una variante implícita. El editor advierte el alcance y exige confirmar «todas las unidades de este producto». La API exige `variantScope: 'PRODUCT'` y registra ese alcance junto con antes/después en `INVENTORY_APPLE_VARIANT_UPDATED`.

Permisos: ADMIN/GERENTE, `products:manage`, tenant y restricción de sucursal del producto equivalentes a `PATCH /api/products`; además se conserva el alcance de sucursal de la unidad. Un vendedor, cajera, técnico o repartidor no recibe permiso por tener acceso al inventario. Los límites coinciden con el editor de producto: modelo80, capacidad20, color60. No se truncan textos ni se convierten objetos a texto.

El cambio no modifica stock, costo, IMEI/serial, condición, ubicación, sucursal, producto asignado ni estado físico. No actualiza `OrderItem` ni `Order.receiptSnapshot`. Una unidad seleccionada SOLD continúa rechazada; no se impone una prohibición adicional por unidades hermanas vendidas, porque la operación confirmada es de catálogo y los documentos emitidos conservan sus snapshots. La demo presenta esta edición como sólo lectura.

La repetición del mismo valor es un no-op sin escritura de Product ni auditoría duplicada; el bloqueo transaccional de la fila del producto serializa reintentos concurrentes. Un fallo HTTP mantiene el editor y sus datos para reintentar.

## Clasificación de dispositivos Apple

La API y el frontend reutilizan `backend/lib/apple-device.mjs`. Las categorías inferidas de `categoriasProducto` son de presentación: inferir WATCH desde una palabra no prueba marca Apple. La regla exige nombres/modelos de dispositivo con prefijo anclado y coherentes entre sí; rechaza categoría explícita de accesorio/servicio, accessoryCategory y marca declarada contradictoria. «Samsung Galaxy Watch» y «Correa Apple Watch» quedan fuera, incluso con categoría WATCH o modelo de compatibilidad Apple. Se admiten Apple Watch y las formas canónicas Watch Series/Ultra/SE. La variante propuesta también debe conservar esa identidad de dispositivo. No se agregan campos ni migraciones.

## Evidencia

- `backend/tests/inventory-apple-variant.mjs` está incorporado al arnés HTTP/PG sintético: consentimiento, roles, permiso de catálogo, sucursal, tenant de unidad/producto, Apple/genérico, AVAILABLE/RESERVED/SOLD, límites/tipos, no-op secuencial/concurrente, auditoría, campos físicos intactos y snapshots intactos.
- `e2e/qa-593-apple-variant.spec.js`: 2 PASS, 1440 y390px, cero flaky. Componentes reales, fixtures creados sólo en PG local y PATCH simulado 409/200: alcance explícito, payload emitido exacto, conservación del editor y reintento. No acredita backend real por esas respuestas simuladas; lo acredita el arnés anterior.
- Frontend: 1597 PASS. Backend: 347 PASS y1 skip. Prisma validate PASS. Lint: 0 errores,1 warning previo de DeliveryOperations. Builds frontend/backend PASS con BUILD_ID.

Gates PG/HTTP: arnés completo exit0, paridad de schema PASS, backup/restauración con69 productos y99 órdenes idénticos. Después de ampliar los negativos de tenant y reintentos concurrentes, se ejecutó nuevamente el prefijo del mismo arnés hasta `inventory-apple-variant.mjs`: exit0. Backend BUILD_ID=`NvIjVBlgApsyX17AfsDZ9`. Se usaron sólo clusters sintéticos propios y puertos aislados (UI PG5589/API3189/web5289); ambos arneses detuvieron sus propios recursos.

## Criterios de #593 que siguen pendientes

Esta entrega no completa #593. No implementa sincronización avanzada por sucursal/depósito, transferencias, reasignación/creación de SKU, ni alta/edición integral de condición/IMEI. No agrega estados nuevos: `SERVICE` **no existe** actualmente en `InventoryUnitStatus` (AVAILABLE, RESERVED, SOLD, DEFECTIVE, IN_TRANSIT); el test comprueba que enviar `status: 'SERVICE'` en la edición de catálogo no lo inyecta ni altera la unidad. Su semántica/transición requiere otra unidad de trabajo explícita.

El alcance móvil/web se prueba para este editor; demo queda sólo lectura. El recorrido completo de transferencias/stock unificado y demás criterios funcionales del issue siguen abiertos. Sin merge ni deploy.

## Novedades para el dueño

- La ficha permite corregir modelo, capacidad y color avisando que el cambio aplica a todo el catálogo de ese producto.
- El cambio exige permiso de edición de productos y confirmación explícita.
- Reintentar no duplica el cambio ni su historial; un error conserva lo cargado.
- La sincronización y transferencias del inventario Apple continúan pendientes.

### Revisión de falsos positivos Apple

Tras la revisión de #628 se repitieron builds/lint, frontend1597PASS, backend347PASS+1skip, UI2PASS (10,0s, cero flaky) y el gate PG/HTTP enfocado exit0 sobre el build final. Este último crea productos/unidades sintéticos para Samsung Galaxy Watch y Correa Apple Watch (409, sin cambio de color), y Apple Watch Series9 / Watch Series9 (200). También rechaza convertir el modelo de un iPhone en Samsung Galaxy Watch. El arnés completo anterior sigue como evidencia de regresión general; la regla de clasificación final se acredita con esta repetición enfocada.
