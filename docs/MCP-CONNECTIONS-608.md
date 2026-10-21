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
| `price_lists.read/write` | Disponible | `price_lists:read/write` | Gestión comercial según servicio | Listas, tiers y descuentos; lectura/escritura autorizada |
| `prices.write` | Disponible | `prices:write` | `products:manage` | Empresa/producto autorizado |
| `product_images.write` | Disponible | `product_images:write` | `products:manage` | Sucursal autorizada |
| `customers.write` | Disponible | `customers:write` | `customers:manage` | Empresa y reglas de cliente |
| `company.write` | Disponible | `company:write` | `dashboard:read` + rol `ADMIN` | Perfil de empresa, con reautenticación |
| `company.create` | Disponible | `company:create` | `dashboard:read` + rol `ADMIN` y OWNER vinculado | Prepara un enlace para confirmar la creación dentro de la app; no crea por sí sola |
| `sales.write` | Disponible parcial | `sales:write` | `orders:manage` | Sólo `update_note` de una venta existente; preview/commit y servicio compartido web |
| Facturación, stock/IMEI directo y otras mutaciones | Pendiente | — | — | Requieren servicio específico |

“Disponible” significa implementado en el endpoint y sujeto a las guardas indicadas; no significa que todos los roles tengan acceso. Propietarios/administradores y otros roles sólo acceden cuando sus permisos reales de MobOS lo permiten. Un usuario PIN sin `accountId` también puede autorizarse si su sesión, usuario, tenant y permisos están vigentes; nunca se transforma en propietario por el hecho de conectar un cliente.

## Mutaciones seguras

Las mutaciones no se ejecutan directamente desde el modelo. Las herramientas normales requieren preview/commit:

1. El cliente solicita `mode: "preview"` con una clave de idempotencia.
2. MobOS valida sesión, tenant, módulo, permisos, sucursal y payload tipado.
3. La respuesta incluye el cambio `before/after` y un `previewId` temporal.
4. El cliente confirma con `mode: "commit"` y ese `previewId`.
5. MobOS vuelve a validar permisos, sesión y valores actuales antes de escribir.
6. El commit queda auditado; repetir la misma clave devuelve el resultado estable.

`company.create` es una excepción de preparación: valida OWNER, ADMIN, cuenta vinculada y contexto, y devuelve `awaiting_app_confirmation` con un enlace de la aplicación. La creación efectiva sólo ocurre después de la confirmación explícita dentro de MobOS; si luego se desea operar la nueva empresa desde el conector, se requiere un nuevo consentimiento OAuth. El endpoint MCP no crea empresas ni sesiones.

El preview está ligado al grant OAuth, cliente y sesión que lo creó. Otro conector, una sesión cambiada, un grant revocado o un preview vencido no puede confirmarlo. Los cambios de precio usan control de concurrencia: si el valor esperado cambió, la confirmación falla y no sobreescribe el precio.

Las bajas de listas de precios también pasan por el servicio compartido. La transición activa → inactiva usa una actualización compare-and-swap sobre `updatedAt`, avanza la versión aun cuando el reloj tenga la misma marca de tiempo y registra un único `PRICE_LIST_DEACTIVATED`. Por eso una vista previa de edición tomada antes de una baja queda invalidada y no puede volver a escribir ítems o reactivar la lista.

Restricciones relevantes:

- `products.write` permite campos de producto y variante definidos por el servicio; no permite inventar stock, IMEI, SQL, rutas o atributos arbitrarios.
- Las fotos pasan por validación de MIME real, tamaño, tenant, sucursal y pipeline existente; no se aceptan URLs libres.
- `company.write` sólo modifica el perfil de la empresa actual y requiere reautenticación reciente del administrador.
- No se aceptan cookies como bearer, tokens enviados por el modelo, credenciales compartidas ni selección arbitraria de otra empresa.
- Códigos de autorización son de un solo uso; access/refresh tokens se almacenan como hashes, expiran, rotan y pueden revocarse por conexión.

## Conexión y auditoría

La aplicación puede consultar `GET /api/mcp/connections` para mostrar conexiones del usuario actual, scopes, capabilities, proveedor configurado y última actividad. `DELETE /api/mcp/connections` revoca el grant y sus tokens. La revocación también bloquea previews asociados.

Registrar un cliente o habilitar una aplicación requiere una operación explícita de administración: callback HTTPS exacto, scopes aprobados y consentimiento visible. No se crea una cuenta o pertenencia a partir de argumentos enviados por el conector; `company.create` sólo prepara el enlace de confirmación dentro de la aplicación. La creación automática de aplicaciones/proveedores y la gestión de facturación electrónica permanecen pendientes.

Cada solicitud, consentimiento, rechazo, mutación y revocación deja metadatos de auditoría acotados. Los logs y auditorías no contienen tokens, prompts, fotos completas ni dumps de clientes. Los payloads privados de preview pueden contener los datos necesarios para el commit; ver la retención de imágenes al final.

## Verificación antes de habilitar

1. Configurar issuer, resource, orígenes y allowlist de clientes en un entorno aislado.
2. Ejecutar migraciones Prisma y el conjunto de pruebas PostgreSQL aislado.
3. Probar authorization code + PKCE, refresh concurrente, replay, revocación, cambio de usuario PIN, tenant archivado y sucursal ajena.
4. Conectar un cliente real usando su callback oficial y ejecutar `initialize`, `tools/list` y una preview/commit controlada.
5. Revisar auditoría y revocar el grant.

El código puede prepararse y desplegarse desactivado por defecto tras review y gates de publicación. Antes de completar el paso 4 y definir/aplicar retención de payloads no se debe activar MCP remoto ni presentar la integración como conectada a ChatGPT/Claude.

## Límites del servidor (#647)

Cada validación exitosa de un bearer consume dos presupuestos atómicos: por conexión
OAuth (`MOBOS_MCP_GRANT_MINUTE_LIMIT`, predeterminado120) y por empresa
(`MOBOS_MCP_TENANT_MINUTE_LIMIT`, predeterminado600), ambos por60segundos.
Las variables deben ser enteros positivos finitos. No hay fallback en memoria ni
modo ilimitado: configuración inválida, fallo de PostgreSQL, lock o reloj devuelve
503 saneado; exceso devuelve429 y `Retry-After` en segundos.

La guarda está en el acceso canónico y cubre tanto `/streamable` como `/changes`.
Una escritura reenviada internamente valida acceso en ambos límites de API y puede
consumir dos unidades; ningún header enviado por un cliente evita la segunda guarda.
Las cuentas se serializan con locks transaccionales en orden estable, reloj de la DB
posterior al lock y rollback conjunto. Los identificadores se guardan hasheados y no
se persisten tokens ni argumentos en el contador.

## Corte de cobertura verificable —21/10/2026

`tools/list` y la validación usan el mismo esquema cerrado por herramienta. Las
mutaciones de clientes/empresa declaran y aceptan su `idempotencyKey`; los filtros
no soportados y los cursores de forma/fecha inválida se rechazan antes de consultar
el listado. Los JSON Schema anunciados se validan con Ajv dentro del arnés SDK.

`sales.write` **sólo edita el comentario de una venta existente** mediante
`operation: "update_note"`; no crea ventas ni cambia importes, pagos, artículos,
estados, datos fiscales o stock. Usa el mismo servicio que el editor web de
comentario/facturación, con `textInput` no vacío de hasta2000caracteres. El servicio
revalida usuario, tenant, módulo, sucursal y pedido actuales; MCP exige además
`orders:manage`, scope, sesión, grant y token vigentes. La vista previa no escribe
el pedido. El commit exige la versión capturada, avance monotónico de `updatedAt`
con reloj PostgreSQL, idempotencia y auditoría dentro de la misma transacción.
Cambiar el comentario desde web invalida una vista previa anterior.

El reloj OAuth usa epoch numérico de PostgreSQL: evita interpretar un resultado
`timestamptz` con el desfase local del adaptador. No se modificaron los TTLs.
La ruta directa `/api/mcp/changes` conserva las mismas guardas de origen y tipo
JSON que el transporte, y no permite eludir la cuota canónica.

### Activación externa todavía pendiente

Las fuentes oficiales verificadas21/10/2026 permiten clientes OAuth predefinidos.
Este servidor **sólo admite la allowlist server-side configurada**: no implementa
CIMD dinámico ni registro DCR. No alcanza con pegar la URL y usar el registro
automático del proveedor. Para probarlo, elegir el cliente OAuth propio/predefinido
que corresponda y registrar sus identificadores/callbacks exactos en el entorno de
prueba aprobado. No copiar callbacks de ejemplos ni crear acceso persistente sin
la autorización del dueño.

- [OpenAI: autenticación de MCP](https://developers.openai.com/plugins/build/auth).
- [Claude: conectores remotos personalizados](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- [MCP: contrato de herramientas y validación](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

La prueba con SDK local es interoperabilidad de protocolo, **no una conexión real
a las cuentas de ChatGPT/Claude**. La creación de ventas, las demás mutaciones y
los dominios sin herramienta siguen pendientes en #616.

## Corte 2026-10-21: código y activación

MCP remoto queda **desactivado por defecto**. Sólo `MOBOS_MCP_ENABLED=true`
(literal, backend) lo habilita. Ausencia, `false`, `TRUE`, `1` o valor inválido
bloquean con503 saneado discovery OAuth, authorize GET/POST, token, streamable y
changes antes de consultar tokens/cuotas o crear códigos. La gestión privada
`/api/mcp/connections` GET/DELETE conserva listado y revocación con sus controles
existentes incluso off; apagar no borra grants ni tokens.

| Área | Código de este corte | Configuración o trabajo pendiente |
|---|---|---|
| OAuth | PKCE S256, resource/issuer, callbacks exactos, tokens hash y revocación; off por defecto | Issuer/resource HTTPS y clientes allowlist con callbacks reales verificados; activar sólo por operador autorizado |
| Clientes | Permisos vigentes, módulos, empresa y sucursal | Conectar cuentas reales ChatGPT/Claude y comprobar consentimiento/revocación; SDK local no acredita conexión real |
| Herramientas |14 acciones implementadas; esquemas cerrados y cursores tipados | #616 conserva dominios sin herramientas y restantes escrituras de ventas |
| Ventas | sales.write sólo update_note en pedido existente, preview/commit, CAS monotónico, auditoría e idempotencia; servicio común web/MCP | Crear ventas, pagos, stock, fiscal y otras mutaciones no implementadas por MCP |
| Empresa | Lectura/edición autorizada; creación prepara enlace de confirmación en la app | No crea empresa silenciosamente ni evita reautenticación |
| Límites | Grant120/min y tenant600/min por defecto, PG atómico, fail closed si config/DB falla | Ajustes autorizados de MOBOS_MCP_GRANT_MINUTE_LIMIT y MOBOS_MCP_TENANT_MINUTE_LIMIT; no fallback abierto |
| Publicación | Tests HTTP/PG y navegador locales sintéticos | Review, integración centralizada, CI, deploy y prueba real de proveedores; sin registros ni claves productivas nuevos |

El arnés habilita el flag sólo en entorno sintético y restaura el entorno al
finalizar. Ningún registro OAuth externo ni clave productiva fue creado.

Privacidad de imágenes: los bytes no se devuelven en logs, auditorías ni respuestas. El payload privado de McpChangePreview sí conserva dataBase64 para realizar commit; la expiración impide usarlo pero no lo elimina físicamente. La limpieza/retención de previews debe definirse antes de activación real.
