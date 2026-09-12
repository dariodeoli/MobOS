# MobOS · modelo de datos productivo

MobOS opera sobre PostgreSQL en OwnCoding Hub mediante Prisma y una API propia.
El frontend solo consume esa API: no accede a la base de datos ni incorpora
claves de infraestructura.

## Entidades principales

- `Tenant`, `User` y `Branch`: aislamiento por empresa, usuarios y sucursales.
- `Product`, `InventoryUnit` y `Location`: catálogo, unidades con IMEI/serial y
  ubicaciones físicas.
- `Customer`, `Order`, `OrderItem` y `Payment`: venta, líneas, cliente y pagos
  parciales o combinados.
- `Account`, `Transaction`, `Cheque` y `ExchangeRate`: caja, conciliación y
  multidivisa.
- `Supplier`, compras e importaciones: costo, anticipos y recepción.
- `TradeIn`, `Warranty`, `Transfer` y `AuditLog`: trazabilidad operativa.

## Reglas de seguridad

1. Cada consulta de negocio se limita por `tenantId` en el backend.
2. Las acciones sensibles requieren sesión, rol y sucursal autorizada.
3. IMEI, movimientos de inventario, pagos y auditoría se escriben de forma
   transaccional.
4. La UI no persiste operaciones reales en almacenamiento local; ese mecanismo
   se reserva exclusivamente para datos demo y experiencia sin conexión.

## Pendientes técnicos

- Completar pruebas de aislamiento multiempresa y permisos en producción.
- Extender la cobertura de compras, garantías, conciliación y lotes conforme a
  las reglas operativas de MobOS.
- Mantener migraciones Prisma aditivas y verificadas antes de cada publicación.
