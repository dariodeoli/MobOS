# QA #196 — Demo público en producción v1.0.136 (trackers #194/#198)

- **Superficie:** `https://app.moboss.online/demo` (demo anónima) y
  `https://clientes.moboss.online` (pedido público).
- **Versión observada:** **v1.0.136**.
- **Sin sesión real ni datos de tiendas:** todo el recorrido es en la demo
  pública, con datos ficticios.
- **Acceso anónimo y “solo sesión”:** entra sin login, no llama al API real
  (0 requests) y no deja nada en `localStorage`/IndexedDB; la marca de demo vive
  en `sessionStorage` y se limpia al salir (contrato #201 verificado con
  capturas en `docs/QA-201-210-plataforma-produccion.md`).

## Resultado por dominio (5 verificadores · todo en verde)

| Verificador | Dominio verificado | Resultado | Evidencia |
| --- | --- | --- | --- |
| `scripts/verificar-demo-publico.mjs` | Acceso anónimo, panel del vendedor, módulos locales, navegación sin sesión, guardado simulado | **5/5 OK** | `docs/qa/196-demo/` |
| `scripts/qa-198-demo-publico.mjs` | POS/ventas de punta a punta (catálogo, carrito y descuento, cliente nuevo, borradores, pago dividido, entrega, confirmación, analytics, móvil) + pedido público canónico (#197) | **14/14 OK** · 0 API | `docs/qa/198/` |
| `scripts/qa-196-demo-finanzas-produccion.mjs` | Cuentas y medios, caja (turno/arqueo), auditoría de medios y efectivo, conciliación, seguro aplicado al margen | **6/6 OK** | `docs/qa/196/` |
| `scripts/qa-194-impresion-demo.mjs` | Impresoras demo, actividad con estados honestos, auto-validación del número secreto, cola, prueba simulada, cancelación y reimpresión, QR por nivel | **10/10 OK** · 0 API | `docs/qa/196-impresion-prod/` |
| `scripts/qa-199-pos-responsive.mjs` | POS en 360 y 768 px (desborde, cobro, total, monto sin cuenta) | **2/2 sin desborde ni errores** | `docs/qa/199/` |

Referencia adicional ya publicada: `docs/QA-201-210-plataforma-produccion.md`
(bloqueo, último usado, demo sin persistencia y topbar) — **9/9 en v1.0.134**.

## Fallas encontradas y resolución

**Ninguna falla de producto.** Los 5 hallazgos iniciales eran de los propios
verificadores, con expectativas previas a los cambios recientes; quedaron
corregidos y re-corridos en la misma versión:

| # | Síntoma | Causa | Fix |
| --- | --- | --- | --- |
| 1 | “no se ve el banner de datos ficticios” (`verificar-demo-publico`, `qa-196`) | El banner vigente dice “Modo demo: datos ficticios…” | Regex actualizada |
| 2 | `option «Caja…»` no aparece al cobrar (`qa-198`) | La cuenta demo es “Caja · Guaraníes” y el combobox filtra por nombre | Se paga con “Guaraníes”; el segundo medio se elige por banco (“Itaú”) |
| 3 | “faltan impresoras demo” (`qa-194`) | Los nombres demo ya no llevan sufijo “(demo)” en la lista | Match por “Térmica mostrador” / “Térmica depósito” |
| 4 | “reimprimir el mismo nivel cambió el token” (`qa-194`) | El nivel del comprobante ahora es un radiogroup con iconos (#208) y el default es “Rápido” | Se fija “Completo” antes de comparar |
| 5 | “el margen no muestra el seguro aplicado” (`qa-196`) | El demo vive en memoria de la pestaña; el guion recargaba y perdía el seguro | Navegación dentro de la app (como el spec local, #204) |

**Coordinación con slots dueños:** no hubo fallas de producto que asignar. Si
aparecieran, el dominio marca el slot: POS/ventas → #198, finanzas → #194/#196,
impresión → #194/#198.

## No verificable sin sesión real

- **IMEI contra producción (#193):** `scripts/qa-193-imei-produccion.mjs`
  requiere un storage state de una cuenta real.
- **Presencia con varias personas, foto subida y logo de tienda reales:**
  pasos manuales documentados en `docs/QA-201-210-plataforma-produccion.md`.

## Cómo repetir

```bash
node scripts/verificar-demo-publico.mjs
node scripts/qa-198-demo-publico.mjs
node scripts/qa-196-demo-finanzas-produccion.mjs
QA_BASE_URL=https://app.moboss.online QA_OUT=docs/qa/196-impresion-prod node scripts/qa-194-impresion-demo.mjs
node scripts/qa-199-pos-responsive.mjs
```
