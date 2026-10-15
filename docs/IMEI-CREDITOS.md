# Créditos de verificación IMEI

Las verificaciones de IMEI (IMEIcheck) se consumen con **créditos** que gestiona
**solo el dueño de la plataforma** desde `/superadmin › Verificaciones IMEI`.
Dentro de la app de las empresas **no hay precios, compra ni enlaces de pago**
(reglas de App Store): la empresa solo ve «Te quedan N verificaciones» y, en 0,
«No disponible en tu cuenta». PagaYa no interviene.

## Modelo (migración `20270126000001_imei_creditos`)

- `ImeiCreditLot`: lote con `source` (`FREE | GRANT | MONTHLY | ADJUST`), `granted`,
  `remaining` (CHECK `>= 0`) y `expiresAt` opcional. Se consume primero el que vence antes.
- `ImeiCreditEntry`: libro **solo de agregado** (trigger bloquea UPDATE). Tipos
  `GRANT | CONSUME | REFUND | EXPIRE | ADJUST`; único por `(tenantId, type, sourceRef)`, por eso
  cada operación se aplica una sola vez.
- `ImeiCreditSetting`: cupo mensual por empresa (`monthlyAllowance`, `since`).
- Verificación gratis: toda empresa recibe 1 (`sourceRef = 'free'`). La migración la siembra a
  las existentes y el código la acredita de forma perezosa a las nuevas; ambas son idempotentes.

## Costo en créditos por servicio

| Servicio | Créditos |
|---|---|
| Apple Basic, Find My / iCloud, Identificación | 1 |
| Apple Advanced, Blacklist Pro | 2 |
| Apple Full + MDM | 15 |

## Consumo (`POST /api/imei`, acción `checks`)

1. Transacción con `pg_advisory_xact_lock` por empresa.
2. Si ya existe la fila `(tenantId, requestId)` se devuelve (no se descuenta de nuevo).
3. Se acreditan gratis, vencimientos y cupo del mes (perezoso) y se mira el saldo.
4. Sin saldo y con el control activo: **402** `{ code: 'IMEI_SIN_CREDITOS' }`, sin fila ni consumo.
5. Si alcanza: se crea la fila de consulta (`reservado`) y se descuenta (`CONSUME`, un asiento por lote).
6. **Fuera de la transacción** se llama al proveedor.
7. Falló **sin cobro del proveedor** (`fallido` y costo 0): `REFUND` automático, una sola vez.
   `conciliar` (ambiguo, pudo cobrarse) **conserva** el crédito; si luego se concilia como
   fallida sin cobro, se devuelve en ese momento (también una sola vez).

## Cupo mensual, arrastre y vencimiento

- El cupo (N por mes) se acredita el día 1 (hora de Paraguay), de forma perezosa en el primer uso
  del mes o al consultar el saldo; el id `sub:YYYY-MM` lo hace idempotente. Al fijar o subir el cupo,
  el mes en curso se acredita en el acto. Si pasaron meses sin uso se acreditan los faltantes, hasta 3 hacia atrás.
- **Arrastre**: lo no usado pasa al mes siguiente hasta **3 cupos**; antes de acreditar cada mes, el
  sobrante por encima de 3 cupos vence (`EXPIRE` con nota). Con el cupo del mes el máximo es 4 cupos.
- Los lotes mensuales vencen a los **12 meses**; las altas manuales no vencen salvo que se indique fecha.

## Panel de plataforma (`/api/superadmin/imei-creditos`)

- Lista por empresa (saldo, cupo, consumidas, consultas, costo USD del proveedor) y detalle
  (lotes, consumo por servicio, historial, costo del proveedor total y del mes).
- Acciones (`POST …/[id]`): `agregar` (cantidad, vencimiento opcional, nota), `cupo` (N por mes),
  `ajuste` (± con nota obligatoria; nunca deja saldo negativo). Idempotentes por `opId`;
  auditadas en `AuditLog` (`IMEI_CREDITS_GRANTED | IMEI_CREDITS_ALLOWANCE_SET | IMEI_CREDITS_ADJUSTED`).
- Guard `conAdministradorPlataforma`: a cualquier persona que no sea el dueño (incluido el
  administrador de una empresa) responde **404** sin revelar que el panel existe.

## Flag `IMEI_CREDITS_ENFORCE`

- `1` / `true`: bloquea sin saldo (402). `0` / `false`: **modo sombra**, registra el consumo (lo que no
  alcanza queda como `CONSUME` sin lote) pero no bloquea.
- Sin definir: **activo** en demo, e2e, test y desarrollo; **producción arranca en sombra**.
  Para encender el bloqueo en producción: `IMEI_CREDITS_ENFORCE=1` (idealmente tras revisar el
  consumo en sombra desde el panel).
- E2E: `e2e/global-setup.mjs` repone un lote grande a la empresa seed en cada corrida. El arnés
  `backend/tests/integration-http.sh` hace lo mismo con `tenant-a-it`.

## Pruebas

- `backend/tests/imei-credits.test.ts` (costos, flag, mes de Paraguay, regla de reembolso).
- `backend/tests/imei-credits-http.mjs` (Postgres real): 5 consultas paralelas con saldo 2 ⇒ pasan 2;
  10 paralelas con el mismo `requestId` ⇒ 1 `CONSUME`; reembolso único; `conciliar` conserva;
  tope de arrastre; acciones solo del dueño (404 a empresas).
- Demo: `src/lib/demoImei.js` (3 verificaciones simuladas por sesión).
