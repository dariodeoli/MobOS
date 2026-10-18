# Issue #552 — tienda de módulos, primera fase

## Qué queda conectado

- El registro del catálogo vive en `backend/lib/module-store.ts`. Cada entrada lleva id, nombre, descripción, categoría, icono, rubros, nivel, core, dependencias, preview, estado disponible/próximamente y accesos a los editores existentes.
- El estado queda dentro de `Tenant.settings.moduleStore`, con preset, estado por módulo (`enabled`, `manuallySelected`, `source`, `updatedAt`) y auditoría en `AuditLog`. No se crea una segunda entidad de módulos ni se toca información histórica.
- La ruta `GET/PUT /api/tenant/modules` devuelve catálogo y estado por tenant a cualquier usuario autenticado; solo `ADMIN` puede cambiar el preset o un override (`canManage` lo indica). El servidor conserva módulos core, valida dependencias/dependientes y registra el antes/después.
- Organización → Tienda de módulos tiene búsqueda, categorías, filtro de activos, tarjetas responsive, distintivos Core/Manual, vistas previas de muestra que no guardan ni imprimen, cambio de preset con confirmación y accesos a los editores ya existentes. Catálogo y estados muestran versión, origen y fecha.
- Mensajes es el primer módulo con activación real: el shell oculta Plantillas/Campañas, la navegación directa redirige y cada operación API de `/api/message-templates` queda bloqueada cuando está desactivado. El editor existente de WhatsApp permanece en `/plantillas`.
- Impresión se descubre y enlaza a Configuración → Impresoras, sin duplicar el editor. Su control central queda pendiente hasta cubrir en servidor todas las operaciones de cola, puentes y renderizado; el editor actual sigue disponible.
- Impresión conecta con funciones ya presentes para comprobantes y tickets térmicos/A4, vertical/horizontal, tamaños/márgenes/QR/logo, ruteo y etiquetas de stock/IMEI/garantía. Mensajes se conecta con plantillas WhatsApp por contexto: pedido, cliente, servicio y cobranzas.
- La tienda incluye packs de impresión y mensajes sugeridos por rubro y vistas previas declaradas como ficticias. Esos packs son de descubrimiento: no se importan, no envían trabajos y no cambian los valores predeterminados. El editor existente sigue siendo la fuente de configuración; los avisos por correo ya existentes no se convierten aquí en un editor de plantillas.
- Verificación de IMEI aparece como módulo por empresa y enlaza a las unidades existentes. Su API GET/POST exige módulo activo además de los roles actuales, aplica créditos/idempotencia existentes y conserva el aviso de consulta reciente de 24 h. Audita consultas y rechazos por saldo; la actividad de activación queda en `TENANT_MODULES_UPDATED`. El GET informa `imeicheck.net` como proveedor actual (modo simulado/vivo, sin credenciales) y `imei.info` como no configurado. Los resultados siguen normalizados, el IMEI se enmascara y ningún resultado acredita propiedad o autenticidad.

## Límite deliberado de esta fase

La tienda gobierna presets, overrides, catálogo, navegación de pantallas, la API de cambios de estado y su auditoría. Mensajes y Verificación IMEI tienen guardas de API; las otras operaciones de inventario no dependen del interruptor IMEI. Ventas, inventario, finanzas, reportes y servicios permanecen visibles/en uso y aparecen en modo catálogo mientras se prepara una guarda backend común para todos sus endpoints. No se ofrece su desactivación en esta fase.

También queda para la siguiente fase la instalación transaccional/versionada de packs de mensajes (correo, seguimiento, pago, entrega, garantía y asistencia), selección de plantilla predeterminada/restauración con versionado y un preview de ticket/etiqueta con los renderizadores reales sin enviar trabajo a la impresora. La vista previa de esta entrega es una muestra fija. Los presets actuales afectan el estado de Mensajes; no siembran ni reescriben plantillas.

El adaptador operativo continúa siendo el de IMEIcheck.net; su clave queda exclusivamente en el entorno seguro del servidor. No se añadió llamada ni adaptador especulativo para IMEI.info: se muestra como Próximamente/No configurado hasta que estén disponibles credenciales y contrato. La selección de proveedor por empresa/global, cuotas por proveedor, caché de resultado normalizado y configuración granular de roles/límites requieren una fase posterior. En esta fase se mantienen proveedor actual, controles por rol, saldo/créditos del mecanismo existente, idempotencia, historial y auditoría, con bloqueo de API si el módulo está desactivado.

Agenda aparece como módulo core de catálogo, pero MobOS aún no tiene una pantalla conectada. Salud está marcado próximamente, con aviso de sensibilidad, y no puede activarse. Los presets solo afectan accesos del catálogo actual; el módulo de Salud no recibe datos.

## Verificación

- Prueba unitaria de defaults, presets, overrides, dependencias, core, validación y preservación de settings.
- E2E focal de enlace a los editores actuales, desactivación/guardia de la pantalla de plantillas y ancho móvil.
- E2E de presencia del módulo IMEI, estado de los proveedores y rechazo 403 de su API al desactivarlo.
- Contrato #299 actualizado para incluir la pestaña Tienda de módulos sin relajar aserciones. E2E seller/manager confirma lectura de estado, ocultamiento y bloqueo de Plantillas/Campañas cuando Mensajes está desactivado.
