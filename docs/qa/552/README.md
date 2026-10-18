# Issue #552 — tienda de módulos, primera fase

## Qué queda conectado

- El registro del catálogo vive en `backend/lib/module-store.ts`. Cada entrada lleva id, nombre, descripción, categoría, icono, rubros, nivel, core, dependencias, preview, estado disponible/próximamente y accesos a los editores existentes.
- El estado queda dentro de `Tenant.settings.moduleStore`, con preset, estado por módulo (`enabled`, `manuallySelected`, `source`, `updatedAt`) y auditoría en `AuditLog`. No se crea una segunda entidad de módulos ni se toca información histórica.
- La ruta `GET/PUT /api/tenant/modules` devuelve catálogo y estado por tenant. Solo `ADMIN` puede cambiar el preset o un override. El servidor conserva módulos core, valida dependencias/dependientes y registra el antes/después.
- Organización → Tienda de módulos tiene búsqueda, categorías, filtro de activos, tarjetas responsive, distintivos Core/Manual, vistas previas de muestra que no guardan ni imprimen, cambio de preset con confirmación y accesos a los editores ya existentes. Catálogo y estados muestran versión, origen y fecha.
- Mensajes es el primer módulo con activación real: el shell oculta Plantillas/Campañas, la navegación directa redirige y cada operación API de `/api/message-templates` queda bloqueada cuando está desactivado. El editor existente de WhatsApp permanece en `/plantillas`.
- Impresión se descubre y enlaza a Configuración → Impresoras, sin duplicar el editor. Su control central queda pendiente hasta cubrir en servidor todas las operaciones de cola, puentes y renderizado; el editor actual sigue disponible.
- Impresión conecta con funciones ya presentes para comprobantes y tickets térmicos/A4, vertical/horizontal, tamaños/márgenes/QR/logo, ruteo y etiquetas de stock/IMEI/garantía. Mensajes se conecta con plantillas WhatsApp por contexto: pedido, cliente, servicio y cobranzas.

## Límite deliberado de esta fase

La tienda gobierna presets, overrides, catálogo, navegación de pantallas, la API de cambios de estado y su auditoría. Solo Mensajes tiene una guarda de módulo completa en servidor. Ventas, inventario, finanzas, reportes y servicios permanecen visibles/en uso y aparecen en modo catálogo mientras se prepara una guarda backend común para todos sus endpoints. No se ofrece su desactivación en esta fase.

También queda para la siguiente fase la instalación transaccional/versionada de packs de mensajes (correo, seguimiento, pago, entrega, garantía y asistencia), y un preview de ticket/etiqueta con los renderizadores reales sin enviar trabajo a la impresora. La vista previa de esta entrega es una muestra fija. Los presets actuales afectan el estado de Mensajes; no siembran ni reescriben plantillas.

Agenda aparece como módulo core de catálogo, pero MobOS aún no tiene una pantalla conectada. Salud está marcado próximamente, con aviso de sensibilidad, y no puede activarse. Los presets solo afectan accesos del catálogo actual; el módulo de Salud no recibe datos.

## Verificación

- Prueba unitaria de defaults, presets, overrides, dependencias, core, validación y preservación de settings.
- E2E focal de enlace a los editores actuales, desactivación/guardia de la pantalla de plantillas y ancho móvil.
