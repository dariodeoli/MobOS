# MobOS Hub: mapeo de esquemas y plan de migración

## Alcance y fuentes

Este documento compara las migraciones SQL de `fono-mobile-store` con el esquema Prisma de `mobile-system` para definir la base de datos PostgreSQL de MobOS en OwnCoding Hub. Es un análisis de compatibilidad y orden de trabajo; no ejecuta migraciones ni modifica datos.

Fuentes revisadas:

- `supabase/migrations/20260911_mobtock_relational.sql`
- `supabase/migrations/20260911_mobtock_operations.sql`
- `mobile-system/prisma/schema.prisma`
- `docs/HUB_BACKEND_MIGRATION.md`

## Resumen ejecutivo

La migración no es un renombrado directo. Hay tres diferencias estructurales importantes:

1. **Identidad y tenant:** SQL usa `uuid`, `organizations` y `organization_users` ligados a `auth.users`; Prisma usa `cuid()`, `Tenant` y `User` propios.
2. **Inventario:** SQL separa el catálogo (`products`) de las unidades serializadas (`inventory_units`); Prisma representa cada equipo físico directamente como `Product` y usa `ProductModel` como catálogo.
3. **Cobertura funcional:** Prisma tiene caja, cheques, trade-in, delivery y transferencias; SQL tiene garantías, costos de importación más detallados, lotes, activos y soporte operativo de sesiones/presencia.

La recomendación es adoptar Prisma como modelo canónico de Hub, pero ampliar su modelo antes de cargar datos: conservar la separación catálogo/unidad del SQL o definir una transformación explícita, y agregar garantías, compras normalizadas, lotes, activos y controles de organización.

## Mapeo de entidades

| SQL / Supabase | Prisma / Hub | Tratamiento recomendado | Diferencia o riesgo |
|---|---|---|---|
| `organizations` | `Tenant` | Mapear 1:1 y conservar un mapa de IDs | `uuid` vs `cuid`; `settings` existe en ambos; Prisma agrega `logo` y `plan`. |
| `organization_users` | `User` | Transformar a usuario por tenant | SQL permite membresía compuesta; Prisma obliga `tenantId` en `User`. Roles y campos no coinciden; `auth.users` no tiene equivalente directo. |
| `customers` | `Customer` | Mapear con tabla de equivalencias | `document_id`/`document_type` vs `document`; SQL exige `name`; Prisma agrega tipo, ciudad, departamento y tags. La unicidad de documento puede cambiar por valores nulos. |
| `products` | `ProductModel` + `Product` | Dividir registros SQL por catálogo y variantes/unidades, según `tracking` | En SQL un producto tiene SKU, precio y condición; en Prisma `Product` exige `modelId`, color, IMEI, costo USD y precio PYG. No hay conversión segura automática para accesorios o servicios. |
| `inventory_units` | `Product` | Crear un `Product` por unidad serializada o introducir una entidad `InventoryUnit` en Prisma | El SQL separa unidad de catálogo; Prisma exige IMEI/SKU en todo producto y no soporta bien stock cuantitativo con el modelo actual. |
| `orders` | `Order` | Mapear pedido y derivar campos faltantes | SQL calcula `total_pyg` desde subtotal, descuento y entrega; Prisma recibe `totalPyg` explícito. `customer_id` y `seller_id` son opcionales en SQL pero obligatorios en Prisma. Estados y fulfillment difieren. |
| `order_items` | `OrderItem` | Mapear líneas; conservar `inventory_unit_id` en una relación nueva o tabla puente | Prisma permite `productId` nulo y descripción de servicios; SQL exige `productId` y no tiene descripción. Los descuentos por línea no se modelan igual. |
| `order_payments` | `Payment` | Mapear pagos y completar `method`/estado según reglas | SQL usa texto y monto entero; Prisma usa enums, `accountId`, comisión, liquidación y pagos programados. `financial_status` del pedido no tiene campo equivalente directo en Prisma. |
| `warranties` | Sin equivalente | Crear modelo Prisma antes de migrar | La garantía depende de `order_item`; `expires_at` es columna generada en SQL. Riesgo de perder cobertura y reclamos si se omite. |
| `suppliers` | `Import.supplier` | Normalizar proveedor y relacionarlo con compras | Prisma guarda sólo texto dentro de `Import`; SQL tiene proveedor reutilizable, datos de contacto y metadata. |
| `purchase_orders` | `Import` | Mapear cabecera y preservar número/estado/costos | No hay relación normalizada con proveedor ni detalle equivalente a `purchase_order_items`; Prisma usa `Float` USD, SQL usa `numeric` y `bigint` PYG. |
| `purchase_order_items` | `Import.items` JSON | Mantener temporalmente JSON y planificar normalización | El JSON pierde FK a producto, cantidades tipadas, lotes y fechas de vencimiento si no se valida durante la carga. |
| `inventory_lots` | Sin equivalente | Crear modelo sólo si habrá stock por lote | Riesgo funcional para accesorios, consumibles o productos con vencimiento. `tracking` en SQL permite `serialized`, `lot` y `quantity`; Prisma no lo expresa. |
| `exchange_rates` | `ExchangeRate` | Mapear con conversión de tipos | SQL guarda moneda base/cotizada, tasa y fuente; Prisma sólo tasa PYG/USD, usuario y fecha. Puede perder histórico multidivisa. |
| `order_shipments` | `Delivery` | Mapear parcialmente y ampliar `Delivery` | SQL está ligado 1:1 al pedido y admite proveedor, externo, cotización/costo final y metadata; Prisma agrega conductor, geolocalización y cobro contra entrega. |
| `product_assets` | `Product.image_url` / `TradeIn.photos` | Crear modelo de activos | Una URL única no conserva múltiples versiones, tipos, checksum ni aprobación. |
| `user_preferences` | Sin equivalente | Crear modelo opcional | Clave compuesta `(user, organization)`; no mezclar con `User.permissions`. |
| `user_sessions` | Auth del backend | No migrar como datos de negocio sin decisión de autenticación | SQL depende de `auth.users`; Prisma schema no define sesiones. Migrar hashes/sesiones sin conocer el proveedor sería inseguro. |
| `presence` | Sin equivalente | Excluir de la migración inicial | Estado efímero; no debe bloquear la carga histórica. |
| `identifier_lookups` | Sin equivalente | Crear sólo si se mantiene la integración | Respuestas externas y proveedor necesitan política de retención y privacidad. |
| `webhook_events` | Sin equivalente directo | Crear modelo operativo en Hub | Útil para idempotencia; conservar `provider` + `external_event_id` como clave única. |
| `audit_log` | `AuditLog` | Mapear y conservar JSON | SQL separa `before_data`/`after_data`; Prisma usa `details`. `actor_id`/`userId` y tipos de ID deben resolverse. |
| — | `TradeIn` | Mantener como módulo Prisma | No hay fuente equivalente en las migraciones SQL; no inventar filas. |
| — | `Transfer` | Mantener, pero enlazar a productos/unidades | Prisma guarda `product` como texto; no hay cantidad por unidad ni relación con inventario SQL. |
| — | `Account`, `Transaction`, `Cheque` | Mantener como módulo financiero | No existe equivalente en las migraciones SQL. Requiere reglas contables y conciliación, no un mapeo automático. |

## Diferencias transversales

### Identificadores y autenticación

Las FK SQL apuntan a `auth.users(id)` y usan UUID. Prisma genera IDs `cuid()` y modela `User` dentro de `Tenant`. No se debe copiar el ID textual sin comprobar longitud, formato y dependencias; conviene construir tablas de equivalencia para `organization`, `user`, `customer`, `product`, `order` y `order_item`.

### Dinero, moneda y precisión

SQL usa `bigint` para importes en PYG y `numeric(18,2)`/`numeric(18,6)` para valores monetarios y tasas. Prisma mezcla `Int` y `Float`. Los importes deben llegar a Hub como enteros PYG y `Decimal` para USD, costos, tasas y porcentajes; `Float` puede introducir diferencias de redondeo en conciliaciones.

### Inventario y stock

SQL permite una fila de catálogo con stock por unidad, lote o cantidad. Prisma trata `Product.imei` como obligatorio y asigna ubicación/estado a ese registro. Antes de migrar hay que decidir si MobOS conservará el modelo híbrido: catálogo + unidades serializadas + existencias cuantitativas. Sin esa decisión, accesorios, servicios, lotes y stock agregado quedan ambiguos.

### Estados y semántica

Los enums no son compatibles por nombre ni por significado. Ejemplos: SQL `completed` puede corresponder a Prisma `COMPLETED` o `DELIVERED` según fulfillment; SQL `received` para compras no es idéntico a Prisma `DELIVERED`; `inventory_status.repair` no equivale necesariamente a `IN_REPAIR`. El mapeo debe ser una tabla versionada y revisada por negocio, no una conversión automática por mayúsculas.

### Seguridad y aislamiento

Ambas propuestas son multiempresa y habilitan RLS en SQL, pero las migraciones dejan explícitamente las tablas cerradas hasta crear policies. Prisma no expresa RLS ni policies. El backend Hub debe imponer `tenantId` en cada consulta y probar aislamiento antes de habilitar escrituras; no se debe asumir que el schema Prisma sustituye el control de acceso.

## Riesgos de migración

1. **Pérdida o duplicación de inventario:** un `products` SQL puede generar catálogo, variante y varias unidades; una mala expansión puede duplicar stock o IMEI.
2. **Identidad rota:** cambiar IDs sin una tabla de equivalencias rompe pagos, garantías, auditoría y webhooks.
3. **Pérdida de precisión:** convertir `bigint`/`numeric` a `Float` puede impedir que totales y saldos cierren.
4. **Estados mal interpretados:** una conversión superficial puede marcar entregas como completadas, compras como recibidas o unidades como vendidas antes de tiempo.
5. **Relaciones obligatorias en Prisma:** pedidos SQL sin cliente o vendedor no pueden insertarse en `Order` sin una regla explícita de cliente genérico/vendedor sistema.
6. **Cobertura funcional incompleta:** garantías, lotes, proveedores normalizados, activos y exchange rates multidivisa no tienen destino completo en Prisma.
7. **Autenticación incompatible:** `auth.users`, PINs, sesiones y roles no se pueden migrar como si fueran campos de negocio; se necesita una estrategia de identidad y hash aprobada.
8. **Seguridad durante la transición:** RLS sin policies funcionales y un backend sin filtros por tenant pueden exponer datos entre empresas.
9. **Fuentes divergentes:** `mobile-system` puede evolucionar separado de las migraciones SQL; hay que congelar una versión de cada fuente antes de cargar datos.

## Orden recomendado

1. **Congelar y versionar fuentes.** Registrar commits exactos de ambos repositorios y exportar conteos por tabla; no modificar frontend/backend durante esta fase.
2. **Definir el modelo canónico de Hub.** Confirmar Tenant/User, autenticación, IDs, precisión monetaria y el diseño catálogo–unidad–lote.
3. **Ampliar el schema Prisma.** Prioridad: `InventoryUnit` o equivalente, `Warranty`, `Supplier`, `PurchaseOrder`/items, `ProductAsset`, `WebhookEvent` y `UserPreference`; decidir si `ExchangeRate` se vuelve multidivisa.
4. **Crear tablas de equivalencia.** Como mínimo: organización, usuario, cliente, modelo, producto/unidad, pedido, línea, pago y proveedor. Mantener los IDs de origen y destino, con fuente y fecha.
5. **Cargar maestros.** Tenants/organizaciones, usuarios, ubicaciones, modelos, productos, unidades, clientes y proveedores. Validar unicidad de slug, email, SKU, IMEI y documentos.
6. **Cargar operación comercial.** Importaciones/compras y lotes; luego pedidos, líneas, pagos, envíos y garantías. Cargar primero cabeceras y después dependencias.
7. **Cargar finanzas y módulos específicos.** Cuentas, transacciones, cheques, trade-in y transferencias sólo después de definir reglas de conciliación y referencias cruzadas.
8. **Reconciliar.** Comparar conteos, sumas de PYG/USD, stock por estado, IMEI únicos, pedidos por estado y relaciones huérfanas. Registrar excepciones sin corregir silenciosamente.
9. **Probar aislamiento y permisos.** Verificar cada rol y tenant con datos de prueba; revisar policies/RLS o filtros equivalentes del backend.
10. **Corte controlado.** Hacer backup, detener escrituras en la fuente anterior, ejecutar carga incremental final, validar smoke tests y recién después habilitar Hub como fuente de escritura.

## Criterios de salida

- Cero IMEI/seriales duplicados y cero relaciones huérfanas.
- Totales de pedidos y pagos conciliados contra la fuente, con diferencias documentadas.
- Stock por producto, estado, ubicación y lote explicado y aprobado.
- Todos los registros tienen tenant válido y las consultas cruzadas están bloqueadas.
- Garantías, importaciones, pagos, auditoría y delivery tienen destino definido; no quedan datos relevantes en JSON sin contrato.
- La migración es repetible o tiene checkpoints, y existe rollback por restauración de backup sin borrar la fuente original.

## Hallazgos concretos

- Se revisaron **2 migraciones SQL**: `20260911_mobtock_relational.sql` define **11 tablas** y `20260911_mobtock_operations.sql` agrega **11 tablas**, además de columnas, índices y enums operativos.
- El SQL define **22 sentencias de creación de tablas** en total; `products` se altera en la segunda migración, pero no se vuelve a crear.
- El SQL crea **11 enums** en total; Prisma define **19 enums**. Los nombres y valores no son compatibles de forma directa.
- Prisma contiene **18 modelos** persistentes: `Tenant`, `User`, `ProductModel`, `Product`, `Location`, `Customer`, `Order`, `OrderItem`, `Payment`, `TradeIn`, `Delivery`, `Transfer`, `Import`, `Account`, `Transaction`, `Cheque`, `ExchangeRate` y `AuditLog`. Su cobertura funcional es mayor en finanzas y trade-in, pero menor en garantías, lotes y activos.
- `orders.customer_id` y `orders.seller_id` son opcionales en SQL, mientras `Order.customerId` y `Order.sellerId` son obligatorios en Prisma. La carga necesita una política para ventas sin cliente o vendedor.
- `products` SQL permite producto sin SKU y usa `base_price_pyg`/`cost_price_pyg`; `Product` Prisma exige `modelId`, `color`, `imei`, `costUsd` y `pricePyg`. Esto impide un `INSERT ... SELECT` directo para accesorios, servicios y stock no serializado.
- `inventory_units` SQL tiene **una unicidad por organización e IMEI/serial** y estados explícitos; Prisma coloca IMEI/SKU directamente en `Product`. La decisión catálogo–unidad es el bloqueo técnico principal.
- SQL habilita RLS en las tablas de negocio y en las tablas operativas nuevas, pero las migraciones no contienen las policies finales. En Hub, el aislamiento por tenant debe probarse desde el backend y no darse por supuesto.
- `purchase_orders.landed_cost_pyg` y varios importes SQL usan `numeric`/`bigint`, mientras Prisma usa `Float` en `Import`, `Account`, `Transaction` y `ExchangeRate`. Hay riesgo cuantificable de redondeo si se conserva `Float` para dinero o tasas.
- `warranties`, `inventory_lots`, `suppliers`, `product_assets`, `user_preferences`, `user_sessions`, `presence` e `identifier_lookups` no tienen modelo Prisma equivalente.
- `TradeIn`, `Transfer`, `Account`, `Transaction` y `Cheque` no tienen tabla equivalente en las migraciones Supabase; sus datos sólo pueden conservarse desde Prisma o desde otra fuente histórica.

## Lista de archivos revisados

1. [`supabase/migrations/20260911_mobtock_relational.sql`](../supabase/migrations/20260911_mobtock_relational.sql) — modelo base Supabase: organizaciones, usuarios, clientes, productos, inventario, pedidos, pagos, garantías, webhooks y auditoría.
2. [`supabase/migrations/20260911_mobtock_operations.sql`](../supabase/migrations/20260911_mobtock_operations.sql) — operaciones: lotes, proveedores, compras, tipos de transporte, envíos, activos, preferencias, sesiones, presencia y búsquedas de identificadores.
3. [`../mobile-system/prisma/schema.prisma`](../../mobile-system/prisma/schema.prisma) — modelo Prisma de referencia para Hub, con tenant, usuarios, catálogo, ventas, pagos, trade-in, delivery, transferencias, importaciones y finanzas.
4. [`docs/HUB_BACKEND_MIGRATION.md`](HUB_BACKEND_MIGRATION.md) — decisión previa de usar PostgreSQL + Prisma en OwnCoding Hub y orden general de implementación.

## Decisiones pendientes

- ¿La unidad serializada será `Product` en Prisma o se introducirá `InventoryUnit`?
- ¿Cuál será el proveedor de autenticación de Hub y cómo se migrarán usuarios/PINs?
- ¿Se requiere stock por cantidad y por lote además de IMEI?
- ¿Qué estados de pedido, compra, inventario y delivery son los oficiales?
- ¿Se conservará la contabilidad de `Account`/`Transaction`/`Cheque` dentro del primer corte?
- ¿Qué política de retención tendrán sesiones, presencia, búsquedas externas y webhooks?
