# Volumen de adjuntos y scheduler de mantenimiento (#87)

Pasos exactos para Dario en **Coolify**. No hay cambios de código: el backend ya
funciona con `MOBOS_STORAGE_DIR` y expone los tres endpoints internos con
`Authorization: Bearer <MOBOS_MAINTENANCE_TOKEN>`.

## A. Volumen de adjuntos (`MOBOS_STORAGE_DIR`)

Qué hace el código (`backend/lib/attachment-storage.ts`):

- Con la variable configurada, cada adjunto se guarda en
  `<dir>/<tenantId>/<área>/<uuid>.<ext>` y en la base queda solo el `storageKey`.
- Sin la variable, los bytes siguen guardándose en Postgres (comportamiento actual).
- Toda escritura **conserva además la copia en base** (respaldo) y la lectura cae
  a esa copia si el archivo no está en el volumen.

Pasos:

1. Coolify → aplicación del **backend** (la de `api.moboss.online`) →
   **Storages → Add**.
2. Name `mobos-attachments` · **Mount path** `/data/mobos` (ruta dentro del
   contenedor) · Save.
3. **Environment Variables** → agregar `MOBOS_STORAGE_DIR=/data/mobos` → Save.
4. **Redeploy** (o Restart) del backend.
5. Verificar:
   - Subí un adjunto desde la app (un gasto, una compra o un comentario con foto).
   - Coolify → contenedor del backend → **Terminal**: `ls -R /data/mobos | head`
     → aparece `<tenant>/<área>/<uuid>.<ext>`.
   - Descargá el adjunto desde la app: sigue bajando (ahora desde el volumen).
   - Opcional en Postgres:
     `SELECT "storageKey" FROM "Attachment" ORDER BY "createdAt" DESC LIMIT 3;`
     → las claves nuevas ya no son nulas.
6. **Respaldos**: sumá el volumen al backup del servidor (además de los dumps de
   Postgres de `docs/BACKUP.md`).
7. Rollback: borrá `MOBOS_STORAGE_DIR` y redeploy → vuelve a guardar en base
   (los archivos del volumen quedan; los adjuntos existentes se siguen leyendo).

## B. Scheduler de mantenimiento (`MOBOS_MAINTENANCE_TOKEN`)

Los tres endpoints son `POST`, esperan `Authorization: Bearer <token>` y
responden **401** si el token no coincide y **503** si la variable no está
configurada:

| Endpoint | Qué hace | Frecuencia sugerida |
| --- | --- | --- |
| `/api/internal/email-outbox` | Drena la cola de correos (reintentos; entrega at-least-once) | cada 10 min |
| `/api/internal/remind-due-payments` | Recordatorios de cuotas a 3 días, reclamo de vencidas y aviso de reservas por vencer | 1 vez al día |
| `/api/internal/release-expired-reservations` | Libera reservas vencidas y avisa al cliente | 1 vez al día |

Pasos:

1. Generá un token fuerte: `openssl rand -hex 32`.
2. Coolify → backend → **Environment Variables** →
   `MOBOS_MAINTENANCE_TOKEN=<token>` → Save → **Redeploy**.
3. Coolify → backend → **Scheduled Tasks** (los comandos corren dentro del
   contenedor y ven las variables de entorno). Frecuencia en cron del servidor
   (UTC; Asunción ≈ UTC-3):

   - Nombre `email-outbox` · Frecuencia `*/10 * * * *`
     ```
     node -e "fetch('http://127.0.0.1:3000/api/internal/email-outbox',{method:'POST',headers:{Authorization:'Bearer '+process.env.MOBOS_MAINTENANCE_TOKEN}}).then(r=>r.text()).then(console.log)"
     ```
   - Nombre `recordatorios-cobranza` · Frecuencia `0 11 * * *` (08:00 en Asunción)
     ```
     node -e "fetch('http://127.0.0.1:3000/api/internal/remind-due-payments',{method:'POST',headers:{Authorization:'Bearer '+process.env.MOBOS_MAINTENANCE_TOKEN}}).then(r=>r.text()).then(console.log)"
     ```
   - Nombre `liberar-reservas` · Frecuencia `15 11 * * *`
     ```
     node -e "fetch('http://127.0.0.1:3000/api/internal/release-expired-reservations',{method:'POST',headers:{Authorization:'Bearer '+process.env.MOBOS_MAINTENANCE_TOKEN}}).then(r=>r.text()).then(console.log)"
     ```

4. **Alternativa host cron** (si se prefieren tareas fuera de Coolify), con el
   token en un archivo solo-root:

   ```
   # /etc/mobos-maintenance.env   (chmod 600)
   MOBOS_MAINTENANCE_TOKEN=<token>
   ```
   ```
   # /etc/cron.d/mobos-maintenance
   */10 * * * * root . /etc/mobos-maintenance.env; curl -fsS -X POST -H "Authorization: Bearer $MOBOS_MAINTENANCE_TOKEN" https://api.moboss.online/api/internal/email-outbox >/dev/null
   0 11 * * * root . /etc/mobos-maintenance.env; curl -fsS -X POST -H "Authorization: Bearer $MOBOS_MAINTENANCE_TOKEN" https://api.moboss.online/api/internal/remind-due-payments >/dev/null
   15 11 * * * root . /etc/mobos-maintenance.env; curl -fsS -X POST -H "Authorization: Bearer $MOBOS_MAINTENANCE_TOKEN" https://api.moboss.online/api/internal/release-expired-reservations >/dev/null
   ```

5. Verificación:

   ```bash
   TOKEN=<token>

   # Sin token: 401. Con la variable sin configurar en el backend: 503.
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.moboss.online/api/internal/email-outbox

   curl -s -X POST -H "Authorization: Bearer $TOKEN" https://api.moboss.online/api/internal/email-outbox
   # {"processed":N,"sent":..,"retryable":..,"failed":..,"checkedAt":"..."}

   curl -s -X POST -H "Authorization: Bearer $TOKEN" https://api.moboss.online/api/internal/remind-due-payments
   # {"reminded":..,"overdueReminded":..,"reservationReminded":..,"checkedAt":"..."}

   curl -s -X POST -H "Authorization: Bearer $TOKEN" https://api.moboss.online/api/internal/release-expired-reservations
   # {"released":..,"tenants":..,"checkedAt":"..."}
   ```

6. Criterio de cierre: los adjuntos nuevos aparecen en el volumen y se descargan
   igual; los recordatorios y la liberación de reservas corren a diario (mirar
   los JSON de respuesta y los logs del backend).

## Orden recomendado

Primero **A** (volumen) con la app estable; después **B** (token + tareas). Cada
paso con su redeploy y su verificación.
