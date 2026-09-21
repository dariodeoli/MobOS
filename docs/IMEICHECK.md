# Consulta de IMEI (IMEIcheck.net) — adaptador, UI y validación Live

Estado: **Fase 1 (mocks)** en `main`. Ninguna consulta real se hace sola: el modo
vivo exige `IMEICHECK_LIVE=1` **y** `IMEICHECK_TOKEN` (secreto de `mobos-api` en
Coolify). Sin eso, el adaptador responde un mock determinista y **no hay red**.

- Adaptador único: `backend/lib/imeicheck.ts` (URL, Bearer, validación Luhn,
  catálogo y redacción de errores). El token nunca llega al navegador ni al repo.
- Endpoint: `backend/app/api/imei/route.ts` — `precheck` (valida y muestra costo,
  **no cobra**) y `checks` (exige `confirm: true` + `requestId` único; repetir el
  mismo `requestId` devuelve el registro sin otro cargo).
- UI mínima: ficha de la unidad → sección **Consulta de IMEI** (precheck con
  costo visible → confirmación explícita → resultado con fuente y hora;
  “No verificado” ante pendiente/fallo, nunca “Limpio”). En demo solo **simula**
  y queda marcado como SIMULADO, sin llamadas.
- Contrato consumido: `POST https://api.imeicheck.net/v1/checks` con
  `{ deviceId, serviceId }`. El JSON de `/frontend-api/checks` (orden pagada)
  sirve para contrastar campos (`simLock`, `fmiOn`, `warrantyStatus`,
  `usaBlockStatus`, `status: successful`, `amount`), no como contrato.

## Única consulta real autorizada (NO ejecutar hasta cumplir precondiciones)

Autorizada por Dario: **una sola** consulta **Apple Basic** (`serviceId 1`,
referencia USD 0,06) para el IMEI **350970405250150**.

1. **Precondiciones**: Fase 1 integrada y deployada; `IMEICHECK_LIVE=1` y
   `IMEICHECK_TOKEN` presentes en el contenedor `mobos-api`.
2. **Precheck** (no cobra): `POST /api/imei` con
   `{ "action": "precheck", "imei": "350970405250150", "servicio": "APPLE_BASIC" }`.
   Verificar `costoEstimadoUsd = 0.06` y `servicio.precioConfirmado = true`.
3. **Consulta única**: `POST /api/imei` con
   `{ "action": "checks", "imei": "350970405250150", "servicio": "APPLE_BASIC",
     "confirm": true, "requestId": "<uuid v4 nuevo>" }`.
   Guardar el `requestId` usado: es la única forma de reintentar sin doble cobro.
4. **Anonimizar antes de compartir** el JSON (issue o chat): borrar/reemplazar
   `imei`/`deviceId`, `id`/`externalId`, `requestId` y cualquier dato de cuenta;
   **conservar** `status`, `amount`, `properties` y `requestedAt`. Ejemplo:
   `jq 'del(.responseRaw, .externalId, .requestId) | .imei = "••••••••••0150"'`
5. **Cargo observado**: registrar el `amount` devuelto (esperado `0.06`) y el
   cargo real en el panel del proveedor; pegarlo junto al JSON anonimizado.
6. **Límites**: si falla, **no reintentar sin autorización**; para volver a modo
   mock, `IMEICHECK_LIVE=0` y redeploy (o quitar la variable).

El resultado de esta consulta valida además el contrato público (`/v1/checks`):
si sus claves difieren del JSON de `/frontend-api`, el mapeo de
`normalizarRespuesta` ya contempla ambos formatos.
