# #249 · Finanzas: responsive mobile (H2/H3) + cadena de costo real

- **Issue:** #249 (auditoría responsive de Dario) · **Coordinación:** DSN
  (auditoría y objetos compartidos), INV/CRM/POS (sus H2)
- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-23
- **Resultado:** los 4 hallazgos de Finanzas quedan corregidos **con capturas
  antes/después y gate e2e**, y la cadena de costo real (repuestos/reparaciones
  → margen/seguro) queda verificable con una sonda **de solo lectura** lista
  para producción.

## 1. Fixes responsive (H2/H3) con capturas

Hallazgos de la auditoría mobile (`docs/QA-RESPONSIVE-MOBILE.md`, pasada de
DSN) medidos a **390 px** sobre `/finanzas/caja` y corregidos:

| Hallazgo | Antes (390) | Después (390) | Fix |
| --- | --- | --- | --- |
| H3 · solapas de Finanzas (`Subtabs`) | 53×**36** | 53×**44** | `[&>button]:min-h-11 md:min-h-9` en el `Subtabs` de finanzas (`PanelVendedor.jsx`) |
| H3 · selector de período («30 días») | 123×**36** | 123×**44** | `[&>button]:h-11 md:h-9` en `VentasPorCaja.jsx` y `Conciliacion.jsx` |
| H2 · fila de auditoría · «Guardar» | 64×**32** | 72×**44** | `h-11 md:h-8` en Estado/Observación/Guardar de `AuditoriaEfectivo.jsx` |
| H2/H4 · casilla «Coincide» (medios) | 92×54 | 92×54 | **Ya cumplía**: el área táctil es el `label` (54 px); no se tocó |

Criterio: 44 px de alto táctil **solo en mobile** (`< md`); en desktop los
controles conservan 36/32 px, así que la densidad del panel no cambia (el e2e
de escritorio sigue verde).

Coordinación: el alto por defecto de los objetos compartidos (`Subtabs`,
`RangoFechas`, chips) queda para el fix H3 de **DSN**; acá se aplica el mismo
criterio en los usos de Finanzas (sin tocar los componentes compartidos, para
no pisar esa rama). Las tablas de otras pantallas de Finanzas no medidas en la
pasada (gastos, bancos, comisiones) quedan para la segunda vuelta del issue.

**Capturas** (`docs/qa/249-finanzas/`): `caja-390-antes/despues.png`,
`subtabs-390-*`, `auditoria-390-*`, `medios-390-*` y
`mediciones-antes/despues.json` (crudo de cada control).

**Gate:** `e2e/finanzas-caja.spec.js` → «responsive: los controles de finanzas
llegan a 44 px en mobile» (proyecto `admin`, corre en CI; con
`MOBOS_QA_CAPTURAS=1 MOBOS_QA_FASE=antes|despues` deja las capturas y el JSON).

## 2. Cadena de costo real en producción (repuestos → margen/seguro)

Sonda nueva `scripts/qa-249-costo-real-produccion.mjs`:

- **Producción: solo lectura** (nunca escribe; `MOBOS_QA_SEMBRAR` se bloquea si
  la API no es local). Busca una unidad **vendida** con repuestos de inspección
  (`inspection.costoRepuestosPyg`), rearma la cadena desde el pedido y comprueba:
  1. **base del costo** = consignación → costo de la unidad → costo del producto
     **+ repuestos/reparaciones**;
  2. **costo real congelado** = base + seguro + extras;
  3. **margen de la línea** = venta − costo real;
  4. **reporte** del día: el costo del producto incluye esa línea (y en modo
     sandbox, con una venta propia, el margen del reporte es exactamente
     venta − costo).
- **Fail-closed:** sin sesión (`MOBOS_QA_STORAGE_STATE`) sale 2; sin datos sale 1
  con el motivo, sin inventar verde.

### Evidencia ejecutada

- **Arnés de integración** (backend real, datos del seed; entra en CI):
  ```
  Cadena de costo real (repuestos/inspección → margen/seguro) sobre una unidad vendida (#249 §19)...
  PASS: MOB-#0028 · 994790194435805 · repuestos 120000 → base 1620000 + seguro 162000 = costo 1782000 ·
        margen de la línea 418000 · reporte: venta 2200000 − costo 1782000 = margen 418000 · 9 comprobaciones
  ```
  (unidad consignada inspeccionada: consignación 1.500.000 + repuestos 120.000,
  seguro 10% = 162.000 y el margen del reporte con ese costo).
- **Arnés local (escenario propio, e2e)**: `PASS: MOB-#0270 · 994790194704345 ·
  repuestos 120000 → base 1120000 + seguro 0 = costo 1120000 · margen de la línea
  1080000 · reporte: venta 2200000 − costo 1120000 = margen 1080000 · 18
  comprobaciones` + `docs/qa/249-costo-real-prod/resultados.json`.
- **Producción: pendiente de la sesión real** (la sonda no inventa datos). Para
  correrla el integrador/Dario:
  ```bash
  npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login
  MOBOS_QA_STORAGE_STATE=/tmp/mobos-qa.json node scripts/qa-249-costo-real-produccion.mjs
  ```

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **656/656** · build FE ✓ ·
build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · `db:check` ✓ ·
**arnés de integración PASS** (auditoría base↔API + sonda de costo real) ·
`e2e/finanzas-caja` **2/2** (escritorio + gate responsive) · sin marcadores.
