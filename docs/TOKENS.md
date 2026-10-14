# Reglas de tokens, enlaces y sesiones (MobOS)

Regla viva del proyecto, hermana de `docs/AVATAR.md` y `docs/TABLAS.md`. Nace del
patrón ya probado en Scale OS (`scale-core-api`), que funciona en producción:
todo se resuelve **server-side** con **Postgres como reloj autoritativo**. Antes
de crear o tocar un token (recuperación, verificación, invitación, sesión),
seguí estas reglas.

## 1. Generación y almacenamiento

| Paso | Regla |
| --- | --- |
| Generar | `crypto.randomBytes(32).toString('hex')` → **64 caracteres hex**. (Enlaces de un solo uso: token opaco, nunca JWT ni firmado). |
| Guardar | Solo **`sha256(token)`** en la columna `tokenHash` (`UNIQUE`). El token crudo **nunca** se guarda ni se loguea. |
| Buscar | `where tokenHash = sha256(recibido)`. |
| Validar formato | Antes de tocar la base: `/^[a-f0-9]{64}$/`. Si no cumple → 400 (o `''` en el cliente) **sin consultar la DB**. |
| Token en la URL | Viaja en el **path** (`/aceptar-invitacion/<token>`, `/restablecer-contrasena/<token>`, `/verificar-correo/<token>`): inmune a los redirects del relay. Nunca en query/fragmento para los correos. |

## 2. Expiración: el reloj es el de Postgres

- La comparación se hace **en la base**: `expires_at > now()`. Nunca con
  `new Date()` de Node, que puede diferir del reloj de la DB y producir "venció
  al instante" o "no vence nunca".
- TTLs de referencia: recuperación **1 h** (MobOS: 30 min), verificación de
  correo **24 h** (MobOS: 60 min), invitación de equipo **7 días**, sesión
  **7 días**.
- Emitir un token nuevo **invalida los anteriores no usados** del mismo tipo y
  destinatario (el enlace viejo deja de servir).

## 3. Un solo uso, atómico

- Consumir con una operación atómica y verificar que devolvió una fila:
  `DELETE ... WHERE token_hash=$1 AND expires_at > now() RETURNING ...`, o
  `UPDATE ... SET used_at = now() ... FOR UPDATE` dentro de la transacción.
- Si dos pedidos llegan juntos, **uno gana** y el otro recibe 400 ("vencido o
  utilizado"). Nada de "leer → decidir → escribir" sin lock.
- **Consumir después de validar**: la política de contraseña (y el hash) se
  validan **antes** de consumir el token, para no perderlo si el usuario se
  equivoca al tipear.
- La misma transacción cierra las sesiones activas al cambiar la contraseña y
  borra los tokens restantes del mismo tipo.

## 4. Anti-enumeración y abuso

- El endpoint público responde **202 idéntico** exista o no la cuenta.
- Throttle por destinatario/correo (clave hasheada) además del límite por IP.
- Los correos de acción no revelan si el correo existe.

## 5. Sesiones

- El **id de la sesión es el token aleatorio** (64 hex), opaco, con búsqueda en
  la DB; se borra al cerrar sesión. El hash es lo único persistido.
- Cookie HttpOnly, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age`; en MobOS:
  `mobos_seller_session` y `mobos_company_session` (`sessionCookieOptions`).
- El login por PIN exige primero la sesión de empresa (contexto de tenant).

## 6. Errores que rompen esto al replicarlo

1. Guardar o comparar el token **crudo** en vez de `sha256` → nunca coincide.
2. Usar la hora de **Node** para el TTL y la de la **DB** para validar.
3. **Consumir** el token antes de validar la contraseña → se pierde el enlace.
4. **Formato equivocado** (43 base64url vs 64 hex) → el regex rechaza tokens
   legítimos.
5. **Doble submit** en el endpoint de un solo uso → "ya fue utilizado".
6. Extraer el token de una URL **sin decodificar**: el tracker del relay deja
   `%2F` pegado y el token sale corrido (ver `src/lib/actionToken.js`).

## 7. Estado en MobOS y brechas a cerrar

| Regla | Estado |
| --- | --- |
| Token 64 hex + `sha256` + lookup por hash | ✅ recuperación, verificación, invitaciones y sesiones |
| Formato validado antes de la DB | ✅ API y cliente |
| Token en el path | ✅ (el cliente lo extrae y limpia la URL) |
| Token nuevo invalida los anteriores | ✅ recuperación |
| Un solo uso | ✅ con `usedAt`; falta el patrón `DELETE ... RETURNING`/`FOR UPDATE` |
| Validar antes de consumir | ✅ recuperación (hash y política antes) |
| **Reloj de la DB** | ✅ el TTL se emite y se valida con `now()` de Postgres (`$queryRaw`/`$executeRaw`) |
| Política de contraseña | ✅ `validarClave` compartida (12–128, mayúscula, minúscula, número y símbolo, sin espacios, sin el correo, sin claves comunes) en alta y recuperación |
| Throttle por correo | ✅ por IP y por cuenta (3 pedidos de recuperación por 15 min, respuesta neutra igual) |

> Referencias MobOS: `backend/lib/email-actions.ts`, `backend/lib/auth.ts`
> (`hashToken`, `createSession`), `backend/app/api/auth/password-reset/route.ts`,
> `backend/app/api/user-invitations/`, `src/lib/actionToken.js`.

## 8. Tokens de comprobantes impresos (QR que no vence)

El papel no expira: un comprobante impreso (hoy, la liquidación de comisiones)
sigue verificando mientras no se emita un enlace nuevo. Reglas del patrón
(#172/#178):

- **Solo `sha256` en la base**: `CommissionSettlement.verificationTokenHash`.
  El token crudo (64 hex) se revela **una vez** al emitir o rotar; no se
  persiste ni se loguea, así un dump de la tabla no abre comprobantes.
- **Backfill legacy**: la migración guarda el `sha256` de los tokens viejos
  (cuid) y vacía la columna cruda; los QR ya impresos siguen validando por
  hash.
- **Rotación explícita**: la acción `rotate` (auditada
  `COMMISSION_SETTLEMENT_TOKEN_ROTATED`) emite un token nuevo e invalida el
  anterior. El panel avisa al reimprimir/copiar cuando ya no tiene el token en
  memoria: sin crudo guardado, emitir uno nuevo es el único camino (el token
  anterior deja de funcionar).
- **Límite de uso**: los endpoints públicos aplican `enforceRateLimit`
  (30 req/min por IP); `public/commission-settlements` lo hace desde #178,
  igual que `portal`, `quotes` y `transfers`.

> Prueba reproducible: `node backend/tests/commission-settlement-public.mjs`
> (base descartable; emisión, verificación, 429, rotación, permisos,
> aislamiento y backfill legacy).
