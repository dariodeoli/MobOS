# Conexiones MCP de MobOS · #608

## Estado de esta fase

Esta entrega implementa la base local y fail-closed del catálogo MCP. No publica todavía un endpoint de conexión para Claude o ChatGPT, no crea tokens, no acepta bearer externos y no modifica datos de producción.

El conector futuro tendrá que obtener una sesión autorizada mediante OAuth 2.1 + PKCE (`S256`), elegir explícitamente la empresa y solicitar scopes del catálogo. La sesión del conector nunca reemplaza la sesión MobOS ni puede saltar el RBAC existente.

## Capacidades tipadas disponibles para la siguiente fase

| Acción | Scope | Módulo | Permiso MobOS | Escritura | Sucursal |
| --- | --- | --- | --- | --- | --- |
| `products.read` | `products:read` | `inventario` | `products:read` | No | Sí |
| `products.write` | `products:write` | `inventario` | `products:manage` | Sí | Sí |
| `prices.write` | `prices:write` | `inventario` | `products:manage` | Sí | No |
| `customers.read` | `customers:read` | `clientes` | `customers:manage` | No | No |
| `customers.write` | `customers:write` | `clientes` | `customers:manage` | Sí | No |
| `company.read` | `company:read` | `equipo` | `dashboard:read` | No | No |
| `sales.read` | `sales:read` | `ventas` | `orders:own`, `orders:branch` o `orders:manage` | No | Sí |
| `sales.write` | `sales:write` | `ventas` | `orders:manage` | Sí | Sí |
| `reports.read` | `reports:read` | `reportes` | `reports:read` | No | No |
| `product_images.write` | `product_images:write` | `inventario` | `products:manage` | Sí | Sí |

Las acciones desconocidas, scopes desconocidos, módulos apagados, tenants distintos, sesiones ausentes y sucursales fuera del alcance se rechazan.

## Archivos

- `backend/lib/mcp/catalog.ts`: catálogo cerrado de acciones y scopes.
- `backend/lib/mcp/authorization.ts`: autorización fail-closed que recibe una sesión MobOS ya validada, comprueba tenant, módulo, permiso y sucursal, y limita los metadatos de auditoría.
- `backend/tests/mcp-authorization.test.ts`: pruebas negativas de sesión, tenant, módulo, permisos, sucursal, scopes duplicados/desconocidos y ausencia de secretos.

## Diseño pendiente para OAuth y revocación

1. Registrar MobOS como Authorization Server/Resource Server con metadata HTTPS y audience explícita.
2. Usar Authorization Code + PKCE `S256`, `state`, `nonce`, redirect URI exacta y consentimiento visible por empresa y scopes.
3. Asociar el consentimiento a `accountId`, `tenantId`, conector, scopes y usuario que aprobó. No permitir consentimiento global que cruce empresas.
4. Guardar únicamente hashes de tokens; incluir expiración, rotación, revocación y detección de reuse. Revocar por usuario, empresa, conector y emergencia.
5. Resolver cada request a la sesión/identidad MobOS y volver a ejecutar las mismas guardas de tenant, módulo, RBAC y sucursal.
6. Auditar solicitud, aprobación, rechazo, uso mutante y revocación sin guardar tokens, prompts, fotos ni datos completos de clientes.
7. Exponer sólo operaciones tipadas; no SQL arbitrario, rutas arbitrarias ni URLs de descarga libres. Las fotos deben usar el flujo de adjuntos existente y validar tenant, MIME, tamaño y hash.

La implementación OAuth requiere revisión adicional de esquema, endpoints, redirect URIs y cliente de cada proveedor. Hasta completar esos puntos no debe mostrarse un botón “Conectar MCP” funcional.

## Fase OAuth implementada en esta rama

Se agregaron tablas aditivas `McpClientGrant`, `McpAuthorizationCode` y `McpAccessToken`, con migración `20261024000000_mcp_oauth`. Los códigos son de un solo uso y los tokens sólo se almacenan como hash. El refresh rota el token anterior; la revocación invalida access/refresh.

Endpoints preparados, deshabilitados hasta configurar clientes server-side:

- `GET /api/mcp/.well-known/authorization-server`
- `GET /.well-known/oauth-protected-resource`
- `POST /api/mcp/authorize` (sólo sesión MobOS por cookie y mismo origen; PKCE S256 y consentimiento por tenant)
- `POST /api/mcp/token` (authorization code o refresh token; sin cookie como bearer)
- `POST /api/mcp/revoke`

La validación de bearer reconsulta la sesión, membresía, tenant, usuario activo y permisos actuales antes de permitir una operación. No se habilita ningún cliente hasta definir `MOBOS_MCP_CLIENTS_JSON` con client IDs y redirect URIs HTTPS exactas.
