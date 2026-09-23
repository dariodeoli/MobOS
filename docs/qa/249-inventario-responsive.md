# Inventario responsive (#249 · H2/H3/H4 + ficha con checklist en mobile)

Fixes de la auditoría responsive de DSN sobre **Inventario**, medidos con cajas
reales a 390 px (mobile) y 768 px (escritorio).

## Hallazgos y fixes

| # | Hallazgo (mobile) | Fix |
|---|---|---|
| **H2** | lápiz de costo 14×14, verificar 24×24 y menú Acciones 28×28 | los tres pasan a **44×44** en mobile (`h-11 w-11`) y vuelven a su tamaño compacto en `md:` (7×7 / 6×6 / 7×7) |
| **H2** | botones de texto «Editar» / «Finalizar venta» de 26 px de alto | `min-h-11` en mobile (`md:min-h-0` en escritorio) |
| **H3** | solapas de estado (Inventario/Taller/Alertas…) de 32 px | `min-h-11` en mobile; el buscador ya era 44 |
| **H3** | acciones del lote (Vender/Verificar/Etiquetas/CSV…) de 26 px | `min-h-11` en mobile |
| **H4** | casilla de selección de 16×16 | la casilla vive en un `<label>` de **44×44** (encabezado y fila) y la columna del grid pasa a **2.75 rem**; el dibujo sigue de 16 px |
| — | ficha con checklist: estados del PhoneCheck de 30 px | `min-h-11 flex-1` en mobile (los 4 estados entran en la fila) y `md:min-h-0 md:flex-none` |

La fila **no crece en escritorio** (#246 sigue): a 768 px mide ≤48 px y los
íconos vuelven a su tamaño compacto (verificado por el e2e).

## Medición (mobile 390)

| Target | Antes (producción v1.0.152) | Después |
|---|---|---|
| Casilla de fila | 16×16 | **44×44** |
| Lápiz de costo | 14×14 | **44×44** |
| Verificar | 24×24 | **44×44** |
| Menú Acciones | 28×28 | **44×44** |
| Solapa de estado | 109×32 | 109×**44** |
| Estado del checklist | 39×30 | **72×44** |

## Evidencia

- **Antes** (producción v1.0.152, sin los fixes): `docs/qa/249-inventario-responsive/prod/`
  (`01-mobile-lista.jpg`, `02-mobile-ficha-checklist.jpg`, `medidas.json`) — script
  `scripts/qa-249-responsive-prod.mjs`.
- **Después** (harness, backend real): `docs/qa/249-inventario-responsive/despues/`
  (`01-mobile-lista.png`, `02-mobile-ficha-checklist.png`, `03-escritorio-768.png`,
  `medidas-mobile.json`).
- e2e que lo fija: `e2e/qa-249-inventario-touch.spec.js` (2/2: mobile ≥44 en
  todos los targets y escritorio con la fila compacta).

## Notas

- La tabla sigue con **scroll horizontal intencional** en mobile (grid de 55 rem):
  es una tabla de datos, no un corte accidental; la ficha es la vista cómoda.
- `BarraLote`, solapas y checklist quedaron con el mismo patrón (`min-h-11` +
  `md:min-h-0`) para que DSN/CMP puedan reemplazarlo cuando aterrice el chip
  compartido de 44.
