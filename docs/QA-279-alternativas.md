# A5 · Variante agotada → alternativas (#279)

Cuando la variante exacta se agota, el **comprador propone** alternativas (sin
decidir), el **vendedor resuelve** y, si cambia el precio, el **cliente aprueba
con OTP** por un enlace público. Se conserva el **historial de versiones** y la
necesidad original se **libera recién al aceptar**. Nunca se sustituye solo.

## Backend

- **Modelo** `SupplyAlternative` (migración aditiva/idempotente
  `20261227000000_supply_alternatives`): versión, estado, motivo, opción,
  producto alternativo, **diferencia de precio**, nueva fecha, notas, propuesto/
  decidido por, fechas de aprobación/rechazo del cliente, token público
  (solo `sha256`) y OTP (huella, vencimiento, intentos).
- **Reglas puras** (`backend/lib/supply-alternatives.ts`): `requiereAprobacionCliente`
  (solo con diferencia ≠ 0), `estadoNecesidadTras` (aceptar → `COMPRADA`,
  rechazar → `ABIERTA`), token 64 hex, OTP 6 dígitos con vigencia 30 min y
  máximo 5 intentos.
- **API**:
  | Método | Ruta | Quién |
  |---|---|---|
  | `GET`/`POST` | `/api/supply/needs/:id/alternatives` | comprador/equipo (propone versiones) |
  | `POST` | `/api/supply/alternatives/:id/decision` | vendedor: `ACEPTAR` (sin cambio de precio) · `MANTENER` · `CANCELAR` · `ENVIAR_CLIENTE` (devuelve `link` + `otp`) |
  | `GET`/`POST` | `/api/public/supply/alternatives/:token` | **cliente** (sin sesión): ver propuesta + historial, `ACEPTAR` (con OTP si corresponde) o `RECHAZAR` |
- Estados de la necesidad: se sumó `ESPERANDO_CLIENTE` (los pendientes del panel
  lo incluyen); al aceptar pasa a `COMPRADA`, al cancelar el producto a
  `CANCELADA` y si el cliente rechaza vuelve a `ABIERTA` para que el vendedor
  decida (esperar/cancelar/devolver). La unidad asignada no se revende.
- Auditoría: `SUPPLY_ALTERNATIVE_PROPOSED/SENT/ACCEPTED/KEPT/CANCELLED` y
  `SUPPLY_ALTERNATIVE_CUSTOMER_APPROVED/REJECTED` (esta última con `userId: null`
  y `origen: 'cliente'`), con etiquetas en Auditoría.

## UI

- **Página pública** `/alternativa/:token` (`src/pages/AlternativaPublica.jsx`):
  producto, opción, diferencia de precio, nueva fecha, notas, **historial de
  versiones** y acciones *Aprobar* (con OTP cuando hay diferencia) / *Rechazar*.
- El panel de compras (INV) y el POS consumen la misma API; el vendedor obtiene
  el enlace y el OTP para pasárselos al cliente (coordinado con FIN para el
  envío automático cuando el servicio de OTP esté disponible).

## Verificación

- Unit `backend/tests/supply-alternatives.test.ts`: reglas, OTP y estados.
- Integración `backend/tests/supply-alternatives.mjs`: **24 chequeos** —
  versiones, `ACEPTAR` bloqueado con cambio de precio, envío con OTP, OTP
  incorrecto, aprobación, necesidad liberada, rechazo (vuelve a `ABIERTA`),
  cierre de necesidad y permisos.
- e2e `e2e/qa-279-alternativas.spec.js`: **1/1** con capturas
  `docs/QA-279-alternativas/01-propuesta-cliente.png` y `02-aprobada.png`.
- Suite completa de integración: **exit 0** · smoke **19/19**.

## Coordinación

- **FIN (OTP)**: hoy el código lo genera/valida el propio flujo (huella sha256,
  vigencia, intentos) y el vendedor lo ve para compartirlo; cuando FIN exponga
  el servicio de OTP, se reemplaza la generación por su API sin tocar el flujo.
- **POS**: el vendedor decide desde el panel; el POS puede mostrar la propuesta
  y el estado de la necesidad con estos endpoints.
