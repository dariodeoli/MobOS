# Cierre #278 · FIN — compacto de Autorizaciones y migración §9 (montos 10B/99B)

Cierra los dos ítems de Finanzas del issue de cierre de las auditorías
(#250/#148/#256): la **barra compacta de Autorizaciones** (patrón #256) y la
**migración de montos 10B/99B** (§9 de la épica #148, columnas de dinero a
bigint, cross-dominio con INV).

Spec re-ejecutable: `e2e/qa-278-cierre.spec.js` (4/4, incluye la pantalla de
Autorizaciones) y `e2e/qa-148-9-pos-montos.spec.js` (tope de venta 99B).
Capturas: `docs/qa/278-cierre/` y `docs/qa/148-9-montos-monedas/`.

## 1. Compacto de Autorizaciones (#256)

La pantalla repetía un encabezado grande con el título y dejaba «Actualizar»
aislado en la esquina; ahora usa la composición compartida `BarraModulo`:

- `data-testid="barra-autorizaciones"`, con ícono, **h2** «Autorizaciones
  comerciales», detalle corto y las **acciones juntas** (Actualizar). El badge
  de pendientes va al contexto de la barra.
- Se eliminó el bloque de encabezado duplicado; los filtros (estado/tipo)
  quedan en su tarjeta y la tabla no cambió.
- La regla de objetos exige la barra para que no vuelva atrás
  (`src/lib/objetosReglas.test.js`).

| | Antes (v1.0.192) | Después (#278) |
|---|---|---|
| Barra `barra-*` | ✗ | **✓** `barra-autorizaciones` |
| Encabezado grande propio | ✓ (título + descripción + botón) | **✗** (barra única) |
| Capturas | `docs/qa/256-cierre/produccion/autorizaciones-claro-desktop.jpg` | `docs/qa/278-cierre/compacto-autorizaciones-claro-desktop.png` · `-claro-mobile.png` |

## 2. Migración de montos 10B/99B (§9)

### El cambio

- **Migración `backend/prisma/migrations/20261228000000_money_bigint/`**: 81
  columnas de dinero pasan de `integer` (32 bits) a `bigint`. Es aditiva,
  idempotente y re-ejecutable (solo altera columnas que todavía están en
  `integer`, sin tocar datos).
- **Schema Prisma**: los mismos 81 campos quedan `BigInt`. Prisma devuelve
  `bigint` en lecturas y acepta `number` en escrituras.
- **Borde de conversión**: `backend/lib/montos.ts` (`numero()`,
  `numeroOpcional()`, `LIMITE_MONTO_GENERAL = 10.000.000.000`,
  `LIMITE_MONTO_VENTAS = 99.000.000.000`); las respuestas JSON serializan los
  importes como número (`BigInt.prototype.toJSON` en `backend/lib/prisma.ts`,
  seguro hasta 2^53).
- **Topes**: general 10B / ventas 99B en POS, Gastos, Caja, Pagos, Cuentas,
  Compras, Cotizaciones, Créditos, Autorizaciones, Reportes y Comisiones.
  Stock, cantidades y días siguen en 32 bits.
- **Frontend**: `LIMITE_MONTO_ALMACENABLE` pasa a ser el tope de ventas y el
  `MoneyInput` local toma los límites del módulo del repo (`@/utils/moneda`),
  no los de `owncoding-ui` (que todavía acota al techo viejo). Follow-up para
  DSN: bumpear la biblioteca cuando publique los topes nuevos.

### Evidencia

| Verificación | Resultado |
|---|---|
| `npm run db:check` contra la base migrada | **la base coincide con el schema** |
| Migración re-ejecutada a mano (`psql -f migration.sql`) | **no-op sin error** (idempotente); `Order.totalPyg` sigue `bigint` |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | **PASS completo** (créditos, finanzas, compras y repuestos con los nuevos topes) |
| `npm --prefix backend run test:unit` | **114/114** |
| `npm test` (frontend) | **848/848** |
| Sonda `scripts/qa-148-montos-monedas.mjs` | **8/8** (cheque de 3B entra y se anula; 10B+1 bloqueado con el número; venta de 3B guardada y cobrada; venta de 100B rechazada) |
| Set e2e afectado (qa-278-cierre, qa-148-9-pos-montos, qa-256-composicion, qa-fin-compacto, finanzas-caja/comisiones/conciliacion, compras-densidad) | **30/30** |
| `npm run test:e2e:smoke` | **19/19** |

Capturas de la sonda (local, demo sembrada): `gastos-3b-guardado.jpg`,
`gastos-sobre-tope-general.jpg`, `caja-sobre-tope-general.jpg` y
`resultados-bigint.json` en `docs/qa/148-9-montos-monedas/`.

## 3. Cómo re-verificar

```sh
# con la base e2e aplicada y los servidores del harness (puertos del worktree)
npm run db:check
QA_API_URL=http://localhost:3115 QA_BASE_URL=http://localhost:5215 \
  node scripts/qa-148-montos-monedas.mjs
npx playwright test e2e/qa-278-cierre.spec.js e2e/qa-148-9-pos-montos.spec.js
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

> Nota de artefacto: por la migración, el snapshot de la base e2e se invalida
> solo y la próxima corrida vuelve a sembrar (mecanismo existente del harness).
