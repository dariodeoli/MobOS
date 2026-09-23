# #240 — Seguimiento de la garantía en el portal (credencial + taller)

Después del informe (visto/no visto) y del taller en la cuenta, cerraba el
circuito la **garantía**: el portal listaba las garantías activas, pero el
cliente no podía abrir su credencial ni ver que el caso estaba en el taller.

## Auditoría: qué había y qué faltaba

- **Ya existía:** la página pública de garantía (`/garantia/<token>`) con
  cobertura, exclusiones, días restantes y contacto de la sucursal; el QR de la
  ficha; y el portal listando las garantías activas con estado y vencimiento.
- **Brecha:** el portal no exponía el **token público** de cada garantía (el
  cliente dependía de que la tienda le mandara el enlace), no vinculaba el caso
  con su **orden de taller** (cuando la garantía derivó en servicio, #224) y la
  garantía **no tenía modo demo** (la página pública solo resolvía contra el API
  real).

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/portal/[token]/route.ts` | Las garantías del nivel completo suman **`publicToken`** (la credencial del QR) y **`taller`** (`{ status, statusLabel }`) cuando existe una orden de servicio del mismo serial y sigue activa |
| `src/pages/CuentaPublica.jsx` | Cada garantía muestra **«En el taller: …»** y el acceso **«Ver garantía»** (mismo enlace del QR); en demo viaja con `?demo=1` |
| `src/pages/GarantiaPublica.jsx` | Modo demo: con `?demo=1` (o dentro de `/demo`) resuelve la garantía con los datos del navegador, igual que el informe |
| `src/lib/demoGarantia.js` (nuevo) | Payload demo de la credencial (cobertura, exclusiones, días restantes, tienda y compra del serial) |
| `src/lib/demoClientes.js` | Seeds: Lucía con una garantía vigente (iPhone 15, MOB-0008) y Fernando con el caso **en diagnóstico** que ya tiene orden de taller; el portal completo expone ambas con su credencial |
| `src/lib/demoInforme.js` | `pedidoDemoDelSerial` queda exportado: la credencial demo enlaza la compra del serial |

## Decisiones (documentadas)

- **La credencial usa el mismo token del QR**: si la tienda rota el enlace
  (regenerar), el portal deja de exponer el viejo automáticamente.
- **El vínculo con el taller es por serial**, que la conversión de garantía a
  servicio copia (#224). No se expone ningún identificador interno en el portal.
- **Niveles sin cambios**: las garantías siguen siendo del nivel **completo**;
  el rápido mantiene su contrato (saldo, vencimientos y pedidos).
- **La credencial no agrega datos**: es la misma página pública del QR; el
  portal solo la enlaza.

## Verificación

```bash
# e2e (cuenta real del harness + demo), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/qa-240-garantia-portal.spec.js --project=admin

# integración HTTP: credencial en el portal + etapa del taller (en el arnés)
node backend/tests/customer-portal.mjs <BASE_URL> <ADMIN_TOKEN> <SELLER_TOKEN> <CAJERA> <DATABASE_URL> <PG_BIN>
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-garantia-portal/01-portal-garantia.png` | Portal completo: «Garantías activas» con **En el taller: Recibido** y **Ver garantía** |
| `docs/QA-240-garantia-portal/02-credencial-garantia.png` | La credencial abierta desde el portal: cobertura, vencimiento, qué cubre y qué no |
| `docs/QA-240-garantia-portal/03-demo-garantia.png` | Demo: la garantía de Lucía (iPhone 15 · MOB-0008) con 300 días y cobertura |
| `docs/QA-240-garantia-portal/04-demo-garantia-taller.png` | Demo: portal de Fernando con la garantía **En el taller: Diagnóstico** |
| `e2e/qa-240-garantia-portal.spec.js` | 2/2: cuenta real (garantía + orden de taller + credencial) y demo |
| `backend/tests/customer-portal.mjs` | La garantía del portal enlaza su credencial, la credencial abre sin sesión y la orden de taller aparece en `taller.statusLabel` |
| `src/lib/demoGarantia.test.js` · `src/lib/demoClientes.test.js` | Credencial demo (cobertura/días/tienda) y portal demo con credencial + taller |

## Checks de esta entrega

`npm run lint` 0 errores · `npm run build` y `backend run build` con
`BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de schema) · `npm test`
**644 ✓** · backend `test:unit` **75 ✓** · `test:e2e:smoke` **7/7** ·
`e2e/qa-240-garantia-portal.spec.js` **2/2** · integración HTTP completa en
verde · sin marcadores de conflicto.
