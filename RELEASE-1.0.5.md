# MobOS v1.0.5

## Alcance

- **Costo real del producto:** `Product.costPyg` (opcional). Se carga desde Inventario → Costo ₲,
  que antes quedaba deshabilitado cuando la sesión era real y por eso el costo se perdía.
- **Foto del costo en la venta:** `OrderItem.unitCostPyg` congela el costo al momento de vender.
  La ganancia histórica no cambia si después se actualiza el costo del producto.
- **Ganancia honesta:** el tablero deja de mostrar la ganancia igual a las ventas cuando el costo
  no estaba cargado. Sin costo cargado la mercadería vendida queda en 0, como antes, pero ahora el
  dato se puede completar y se guarda.
- **Build de producción reproducible:** `.env.production` versiona `VITE_API_URL=https://api.controlaria.online`.
  Un build local o desde Hub queda conectado al API real sin depender de variables cargadas a mano.

## Migración

`20260911220000_product_cost`. Aditiva y opcional: agrega dos columnas nulas. No toca datos
existentes, no recarga productos y no obliga a recargar ventas históricas. El arranque del backend
aplica las migraciones antes de aceptar tráfico.

## Verificación local

- `npm run build` (frontend) y `npm run build` (backend) sin errores.
- Pruebas de unidad del frontend: 6 archivos, 13 pruebas aprobadas.
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` contra PostgreSQL 16 desechable:
  suite completa aprobada, incluida la comprobación nueva `4b/11` (costo del producto y foto del
  costo en la venta), el rechazo de costo negativo y la limpieza del costo con `null`.
- El bundle de producción compilado contiene `https://api.controlaria.online`.

## Publicación y reversión

Publicar el backend antes que el frontend, como en las entregas anteriores. Verificar
`/api/health`, una sesión real y que Inventario muestre y guarde el costo.

Reversión de código: volver a los commits anteriores. Las dos columnas nuevas son inofensivas si
queda una versión anterior corriendo; no hace falta revertir la base ni borrar datos.

## Pendiente después de esta entrega

- Comisión y precio mayorista siguen sin campo en la API.
- Al recibir una compra no se actualiza el costo del producto: definir si el costo puesto
  (flete y aduana prorrateados) reemplaza al costo cargado a mano.
- Gastos, publicidad y mayoristas no se hidratan desde la API.
