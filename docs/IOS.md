# App de iPhone — contrato del backend y pendientes

App en Capacitor (WebView con origen `capacitor://localhost`). Este documento es
el **contrato** entre el backend y la app. El código vive en `backend/` y se
prueba con `backend/tests/ios-backend.mjs` (PostgreSQL desechable, Apple, Google
y APNs simulados): `cd backend && LC_ALL=en_US.UTF-8 node tests/ios-backend.mjs`.

## Ya existe (en Apple)

- App ID / bundle `online.moboss.app`, clave de Apple `Y232HM59NN`, team `F65VS7VHB9`.
- La app ya está creada en App Store Connect.

## Contrato de cliente nativo

- Todo pedido de la app lleva `X-MobOS-Client: ios/<versión>` (ej. `ios/1.0.0`) y
  `Authorization: Bearer <token>` cuando hay sesión. Las cookies **no** se usan.
- Solo para clientes nativos, las respuestas de acceso traen el token **en el
  cuerpo** (y no ponen cookie). El header se ignora si el `Origin` es un sitio web
  (`app.moboss.online` no recibe tokens en el cuerpo aunque mande el header); vale
  sin `Origin` (HTTP nativo) o con `capacitor://localhost` / `ionic://localhost`.
- CORS permite `capacitor://localhost` e `ionic://localhost` y los headers
  `Authorization`, `Content-Type`, `X-MobOS-Client`, `Idempotency-Key`, `X-Request-Id`.
- Sesión en dos pasos, igual que la web (TOKENS.md: 64 hex, solo `sha256` en la base, 7 días):
  1. **Empresa** → `token` (sesión `COMPANY`): `POST /api/auth/login` (correo + contraseña +
     `deviceId`), `POST /api/auth/apple` o `POST /api/auth/google/native`. Respuesta:
     `{ token, expiresAt, tenant, sellers, onboardingRequired, scope, stores? }`.
  2. **Vendedor** → `sellerToken`: `POST /api/auth/pin` con `Authorization: Bearer <token>`
     y `{ sellerId, pin }`. Respuesta: `{ user, sellerToken, expiresAt }`.
  Todo lo demás del API usa `Authorization: Bearer <sellerToken>`. Cerrar sesión:
  `POST /api/auth/logout` con Bearer.
- Varias tiendas (Apple/Google): la respuesta es `{ storeRequired: true, stores: [{id,name,slug}] }`
  y la app repite el pedido con `storeId`.

## `GET /api/config` (público)

`{ minVersion: { ios }, supportUrl, privacyUrl, termsUrl }`. Variables:
`MOBOS_IOS_MIN_VERSION` (por defecto `1.0.0`), `MOBOS_SUPPORT_URL`,
`MOBOS_PRIVACY_URL`, `MOBOS_TERMS_URL` (por defecto `/soporte`, `/privacidad`,
`/terminos` de `moboss.online`). Si la versión de la app es menor, bloquear con «Actualizá la app».

## Sign in with Apple — `POST /api/auth/apple`

Body: `{ identityToken, nonce, fullName?, authorizationCode?, storeId?, deviceId? }`.

- `nonce` es el valor **crudo**; la app le pasa a Apple `sha256(nonce)` en hex y el
  backend exige que el claim `nonce` sea ese hash.
- Se verifica: firma RS256 con el JWKS de Apple, `iss = https://appleid.apple.com`,
  `aud ∈ MOBOS_APPLE_CLIENT_IDS` (`online.moboss.app`), `exp`, nonce.
- **Nunca crea cuentas ni tiendas.** Solo entra si la identidad ya está vinculada
  (`AppleIdentity`) o si el correo real verificado por Apple coincide con una cuenta de
  Google o una tienda con correo verificado. Si no hay tienda: `403` con
  «No hay una tienda vinculada a esta cuenta».
- Relay privado (`@privaterelay.appleid.com`): funciona una vez vinculada. Para la primera
  vez, la app abre sesión con contraseña/Google y llama a `/api/auth/apple` **con el
  Bearer de esa sesión**: vincula la identidad a esa cuenta.
- `authorizationCode` (opcional pero recomendado): el backend lo canjea y guarda el
  refresh token **cifrado** solo para revocarlo al borrar la cuenta.
- `fullName` (`{givenName,familyName}` o texto) llega solo la primera vez que Apple lo entrega.
- Errores: `400` cliente no nativo / pedido inválido, `401` identidad inválida,
  `403` sin tienda, `429` demasiados intentos (20 / 15 min por IP, **antes** de la base),
  `503` sin configurar.

## Google en iPhone — `POST /api/auth/google/native`

Body: `{ idToken, storeId? }`. Verifica firma con el JWKS de Google, `iss`, `exp`,
`email_verified` y `aud ∈ MOBOS_GOOGLE_IOS_CLIENT_ID` (lista separada por comas).
Cliente iOS actual: `500595134387-36gmh5fu4tucjt0u2c9c380i4662pvdh.apps.googleusercontent.com`
(no es secreto). Misma regla: solo tiendas ya vinculadas (`403` si no hay), mismos errores.

## Notificaciones push (APNs)

- `POST /api/push/devices` `{ token, environment?: 'sandbox'|'production', appVersion? }`
  (Bearer de vendedor): registra el token del iPhone (64+ hex). Es único: si el iPhone
  cambia de usuario, pasa al nuevo. `DELETE /api/push/devices` `{ token }` lo quita
  (llamarlo al cerrar sesión). Las builds de TestFlight/Store registran `production`; las de Xcode, `sandbox`.
- Envío: `enviarWebPush` (el mismo que usan los avisos web) ahora también manda por
  APNs HTTP/2 con token `.p8`. Payload genérico (sin clientes, montos ni IMEI):
  `aps.alert.{title,body}`, `aps.thread-id` y `url` (ruta interna a abrir).
- Un `410`/`BadDeviceToken`/`Unregistered` borra el token. Sin variables de APNs es un
  no-op con log (`apns_not_configured`). Un error transitorio no borra nada.

## Borrar mi cuenta (Apple 5.1.1(v))

`DELETE /api/me` con Bearer de vendedor y reautenticación en el mismo pedido, una de:
`{ pin }`, `{ password }` (admin), `{ apple: { identityToken, nonce } }` o
`{ googleIdToken }` (la identidad tiene que ser la vinculada a la cuenta). Efectos:
se revocan los tokens de Apple (`MOBOS_APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY`), se borran
`AppleIdentity`, tokens APNs, avisos web y foto, se cierran las sesiones y se anonimiza
el perfil. Dueño / único admin: `409 OWNER_MUST_TRANSFER_OR_DELETE_STORE`.
Límite 5 pedidos / 15 min por IP. Si Apple falla al revocar, se registra y el borrado sigue.

## Variables de entorno (Coolify)

| Variable | Para qué |
| --- | --- |
| `MOBOS_APPLE_CLIENT_IDS` | `online.moboss.app` (lista por comas) |
| `MOBOS_APPLE_TEAM_ID`, `MOBOS_APPLE_KEY_ID`, `MOBOS_APPLE_PRIVATE_KEY` | revocar al borrar la cuenta (client_secret ES256) |
| `MOBOS_GOOGLE_IOS_CLIENT_ID` | aud permitido del login con Google en iPhone |
| `MOBOS_APNS_KEY_ID`, `MOBOS_APNS_TEAM_ID`, `MOBOS_APNS_PRIVATE_KEY` | envío APNs |
| `MOBOS_APNS_TOPIC` | `online.moboss.app` |
| `MOBOS_IOS_MIN_VERSION` | versión mínima de la app (opcional) |

## Qué tiene que hacer Dario

1. Google Cloud, proyecto **WEEM**: cliente tipo iOS «MobOS iOS» (bundle `online.moboss.app`,
   equipo `F65VS7VHB9`) — ya creado; cargar su ID en Coolify como `MOBOS_GOOGLE_IOS_CLIENT_ID`.
2. Coolify: confirmar `MOBOS_APNS_TOPIC=online.moboss.app` (falta), y que estén
   `MOBOS_APPLE_CLIENT_IDS`, `MOBOS_APPLE_TEAM_ID`, `MOBOS_APPLE_KEY_ID`, `MOBOS_APPLE_PRIVATE_KEY`,
   `MOBOS_APNS_KEY_ID`, `MOBOS_APNS_TEAM_ID`, `MOBOS_APNS_PRIVATE_KEY`.
3. La clave `.p8` de Apple debe tener habilitados **Sign in with Apple** y **APNs**
   (si son claves distintas, usar la de Sign in with Apple en `MOBOS_APPLE_*`).
4. Redeploy del backend (la migración `20270130120000_ios_apple_push` es aditiva).

## Pendiente en la app (otro frente)

- Botón «Borrar mi cuenta» en Mi cuenta (usa `DELETE /api/me`), pantalla de Apple/Google,
  registro del token push, chequeo de `minVersion`.
- Página pública `/soporte` y `/privacidad` ya existen en la web.
