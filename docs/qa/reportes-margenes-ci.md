# Reportes y márgenes · runner en el gate y sonda por sucursal/cliente (#148 · #171 · #83)

- **Rama:** `slot/finanzas` · **Fecha:** 2026-09-25 · **Resultado:** los tests
  puros de reportes corren en el gate (`test:unit` y, por lo tanto, CI) y la
  sonda independiente contra la base ahora también verifica los cortes por
  **sucursal** y por **cliente**.

## El pendiente que cierra

`docs/qa/148-19-descuento-margen.md` dejaba anotado: «`npm run test:reports` no
está cableado a CI (sus tests puros no corrían en ningún job); queda como mejora
pendiente conectar el runner de reportes».

- `backend/tests/run-unit.cjs` ahora incluye `reporting.test.ts` (24 tests): el
  runner corre dentro de `npm --prefix backend run test:unit`, que CI ya
  ejecuta. `npm run test:reports` sigue disponible para corridas directas.
- `backend/tests/reports-margen-db.mjs` suma la verificación de los cortes
  `groupBy=branch` y `groupBy=customers` con la misma regla por venta (costo
  congelado − descuento del carrito, piso 0, líneas sin costo informadas
  aparte), comparando fila por fila y totales contra SQL.

## Evidencia

- `npm --prefix backend run test:unit` → **99/99** (75 previos + 24 de reportes).
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` → arnés completo
  PASS; la sonda imprime:
  `PASS: reportes y comisiones contra la base — 74 orden(es), 2 vendedor(es), 1 sucursal(es), 27 cliente(s), 456 comparaciones`
  (antes: solo vendedor y totales, 56 comparaciones).

## Alcance

- No cambia ninguna fórmula ni contrato de la API: es cobertura (gate + sonda).
- Quedan como candidatos de producto, fuera de esta entrega: conciliar el costo
  pendiente de una venta pasada y la vinculación automática orden ↔ unidad del
  taller (épica F3).
