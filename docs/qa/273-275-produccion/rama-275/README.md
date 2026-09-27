# #275 · Ida automática al detalle del pedido — evidencia de rama

Verificación local sobre el build de la rama `slot/pos` (`http://localhost:5216`,
demo pública), con el mismo probe que documentó el problema en producción.

## Resultado (`resultados.json`)

- `navegoAlDetalle: true` — al confirmar, la app va sola a `/pedidos/<id>`.
- `numeroVisible: true` — el detalle muestra el número del pedido (`AUR-#0001`).
- `carritoVacio: true` — al volver al POS el carrito queda vacío.
- `erroresPagina: []`.

Antes, en producción v1.0.191 (mismo probe): `../resultados.json` →
`navegoAlDetalle: false`, la app quedaba en `/pos` y el número no aparecía.

## Cómo se reprodujo

```bash
QA_BASE_URL=http://localhost:5216 QA_OUT=docs/qa/273-275-produccion/rama-275 \
  node scripts/qa-273-275-produccion.mjs
```

## e2e de la rama (52/52, sin flakes)

`pos-checkout`, `pos-qa-173`, `pos-148-s11-sin-stock`, `qa-263-imei-venta`,
`precios-listas`, `demo-crm` y `demo-anonimo`: las aserciones post-venta ahora
esperan la llegada al detalle (también en demo) y `pos-checkout` cubre
«Volver al POS» con el carrito vacío.
