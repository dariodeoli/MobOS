# #240 ítem 7 — Valuación de trade-in con grado

Del épico #240 (*inspiración PhoneCheck*), ítem 7: **«el grado + checklist
alimenta la valuación de trade-in (ya existe valuación) con descuentos por
hallazgos»**. Evidencia en `docs/QA-240-7-valuacion-grado/`.

## Auditoría: qué había y qué faltaba

- **Ya desplegado:** tabla de **valores de toma** por modelo + condición
  (`/api/device-valuations`, pantalla Trade-In del dueño) y la sugerencia en la
  herramienta del vendedor (`/trade-in`, `SellerTools`): valor base por
  modelo/condición, editable, con el valor acordado.
- **Brecha:** la valuación **no miraba el estado real de la unidad**. El grado y
  los hallazgos de la inspección (los ítems 1-2 del épico, de INV) no
  descontaban nada: dos equipos del mismo modelo y condición valían lo mismo
  aunque uno tuviera la pantalla rota. Tampoco había forma de registrar los
  hallazgos en el canje ni de explicar el número.

## Entregado

| Archivo | Cambio |
|---|---|
| `src/lib/tradeInValuation.js` (nuevo) | Módulo puro: **10 hallazgos canónicos** con su descuento (pantalla 18%, Face ID 15%, reparaciones 12%, batería 10%, cámaras/carcasa 8%, conectividad 7%, audio/sensores 6%, botones 5%), **grados A–D** (0/4/12/25%), **grado sugerido** desde los hallazgos, valuación = base − descuentos con **tope del 70%** (nunca menos del 30%) y el **detalle por ítem** + resumen para las notas |
| `src/components/ventas/SellerTools.jsx` | Bloque **Inspección del equipo (grado y hallazgos)** en la herramienta de trade-in: checklist con su −%, grado automático (sugerido) o elegido, línea **“Base … −X% por grado y hallazgos → valor”** con el **detalle de cada descuento** y **Usar**; el resumen de la inspección viaja en el detalle de la condición del canje |
| `src/lib/tradeInValuation.test.js` (nuevo) | 5 tests: base sin hallazgos, descuentos con detalle, tope, grado sugerido, normalización desde array u objeto de checklist |

## Contrato de datos para INV (coordinación)

La valuación consume la unidad cuando venga de inventario:

- `grade`: `A`/`B`/`C`/`D` (o el grado propio de INV, mapeable en un punto).
- `checklist`: objeto con **estas claves canónicas** en `false`/`{ estado: false }`
  (hallazgo) — `pantalla`, `faceid`, `reparado`, `bateria`, `camaras`,
  `carcasa`, `conectividad`, `audio`, `sensores`, `botones` —, o un array de
  claves con hallazgo. Si INV usa otras claves, se alinean en la tabla del
  módulo (una sola fuente).
- Si la unidad **no** trae grado/checklist (hoy), el vendedor marca los
  hallazgos en el POS y el grado se sugiere solo: la valuación funciona igual.

## Evidencia

| Captura | Qué muestra |
|---|---|
| `00-antes-produccion-v1.0.141.png` | La herramienta en producción (v1.0.141) **antes**: sin inspección ni grado (solo modelo/condición y valor sugerido) |
| `01-base-modelo-condicion.png` | Valor base del modelo + condición (Gs 1.500.000, tabla de valores de toma) |
| `02-con-grado-y-hallazgos.png` | Inspección con pantalla (−18%) y botones (−5%) → **grado sugerido C (−12%)**, línea “−35% por grado y hallazgos → **Gs 975.000**” y el detalle de los tres descuentos |
| `03-continuar-en-pos.png` | «Usar» lleva el valor valuado al acuerdo y el canje continúa en el POS con el resumen de la inspección en las notas |
| `04-grado-sugerido.png` | El grado se sugiere solo: con botones (hallazgo menor) queda **B (−4%)** y sin hallazgos vuelve a **A** (base) |

## Verificación

- `node --test src/lib/tradeInValuation.test.js` **5 ✓** · `npm test` ✓ ·
  backend `test:unit` ✓ · lint 0 · builds FE/BE con `BUILD_ID` ·
  `prisma:validate` ✓ · sin marcadores (sin cambios de schema).
- e2e `e2e/qa-240-valuacion.spec.js` (cuenta real del harness, sesión del
  vendedor): base → hallazgos con detalle y grado sugerido → «Usar» → POS;
  más el caso de grado B/A.
- `test:e2e:smoke` ✓.
