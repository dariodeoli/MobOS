# QA-320 — Sistema visual: un solo encabezado y un solo pie por página

Origen: auditoría del demo v1.0.209 (issue #320). Esta pasada consolida los
objetos compartidos que repetían identidad o pie y deja escritas las reglas que
van a ordenar el resto de la tanda visual.

## Qué se consolidó

| Hallazgo de la auditoría | Objeto / regla | Antes | Ahora |
|---|---|---|---|
| Títulos repetidos (header + contenido) en Precios, Cotizaciones, Comparador, Plantillas y varias páginas administrativas | `shared/BarraModulo` | La barra del módulo dibujaba un `h2` con el mismo título que el `h1` del shell (Cotizaciones, Productos, Pedidos, Compras, Delivery, Plantillas, Lista por modelo, Comparador, Autorizaciones, Precios, Promociones, POS, Taller, Trade-In…) | La identidad visible es **una sola**: el `h1` del shell (topbar, con su miga). La barra **no repite el título**: agrupa contexto + acción principal + secundarias, y los filtros van debajo. `titulo` queda como nombre accesible (`aria-label`) y `tituloVisible` existe solo para previews standalone (A3/A5) |
| Footers duplicados en Lista por modelo y Comparador | Pie institucional | `Celulares.jsx` y `Comparador.jsx` montaban su propio `ProductFooter` **dentro** del shell: dos pies por página | El pie del panel lo renderiza **solo `AppShell`**; las pantallas no lo repiten (las públicas/tokenizadas siguen standalone). Aserción de fuente en `objetosReglas.test.js` |
| Tarjetas enormes en el primer viewport y acciones que compiten con la principal | Reglas de composición | Sin regla escrita | `docs/PLANTILLA-OBJETOS.md` §3 (tarjetas de una sola capa, fila con borde/ícono/badge, primer viewport con datos), §5 bis (un solo encabezado y un solo pie) y §8 (referencia de sistema #320) |

## Cambios

- `src/components/shared/BarraModulo.jsx`: sin `h2` visible por defecto; la
  descripción pasa a verse también en mobile cuando no hay título; el nombre
  accesible y el testid no cambian (los consumidores no se tocan).
- `src/pages/preview/AprobacionOtpPreview.jsx` y
  `VarianteAgotadaPreview.jsx`: pasan `tituloVisible` (son previews sin shell).
- `src/pages/Celulares.jsx` y `src/pages/Comparador.jsx`: se quita el
  `ProductFooter` propio (lo renderiza el shell).
- `e2e/qa-256-composicion.spec.js` y `e2e/qa-278-cierre.spec.js`: las
  aserciones del `h2` de la barra se reemplazan por “la barra no repite el
  título” (`getByRole('heading')` → 0) manteniendo las acciones.
- `src/lib/objetosReglas.test.js`: nuevas aserciones de fuente (barra sin
  título duplicado y pie del panel solo desde el shell).
- `docs/PLANTILLA-OBJETOS.md` y `docs/AUDITORIA-DUPLICACION.md`: reglas y lote
  58 documentados.

## Evidencia y gate

- Spec `e2e/qa-320-sistema-visual.spec.js` (proyecto `admin`): recorre 22
  superficies (16 con barra de módulo + 6 administrativas sin barra) y
  verifica, en 1440 claro, 390 claro y 390 oscuro:
  1. la barra de módulo no contiene encabezados visibles;
  2. el título de la página (`h1` del shell) aparece **una sola vez** en
     `h1/h2/h3` visibles;
  3. hay **exactamente un** `footer.mobos-footer` por página.
- Capturas y registro crudo: `docs/qa/320-sistema-visual/`
  (`<superficie>-desktop.png`, `-mobile.png`, `-mobile-oscuro.png` y
  `auditoria-320.json`).

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  npx playwright test e2e/qa-320-sistema-visual.spec.js --project=admin
```

Resultado: **1/1 en verde** (sin reintentos), con las 22 superficies × 3
estados verificadas: título único y un solo pie en todas. Los specs que
codificaban el `h2` de la barra (`qa-256-composicion`, `qa-278-cierre`) pasan
con la regla nueva (10/10 en conjunto).

## Verificaciones de entrega

- `npm run lint` → 0 errores (2 warnings preexistentes).
- `npm run build` + `npm --prefix backend run build` → exit 0 con
  `backend/.next/BUILD_ID`.
- `npm --prefix backend run prisma:validate` → OK.
- `npm test` → 885 pass · 0 fail (incluye la aserción de fuente nueva).
- `npm --prefix backend run test:unit` → 138 pass · 0 fail.
- `node scripts/e2e-shards.mjs --check` → 202 / 202 / 202 (606 tests).
- `e2e/qa-320-sistema-visual.spec.js` (1/1) + `e2e/qa-256-composicion.spec.js`
  (6/6) + `e2e/qa-278-cierre.spec.js` (3/3) → **10/10 en verde**, sin reintentos.
- `rg "<<<<<<<" src backend e2e` → sin marcadores.
