# Conexiones MCP de MobOS (#608)

## Estado

Esta rama contiene una implementación verificable del conector MCP con OAuth 2.1 + PKCE
(S256), consentimiento por usuario/empresa, tokens revocables y transporte HTTP MCP.
Está preparada para revisión; no implica interoperabilidad validada con ChatGPT o Claude
ni publicación en producción.

El acceso siempre se resuelve con la sesión MobOS que autorizó el conector. El cliente
externo no puede elegir `userId`, `tenantId`, sucursal, rol o cuenta en el payload.
Las guardas de módulo, tenant, permisos y sucursal se vuelven a ejecutar en cada
solicitud.

## URLs y configuración

Las URLs se derivan de dos variables de entorno y no se deben inventar:

- `MOBOS_MCP_ISSUER`: origen HTTPS del Authorization Server.
- `MOBOS_MCP_RESOURCE`: origen HTTPS del Resource Server que publica el endpoint MCP.
- `MOBOS_MCP_ALLOWED_ORIGINS`: orígenes web permitidos para solicitudes del navegador.
- `MOBOS_MCP_CLIENTS_JSON`: allowlist server-side de clientes OAuth y sus callbacks exactos.

Con esos orígenes, las rutas son:

| Recurso | Ruta |
| --- | --- |
| Metadata Authorization Server | `/.well-known/oauth-authorization-server` |
| Metadata Protected Resource | `/.well-known/oauth-protected-resource` |
| Authorization | `/api/mcp/authorize` |
| Token | `/api/mcp/token` |
| Revocación | `/api/mcp/revoke` |
| Transporte MCP | `/api/mcp/streamable` |
| Estado de conexiones de la app | `/api/mcp/connections` |

Plantilla de configuración (los valores son placeholders):

```env
MOBOS_MCP_ISSUER=https://<ORIGEN_API_VERIFICADO>
MOBOS_MCP_RESOURCE=https://<ORIGEN_API_VERIFICADO>
MOBOS_MCP_ALLOWED_ORIGINS=https://<ORIGEN_WEB_VERIFICADO>
MOBOS_MCP_CLIENTS_JSON=[{"clientId":"<ID_REGISTRADO>","name":"<NOMBRE>","redirectUris":["<CALLBACK_HTTPS_EXACTO>"]}]
```

El callback lo entrega y verifica cada proveedor. No se debe copiar un callback de ejemplo ni aceptar redirecciones dinámicas. Cada cliente queda asociado a un `clientId`, callback exacto y scopes explícitos. El flujo usa Authorization Code, PKCE S256 y `state`; los secretos y tokens no se guardan en el navegador.

Referencias de configuración:

- [Autorización de conectores de OpenAI](https://developers.openai.com/plugins/build/auth)
- [Especificación de autorización MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [Especificación MCP](https://modelcontextprotocol.io/specification/latest)

La configuración real de un cliente ChatGPT o Claude y su prueba contra el proveedor quedan pendientes de una cuenta, callback aprobado y entorno de prueba. No se afirma interoperabilidad hasta ejecutar esa prueba.

## Capacidades

La lista de `tools/list` se filtra por el scope concedido, el módulo activo y las guardas de la sesión actual. Una capacidad no aparece si no está implementada o si el usuario no puede ejecutarla.

| Herramienta | Estado | Scope | Permiso MobOS | Alcance |
| --- | --- | --- | --- | --- |
| `company.read` | Disponible | `company:read` | `dashboard:read` | Empresa actual |
| `products.read` | Disponible | `products:read` | `products:read` o `products:manage` | Sucursal autorizada |
| `customers.read` | Disponible | `customers:read` | `customers:manage` | Empresa actual |
| `sales.read` | Disponible | `sales:read` | `orders:own`, `orders:branch` o `orders:manage` | Propias, sucursal o todas según permiso |
| `reports.read` | Disponible | `reports:read` | `reports:read` | Filtros y reglas del informe |
| `products.write` | Disponible | `products:write` | `products:manage` | Sucursal autorizada |
| `prices.write` | Disponible | `prices:write` | `products:manage` | Empresa/producto autorizado |
| `product_images.write` | Disponible | `product_images:write` | `products:manage` | Sucursal autorizada |
| `customers.write` | Disponible | `customers:write` | `customers:manage` | Empresa y reglas de cliente |
| `company.write` | Disponible | `company:write` | `dashboard:read` + rol `ADMIN` | Perfil de empresa, con reautenticación |
| `sales.write` | Pendiente | `sales:write` | `orders:manage` | No se anuncia ni se ejecuta |
| Facturación, stock/IMEI directo y otras mutaciones | Pendiente | — | — | Requieren servicio específico |

“Disponible” significa implementado en el endpoint y sujeto a las guardas indicadas; no significa que todos los roles tengan acceso. Propietarios/administradores y otros roles sólo acceden cuando sus permisos reales de MobOS lo permiten. Un usuario PIN sin `accountId` también puede autorizarse si su sesión, usuario, tenant y permisos están vigentes; nunca se transforma en propietario por el hecho de conectar un cliente.

## Mutaciones seguras

Las mutaciones no se ejecutan directamente desde el modelo. Se usa este flujo:

1. El cliente solicita `mode: "preview"` con una clave de idempotencia.
2. MobOS valida sesión, tenant, módulo, permisos, sucursal y payload tipado.
3. La respuesta incluye el cambio `before/after` y un `previewId` temporal.
4. El cliente confirma con `mode: "commit"` y ese `previewId`.
5. MobOS vuelve a validar permisos, sesión y valores actuales antes de escribir.
6. El commit queda auditado; repetir la misma clave devuelve el resultado estable.

El preview está ligado al grant OAuth, cliente y sesión que lo creó. Otro conector, una sesión cambiada, un grant revocado o un preview vencido no puede confirmarlo. Los cambios de precio usan control de concurrencia: si el valor esperado cambió, la confirmación falla y no sobreescribe el precio.

Restricciones relevantes:

- `products.write` permite campos de producto y variante definidos por el servicio; no permite inventar stock, IMEI, SQL, rutas o atributos arbitrarios.
- Las fotos pasan por validación de MIME real, tamaño, tenant, sucursal y pipeline existente; no se aceptan URLs libres.
- `company.write` sólo modifica el perfil de la empresa actual y requiere reautenticación reciente del administrador.
- No se aceptan cookies como bearer, tokens enviados por el modelo, credenciales compartidas ni selección arbitraria de otra empresa.
- Códigos de autorización son de un solo uso; access/refresh tokens se almacenan como hashes, expiran, rotan y pueden revocarse por conexión.

## Conexión y auditoría

La aplicación puede consultar `GET /api/mcp/connections` para mostrar conexiones del usuario actual, scopes, capabilities, proveedor configurado y última actividad. `DELETE /api/mcp/connections` revoca el grant y sus tokens. La revocación también bloquea previews asociados.

Registrar un cliente o habilitar una aplicación requiere una operación explícita de administración: callback HTTPS exacto, scopes aprobados y consentimiento visible. No se crea una empresa, cuenta o pertenencia a partir de argumentos enviados por el conector. La creación automática de aplicaciones/proveedores y la gestión de facturación electrónica permanecen pendientes.

Cada solicitud, consentimiento, rechazo, mutación y revocación deja metadatos de auditoría acotados. No se almacenan tokens, prompts, fotos completas ni dumps de clientes.

## Verificación antes de habilitar

1. Configurar issuer, resource, orígenes y allowlist de clientes en un entorno aislado.
2. Ejecutar migraciones Prisma y el conjunto de pruebas PostgreSQL aislado.
3. Probar authorization code + PKCE, refresh concurrente, replay, revocación, cambio de usuario PIN, tenant archivado y sucursal ajena.
4. Conectar un cliente real usando su callback oficial y ejecutar `initialize`, `tools/list` y una preview/commit controlada.
5. Revisar auditoría y revocar el grant.

Hasta completar el paso 4 no se debe presentar la integración como conectada a ChatGPT/Claude ni desplegarla en una tienda o entorno productivo.
