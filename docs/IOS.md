# App de iPhone — estado y pendientes

La app de iPhone **no es prioridad por ahora**. Este documento deja anotado lo
que ya existe y lo que queda para más adelante.

## Ya existe (en Apple)

- App ID `online.moboss.app`.
- Clave de Apple `Y232HM59NN` (team `F65VS7VHB9`).
- La app ya está creada en App Store Connect.

## Ya existe (en el backend / web)

- `DELETE /api/me`: borrar mi cuenta (Apple 5.1.1(v) lo exige para cualquier app
  con cuentas, y sirve igual en la web). Reautenticación en el mismo pedido con
  `{ "pin": "…" }` o `{ "password": "…" }` (contraseña de la empresa, solo ADMIN).
  - Integrante: se desvincula de todas sus tiendas, se cierran sus sesiones, se
    borran sus avisos push y su foto, y se anonimiza su nombre y correo
    («Usuario eliminado»). Las ventas y demás registros del negocio se conservan.
  - Dueño o único administrador de una tienda: `409` con
    `code: "OWNER_MUST_TRANSFER_OR_DELETE_STORE"` y la lista `stores`; primero
    debe transferir o eliminar la tienda (`purgeStore` en Configuración).
  - Limitado a 5 pedidos por IP cada 15 min (antes de consultar la base) y
    auditado como `ACCOUNT_DELETED_SELF`. Sin interfaz todavía.
- Página pública `/soporte` (y `/privacidad` completa con terceros y retención).

## Pendiente para más adelante

- Token de sesión en el cuerpo para clientes nativos (`X-MobOS-Client: ios/<versión>`).
- CORS para `capacitor://localhost` e `ionic://localhost`.
- `GET /api/config` (versión mínima, enlaces legales).
- Sign in with Apple (JWKS, nonce, relay privado, revocación al borrar la cuenta).
- Notificaciones APNs (`DeviceToken`, envío HTTP/2 enganchado al Web Push).
- Botón «Borrar mi cuenta» en Mi cuenta (usa `DELETE /api/me`).
- Variables de Coolify cuando se retome: `MOBOS_APPLE_CLIENT_IDS`,
  `MOBOS_APPLE_TEAM_ID`, `MOBOS_APPLE_KEY_ID`, `MOBOS_APPLE_PRIVATE_KEY`,
  `MOBOS_APNS_KEY_ID`, `MOBOS_APNS_TEAM_ID`, `MOBOS_APNS_PRIVATE_KEY`,
  `MOBOS_APNS_TOPIC`, `MOBOS_IOS_MIN_VERSION`.
