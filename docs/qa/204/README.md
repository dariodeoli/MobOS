# QA #204 — Caza de bugs FIN (ronda 2)

- **Fecha:** 2026-09-21 · **Rama:** `slot/finanzas`
- **Alcance:** caja/conciliación (diferencias y lote), seguro/margen, medios (Pix,
  USDT-Cripto, canje) y cuentas.
- **Método:** sonda API reproducible con el seed de e2e + capturas UI before/after.
  Sin consultas pagas. La verificación post-deploy del demo público v1.0.129 sigue
  en verde (#198); esta ronda corrió sobre datos reales locales.

## Reproducir

```bash
# 1) Servidores locales del worktree (base e2e aislada)
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-FIN MOBOS_E2E_PGPORT=5515 \
MOBOS_E2E_API_PORT=3115 MOBOS_E2E_WEB_PORT=5215 MOBOS_E2E_DB=mobos_e2e_MOS_FIN \
  bash e2e/bin/start-backend.sh
MOBOS_E2E_API_PORT=3115 MOBOS_E2E_WEB_PORT=5215 bash e2e/bin/start-frontend.sh

# 2) Sonda (18 casos) — salida en docs/qa/204/probe-salida.txt
QA_BASE_URL=http://localhost:3115 QA_ORIGIN=http://localhost:5215 \
  node scripts/qa-204-finanzas-probe.mjs

# 3) Capturas UI (modo after; `before` se corre con los archivos del fix revertidos)
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 QA_MODO=after \
  node scripts/qa-204-capturas.mjs
```

## Hallazgos y fixes

### A. El seguro de ventas se perdía al recargar Configuración (corregido)

- **Pasos:** Configuración → Negocio → activar “Aplica seguro”, poner 25% → Guardar
  → recargar la página.
- **Antes:** el campo volvía vacío aunque el valor estaba guardado
  (`capturas-before.json`: `insurancePctApi: null`, `valorTrasRecarga: ""`).
- **Causa:** `GET /api/account` no incluía `insurancePct` en el `select` del tenant;
  el PATCH sí lo devolvía, por eso se veía hasta recargar
  (`src/components/control/Config.jsx` lee `account.tenant.insurancePct`).
- **Después:** el campo conserva 25 tras recargar (`capturas-after.json`:
  `insurancePctApi: 25`, `valorTrasRecarga: "25"`) · captura
  `204-a-config-seguro-{before,after}.jpg`.
- **Fix:** `backend/app/api/account/route.ts` (+ `insurancePct: true` en el select).
- **Test:** `backend/tests/authorization-limits.mjs` — PATCH guarda, GET devuelve,
  150 se rechaza y el valor se restaura.
- **Margen verificado (sonda):** con costo base 100.000 y seguro 25%, la venta
  congela `baseUnitCostPyg=100.000`, `insurancePyg=25.000`, `unitCostPyg=125.000`;
  `/api/reports` muestra costo 125.000 y ganancia 25.000 (el seguro ya impactaba
  en los márgenes; lo que faltaba era persistir/ver el % configurado).

### B. La transferencia bancaria ofrecía y aceptaba USDT (corregido)

- **Pasos:** Finanzas → Cuentas de cobro → Añadir cuenta → medio “Transferencia” →
  abrir Moneda. Antes listaba `PYG, USD, BRL, EUR, USDT` y la API aceptaba el alta
  (`POST /api/payment-accounts` con `kind: TRANSFER, currency: USDT` → **201**);
  contra la regla de #142, la transferencia no mezcla USDT.
- **Después:** Moneda ofrece `PYG, USD, BRL, EUR` y la API responde **400**
  (“USDT tiene su propio medio: usá una cuenta USDT - Cripto.”) · capturas
  `204-b-cuenta-transferencia-{before,after}.jpg`.
- **Fix:** `backend/app/api/payment-accounts/route.ts`,
  `src/lib/paymentAccountsReglas.js` (regla compartida + opciones excluidas),
  `src/lib/paymentAccounts.js`, `src/components/shared/CurrencySelect.jsx`
  (prop `excluir`), `src/components/control/PaymentAccounts.jsx`.
- **Tests:** `src/lib/paymentAccountsReglas.test.js` y
  `backend/tests/payment-account-defaults.mjs` (alta USDT en transferencia → 400).
- **Nota:** una cuenta vieja `TRANSFER + USDT` sigue existiendo, pero al editarla
  el guard la señala y pide migrarla al medio USDT-Cripto.

### C. Reasignar un pago ya conciliado dejaba lotes huérfanos (corregido)

- **Pasos:** conciliar un lote con un pago (esperado 250.000, recibido 240.000,
  diferencia −10.000) y después confirmar **otro** lote con el mismo pago.
- **Antes:** el segundo lote se creaba (**201**) y movía el pago; el lote original
  quedaba con `pagos=0` pero conservaba su diferencia, que el resumen seguía
  contando (doble diferencia). Evidencia cruda de las corridas previas al fix:

  ```
  FALLO conciliación: re-conciliar un pago ya verificado en otro lote — mover un pago ya conciliado a otro lote debía 409: 201 {"lote":{"id":"cmubm8vqy003dw8jhgqgx1ftrg", …
  FALLO conciliación: el lote viejo queda consistente (no 0 pagos con diferencia) — 2 lote(s) con 0 pagos y diferencia
  ```

  Los dos lotes huérfanos quedaron registrados con
  `pagos: 0, expectedPyg: 250000, receivedPyg: 240000, differencePyg: -10000`
  (`capturas-{before,after}.json` → `reasignacion.lotesHuerfanos`).
- **Después:** el intento responde **409** (“los lotes no se reasignan”) y el lote
  original conserva su pago (sonda: “lote propio intacto (1 pago)”).
- **Fix:** `backend/app/api/finance/reconciliation/route.ts` — guard dentro de la
  transacción, después de validar estado/medio y que los pagos sean de una sola
  cuenta (así el error de mezcla sigue siendo 400 y este 409).
- **Test:** `backend/tests/reconciliation-http.mjs` — reasignación 409, lote
  original con 1 pago, mezcla de cuentas 400, ids repetidos 400.

## Verificado sin hallazgos (15 casos)

Cuentas: rangos de fee/días/porcentajes, monedas fijas de Pix y Cripto, PATCH sin
cambios (“Faltan cambios.”), cuenta inactiva rechazada al cobrar (409).
Conciliación: diferencia sin nota 400, lote con cuentas mixtas 400, pago PENDING
se confirma y completa el pedido, `soloResumen` sin items/lotes, límites de
entrada (201 ids, recibido negativo, pago inexistente), diferencia espejada en
cuenta y procesadora. Caja: doble apertura 409, gasto en efectivo baja el
esperado (y el cierre calcula la diferencia). Seguro: venta sin seguro del
cliente no aplica. Medios: Pix BRL con llave en el snapshot, USDT exige
cotización, canje exige ficha, método debe coincidir con el tipo de cuenta.

## Checks

| Check | Resultado |
| --- | --- |
| `npm run lint` | 0 errores (1 warning preexistente en `Precios.jsx`) |
| `npm run build` (FE) | exit 0 |
| `npm --prefix backend run build` | exit 0 + `backend/.next/BUILD_ID` |
| `npm test` | 388/388 |
| `npm --prefix backend run test:unit` | 71/71 |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | PASS completo |
| `npm run test:e2e:smoke` | 7/7 |
| Sonda `scripts/qa-204-finanzas-probe.mjs` | 18/18 (`probe-salida.txt`) |

## Novedades para el dueño

- El porcentaje de **seguro de ventas** ya no se pierde al recargar Configuración:
  antes había que volver a cargarlo y parecía que no se había guardado.
- La **transferencia bancaria** dejó de ofrecer y aceptar USDT: la cripto tiene su
  propio medio de cobro, así no se mezclan cuentas.
- Un **pago ya conciliado** no se puede pasar a otro lote: antes el lote original
  quedaba vacío pero su diferencia seguía restando en el resumen.
