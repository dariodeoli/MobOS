# Retención de imágenes temporales MCP · #652

Candidato separado de PR651, basado en su corte7bfd. MCP sigue OFF por defecto;
este trabajo no configura OAuth, claves, scheduler ni ejecuta limpieza productiva.

## Datos y conservación

- Después de un commit exitoso de product_images.write, su misma transacción
  elimina únicamente payload.dataBase64 del preview. Conserva payloadHash,
  identidad, idempotencyKey, estado, resultado y auditoría; el retry devuelve el
  resultado existente. Las fotos canónicas y sus archivos no se borran.
- Previews vencidos, de grant revocado o sesión revocada/vencida pierden esos
  bytes en el próximo lote de mantenimiento. Propuestas válidas quedan intactas.
- Las filas y el resto de metadata permanecen para trazabilidad; este cambio no
  es una política general de borrado de datos personales.

## Operación propuesta, sin activar

POST /api/internal/mcp-previews usa el mismo MOBOS_MAINTENANCE_TOKEN del
mantenimiento interno existente, exclusivamente en Authorization: Bearer.
Sin configuración devuelve503, token incorrecto401, opciones inválidas400,
cuerpo mayor4096bytes413 y fallo de DB503 saneado. Lectura tiene deadline10s.
No acepta tenant, URL, SQL ni identificadores aportados por el llamante: como
los otros jobs de plataforma opera globalmente, preservando la asociación de
cada fila y auditando sólo conteos por tenant. No devuelve bytes ni IDs privados.

Body vacío o {}: máximo100 previews por solicitud. {"limit":200} permite como
máximo200; valores fuera1–200 fallan, sin fallback abierto. batchFull avisa que
el lote pudo llenarse; no implica que queden necesariamente más filas. Cada
invocación hace sólo un lote: no hay bucle ilimitado ni autoprogramación.

Antes de activar un conector, operaciones debe configurar y verificar un job
interno (propuesta: cada5min, lote100), monitorear fallos/backlog y ajustar la
capacidad sin ampliar el máximo por solicitud. **Ese scheduler no está
configurado por este trabajo.** No hay una ventana efectiva garantizada para
previews vencidos/revocados mientras no se ejecute mantenimiento. Una vez
programado, la demora dependerá del siguiente job, backlog y disponibilidad;
el TTL de10min impide commit pero por sí solo no elimina físicamente datos.
La limpieza tras commit es inmediata dentro de su transacción exitosa.

## Concurrencia y límites

SELECT FOR UPDATE SKIP LOCKED toma como máximo el lote autorizado. Se revisan
nuevamente elegibilidad y clock_timestamp PostgreSQL después del lock antes de
quitar bytes. Un commit bloquea el mismo preview, revalida TTL/sesión/grant y no
puede rescatar un payload ya limpiado. Si expira esperando un lock, foto y
mutación revierten. Los locks ocupados se omiten y se reintentan en otro lote.
Statement timeout3s, espera de transacción2s y duración máxima5s: fallo cerrado.

## Backups y almacenamiento físico

UPDATE quita bytes del registro lógico activo. No acredita eliminación de
versiones MVCC, WAL, réplicas, backups o snapshots. Esas copias dependen de las
políticas de retención de infraestructura y recuperación; no se modifica su
configuración ni se ejecuta VACUUM destructivo. Deben revisarse antes de prometer
un plazo de eliminación física. Ningún test de esta unidad usa base productiva.

## Dependencia de seguridad #654

El guard del bearer se reutiliza dentro de la transacción de imagen después de
esperar el lock: token actual, vencimiento/revocación, scope/grant/sesión,
pertenencia, usuario activo, horario, módulo, permiso y sucursal se revisan de
nuevo sin consumir otra cuota ni extender TTL. La extracción compartida no
cambia los criterios de autorización del ingreso. Las pruebas PG revocan o
dejar vencer un token mientras el commit espera y exigen rollback de foto,
preview y auditoría.
