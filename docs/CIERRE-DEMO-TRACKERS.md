# Cierre de los trackers del demo público (#196 · #194 · #198 · #195)

Consolidación de cierres con **evidencia por dominio**. Verificado contra
producción en **v1.0.137–v1.0.139** (el lote de demo está en todas), sin sesión
real y con **0 llamadas al API real** en cada corrida.

## Estado global

| Tracker | Estado | Pendiente |
| --- | --- | --- |
| **#196** Verificación post-deploy (PLT técnico + DSN visual) | ✅ **Listo para cerrar** | — |
| **#194** Barrido por dominio del demo | ✅ **Listo para cerrar** | — |
| **#198** Tracker por módulo | ⚠️ Cerrable **salvo INV** | 2 hallazgos abiertos (#226, #227) |
| **#195** Demo de Inventario | ⚠️ Todo verde **salvo** alertas y sync | #226 (alertas en blanco) · #227 (venta no mueve stock) |

## #196 — Verificación post-deploy del demo público

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| PLT técnico: `/demo` sin login, perfiles Vendedor/Dueño, navegación sin sesión vuelve a `/demo`, banner de datos ficticios, 0 API, script reutilizable | ✅ **5/5** | `scripts/verificar-demo-publico.mjs` · `docs/qa/196-demo/` |
| DSN visual: capturas claro/oscuro por módulo (POS, pedidos, clientes, inventario, finanzas, impresión) + banner/densidad | ✅ **12 capturas** | `docs/qa/198-dominios/07–18` |
| Base técnica adicional: contrato “solo sesión” (sin persistencia) y bloqueo del POS | ✅ **9/9** | `docs/QA-201-210-plataforma-produccion.md` · `docs/qa/201-210-produccion/` |

## #194 — Barrido por dominio del demo

| Dominio | Resultado | Evidencia |
| --- | --- | --- |
| POS/ventas (flujo, split, entrega #191, borradores, guardados simulados) | ✅ **14/14** | `docs/qa/198/` |
| Finanzas (cuentas/medios, caja, conciliación, seguro/margen, sin “Falta sesión”) | ✅ **6/6** | `docs/qa/196/` |
| Clientes/Servicio (ficha, deuda, cronología, seguro, portal por token, WhatsApp) | ✅ sin hallazgos | `docs/QA-198-demo-crm-produccion/` |
| Visual/UX (claro/oscuro, banner, densidad) | ✅ | `docs/qa/198-dominios/` |
| Impresión (cola/estados, sin backend real) | ✅ **10/10** | `docs/qa/196-impresion-prod/` |

## #198 — Tracker de verificación por módulo

| Módulo | Resultado | Evidencia | Issues |
| --- | --- | --- | --- |
| POS | ✅ 14/14 (+ `/pedidos/<token>` y redirects #197) | `docs/qa/198/` | — |
| INV | ⚠️ resto ✅ · **Alertas en blanco** · **venta no mueve stock** | `docs/qa/198-dominios/` · `docs/qa/195-demo/` | **#226** · **#227** |
| FIN | ✅ 6/6 | `docs/qa/196/` | — |
| CRM | ✅ sin hallazgos | `docs/QA-198-demo-crm-produccion/` | — |
| PRN | ✅ 10/10 | `docs/qa/196-impresion-prod/` | — |
| PLT/DSN | ✅ 5/5 + capturas claro/oscuro | `docs/qa/196-demo/` · `docs/qa/198-dominios/` | — |

## #195 — Demo de Inventario (extensión de #194 para INV)

Corrida v1.0.139 con `scripts/qa-195-demo-inventario.mjs` (**8/9**, 0 API, consola limpia):

| Criterio | Resultado | Captura |
| --- | --- | --- |
| Inventario con 23 unidades e IMEIs ficticios + IMEI **simulado** sin cobro | ✅ | `docs/qa/198-dominios/01–04` |
| Productos (catálogo demo) | ✅ | `docs/qa/195-demo/02-productos.jpg` |
| Compras navegable | ✅ | `docs/qa/195-demo/03-compras.jpg` |
| Ubicaciones (4) y Vendidos (3) | ✅ | `docs/qa/195-demo/04`, `05` |
| Servicio Técnico con OS-#… demo | ✅ | `docs/qa/195-demo/06-servicio.jpg` |
| **Carga rápida con costo diferido USD/Gs** (unidad nueva con US$ 100 · Gs. 750.000) | ✅ | `docs/qa/195-demo/07-recibir-unidad-usd.jpg`, `08-unidad-costo-usd.jpg` |
| Reservas (3) | ✅ | `docs/qa/198-dominios/05-inv-reservas.jpg` |
| **Kardex** | ➖ No aplica: el botón está oculto en demo (`!esDemo`, `ProductoDetalle`); cubierto con sesión real por `e2e/kardex-producto.spec.js` | `docs/qa/195-demo/09` |
| **Sync con POS** (la venta descuenta stock/unidad) | ❌ **Hallazgo #227**: la venta se confirma pero el inventario demo no cambia (23 → 23) | `docs/qa/195-demo/10-pos-venta-demo.jpg`, `11-inventario-tras-venta.jpg` |
| Alertas de reposición | ❌ **Hallazgo #226**: `/inventario/alertas` queda en blanco (TDZ `canViewAlerts`) | `docs/qa/198-dominios/19-hallazgo-inventario-alertas-en-blanco.jpg` |

**Para cerrar #195**, alcanza con el fix de INV de #226 y #227; después:
`node scripts/qa-198-demo-dominios.mjs` (debe dar 16/16) y
`node scripts/qa-195-demo-inventario.mjs` (debe dar 9/9).

## Pendientes fuera de estos trackers

- **#226** y **#227** — INV/POS (detalle y evidencia en cada issue).
- **#74** y **#87** — pasos operativos listos en `docs/PORTAL-CLIENTES-SUBDOMINIO.md`
  y `docs/STORAGE-Y-SCHEDULER.md` (los aplica Dario).
- **#193** — IMEI real contra producción requiere cuenta real (`scripts/qa-193-imei-produccion.mjs`).

## Cómo repetir la evidencia

```bash
node scripts/verificar-demo-publico.mjs
node scripts/qa-198-demo-publico.mjs
node scripts/qa-198-demo-dominios.mjs
node scripts/qa-195-demo-inventario.mjs
node scripts/qa-196-demo-finanzas-produccion.mjs
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/196-impresion-prod node scripts/qa-194-impresion-demo.mjs
node scripts/qa-199-pos-responsive.mjs
QA198_SHOTS=docs/QA-198-demo-crm-produccion node e2e/prod/187-clientes.mjs
```
