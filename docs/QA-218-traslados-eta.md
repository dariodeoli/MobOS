# #218 · Traslados: ETA del lote y quién despachó/recibió

Cierre del gap que quedaba de #218 (épica #215 §11): el detalle del lote ahora
muestra **origen, destino, fecha de envío, ETA, llegada real, cantidad, estado,
quién despachó y quién recibió**, por nombre.

## Qué entró

- **Modelo** (`backend/prisma/schema.prisma`): `StockTransfer.eta`,
  `StockTransfer.dispatchedById` y la relación `receivedBy`. Migración
  `20261203000000_transfer_eta_dispatched` aditiva, idempotente y re-ejecutable;
  backfill de `dispatchedById = createdById` para los lotes viejos (solo vacíos).
- **API de traslados** (`backend/app/api/transfers/route.ts`):
  - `POST` acepta `eta` (fecha ISO o `YYYY-MM-DD`; vacío = sin ETA) y registra
    al usuario que despacha.
  - `PATCH` actualiza guía AEX y/o ETA (auditorías
    `TRANSFER_AEX_GUIDE_ATTACHED` y `TRANSFER_ETA_UPDATED`); una ETA inválida se
    rechaza, no se ignora.
  - `GET` expone `dispatchedBy` y `receivedBy` por nombre.
- **Recepción** (`backend/app/api/inventory-units/verify/route.ts`): al cerrar el
  lote con la última unidad registra `receivedById` (el QR público sigue
  dejando la recepción sin cuenta).
- **Tabla de Traslados** (`src/components/control/Inventario.jsx`): columnas
  **ETA** (editable mientras el lote siga en tránsito, rojo si venció) y
  **Despachó / Recibió**; el alta de traslado suma la ETA y la recepción del lote
  muestra ETA + despachante.
- **Impresos**: la remisión (80 mm y A4) y el remito A4 muestran despachante,
  ETA y receptor por nombre.
- **Demo**: el traslado demo registra despachante y cierra quién recibió.
- **Helper compartido** `src/lib/traslados.js` (etiqueta de ETA y de
  despacho/recepción) con tests unitarios.

## Verificación

- `npm run lint` 0 errores · `npm test` **715 ✓** · backend `test:unit` **75 ✓** ·
  builds FE/BE con `BUILD_ID` · `prisma:validate` ✓ · sin marcadores de conflicto.
- **e2e (32/32)** con el arnés aislado del worktree:
  `traslados-etiquetas-lote` (5/5, incluye el caso nuevo de ETA/despacho),
  `inventario-unidades`, `qa-250-buscador-dependiente`,
  `inventario-tabla-encabezado`, `kardex-producto`, `qa-249-inventario-touch`,
  `public-quote-transfer` y `documentos-no-fiscales`.
- **Integración HTTP**: `backend/tests/inventory-transfers.mjs` ahora fija ETA y
  despachante al crear, el ajuste de ETA por `PATCH`, el rechazo de fecha
  inválida y el receptor por nombre al recibir.
- Capturas del caso e2e: `docs/qa/218-traslados-eta/08-eta-lote.jpg` (modal de
  ETA) y `09-lote-eta-despacho.jpg` (fila con ETA, despachó y recibió).
- Robustez: `elegirModelo` en `e2e/inventario-unidades.spec.js` ahora espera la
  sugerencia real del buscador (antes podía caer en «Agregar como producto
  nuevo» si la lista todavía no había llegado).

## Novedades para el dueño

- En Traslados ahora se ve **quién despachó** cada lote y **quién lo recibió**,
  con sus nombres.
- Se puede cargar una **fecha estimada de llegada (ETA)** al enviar el lote y
  ajustarla después desde la misma tabla; si se pasa y no llegó, queda en rojo.
- La **remisión y el remito** llevan esos datos, además de la llegada real: el
  papel cuenta la misma historia que la pantalla.
