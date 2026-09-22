# QA #198 — Demo público consolidado (v1.0.137)

**Estado:** recorrido completo por dominios con capturas y evidencia lista para
cerrar #196/#194/#198. **1 hallazgo real** (INV → issue #226) y 8 incidencias de
guiones de verificación (corregidas, sin impacto de producto).

- **Superficie:** `https://app.moboss.online/demo` (demo anónima) y
  `https://clientes.moboss.online` (públicos).
- **Versión observada:** **v1.0.137** (las corridas base se hicieron en v1.0.136,
  mismo lote de demo).
- **Sin sesión real:** todo el recorrido es anónimo, con datos ficticios y
  **0 llamadas al API real** en cada corrida.

## Cobertura por dominio (tracker #198)

| Dominio | Qué se verificó | Verificador | Resultado | Evidencia |
| --- | --- | --- | --- | --- |
| **POS/ventas** | Venta en una pantalla, catálogo, carrito + descuento, cliente nuevo, borradores, pago dividido, entrega con estados (#191), confirmación, analytics, móvil 390; `/pedidos/<token>` canónica + redirects (#197) | `scripts/qa-198-demo-publico.mjs` | **14/14 ✅** · 0 API | `docs/qa/198/` |
| **INV** | 23 unidades, ficha con costos PYG/USD, **IMEI simulado** (precheck + resultado, sin cobro), reservas (3) y alertas | `scripts/qa-198-demo-dominios.mjs` | **15/16 ⚠️** — Alertas en blanco → **#226 (INV)** | `docs/qa/198-dominios/` |
| **FIN** | Cuentas/medios, caja (turno/arqueo), auditoría, conciliación y seguro aplicado al margen | `scripts/qa-196-demo-finanzas-produccion.mjs` | **6/6 ✅** | `docs/qa/196/` |
| **CRM** | Ficha (deuda, últimas órdenes, cronología, seguro 12,5%), WhatsApp de plantilla, portal por token, `?cliente=`, Servicio Técnico y públicos con token inválido | `e2e/prod/187-clientes.mjs` | **✅ `hallazgos: []`** | `docs/QA-198-demo-crm-produccion/` |
| **PRN** | Impresoras demo, actividad/estados honestos, auto-validación, cola, prueba simulada, cancelación y anti-duplicados, QR por nivel | `scripts/qa-194-impresion-demo.mjs` | **10/10 ✅** · 0 API | `docs/qa/196-impresion-prod/` |
| **PLT/DSN** | Acceso anónimo (perfiles, navegación sin sesión, banner, 0 API) + **claro/oscuro por módulo** + marca del topbar | `scripts/verificar-demo-publico.mjs` + `qa-198-demo-dominios.mjs` | **5/5 ✅** + **12 capturas ✅** | `docs/qa/196-demo/`, `docs/qa/198-dominios/` |
| **POS responsive** | 360 y 768 px sin desborde, cobro visible | `scripts/qa-199-pos-responsive.mjs` | **2/2 ✅** | `docs/qa/199/` |

## Criterios de #196

- **PLT técnico ✅**: `/demo` abre sin login, perfiles Vendedor/Dueño entran,
  navegación sin sesión demo vuelve a `/demo`, una acción guardada avisa que es
  simulada, banner “Modo demo: datos ficticios…”, 0 llamadas al API y script
  Playwright reutilizable (`verificar-demo-publico.mjs` → `docs/qa/196-demo/`).
- **DSN visual ✅**: capturas **claro/oscuro por módulo** (POS, pedidos,
  clientes, inventario, finanzas, impresión) en `docs/qa/198-dominios/07–18`,
  con banner y densidad visibles en ambas variantes.

## Hallazgo real (asignado a su slot)

**#226 · INV — `/inventario/alertas` queda en blanco.** El `useState` de `tab`
en `src/components/control/Inventario.jsx` (~403) evalúa `canViewAlerts` antes
de su `const` (~481) → `ReferenceError: Cannot access 'es' before
initialization` al montar con la pestaña Alertas. Evidencia: captura
`docs/qa/198-dominios/19-hallazgo-inventario-alertas-en-blanco.jpg` y
`erroresConsola` en `docs/qa/198-dominios/resultados.json`. Issue abierta con
causa y fix sugerido (mover la declaración arriba del `useState`).

## Incidencias de guiones (corregidas, sin impacto de producto)

| Guion | Incidencia | Fix |
| --- | --- | --- |
| `verificar-demo-publico`, `qa-196` | Banner del demo con texto viejo | Regex “Modo demo: datos ficticios…” |
| `qa-198` | Cuenta demo renombrada (“Caja · Guaraníes”) y segundo medio por banco | Pago con “Guaraníes” / “Itaú” |
| `qa-194` | Impresoras demo sin sufijo “(demo)” | Match por “Térmica mostrador/depósito” |
| `qa-194` | Nivel del comprobante ahora es radiogroup (#208) y el default es “Rápido” | Se fija “Completo” antes de comparar |
| `qa-196` | El seguro del demo vive en memoria de pestaña (#204) y el guion recargaba | Navegación dentro de la app |
| `e2e/prod/187-clientes` | La guía automática del demo bloqueaba los clics | Cerrar la guía al entrar |
| `qa-198-demo-dominios` | El h1 vive en el header, no dentro de `main` | Espera por heading visible |
| `qa-198-demo-dominios` | El paso de Alertas pasaba con la pantalla en blanco | Ahora falla y captura el estado |

## No aplica en demo / requiere sesión real

- **Kardex:** el botón está oculto en demo (`!esDemo` en `ProductoDetalle`);
  cubierto localmente por `e2e/kardex-producto.spec.js`.
- **Sync POS↔stock:** `e2e/inventario-pos-sync.spec.js` (suite local).
- **IMEI real (#193):** `scripts/qa-193-imei-produccion.mjs` requiere storage
  state de una cuenta real.
- **Presencia, foto subida y logo de tienda reales:** pasos manuales en
  `docs/QA-201-210-plataforma-produccion.md`.

## Cómo repetir

```bash
node scripts/verificar-demo-publico.mjs
node scripts/qa-198-demo-publico.mjs
node scripts/qa-198-demo-dominios.mjs
node scripts/qa-196-demo-finanzas-produccion.mjs
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/196-impresion-prod node scripts/qa-194-impresion-demo.mjs
node scripts/qa-199-pos-responsive.mjs
QA198_SHOTS=docs/QA-198-demo-crm-produccion node e2e/prod/187-clientes.mjs
```
