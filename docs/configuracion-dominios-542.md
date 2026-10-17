# Configuración por dominios (#542)

La navegación conserva los identificadores y rutas existentes. `dispositivos` continúa usando `/configuracion/dispositivos`; `comercial`, `seguridad` y `sistema` mantienen sus rutas actuales. Los permisos siguen controlados por las páginas y componentes existentes, sin ampliar acceso.

## Impresoras

La sección se presenta como **Impresoras** y reúne la configuración de impresoras, puentes, ruteo de documentos, diagnósticos locales, cola e historial. El panel **Estado y sincronización** muestra el resumen global de puentes, impresoras registradas y trabajos remotos; sus enlaces abren las pantallas de gestión existentes. La vista de sincronización usa el endpoint ya existente `/api/system/sync-status` y su fixture de demo.

## Sistema

Sistema conserva los chequeos generales y la sincronización de correo saliente, webhooks/eventos de AEX, errores recientes y reservas vencidas. La cola remota, puentes e impresoras ya no se presentan como administración de Sistema; el resumen global y las acciones están en Impresoras. Los chequeos generales del servidor siguen disponibles en Sistema.

## Diseño común y cobertura

Cada dominio abierto usa la misma cabecera con icono, título y descripción; la lista móvil conserva las tarjetas de navegación. Los cambios de rótulos no alteran slugs, rutas ni reglas de autorización. Los tests de navegación verifican las rutas existentes, los paneles de impresión y el acceso a Sistema en móvil/escritorio.

Pendiente para una etapa posterior: dividir el endpoint de estado global si se requiere limitar las consultas a cada dominio, y migrar cualquier chequeo de agente local que hoy siga incluido en `/api/system/checks`. Esta etapa conserva ese contrato para no afectar despliegues ni diagnósticos existentes.
