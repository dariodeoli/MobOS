# Google y alta de tienda — contrato para configuración

Estado: implementación local completa; no desplegada ni probada con Google real.

Esquema coordinado con el agente de promociones: modelo `GoogleIdentity` con subject único y relación única a Tenant. Migración independiente `20260911210000_google_identity`; aplicar antes de activar Google y regenerar Prisma. No se modifican permisos ni identidades existentes. La identidad se vincula por `sub` verificado, nunca por coincidencia de correo.

## Variables solo del backend

| Variable | Valor requerido |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID del cliente OAuth web WEEM autorizado para pruebas |
| `GOOGLE_CLIENT_SECRET` | Secreto de ese mismo cliente, solo en variables privadas del backend MobOS |
| `GOOGLE_REDIRECT_URI` | URL pública HTTPS del backend MobOS + `/api/auth/google/callback` |
| `MOBOS_APP_URL` | Origen exacto del frontend, sin ruta; por ejemplo `https://app.moboss.online` |
| `MOBOS_AUTH_SECRET` | 32 bytes aleatorios codificados como 64 caracteres hexadecimales; exclusivo de MobOS |
| `DATABASE_URL` | PostgreSQL propio de MobOS, nunca WEEM |
| `WEEM_EMAIL_RELAY_URL` | `https://weem.com.py/api/internal/email/send` — solo backend |
| `WEEM_EMAIL_RELAY_TOKEN` | Token dedicado de al menos 16 caracteres, igual al configurado en WEEM; nunca `RESEND_API_KEY` |
| `MOBOS_EMAIL_OUTBOX_ACTIVE_KEY_ID` | Identificador de la clave primaria que cifra nuevos trabajos; solo backend |
| `MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON` | Objeto JSON `{"key-id":"base64-de-32-bytes"}` con la clave activa y las anteriores aún necesarias para descifrar pendientes |
| `MOBOS_MAINTENANCE_TOKEN` | Bearer privado usado por el scheduler para procesar `POST /api/internal/email-outbox` |

No usar prefijos `VITE_` ni `NEXT_PUBLIC_` para estas variables. `VITE_API_URL` ya existente debe apuntar al backend correcto. MobOS no almacena ni usa una clave de Resend: recuperación, invitaciones y avisos transaccionales se envían por el relay de WEEM bajo el perfil fijo `mobos`.

### Cifrado y rotación del outbox

Mientras un correo está pendiente, `EmailOutbox.payload` contiene un sobre autenticado AES-256-GCM con formato exacto `mobos-email-outbox:v1:<key-id>:<nonce-base64url>:<ciphertext-base64url>:<tag-base64url>`. La identidad inmutable del trabajo y `recipient` se autentican como AAD, por lo que un sobre no puede trasladarse a otro trabajo ni redirigirse cambiando solamente la columna de destinatario. El contenido y el destinatario se borran al quedar enviado, cancelado o en estado terminal fallido; los logs y auditorías solo registran códigos operativos e IDs internos.

Para rotar, agregá la clave nueva al JSON, marcá su ID como activo y conservá las claves anteriores hasta que no existan trabajos pendientes cifrados con ellas. Después se pueden retirar. Quitar una clave con trabajos pendientes causa un fallo terminal seguro, sin exponer ni enviar el contenido. No reutilices `MOBOS_AUTH_SECRET`, `WEEM_EMAIL_RELAY_TOKEN` ni `MOBOS_MAINTENANCE_TOKEN` como clave de cifrado.

El outbox reintenta como máximo 5 veces con espera exponencial de 30 s, 60 s, 120 s, 240 s y tope de 15 min. Después pasa a `failedAt` (dead letter), borra destinatario/contenido y deja una auditoría sin PII. Los disparos originados por usuarios respetan `availableAt`; no evitan el backoff.

WEEM actualmente reenvía `Idempotency-Key` al proveedor pero no persiste ni aplica deduplicación propia. Por eso el contrato extremo a extremo es **al menos una vez**: una caída después de la aceptación del relay puede repetir la solicitud al proveedor. No afirmar entrega exactamente una vez sin un contrato durable adicional en el relay/proveedor.

## Bloqueos externos y entrega privada

La revisión local no encontró archivos `.env` reales en MobOS/WEEM ni estas credenciales en el entorno del proceso. No existe aquí una ruta privada con secretos lista para copiar. Los valores de WEEM se administran en Hub; el Main puede transferirlos directamente entre los campos privados del Hub sin imprimirlos, volcarlos a archivos, capturas o mensajes. No copiar secretos de JWT, base de datos ni listas de administradores de WEEM. No modificar WEEM.

Quien tenga acceso al cliente OAuth en Google Cloud debe añadir el callback exacto de MobOS a los URI de redirección autorizados, manteniendo los existentes. No sustituir el callback de WEEM en su aplicación. Si el consentimiento está en modo pruebas, incluir la cuenta de prueba autorizada. Sin confirmar esto no se puede afirmar que reutilizar el cliente funcione.

Cookies nuevas: HttpOnly, SameSite=Lax, Secure en HTTPS, sin Domain. Frontend y API deben estar en el mismo sitio (idealmente un proxy `/api` bajo el dominio de la app). Un backend en un dominio ajeno bloqueará estas cookies; no desactivar Secure/SameSite para eludirlo. El origen frontend debe estar permitido por el CORS existente. Local: frontend `http://localhost:5175`, callback `http://localhost:3001/api/auth/google/callback`; HTTP solo fuera de producción.

## Contrato HTTP

- `GET /api/auth/google?intent=login|create`: inicia Google con state, nonce y PKCE S256 ligados a cookie cifrada de 10 minutos.
- `GET /api/auth/google/callback`: valida identidad firmada de Google; vuelve a `/login?google=ready` o `/login?auth_error=<código>`. Nunca envía credenciales en URL.
- `POST /api/auth/google/complete`, `credentials: include`, Origin frontend exacto: `{action:"login"}` o `{action:"create", companyName}`. Devuelve tenant/sellers/scope y cookie HttpOnly de empresa. Alta requiere iniciar con `intent=create`.
- Alta: Google ya verificó el correo, por lo que `emailVerifiedAt` se guarda al crear el tenant. Empresa y ADMIN nacen dentro de una transacción; el dueño elige su PIN durante onboarding. El correo de bienvenida se persiste en `EmailOutbox`, usa una identidad UUID propia del trabajo —independiente de credenciales y tenant— y se reintenta con esa misma clave mientras `welcomeEmailSentAt` sea nulo. Sin vincular por correo, elevar usuarios existentes ni importar datos.
- `POST /api/auth/pin`: mantiene PIN individual; acepta cookie de empresa con validación de Origin. La sesión individual existente sigue usando Bearer.

Google habilita el dispositivo para una empresa; para operar sigue siendo necesario seleccionar usuario y validar PIN. Las empresas anteriores continúan con contraseña; la vinculación de dueño existente queda fuera de este alta.

No se hicieron deploy, commit/push, cambios DNS, Cloudflare o Resend.

## Verificación local y archivos de esta entrega

`node tests/auth-google.mjs` desde backend: 62 comprobaciones pasan con rutas reales, migraciones completas y PostgreSQL desechable. Google se simula con tokens RSA firmados localmente: no es una prueba contra el proveedor real. Se cubren PKCE/state/nonce, firma, issuer/audience/expiry/email verificado, expiración y alteración de cookies, ausencia de configuración, aislamiento por tenant, PIN, origen ajeno, alta concurrente sin duplicados, no vinculación por correo y logout con revocación y borrado de cookie.

TypeScript backend (`tsc --noEmit --incremental false`) y compilación frontend (`npm run build`) pasan. El frontend informa el aviso de tamaño de bundle mayor a 500 kB. No hubo prueba visual de navegador ni login Google real.

Archivos propios (rutas relativas a la raíz del repositorio):

- `backend/.env.example`
- `backend/AUTH-CONFIG.md`
- `backend/lib/google-oauth.ts`
- `backend/lib/google-company.ts`
- `backend/lib/auth.ts`
- `backend/app/api/auth/google/route.ts`
- `backend/app/api/auth/google/callback/route.ts`
- `backend/app/api/auth/google/complete/route.ts`
- `backend/app/api/auth/pin/route.ts`
- `backend/app/api/auth/logout/route.ts`
- `backend/prisma/schema.prisma` (solo GoogleIdentity y relación Tenant, coordinado)
- `backend/prisma/migrations/20260911210000_google_identity/migration.sql`
- `backend/tests/auth-google.mjs`
- `src/lib/api/session.js`
- `src/pages/Login.jsx`

Referencias de validación del proveedor: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [referencia OIDC](https://developers.google.com/identity/openid-connect/reference).
Las respuestas públicas de recuperación de contraseña y reenvío de verificación mantienen el mismo cuerpo/estado y un piso mínimo de 500 ms. El token y su trabajo pendiente se confirman en la misma transacción; el relay se invoca después del commit con una clave estable y los fallos quedan reintentables por el flujo de origen y por `POST /api/internal/email-outbox`. Los enlaces llevan el token en el fragmento y el frontend lo elimina del historial antes de usar la API. El healthcheck informa correo `configured`: confirma configuración local, no alcance ni entrega real del relay.
