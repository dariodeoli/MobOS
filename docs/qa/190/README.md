# QA #190 — Demo al día en Finanzas (cuentas, caja y conciliación)

- **Issue:** #190 (parte de Finanzas) · **Rama:** `slot/finanzas`
- **Objetivo:** que la demo muestre el **sistema nuevo completo** en mi dominio
  y que los **datos visibles no digan «demo»** (los avisos de demo se
  conservan, son parte de la honestidad del modo demo #192/#204).

## Qué cambió

- **Cuentas de cobro** (`src/lib/demoCuentasCobro.js`, nuevo): seed con todos los
  medios —efectivo Gs/USD, transferencias Itaú/Continental, tarjetas ueno (UPay)
  y Dinelco con comisión y acreditación, **Pix · Itaú**, **USDT · Binance** y
  **Canje · Equipos**— con datos verosímiles (titular Aurora Móviles, números de
  cuenta y clave Pix ficticios pero realistas). `paymentAccounts.js` consume el
  seed; los ids `demo-*` quedan internos y no se muestran.
- **Ventas demo** (`storage.js`): las cuentas de los pagos apuntan a los nombres
  nuevos, y el vendedor de respaldo pasa a **Hernán Acosta** (antes «Usuario
  demo»).
- **Conciliación** (`demoConciliacion.js`): el mapa de medio legacy → medio real
  se completa (Pix, USDT-Cripto, Canje, Tarjeta, Transferencia, Dólar) para que
  los cobros del sistema nuevo no caigan en efectivo; el lote inicial usa la
  cuenta nueva y el **número de pedido usa el prefijo de la empresa** (`AUR-####`,
  antes `DEMO-####`). La auditoría de medios de la caja usa el mismo mapa.
- **Caja** (`demoCash.js`): el turno abierto firma con Hernán Acosta.
- **Sesión demo** (`sesion.jsx`, archivo compartido): los perfiles pasan a
  nombres reales del equipo ficticio (**Hernán Acosta** / **Diego López**) y la
  empresa a **Aurora Móviles S.A.** (antes «Dueño demo» / «MobOS Tienda Demo»);
  se ve en la barra y en el turno de caja.
- **Sucursales** (`demo/empresa.js`): la dirección con «Demo» pasa a una calle
  verosímil y la descripción del logo deja de decir «demo».

## Verificación

- `scripts/qa-190-demo-finanzas.mjs` (demo local, capturas + JSON) — **3/3**:
  cuentas con los 9 medios y sin «demo» en los datos, caja con turno real y
  auditoría, conciliación con Pix/USDT/Canje/Tarjeta/Transferencia, lote con su
  cuenta y pedidos `AUR-####`.
- Tests unitarios: `demoCuentasCobro.test.js` (medios completos, sin «demo» en
  campos visibles, transferencias y cajas completas) y el caso nuevo de
  `demoConciliacion.test.js` (mapeo de los medios nuevos).
- E2E: test nuevo en `e2e/demo-finanzas.spec.js` («los medios del sistema nuevo
  se ven completos y sin la palabra demo»); la suite de demo/finanzas 13/13.
- Checks: `lint` 0 · `npm test` 496/496 · build FE ✓ · build BE con `BUILD_ID` ✓ ·
  `test:unit` 71/71 · `test:e2e:smoke` 7/7.

## Evidencia

`docs/qa/190/190-cuentas.jpg`, `190-caja.jpg`, `190-conciliacion.jpg` y
`resultados.json`.

## Ajeno (reportado)

`src/lib/demoClientes.js:17` (CRM) firma una cronología como «Caja demo»; queda
para el slot de clientes.
