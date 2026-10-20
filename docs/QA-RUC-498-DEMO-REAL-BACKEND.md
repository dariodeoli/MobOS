# #498 — consulta OwnData real para la demo (servidor)

Fuente `da8a0568`, base `a08c4d8e`. Esta unidad prepara el servidor; no acredita despliegue, configuración válida de la clave, resultado real del proveedor ni nuevo TestFlight.

## Contrato

- `GET /api/public/ruc?ruc=...`: único parámetro `ruc`, una sola vez; normaliza base/DV con el parser existente antes de reservar cuota. Origen oficial permitido o `MOBOS_APP_URL` válido; admite `capacitor://localhost` e `ionic://localhost`. Rechaza origen ausente/ajeno. Origin no es identidad ni defensa de presupuesto.
- El servidor llama exclusivamente `lookupRuc`: URL OwnData fija, clave `RUC_API_KEY` solo runtime, timeout8s que incluye cuerpo, JSON≤65536bytes, no-store y sin redirects. No hay proxy de URL arbitraria. Rechaza bandera explícita `simulated`/`simulado` verdadera. `meta.environment=test` no se interpreta como datos ficticios: el contrato primario no demuestra esa equivalencia.
- Respuesta explícita: `query{normalized,fullRuc}`, `result{nameOfficial,name,ruc,dv,fullRuc}` con `equivalenceRaw`/`sourcePartition` opcionales, `reviewRequired:true`, `source{provider,queriedAt}`. Nombre oficial intacto. `status`/`stateRaw` no forman parte del contrato público. Sin metadatos comerciales, accounting, cuota upstream, requestId proveedor, sesión, tenant o identidades de negocio.
- Éxito/error/cuota/configuración/preflight llevan `private, no-store`; middleware de esta ruta exacta no devuelve Allow-Credentials y no reenvía Cookie/Bearer al handler. Errores seguros permiten entrada manual y Retry-After solo positivo entero.
- La ruta privada `/api/ruc` conserva sesión+piloto exacto; ninguna escritura comercial. Solo se reservan intentos técnicos públicos en `AuthAttempt` existente, sin migración.

## Presupuesto persistente

- Global90/24h y red12/1h por defecto. Overrides opcionales `RUC_DEMO_GLOBAL_DAILY_LIMIT` y `RUC_DEMO_NETWORK_HOURLY_LIMIT`, enteros positivos≤90/12. Ausente usa default; vacío/inválido/excesivo falla cerrado503 antes del proveedor.
- Una transacción reserva ambas ventanas. Advisory locks PostgreSQL global→red, conteo/creación dentro del lock; reloj epochDB posterior a adquirirlos para evitar inicio de transacción anterior a la espera y ambigüedad del huso horario del adapter. Fetch fuera de transacción. Segundo fallo revierte ambas reservas; fallo upstream conserva intento consumido.
- Identidad de red solo `trustedClientIp` bajo `MOBOS_TRUST_PROXY=true`, validada `net.isIP`, canonicalizada IPv6/IPv4-mapped; sin IP confiable todos comparten `untrusted-network`. Fingerprints hash, sin IP en claro. Ningún device/usuario/tenant/origin/header de app elegido por cliente cambia el cupo global.
- Requiere proxy que sanee cabeceras; la falta de configuración no abre cuota, comparte el bucket limitado. Presencia de clave y proxy en producción deben comprobarse sin imprimir valores antes de probar la consulta real.

## Evidencia

- `node backend/tests/ruc-demo.test.mjs`:143checksPASS, ruta+proveedor mock+middleware real web/Capacitor, negativos query/DV/origen, config inválida, proyección, no-store, errores/timeout/size y privado401.
- `node backend/tests/ruc.test.mjs`:188checksPASS; piloto privado, cuotas privadas y mapeo existentes. Se corrigió solo stub de membership obsoleto en el loader.
- `env -u DATABASE_URL -u DIRECT_URL node backend/tests/ruc-demo-pg.mjs`:24checksPASS. Cluster PostgreSQL descartable propio, definición AuthAttempt de migración real; dos clientes Prisma independientes, exactamenteN llamadas mock, global frente a rotaciónIP, desconocidos/headers forjados sinTRUST_PROXY, reinicio, rollback,0fetch siDB falla, barrera `pg_blocking_pids`, reloj posterior al lock y expiración24h/1h. Handlers reales invocados con Request en proceso, no se afirma servidorNext HTTP completo.
- Backendunit330PASS/1SQLskip preexistente, lint0errores/1warning preexistente DeliveryOperations, build backend exit0 y BUILD_ID presente, Prisma validatePASS, diffcheckPASS. Las pruebas nuevas se conectan al runner unit y al arnés Integration existente; el integrador ejecuta sus gates completos después de unir frontend/servidor.
- Sin clave leída de archivos, proveedor real, base de producción, deploy, versión o upload Apple. Pendiente: transporte UI integrado, comprobación runtime segura y una consulta real autorizada; luego Release/TestFlight nuevo para el bundle iPhone.

## Novedades para el dueño

- La demo podrá consultar el RUC en OwnData mediante el servidor y mostrar el nombre oficial para confirmarlo.
- La clave queda protegida en el servidor y las consultas tienen un límite compartido para controlar el uso.
- Si falta configuración o se alcanza el límite, se explica y se puede completar el dato manualmente.
