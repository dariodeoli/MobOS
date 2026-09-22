# Conciliación de consultas ambiguas (IMEI y AEX)

Regla general: **una respuesta ambigua no se repite**. Primero se concilia con el
proveedor (solo lectura o panel/soporte) y recién después se decide si corresponde
un nuevo intento. Nunca reintentar a ciegas: cada intento puede crear otro cargo u
otra guía.

## IMEI (#233)

1. **Detectar**: la consulta figura como **“A conciliar”** con **costo estimado**
   (p. ej. US$ 0,06) y `externalId` vacío; `error` explica el timeout/red.
2. **Conseguir el dato real** (Dario): orden en el panel del proveedor o respuesta
   de soporte con la referencia temporal del intento (fecha/hora) y el importe
   cobrado.
3. **Conciliar** (ADMIN/GERENTE), sin repetir la consulta:
   ```bash
   curl -X POST "$API/api/imei" -H "Content-Type: application/json" -H "Cookie: mobos_seller_session=…" \
     -d '{"action":"conciliar","requestId":"<requestId del registro>","externalId":"<orden del proveedor>","status":"verificado|parcial|fallido","costUsd":0.06,"note":"Orden recuperada del panel/soporte"}'
   ```
   También acepta `id` en lugar de `requestId`. Queda auditado
   (`IMEI_QUERY_CONCILIED`) y la UI pasa de “A conciliar” al estado conciliado.
4. **Si no se puede obtener la orden**: dejar el registro “A conciliar” y el live
   bloqueado (`IMEICHECK_LIVE` en 0). No se hacen consultas nuevas.
5. **Antes de compartir** el JSON: anonimizar IMEI, ids y credenciales (ver
   `docs/IMEICHECK.md`).

## AEX (#231)

1. **Detectar**: etapa `confirmar_servicio`, código **`ambiguo`** (respuesta sin
   `numero_guia` interpretable). La operación pudo haberse creado.
2. **Conciliar sin crear nada** — consulta solo lectura por referencia:
   ```bash
   npm run aex:sandbox -- --consulta MOBOS-SANDBOX-80da2bde
   ```
   Si no hay movimientos, pedir a **soporte/panel sandbox de AEX** el estado de esa
   referencia (con fecha/hora del intento y el `id_solicitud` si se conoce).
3. **Registrar** el resultado en el handover (guía si existe, o confirmación de que
   no se creó). **No reintentar** mientras la respuesta siga ambigua.
4. Si AEX confirma que no se creó nada y se autoriza un nuevo intento, usar **una
   sola** guía y un `codigo_operacion` nuevo (nunca el mismo para evitar
   duplicados).
