# Rotación de tokens y claves (#232)

Runbook para Dario: cómo rotar los secretos que pudieron quedar visibles en los
logs de deploy de Coolify y los que conviene rotar por higiene. Acompaña a
`docs/SEGURIDAD-LOGS.md` (checklist de higiene y restricciones de Coolify).

## Reglas de oro

1. **Todo se cambia en este orden:** generar el valor nuevo en el proveedor →
   cargarlo en Coolify (Environment Variables, valor **locked**) → redeploy →
   **verificar** → recién ahí **revocar el viejo** en el proveedor.
2. Nunca pegar valores en issues, PRs, capturas, descripciones ni comandos:
   siempre el **nombre** de la variable (`$MOBOS_MAINTENANCE_TOKEN`).
3. El **token de deploy** vive en el Keychain de la Mac (no en el repo):
   `mobos-release-deploy-webhook` y `mobos-release-deploy-token`.
4. Si algo falla después de rotar, se vuelve al valor viejo hasta entender
   (no se borra el viejo antes de verificar).
5. Rota primero lo **expuesto** (los tres primeros de la tabla) y luego el resto
   por higiene; después, una vez por trimestre.

## Hallazgos de la revisión de Dario (22-09-2026)

1. **2FA desactivado** en la cuenta **Owner (Freddy)** y en la **Admin (Dario)**
   de Coolify → hay que **activarlo en las dos** antes de la rotación.
2. Los **tokens de Coolify tienen permisos más amplios** que solo deploy → en la
   rotación planificada se **reducen a lo imprescindible** (least privilege).
3. **No hay tokens `read:sensitive` ni root** (verificado) → mantener ese
   estado; igual conviene **rotar los que puedan haber quedado en logs**.

## 0. Cuenta y permisos de Coolify (hacer primero)

### 0.1 Activar 2FA en Owner y Admin

1. Coolify → menú de la cuenta (avatar, arriba a la derecha) → **Security** →
   **Two-Factor Authentication** → **Enable**.
2. Escanear el QR con una app de autenticación (Google Authenticator, Authy,
   1Password…), ingresar el código de 6 dígitos y **guardar los códigos de
   recuperación** en el gestor de secretos (no en el repo).
3. Repetir con la **otra cuenta** (Owner y Admin).
4. Verificar: cerrar sesión y volver a entrar → el segundo factor se pide.

### 0.2 Reducir los tokens de Coolify a least privilege

1. Coolify → **Keys & Tokens** → listar los tokens de API existentes y anotar
   quién los usa (el deploy del Hub, automatizaciones, etc.).
2. Por cada token en uso: **editar sus permisos** y dejar solo lo que necesita
   (para el deploy: **deploy**; nada de administración, escritura total ni
   lectura de configuración). Si el token no permite limitar permisos:
   **crear uno nuevo con el mínimo** y **revocar el amplio**.
3. **Revocar** todo token sin uso o sin dueño claro. No crear `root` ni
   `read:sensitive`.
4. Verificar: un `MOBOS_INTEGRATOR=1 npm run release:prepare --check-deploy-config`
   y un deploy de prueba con el token nuevo; recién ahí borrar el viejo.

## Runbook por secreto

### 1. `IMEICHECK_TOKEN` (expuesto)

1. Panel de IMEIcheck → *API* → generar token nuevo (y revocar el anterior cuando
   el nuevo funcione).
2. Coolify → **backend** → Environment Variables → `IMEICHECK_TOKEN=<nuevo>`
   (marcado como locked) → Save → **Redeploy**.
3. Verificar: una consulta de IMEI desde Inventario con `IMEICHECK_LIVE` como
   esté configurado (o el flujo simulado si está apagado) y mirar que responda.
4. Revocar el token viejo en el panel.

### 2. Claves sandbox de AEX (`MOBOS_AEX_PUBLIC_KEY`, `MOBOS_AEX_PRIVATE_KEY`, `MOBOS_AEX_WEBHOOK_TOKEN`) (expuestas)

1. Portal sandbox de AEX → regenerar par público/privado y el token del webhook.
2. Coolify → backend → Environment Variables (las tres) → Save → redeploy.
3. Verificar: `node scripts/aex-sandbox-prueba.mjs` (solo sandbox) y una
   recepción de webhook de prueba.
4. Revocar las claves viejas en AEX.

### 3. Tokens de deploy (expuestos)

- **OwnCoding Hub (webhook + token):** generar el token nuevo en el Hub;
  actualizar el Keychain de la Mac:
  ```bash
  security add-generic-password -U -s mobos-release-deploy-webhook -a "$USER" -w "<url-nueva>"
  security add-generic-password -U -s mobos-release-deploy-token -a "$USER" -w "<token-nuevo>"
  ```
  Verificar con `MOBOS_INTEGRATOR=1 npm run release:prepare --check-deploy-config`
  y un `release:publish` de prueba; después revocar el token viejo en el Hub.
- **Token de API de Coolify:** Coolify → *Keys & Tokens* → revocar el que pudo
  quedar expuesto y generar uno nuevo **solo si** alguna automatización lo usa,
  con permisos **mínimos** (deploy) según §0.2.
- **GitHub PAT (si se usó en logs):** GitHub → Settings → Developer settings →
  revocar y generar otro; `gh auth login` en la Mac.

### 4. Resto del inventario (por higiene)

| Secreto | Generación | Verificación |
| --- | --- | --- |
| `MOBOS_AUTH_SECRET` | `openssl rand -hex 32` | Cierra sesiones activas (avisar): los usuarios vuelven a entrar |
| `MOBOS_MAINTENANCE_TOKEN` | `openssl rand -hex 32` | `curl` a los 3 endpoints internos → 200 (ver `docs/STORAGE-Y-SCHEDULER.md`) |
| `WEEM_EMAIL_RELAY_TOKEN` | Relay de correo | Un correo de prueba (recuperación o aviso de pedido) |
| `RUC_SUN_API_KEY` | Proveedor RUC/SUN | Consulta de RUC desde Configuración |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | Login con Google (y actualizar el redirect si cambia) |
| `MOBOS_SIFEN_CERT_PASSWORD` | Proveedor del certificado | Estado SIFEN y una emisión de prueba |
| `MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON` | `openssl rand -hex 32` por clave | El outbox drena y el correo sale |

Cada uno: mismo orden (proveedor → Coolify locked → redeploy → verificar →
revocar viejo).

## Agenda sugerida

| Cuándo | Qué |
| --- | --- |
| **Día 1 (expuesto + cuenta)** | 2FA en Owner y Admin · tokens de Coolify a least privilege · IMEICHECK_TOKEN · claves sandbox AEX · tokens de deploy |
| **Semana 1 (higiene)** | MOBOS_AUTH_SECRET (avisar del re-login) · MOBOS_MAINTENANCE_TOKEN · WEEM · RUC/SUN · Google · SIFEN · outbox |
| **Trimestral** | Repaso completo + `npm run audit:logs` |

## Checklist de cierre

- [ ] **2FA activo** en las cuentas Owner (Freddy) y Admin (Dario), con códigos de recuperación guardados.
- [ ] Tokens de Coolify con permisos **mínimos** (deploy); sin tokens root ni `read:sensitive`; los sin uso, revocados.
- [ ] Cada valor nuevo está en Coolify como **locked** (no visible en la UI).
- [ ] Redeploy hecho y **logs revisados**: no aparece ningún valor.
- [ ] Verificación funcional de la tabla (una por secreto).
- [ ] Valores viejos **revocados** en su proveedor.
- [ ] `npm run audit:logs` en verde y `npm run release:smoke` OK.
