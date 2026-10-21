# Cobertura MCP de MobOS · Issue #616

## Alcance y método

Corte auditado del 21 de octubre de 2026 en codex/mcp-608-complete-20261021, con base origin/main ca28dbe y fuente609 reconciliada. Se compararon las rutas API, sus guardas, los servicios compartidos, backend/lib/mcp/catalog.ts, authorization.ts, app/api/mcp/streamable/route.ts y las pruebas HTTP/SDK.

Una capacidad es MCP implementada sólo si está en IMPLEMENTED_MCP_ACTIONS, pasa autorización de tenant, módulo, usuario, rol, permiso, sucursal y scope, y tiene una rama real en tools/call. Estar en MCP_CATALOG no la habilita.

## Guardas transversales

| Capa | Evidencia | Regla |
|---|---|---|
| OAuth | lib/mcp/oauth.ts y authorize/token/revoke | Grant, usuario, tenant, cliente, resource, sesión y scopes vinculados; PKCE y revocación. |
| Permisos | lib/mcp/authorization.ts | El scope no reemplaza los permisos MobOS. Se valida módulo activo, tenant, rol, permiso y sucursal. |
| Transporte | app/api/mcp/streamable/route.ts | Sólo herramientas implementadas y autorizadas; argumentos, origin, media type y tamaño se validan. |
| Cambios | lib/mcp/changes.ts | Preview/commit, idempotency key, auditoría y revalidación; sin CRUD paralelo. |
| Contexto | requireMcpAccessToken | El conector usa el usuario y tenant de la sesión emitida; no acepta claims de tenant, rol o sucursal enviados por el modelo. |

## Matriz app → permiso → servicio → MCP

| Dominio | API y servicio canónico | Guarda real | MCP y estado |
|---|---|---|---|
| Productos y variantes | /api/products, /api/products/search; lib/product-service.ts, product-catalog.ts, product-search.ts | products:read o products:manage; tenant y sucursal para vendedor/cajera | products.read y products.write implementados. Escritura tipada; no inventa stock, IMEI, costo, seriales ni movimientos. |
| Precios unitarios | PATCH de productos; lib/product-price.ts | products:manage, tenant/producto/sucursal y precio esperado | prices.write implementado con preview/commit, CAS e idempotencia. |
| Listas, tiers y descuentos | /api/price-lists y /api/price-lists/[id]; lib/price-list-service.ts, price-lists.ts, pricing.ts | Lectura ADMIN/GERENTE; cambios con la guarda products:manage; productos del tenant | price_lists.read/write implementados con servicio compartido, cursor, tiers, auditoría, preview/commit, CAS e idempotencia. |
| Clientes | /api/customers y /api/customers/[id]; lib/customer-service.ts, customer-identity.ts | Sesión, tenant, identidad y reglas de cliente | customers.read/write implementados con payload tipado y preview/commit. Historial, merge, loyalty, notas, billing, seguimiento, duplicados y tokens siguen sólo web. |
| Ventas y pedidos | /api/orders y /api/orders/[orderId]; lib/orders.ts, payments.ts, stock.ts, order-serials.ts | Rol comercial, sucursal, crédito, IMEI/serial, stock, límites y auditoría | sales.read implementado con alcance own/branch/all, cursor y sucursal. sales.write sólo permite update_note mediante el servicio compartido order-comment-service.ts; crear, editar importes/artículos, cancelar, devolver, cobrar, cuotas y crédito no están habilitados. |
| Informes y comisiones | /api/reports; lib/reporting.ts, costs.ts | reports:read, tenant y sucursal activa | reports.read implementado y reutiliza agregación, filtros y grupos. No muta datos. |
| Empresa y perfil | /api/tenant/*; lib/tenant-company-profile.ts y servicios de preferencias/policies | Sesión/tenant; cambios de identidad ADMIN y reautenticación según servicio | company.read/write implementados con preview/commit. Preferencias, módulos, policies, logo, FX y costos siguen web. |
| Crear empresa | /api/tenants; lib/company-creation-bridge.ts | OWNER/ADMIN vinculado y contexto de cuenta | company.create sólo prepara un enlace awaiting_app_confirmation; no crea empresa, sesión ni pertenencia desde MCP. |
| Inventario y stock | /api/stock, stock/items, inventory-units, inventory-counts, reservations, shared-stock; lib/inventory.ts, stock.ts, stock-items.ts | stock:manage, sucursal, unidad/serial, políticas y auditoría | Sin herramienta. No usar products.write para stock global, conteos, reservas, transferencias o unidades serializadas. |
| IMEI/equipos | /api/imei, inventory-units, garantías; lib/imeicheck.ts, imei-providers.ts, device-report.ts | Roles de consulta/gestión, créditos, tenant, proveedor y límites | Sin herramienta. Requiere contrato separado de proveedor, saldo, estado no verificado y datos sensibles. |
| Pagos y cuentas | /api/payments, payment-accounts, proofs, reconciliation; lib/payments.ts, reconciliation.ts | Caja/finanzas, cuenta/tenant, idempotencia y reversión | Sin herramienta. Cobro, reversión y conciliación no se exponen como edición genérica de venta. |
| Caja y finanzas | /api/cash, sesiones, auditoría, finance; lib/cash-movements.ts, cash-session-lock.ts, finance.ts | Rol de caja/administración, sesión abierta, moneda y auditoría | Sin herramienta. Falta contrato de lectura y operaciones con lock/idempotencia. |
| Delivery | /api/delivery/*; lib/delivery-access.ts, delivery-operations-store.ts, delivery.ts | Módulo activo; dueño, gestión o repartidor; sucursal, cierres y claves de operación | Sin herramienta. Incluye cierres diarios/semanales y liquidaciones; debe conservar deliveryAccess y branchScope. |
| Impresión y plantillas | /api/print/*; lib/print-templates-api.ts, print-templates-store.ts, print-jobs.ts | ADMIN para plantillas; sesión, bridge, token e impresora para jobs | Sin herramienta. Primero lectura de plantillas/estado; jobs físicos requieren confirmación y bridge autorizado. |
| Fotos de productos | /api/products/[id]/images; lib/product-images.ts | products:manage, tenant/sucursal, MIME mágico, dimensiones y tamaño | product_images.write implementado con pipeline seguro, preview/commit y auditoría; no acepta URL arbitraria. |
| Fiscal/facturación | /api/orders/[orderId]/external-invoice; lib/external-invoices/* y lib/sifen/* | orders:manage, datos fiscales, proveedor y configuración | Sin herramienta. Requiere sandbox, CDC, estado asíncrono, credenciales y reintentos verificados. |
| Taller y garantías | /api/workshop/*, warranties, repairs, inspections; lib/service-order.ts, order-warranty.ts, inspection.ts | Permisos de taller/garantía, cliente/equipo/pedido y adjuntos | Sin herramienta. Debe separarse de customers.write y products.write. |

## Herramientas anunciables hoy

El conjunto depende de acción implementada, scope concedido, módulo activo,
rol, permiso, tenant y sucursal. Actualmente tools/list puede anunciar:

products.read, products.write, prices.write, customers.read,
customers.write, company.read, company.write, company.create, sales.read,
reports.read, sales.write (sólo update_note), price_lists.read/write y product_images.write.

sales.write se anuncia sólo para operation:update_note; price_lists.read/write también se anuncian con sus guardas.
Delivery, stock, pagos, caja, impresión, fiscal, IMEI y taller no aparecen en
tools/list.

## Cortes posteriores

Stock/unidades/IMEI; delivery; impresión; pagos/caja/fiscal;
y taller/garantías, cada uno con contrato y guardas propias.

Este documento no habilita capacidades, no cambia producción y no contiene
secretos.

## Corte implementado en PR #624

`price_lists.read` y `price_lists.write` ya están respaldados por `backend/lib/price-list-service.ts` y expuestos con las mismas guardas de la aplicación: lectura ADMIN/GERENTE; creación con ADMIN/GERENTE o permiso explícito `products:manage`; edición restringida a ADMIN/GERENTE. Siempre se exige módulo de inventario, tenant y scope. La lectura usa cursor y límite; la escritura usa el flujo MCP de preview/commit existente, validación canónica de ítems, TTL, vinculación de grant/cliente/sesión, idempotencia y auditoría. `sales.write` sólo agrega comentarios; el resto de ventas sigue fuera de este corte.

### Evidencia del endurecimiento

- El cursor MCP se serializa como cursor opaco base64url y la segunda página no repite filas.
- El servicio web `/api/price-lists` y el MCP reutilizan el mismo servicio de creación, lectura y actualización.
- Las actualizaciones con preview comparan `updatedAt` y usan un claim condicional; una vista previa obsoleta devuelve conflicto sin sobrescribir cambios.
- La actualización de ítems se ejecuta dentro de la transacción de la ruta web o del commit MCP; el CAS también avanza `updatedAt` cuando sólo cambian ítems, por lo que dos previews concurrentes no pueden sobrescribirse.
- El preview conserva los ítems normalizados y `isActive`; el commit aplica exactamente ese contrato.
- `backend/tests/mcp-sdk-http.mjs` cubre listado, preview, commit, replay, paginación de dos páginas sin duplicados, preview obsoleto, rollback real de transacción, carrera de reemplazo de ítems con un único ganador y denegación por scope/rol.
- Validación local del corte: 89 pruebas HTTP/SDK sobre PostgreSQL aislado, 352 unitarias (1 skip preexistente del runner), `prisma validate`, `tsc --noEmit` y build de backend.
