# QA #196 — Finanzas en el demo público anónimo (post-deploy)

> El pedido llegó citando “#198”; en el backlog ese número no existe: la
> verificación post-deploy del demo público es **#196**. Este informe y los
> commits citan #196 (más #185 y #194 por trazabilidad).

- **Superficie verificada:** `https://app.moboss.online/demo` (demo anónima,
  versión observada **v1.0.128**).
- **Verificador reutilizable:** `scripts/qa-196-demo-finanzas-produccion.mjs`
  (`QA_BASE_URL` cambia la base) → `docs/qa/196/resultados.json` + 8 capturas.
- **Spec reutilizable:** `e2e/demo-finanzas-anonimo.spec.js` (corre en la suite
  local/CI; contra un deploy:
  `DEMO_BASE_URL=https://app.moboss.online npx playwright test e2e/demo-finanzas-anonimo.spec.js --project=core`).
  Los ítems pendientes de deploy quedan como chequeos “soft” que se listan sin
  cortar el recorrido.
- **Sin sesión real ni datos de tiendas:** solo la demo pública.

## Resultado (3 OK · 3 pendientes de deploy · 0 fallos · 0 llamadas al API)

| Paso | Estado | Detalle | Captura |
| --- | --- | --- | --- |
| Entrada anónima (Dueño) | ✅ | Banner de datos ficticios visible | `02` |
| Cuentas y medios | ✅ | 5 → 11 cuentas; nombres automáticos `Efectivo USD`, `Banco Itaú Paraguay - Titular Demo - Cuenta 1234`, `Bancard`, `Pix - Titular Demo`, `USDT - Titular Demo`, `Canje`; Pix fija **BRL** y USDT fija **USD** | `03` |
| Caja: turno y arqueo | ✅ | Estado “Abierta”, “Turno de …” (fix #188 deployado), cierre por denominaciones | `04`, `05` |
| Caja: auditoría de medios/efectivo | ⏳ Pendiente | No se renderizan en la demo | `06` |
| Conciliación | ⏳ Pendiente | “Conciliación no está disponible en la demo.” | `07` |
| Seguro y margen | ⏳ Pendiente | El seguro está deshabilitado con nota de demo (sin “Falta sesión”) | `08` |

- **Llamadas al API real: 0** durante todo el recorrido (el guard de #192
  funciona).
- **Ruido de consola:** 1 `ERR_CONNECTION_REFUSED`, el ping al agente de
  impresión local (`127.0.0.1:17890`) que hace el shell; dominio impresión
  (PRN), no bloquea la demo.

## Interpretación de los pendientes

Los tres pendientes son exactamente la demo de Finanzas de **#194**
(`90aa3e4` en `slot/finanzas`): conciliación con datos ficticios, auditoría de
caja visible y seguro simulable con efecto en el margen. En producción se ve la
versión v1.0.128, que todavía no la incluye; al integrarse/deployarse, el mismo
verificador pasa a verde sin cambios (los pasos “pendiente” mutan a “OK”).

## Cómo repetir la verificación

```bash
# Producción (capturas + resultados.json + exit 1 si hay fallos reales)
node scripts/qa-196-demo-finanzas-produccion.mjs

# Cualquier deploy alternativo
QA_BASE_URL=https://mi-deploy.example node scripts/qa-196-demo-finanzas-produccion.mjs

# Spec Playwright contra un deploy
DEMO_BASE_URL=https://app.moboss.online npx playwright test e2e/demo-finanzas-anonimo.spec.js --project=core
```
