# #502 — aislamiento de la copia privada del POS

## Cambio
- Snapshot versión 2: exige principal, empresa, sucursal, rol y lista efectiva de permisos; clave y metadatos se comparan antes de leer. No se admite el formato legado por empresa.
- Solo un error de transporte permite recuperar la foto del mismo contexto. Se espera la respuesta de la API antes de pintar una foto: 401/402/403, expiración y denegación explícita invalidan RAM, consultas y snapshots, incluso con JSON inválido.
- Logout y cambios incompatibles purgan únicamente el almacén `snapshots`. La cola `cola`, sus payloads y claves de idempotencia quedan intactos.
- Generación local, revisión de consultas y marcador entre pestañas cortan respuestas/escrituras tardías. Tras una invalidación no se hidrata otra vez hasta revalidar el contexto; cambiar de sucursal verifica `/auth/me` sin caché antes de usar el estado de React.
- La clave local no concede autorización. La API mantiene todas las decisiones y escrituras del negocio.

## Evidencia
- `node --test src/lib/offline/snapshot.test.js src/lib/offline/queue.test.js`: 34 PASS. Incluye permisos, sucursal/rol/principal/tenant, legado, escritura pendiente durante purga, generación vieja, marcador cross-tab tardío, recarga legítima y fallo de purga cerrado.
- `MOBOS_QA_PORT=5314 npx playwright test --config=e2e/snapshot502.frontend.config.js`: 2/2 PASS, regresiones con Chromium, IndexedDB y módulos reales del frontend; API sintética aislada, sin cuentas ni servicios reales.
- La prueba de almacén cubre OWNER→SELLER, sucursal/tenant/permisos, offline del mismo contexto, 401/402/403, JSON200 denegado, JSON401 roto, descarga403, respuesta y401 antiguos, evento de espejo legado, logout con red retenida y logout real entre dos pestañas. Luego exige cero consultas de hidratación en el contexto invalidado y la cola sin cambios.
- La prueba del proveedor React cubre cambio legítimo de sucursal y rechazo de reactivación con principal, tenant, rol o permisos de otra sesión.
- Full FE: 1521/1521 PASS antes del último guard de contexto/cambio de sucursal; después se verificaron los casos relacionados y lint/build finales. Sin suites DB/backend ni prueba de producción en esta unidad.
- Lint: cero errores; persiste un aviso ajeno en `DeliveryOperations.jsx:42`. Build frontend: exit 0; advertencia habitual por tamaño de chunks.

## Límites
- No acredita arranque completo de la aplicación sin una sesión validada, ni disponibilidad offline de clientes/cuentas/combos no incluidos en la foto. No convierte revocaciones desconocidas durante un corte de red en autorización nueva.
- Ante una denegación el cliente propaga el error y retira los datos; no modifica globalmente la identidad visual del navbar. Un consumidor que silencie ese error puede mostrar una vista vacía hasta recargar, que revalida `/auth/me`. No se restaura la foto ni se rehidrata automáticamente mientras el contexto esté invalidado.
- No se alteraron Service Worker, esquema, API, permisos del servidor, impresión ni sincronización de ventas. El integrador ejecuta CI y verificaciones de release sobre el árbol unido antes de publicar.

## Novedades para el dueño
- Los datos disponibles sin conexión quedan separados por usuario, sucursal y permisos.
- Al salir o perder acceso se retira la copia privada; las ventas pendientes de sincronización se conservan.
