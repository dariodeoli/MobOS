# QA #196 — Finanzas en el demo público anónimo (post-deploy)

> El pedido original citaba “#198”; el tracker post-deploy por módulo es **#198**
> y el issue histórico de la verificación del demo público es **#196**. Este
> informe cita ambos.

- **Superficie verificada:** `https://app.moboss.online/demo` (demo anónima,
  versión observada **v1.0.129**, con el lote de demo #190/#192/#194).
- **Verificador reutilizable:** `scripts/qa-196-demo-finanzas-produccion.mjs`
  (`QA_BASE_URL` cambia la base) → `docs/qa/196/resultados.json` + capturas.
- **Spec reutilizable:** `e2e/demo-finanzas-anonimo.spec.js` (corre en la suite
  local/CI; contra un deploy:
  `DEMO_BASE_URL=https://app.moboss.online npx playwright test e2e/demo-finanzas-anonimo.spec.js --project=core`).
- **Sin sesión real ni datos de tiendas:** solo la demo pública.

## Resultado v1.0.129: 6 OK · 0 pendientes · 0 fallos · 0 llamadas al API

| Paso | Estado | Detalle | Captura |
| --- | --- | --- | --- |
| Entrada anónima (Dueño) | ✅ | Banner de datos ficticios visible | `02` |
| Cuentas y medios | ✅ | 5 → 11 cuentas; nombres automáticos `Efectivo USD`, `Banco Itaú Paraguay - Titular Demo - Cuenta 1234`, `Bancard`, `Pix - Titular Demo`, `USDT - Titular Demo`, `Canje`; Pix fija **BRL** y USDT fija **USD** | `03` |
| Caja: turno y arqueo | ✅ | Estado “Abierta”, “Turno de …”, cierre por denominaciones | `04`, `05` |
| Caja: auditoría de medios/efectivo | ✅ | Auditoría visible con 2 operaciones ficticias y marcas locales | `06` |
| Conciliación | ✅ | 3 pagos ficticios, lote conciliado (demo) con trazabilidad | `07` |
| Seguro y margen | ✅ | Guardado simulado; Ganancias con “Incluye seguro 25% (demo)”, costo real `Gs 6.712.500` y resultado `Gs 317.500` | `08`, `09` |

- **Llamadas al API real: 0** y **0 errores de consola** durante todo el
  recorrido (el guard de demo de #192 funciona).
- Sin “Falta sesión” en ninguna pantalla de Finanzas.

## Historial

- **v1.0.128:** los tres ítems que dependían del deploy de #194 (conciliación,
  auditoría de caja y seguro simulable) figuraban como “pendiente”.
- **v1.0.129:** el mismo verificador (sin cambios) pasó a **6/6 verde**: la
  demo de Finanzas de #194 quedó deployada.

## Cómo repetir la verificación

```bash
# Producción (capturas + resultados.json + exit 1 si hay fallos reales)
node scripts/qa-196-demo-finanzas-produccion.mjs

# Cualquier deploy alternativo
QA_BASE_URL=https://mi-deploy.example node scripts/qa-196-demo-finanzas-produccion.mjs

# Spec Playwright contra un deploy
DEMO_BASE_URL=https://app.moboss.online npx playwright test e2e/demo-finanzas-anonimo.spec.js --project=core
```
