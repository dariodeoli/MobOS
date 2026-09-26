# Rotación de tokens y claves (#232)

Checklist **ejecutable** para Dario: se recorre de arriba abajo, con la
verificación a la vista y registro del día al final. Acompaña a
`docs/SEGURIDAD-LOGS.md` (higiene y restricciones de Coolify).

## Cómo se ejecuta

```bash
npm run rotacion:tokens                # recorrido guiado: paso a paso, con verificación
npm run rotacion:tokens -- --estado    # tablero de estado, sin preguntas
```

- **No imprime valores**: solo nombres de variables y estados (OK / FALLO / PENDIENTE).
- Al terminar deja `docs/qa/rotacion-tokens/registro-<AAAA-MM-DD>.md` (sin
  secretos) para volcar al registro de abajo.
- La verificación automática delega en `scripts/verificar-rotacion-tokens.mjs`
  (auditoría de logs, producción, endpoints internos y token viejo rechazado).

## Estado actual (26/09/2026)

- ✅ **2FA activo en Coolify** (confirmado por Dario). Los pasos 0.1 y 0.2
  quedan hechos; el tablero (`--estado`) ya los muestra en verde.
- **Falta (1): reducir tokens a least-privilege** — paso **0.4** (Coolify →
  Keys & Tokens: dejar solo **Deploy** donde se pueda; si un token no se puede
  recortar, crear uno mínimo y revocar el amplio). No crear `root` ni
  `read:sensitive`.
- **Falta (2): rotar los que pudieron quedar en logs** — **Fase 1** completa
  (IMEIcheck · AEX sandbox · deploy del Hub · token de API de Coolify · GitHub
  PAT), **en una ventana coordinada con el deploy**: la rotación incluye un
  redeploy y su verificación, así que se hace fuera del horario de operación y
  con el deploy de respaldo listo (regla de oro 4).
- **Después**: Fase 2 (higiene) y Fase 3 (cierre) como están abajo.
- Nada de esto lo ejecuta el agente: **el checklist es para Dario** (no toca
  Coolify).

## Reglas de oro

1. **Orden de cada rotación:** generar el valor nuevo en el proveedor → cargarlo
   en Coolify (Environment Variables, valor **locked**) → redeploy →
   **verificar** → recién ahí **revocar el viejo**. Nunca se revoca antes.
2. Nunca pegar valores en issues, PRs, capturas, descripciones ni comandos:
   siempre el **nombre** de la variable (`$MOBOS_MAINTENANCE_TOKEN`).
3. El **token de deploy** vive en el Keychain de la Mac (no en el repo):
   `mobos-release-deploy-webhook` y `mobos-release-deploy-token`.
4. Si algo falla después de rotar, se vuelve al valor viejo hasta entender
   (no se borra el viejo antes de verificar).
5. Prioridad: primero la cuenta (Fase 0) y lo **expuesto** (Fase 1); después el
   resto por higiene (Fase 2); luego una vez por trimestre.

## Fase 0 — Cuenta y permisos (Día 0, antes de rotar)

- [x] **0.1 2FA en la cuenta Owner (Freddy).** ✅ *(hecho, 26/09)* Coolify (`hub.owncoding.dev`) →
  avatar arriba a la derecha → **Security** → **Two-Factor Authentication** →
  **Enable** → escanear el QR con la app de autenticación (Google
  Authenticator, Authy, 1Password…) → ingresar el código de 6 dígitos.
  *Verificar:* cerrar sesión y volver a entrar: pide el segundo factor.
- [x] **0.2 2FA en la cuenta Admin (Dario).** ✅ *(hecho, 26/09)* Repetir 0.1 con la cuenta de
  Dario. *Verificar:* cerrar sesión y volver a entrar con esa cuenta.
- [ ] **0.3 Códigos de recuperación.** Guardar los de **las dos cuentas** en el
  gestor de secretos del equipo (nunca en el repo, un chat ni una captura).
- [ ] **0.4 Tokens de Coolify con permisos mínimos (least privilege).**
  Coolify → **Keys & Tokens**: por cada token en uso, **editar** y dejar solo lo
  imprescindible (para el deploy: **Deploy**; nada de administración ni lectura
  de configuración). Si el token no permite recortar: **crear uno nuevo
  mínimo** y **revocar el amplio**. Revocar los que no tengan dueño claro. No
  crear `root` ni `read:sensitive`.
  *Verificar:*
  `npm run release:prepare -- --check-deploy-config` y un deploy de prueba con el
  token nuevo; recién ahí borrar el viejo.

## Fase 1 — Secretos que pudieron quedar en logs (ventana coordinada con el deploy)

> **Cuándo:** en una **ventana coordinada con Dario**, fuera del horario de
> operación. Cada paso termina en un redeploy y su verificación; se hace con el
> valor viejo todavía vigente para poder volver atrás (regla de oro 4).

Para cada uno: generar en el proveedor → Coolify (**locked**) → redeploy →
verificar → **revocar el viejo**.

- [ ] **1.1 `IMEICHECK_TOKEN`.** Panel de IMEIcheck → *API* → generar el token
  nuevo (sin revocar el viejo todavía) → Coolify → aplicación **backend**
  (`api.moboss.online`) → Environment Variables → `IMEICHECK_TOKEN=<nuevo>`
  (locked) → Save → **Redeploy**.
  *Verificar:* una consulta de IMEI desde Inventario (con `IMEICHECK_LIVE` como
  esté configurado). Recién ahí revocar el token viejo en el panel.
- [ ] **1.2 Claves sandbox de AEX** (`MOBOS_AEX_PUBLIC_KEY`,
  `MOBOS_AEX_PRIVATE_KEY`, `MOBOS_AEX_WEBHOOK_TOKEN`). Portal sandbox de AEX →
  regenerar el par y el token del webhook → Coolify → backend → Environment
  Variables (las tres, locked) → Save → redeploy.
  *Verificar:* `node scripts/aex-sandbox-prueba.mjs` (solo sandbox) y una
  recepción de webhook de prueba; después revocar las claves viejas en AEX.
- [ ] **1.3 Tokens de deploy (OwnCoding Hub).** Panel del Hub → generar webhook
  y token nuevos → actualizar el Keychain de la Mac:
  ```bash
  security add-generic-password -U -s mobos-release-deploy-webhook -a "$USER" -w "<url-nueva>"
  security add-generic-password -U -s mobos-release-deploy-token -a "$USER" -w "<token-nuevo>"
  ```
  *Verificar:* `npm run release:prepare -- --check-deploy-config` (valida, no
  despliega) y un `release:publish` de prueba; después revocar lo viejo en el
  Hub.
- [ ] **1.4 Token de API de Coolify expuesto.** Coolify → **Keys & Tokens** →
  revocar el que pudo quedar en los logs; si una automatización lo usa, crear
  uno nuevo con permisos mínimos (**Deploy**) como en 0.4.
  *Verificar:* la automatización sigue funcionando y el viejo ya no autentica.
- [ ] **1.5 GitHub PAT (si se usó en los logs).** GitHub → Settings →
  Developer settings → Personal access tokens → revocar el expuesto y generar
  otro con el mínimo alcance.
  *Verificar:* `gh auth status` y un `git fetch`.

## Fase 2 — Higiene (Semana 1)

| Secreto | Generación | Verificación |
| --- | --- | --- |
| `MOBOS_AUTH_SECRET` | `openssl rand -hex 32` | Cierra sesiones activas (**avisar**): los usuarios vuelven a entrar |
| `MOBOS_MAINTENANCE_TOKEN` | `openssl rand -hex 32` | Los 3 endpoints internos dan 200 con el nuevo y 401 con el viejo (`docs/STORAGE-Y-SCHEDULER.md`) |
| `WEEM_EMAIL_RELAY_TOKEN` | Relay de correo | Un correo real de prueba (recuperación o aviso de pedido) |
| `RUC_SUN_API_KEY` | Proveedor RUC/SUN | Consulta de RUC desde Configuración |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | Login con Google (y el redirect igual) |
| `MOBOS_SIFEN_CERT_PASSWORD` | Proveedor del certificado | Estado SIFEN y una emisión de prueba |
| `MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON` | `openssl rand -hex 32` por clave | El outbox drena y sale un correo transaccional |

Cada uno: mismo orden (proveedor → Coolify locked → redeploy → verificar →
revocar viejo).

## Fase 3 — Cierre y registro

- [ ] **3.1** `npm run audit:logs` → tiene que decir «Higiene de logs OK».
- [ ] **3.2** Redeploy de backend y app, y **leer los logs completos** → no debe
  aparecer ningún valor (si aparece, rotar de nuevo ese secreto y avisar).
- [ ] **3.3** `npm run release:smoke` → producción sana y en la versión publicada.
- [ ] **3.4** Completar la tabla «Registro de rotación» de abajo (y guardar el
  `docs/qa/rotacion-tokens/registro-<AAAA-MM-DD>.md` de la corrida).

## Soporte automatizado

El recorrido guiado corre, paso por paso, la verificación que corresponda. La
verificación suelta también se puede correr sola (no imprime valores):

```bash
# Higiene del repo + producción + endpoints internos + token viejo
MOBOS_MAINTENANCE_TOKEN=<nuevo> MOBOS_MAINTENANCE_TOKEN_VIEJO=<viejo> \
  node scripts/verificar-rotacion-tokens.mjs
```

Qué chequea: auditoría de logs del repo · `/api/health` y `/login` de producción ·
los 3 endpoints internos con el token nuevo (200) · que el token viejo dé 401 ·
y deja como *pendientes* los secretos que se verifican a mano (IMEIcheck, AEX,
correo, RUC/SUN, Google). Sale 1 si algo falla.

## Agenda sugerida

| Cuándo | Qué |
| --- | --- |
| **Día 0** | Fase 0: ✅ 2FA Owner/Admin · códigos de recuperación · **pendiente: tokens de Coolify a least privilege** |
| **Ventana coordinada** | **Pendiente:** Fase 1: `IMEICHECK_TOKEN` · claves sandbox AEX · tokens de deploy · token API de Coolify · GitHub PAT (con redeploy y verificación) |
| **Semana 1 (higiene)** | Fase 2: `MOBOS_AUTH_SECRET` (avisar del re-login) · `MOBOS_MAINTENANCE_TOKEN` · WEEM · RUC/SUN · Google · SIFEN · outbox |
| **Al cerrar** | Fase 3: auditoría · logs · smoke · registro |
| **Trimestral** | Repaso completo + `npm run audit:logs` |

## Registro de rotación

Tabla para completar Dario en cada rotación (una fila por secreto):

| Fecha | Secreto | Generado en | Cargado en Coolify | Verificado | Viejo revocado | Quién |
| --- | --- | --- | --- | --- | --- | --- |
| | `IMEICHECK_TOKEN` | | | | | |
| | Claves sandbox AEX | | | | | |
| | Token/webhook de deploy | | | | | |
| | Token API de Coolify (least privilege) | | | | | |
| | `MOBOS_AUTH_SECRET` | | | | | |
| | `MOBOS_MAINTENANCE_TOKEN` | | | | | |
| | `WEEM_EMAIL_RELAY_TOKEN` | | | | | |
| | `RUC_SUN_API_KEY` | | | | | |
| | `GOOGLE_CLIENT_SECRET` | | | | | |
| | `MOBOS_SIFEN_CERT_PASSWORD` | | | | | |
| | Claves de outbox | | | | | |

## Checklist de cierre

- [ ] **2FA activo** en las cuentas Owner (Freddy) y Admin (Dario), con códigos de recuperación guardados.
- [ ] Tokens de Coolify con permisos **mínimos** (deploy); sin tokens root ni `read:sensitive`; los sin uso, revocados.
- [ ] Cada valor nuevo está en Coolify como **locked**.
- [ ] Redeploy hecho y **logs revisados**: no aparece ningún valor.
- [ ] Verificación funcional de cada secreto rotado.
- [ ] Valores viejos **revocados** en su proveedor.
- [ ] `npm run audit:logs` en verde y `npm run release:smoke` OK.
- [ ] Registro del día guardado (`docs/qa/rotacion-tokens/`) y tabla de arriba completa.
