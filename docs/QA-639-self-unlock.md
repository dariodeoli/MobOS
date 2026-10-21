# Recuperación de bloqueo de operadores invitados (#639)

## Contrato

La pantalla bloqueada confirma el PIN por `/api/auth/unlock`, con la sesión
SELLER existente. El endpoint no selecciona usuarios, no requiere/emite COMPANY,
no rota credenciales ni extiende expiración. Entrar/cambiar operador conserva
`/api/auth/pin` con contexto COMPANY. Sesión expirada/revocada se recupera mediante
reingreso o nueva invitación, nunca con credenciales prestadas del dueño.

La revalidación serializa usuario y sesión, usa epoch de Postgres posterior al
lock y verifica usuario activo, horario, tenant no archivado, sucursales activas
/coherentes y pertenencia activa vinculada al mismo usuario cuando corresponde.
La sucursal efectiva de un usuario global replica /auth/me de forma sólo lectura
(asignada, última usada, primera activa); Session.branchId sigue siendo contexto
del ingreso de empresa, sin convertirlo en asignación del usuario. El roundtrip
/auth/me→bloqueo→unlock se prueba con preferencia y sesión de empresa distintas. Respuestas explícitas sin
hashes, tokens, cookies nuevas ni metadatos internos. Un cuerpo no puede elegir
tenant, rol ni sellerId.

Se conserva el lockout compartido de 5 intentos/15 minutos. Además, 20 consultas
por sesión/15 minutos se contabilizan bajo el mismo lock, incluso sin IP de
proxy confiable. El throttle de IP existente es adicional. DB/locks fallidos
responden503 y no habilitan fallback. PIN incorrecto válido:422; sesión inválida:
401; lockout/presupuesto:429. La diferencia conserva snapshots frente a un error
de tipeo y los invalida cuando el permiso de sesión dejó de ser válido.

## Verificación reproducible

- `node backend/tests/seller-unlock-pg.mjs`: PostgreSQL descartable, migraciones
  completas, aceptación real de invitación y primer desbloqueo, TTL/número de
  sesiones/cookies sin cambios, Bearer nativo, PIN incorrecto/reintento, rechazo
  de selección de usuario/tenant, origen ajeno, sesión expirada/revocada, usuario
  inactivo/suspendido, bloqueo PIN, horario, tenant/sucursal/pertenencia,
  concurrencia de intentos y presupuesto, DB fallida y expiración mientras la
  petición espera el lock. Incluye db:check del cluster temporal.
- `npm --prefix backend run test:unit`: formato, UTF8, tamaño/tipo, body detenido.
- `MOBOS_QA_PORT=5349 npx playwright test --config=e2e/pin638.frontend.config.js`:
  wrong422 conserva generación de snapshots; invalid401 la cambia y los
  reintentos no abren la pantalla. Otras seis pruebas rechazan un200 con usuario,
  tenant, rol, permisos, sucursal o identidad incompleta diferentes: se limpia
  la sesión local y el respaldo, se mantiene el bloqueo y se conserva carrito,
  cantidades, precio manual y nota. La salida explícita conserva borrador. El
  cuerpo sólo contiene pin.
- Test nativo confirma que unlock usa Bearer SELLER; pin sigue usando COMPANY.
- `integration-http.sh` incluye el arnés PostgreSQL del contrato.

No se consultaron usuarios, claves o datos productivos. La unidad requiere
revisión de seguridad, integración protegida y deploy antes de afirmar publicada.
El caso real del401 de #638 no se cierra por estas pruebas aisladas.

## Novedades para el dueño

- Quien entró por invitación puede desbloquear su pantalla con su propio PIN.
- Un PIN equivocado permite reintentar conservando la venta y su respaldo.
- Si el acceso venció o fue revocado, la pantalla explica cómo volver a entrar.
- Cambiar de usuario sigue requiriendo el acceso autorizado de la empresa.
