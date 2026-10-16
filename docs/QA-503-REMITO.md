# #503: notas internas del remito

GET público por token dejaba salir notes y receivedNote. Reproducción roja PostgreSQL aislado con canarios, sin datos reales; el parche b5a15849 retira ambos campos del DTO y conserva registros/POST de recepción. GET no altera notas; recepción guarda su observación y audita una sola vez, repetir responde409.

Verificación:11checks PG iniciales;117 checks del lote403 en integración completa posterior, backend332unitPASS+1skipprevio, buildPASS+BUILD_ID y revisión independienteAPPROVE. El script PG está integrado en backend/tests/integration-http.sh; todo crea/limpia su propia base ficticia. No se hicieron llamadas ni escrituras de negocio en producción.

Pendiente CI/main/despliegue exactos para cerrar.

Novedades para el dueño
- El enlace del remito no entrega observaciones internas.
- La gestión privada conserva sus notas y auditoría.
- El cliente puede seguir confirmando la recepción.
