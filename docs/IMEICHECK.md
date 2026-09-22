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

## Probar la UI en mock en producción (post-merge, sin LIVE y sin cargos)

Con la Fase 1 deployada y **sin** `IMEICHECK_LIVE=1` en Coolify, el endpoint
nunca llama al proveedor: responde mocks marcados (`esMock: true`) y la UI los
muestra con el badge **SIMULADO** y “Sin cobro”.

**Runner automático** (recomendado): `npm run qa:imei:prod`. Necesita una sesión
real exportada una vez con
`npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login`
(`MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json`; opcional `MOBOS_QA_IMEI=<serial>`
para elegir la unidad). Recorre la ficha, el precheck y la confirmación, exige
el badge **SIMULADO** y cero llamadas del navegador a `imeicheck.net`, y deja
capturas + `reporte.json` en `MOBOS_QA_OUT` (`/tmp/qa-193-imei` por defecto).
Pasos manuales equivalentes:

1. Inventario → Unidades: abrir (o crear) una unidad cuyo serial sea un IMEI de
   15 dígitos con Luhn válido.
2. Sección **Consulta de IMEI** → «Consultar IMEI (ver costo)»: debe mostrar
   Apple Basic, los campos y el costo US$ 0,06, sin ejecutar nada.
3. Antes de confirmar, el precheck debe decir **SIMULADO · Sin cobro (referencia US$ 0,06)** y el botón **“Confirmar consulta simulada (sin cobro)”**; con `IMEICHECK_LIVE=1` y token dice “Función paga” y muestra el costo real. «Confirmar consulta (US$ 0.06)»: el resultado debe traer el badge
   **SIMULADO**, el estado, los campos (blacklist, Find My/iCloud, garantía) con
   fuente `imeicheck.net` y fecha.
4. DevTools → Network: **ninguna** llamada a `imeicheck.net`; todo pasa por
   `/api/imei`.
5. El historial (`GET /api/imei`) sigue mostrando el IMEI enmascarado y el
   registro auditado (estado, costo, fecha y requestId).
6. Probar un fallo (QA): `POST /api/imei` con `confirm: true`, `requestId` y
   `escenario: "sin-saldo"` (los escenarios solo se aceptan sin
   `IMEICHECK_LIVE=1`; en vivo se ignoran) → la UI/registro debe decir
   **No verificado**, sin costo. Repetir con el mismo `requestId` no crea otro
   registro.
7. Nada que desactivar: sin `IMEICHECK_LIVE=1` no hay cargos; el token puede
   quedar cargado sin riesgo.


## Incidente #233 — timeout en la consulta autorizada (21-09)

Una de las consultas autorizadas (Apple Basic, US$ 0,06) devolvió **timeout a los 8 s**:
el registro quedó `fallido` con **costo 0** y la UI mostró «No verificado · US$ 0,00»,
pero **el saldo del proveedor bajó US$ 0,06** y la orden no aparecía en ese momento.

Reglas actualizadas:

- Un **timeout o error de red es ambiguo**: la consulta queda en estado
  **`conciliar`** («A conciliar» en la UI) con el **costo estimado** del servicio
  (US$ 0,06), nunca 0 a secas.
- **Recuperación**: el registro guarda el `requestId` propio; administración puede
  conciliar con `POST /api/imei` `{ "action": "conciliar", "requestId": "…",
  "externalId": "…", "status": "verificado|parcial|conciliar|pendiente|fallido",
  "costUsd": 0.06, "note": "…" }` (solo ADMIN/GERENTE) y así actualizar externalId,
  resultado y costo real sin repetir la consulta.
- **El harness live queda bloqueado** hasta que la conciliación esté resuelta: no
  se habilita `IMEICHECK_LIVE=1` ni se repite una consulta paga a ciegas.
- Errores con respuesta del proveedor (4xx/5xx) siguen siendo `fallido` con costo 0;
  solo lo ambiguo (timeout/red) pasa a «a conciliar».
