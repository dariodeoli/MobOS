# Seguridad de logs: deploy sin secretos (#232)

Los logs de deploy de Coolify mostraron **variables sensibles en texto claro**
(pruebas de Dario del 21/22-09). Esta página tiene la auditoría del repo, el
checklist para que no vuelva a pasar y los pasos exactos que tiene que aplicar
Dario en Coolify, incluida la **rotación** de lo expuesto.

## 1. Auditoría del repo (hecha)

Revisado: `backend/Dockerfile`, `.github/workflows/ci.yml`, `scripts/*`
(`release.mjs`, `smoke.mjs`, `db-backup.sh`, `check-db-schema.mjs`, pruebas AEX),
`e2e/bin/*.sh`, `backend/tests/*.sh`, `backend/lib/*` (logger, Prisma, correo,
AEX, IMEIcheck, auth/middleware) y `print-agent/*`.

**Resultado: sin volcados de env/secrets.** Lo único que se endureció:

- `backend/app/api/aex/webhook/route.ts`: el error de Prisma se logueaba como
  objeto (`cause`); ahora se loguea solo `cause.message` (los objetos pueden
  traer metadatos del registro).
- Se agregó el auditor **`npm run audit:logs`** (`scripts/audit-logs.mjs`) y la
  guarda de fuente **`src/lib/logsReglas.test.js`** (corre en `npm test`), que
  fallan si alguien introduce `set -x`, `printenv`, `console.log(process.env)`,
  `echo $TOKEN`, `ARG/ENV` secretos en el Dockerfile o `--build-arg` sensible.

La CI solo usa un `DATABASE_URL` local de mentira (`ci:ci@127.0.0.1`) y no
imprime el entorno. El backend no activa logs de queries de Prisma.

## 2. Checklist de higiene de logs

**En código, scripts y CI:**

- Nada de `set -x` / `set -o xtrace` en build, deploy ni tests de integración.
- Nada de `printenv`, `env`, volcados de entorno ni `console.log(process.env)` /
  `JSON.stringify(process.env)` (ni en debug).
- Secretos **nunca** en `ARG`/`ENV` del Dockerfile ni en `--build-arg`: se
  inyectan en runtime por variables de entorno.
- `echo`/`printf` de variables con nombre sensible: prohibido. Se imprime el
  **nombre** de la variable, no el valor.
- Errores: loguear `error.message`; nunca el objeto completo, headers, cookies
  ni cuerpos de request con credenciales.
- GitHub Actions: usar `secrets.*` (se enmascaran solos) y `::add-mask::` si el
  valor se genera en runtime; jamás `env`/`printenv`.
- Al depurar a mano: enmascarar con `***` y borrar el valor de la transcripción.
- Revisar los logs de deploy después de cada release; si aparece un valor, se
  rota (sección 3.3).
- `npm run audit:logs` en la rutina de entrega (sugerido para AGENTS.md) y el
  test `logsReglas` ya corre con `npm test`.

**Qué se puede mostrar:** nombres de variables, estados (`configured`/`missing`),
URLs de servicios **sin credenciales**, versiones y `requestId`.
**Qué no:** valores de tokens/claves/contraseñas, `DATABASE_URL` con password,
cookies/`Authorization`, cuerpos con datos personales.

## 3. Pasos en Coolify (Dario)

### 3.1 Restringir quién ve los logs

1. Coolify → **Team / Members**: dejar solo a Dario y, si hace falta, un admin
   de confianza; revocar accesos de más.
2. **Keys & Tokens (API)**: revisar los tokens de API de Coolify, revocar los que
   no se usen y generar uno nuevo solo si es imprescindible.
3. El acceso al **servidor** (SSH, panel del host) también ve los logs de los
   contenedores: mantenerlo al mínimo.
4. No compartir capturas ni enlaces de logs de deploy (los logs pueden traer
   valores de entorno).

### 3.2 Secretos como referencias (no valores)

1. En cada aplicación (backend y frontend) → **Environment Variables**: marcar
   las sensibles como **Locked/Secret** (según la versión de Coolify) para que
   el valor no se vuelva a mostrar en la UI ni en los deploys.
2. Las que se necesitan **en build** (por ejemplo `DATABASE_URL` para
   `prisma generate`) van como **Build Variable** con candado; el resto, solo en
   runtime.
3. No pegar secretos en **descripciones**, **comandos de tareas programadas**,
   notas de deploy ni PRs: ahí va el **nombre** de la variable
   (`$MOBOS_MAINTENANCE_TOKEN`, ver `docs/STORAGE-Y-SCHEDULER.md`).
4. Si Coolify permite referencias (`$VAR` / secretos del proyecto), usarlas en
   lugar de repetir valores.

### 3.3 Rotar lo que pudo quedar expuesto

Para cada uno: generar el valor nuevo en el proveedor → actualizarlo en Coolify
(→ redeploy) → verificar → **revocar el viejo** en el proveedor.

| Secreto | Dónde se genera | Verificación |
| --- | --- | --- |
| `IMEICHECK_TOKEN` | Panel de IMEIcheck | Una consulta de prueba desde Inventario (con `IMEICHECK_LIVE` como esté configurado) |
| `MOBOS_AEX_PUBLIC_KEY` / `MOBOS_AEX_PRIVATE_KEY` / `MOBOS_AEX_WEBHOOK_TOKEN` | Portal sandbox de AEX | `node scripts/aex-sandbox-prueba.mjs` |
| Token/webhook de deploy (OwnCoding Hub) | Panel del Hub | `MOBOS_INTEGRATOR=1 npm run release:publish` de prueba y `npm run release:smoke`; actualizar el **Keychain** de la Mac si corresponde (`security add-generic-password -U -s mobos-release-deploy-webhook -a "$USER" -w "<nuevo>"`, ídem `mobos-release-deploy-token`) |
| Token de API de Coolify | Coolify → Keys & Tokens | Reemplazar el usado por la Hub/automatizaciones |
| GitHub PAT (si aplica) | GitHub → Settings → Developer settings | `gh auth status` y un `git fetch` |
| `MOBOS_AUTH_SECRET` | `openssl rand -hex 32` | Cierra sesiones activas (avisar): los usuarios vuelven a entrar |
| `MOBOS_MAINTENANCE_TOKEN` | `openssl rand -hex 32` | Tareas programadas responden 200 (ver `docs/STORAGE-Y-SCHEDULER.md`) |
| `WEEM_EMAIL_RELAY_TOKEN` | Relay de correo | Un correo de prueba (recuperación o aviso) |
| `RUC_SUN_API_KEY` | Proveedor RUC/SUN | Consulta de RUC desde Configuración |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | Login con Google |
| `MOBOS_SIFEN_CERT_PASSWORD` | Proveedor del certificado | Estado SIFEN / una emisión de prueba |
| `MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON` | `openssl rand -hex 32` por clave | Correo transaccional sale (el outbox drena) |

5. Agendar la rotación con Dario (los tres primeros, ya expuestos, **cuanto
   antes**; el resto, por higiene y luego 1 vez por trimestre).

### 3.4 Verificación posterior

1. `npm run audit:logs` → debe decir “Higiene de logs OK”.
2. Redeploy de prueba y **leer los logs**: no deben aparecer valores (si
   aparece, rotar de nuevo y avisar).
3. `npm run release:smoke` para confirmar producción sana.

## Referencias

- Runbook de rotación: `docs/ROTACION-TOKENS.md` (paso a paso por secreto).
- Auditor: `scripts/audit-logs.mjs` · Guarda: `src/lib/logsReglas.test.js`.
- Operación: `docs/STORAGE-Y-SCHEDULER.md` (tareas programadas),
  `docs/BACKUP.md`, `AGENTS.md` (checks de entrega).
