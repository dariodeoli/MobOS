# Promociones por línea

`ProductPrice` admite `quantity` (default 1), `esDemo` (default false) y llama `onChange(priceString, couponCode)`.
Código al aplicar: `"SAVE10"`; al editar o quitar: `null`.
Main debe conservar el código por línea y omitirlo cuando esté vacío.

```json
{"items":[{"productId":"product-id","quantity":1,"unitPricePyg":900,"couponCode":"SAVE10"}],"discountPyg":0}
```

Enviar a `POST /api/orders`. El servidor recalcula contra el precio actual del catálogo,
rechaza divergencias, valida pertenencia, estado, vigencia y límite acumulado de unidades.
Los cupones no acumulan descuento global. `promotionSnapshot` es generado exclusivamente
por servidor y persistido en OrderItem. El subtotal ya incluye los descuentos por línea.
El límite consume unidades, incluso en órdenes pendientes; cancelaciones no restituyen cupos.

Endpoints autenticados:

- `GET /api/promotions`: listado del tenant; vendedores reciben promociones activas dentro de vigencia.
- `POST /api/promotions`: ADMIN, `{code,name,kind,value,startsAt,endsAt,productId?,maxUnits?}`.
  `kind` = `PERCENT` (entero 1–100) o `FIXED` (Gs por unidad). Fechas ISO con zona;
  producto y límite nulos = todos/sin límite. Monto máximo: precio del producto.
- `PATCH /api/promotions`: ADMIN, `{id,isActive}`. Para modificar condiciones crear otro código.
- `POST /api/promotions/quote`: `{productId,quantity,couponCode}` devuelve
  `{couponCode,unitPricePyg,promotionSnapshot}`. No consume ni reserva cupo.

Demo: `src/lib/demoPromotions.js` exporta `validateDemoPromotionItems(items, products, discountPyg = 0)`
antes de guardar y `recordDemoPromotionUsage(items, products, discountPyg = 0)` después de
confirmar guardado. Productos con `{id,precioVenta}`, líneas con la estructura API anterior.
Ambos lanzan errores; validación retorna `{CODIGO: unidades}`. Consumo vuelve a validar.
Datos locales ficticios; no hay atomicidad entre almacenamiento de venta y cupos ni entre pestañas.

Aplicar migración `20260911200000_promotions` y generar Prisma antes de iniciar backend.

Verificación sin build:

```sh
node backend/tests/promotions.mjs
node src/lib/demoPromotions.test.js
MOBOS_CHECKOUT_TEST=1 node backend/tests/checkout-customer.mjs
```

El test de backend usa `/opt/homebrew/bin` PostgreSQL en cluster temporal con datos ficticios,
aplica todas las migraciones y llama rutas reales con sesiones reales; no lee `.env`.
