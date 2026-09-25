# #250 · Buscador dependiente (modelo → capacidad → color) en Stock y Compras

**Pedido**: adoptar en Stock y Compras el alta y la búsqueda de productos con
dependientes (modelo → capacidad → color), **reusando el objeto de CMP** y sin
duplicar lógica de catálogo.

## Qué se adoptó

1. **Búsqueda**: el buscador de producto de la biblioteca (`ProductCombobox` de
   owncoding-ui) — sugerencias en flujo, teclado y «Agregar … como producto
   nuevo». En **Compras** ya estaba en la línea de compra; **Stock** lo estrena
   en «Recibir unidad» (antes era un `<select>` plano de modelos).
2. **Alta dependiente** (nuevo objeto de la app, `components/shared/VarianteProducto.jsx`):
   tres campos encadenados — **modelo → capacidad → color** — donde cada paso
   habilita y sugiere el siguiente con el catálogo real:
   - **capacidad** depende del modelo (lineup nuevo/seminuevo + lo ya cargado);
   - **color** depende de modelo + capacidad (colores ya cargados de esa
     variante; sin datos no inventa ninguno);
   - cambiar el modelo (o la capacidad) **resetea** los pasos siguientes;
   - si la variante ya existe, avisa y ofrece **usar la existente** en vez de
     duplicar el producto.
3. **Catálogo compartido**: `lib/catalog.js` suma `modelosDeCatalogo`,
   `capacidadesDeModelo`, `coloresDeVariante`, `skuDeVariante` y
   `varianteExistente` (con tests). Las pantallas no vuelven a implementar el
   catálogo: consumen esos helpers. El **SKU único lo sigue resolviendo el
   servidor** (`skuUnico`), la app solo manda la base.

## Dónde

| Pantalla | Antes | Ahora |
|---|---|---|
| Stock · «Recibir unidad» | `<select>` de modelos | buscador de la biblioteca + alta dependiente en el mismo modal |
| Compras · línea de compra | el buscador creaba el producto con el texto como nombre y SKU | el buscador abre el alta dependiente y la variante creada queda elegida en la línea |

## Tests y evidencia

- Unit: `src/lib/catalog.test.js` (capacidades por modelo, modelos sugeridos sin
  repetidos, colores por variante, SKU base, variante existente).
- e2e `e2e/qa-250-buscador-dependiente.spec.js`:
  - **Stock**: el modal abre el buscador; al crear un modelo inexistente aparece
    la cascada; sin capacidad el color está deshabilitado; con «iPhone 15» las
    capacidades sugeridas traen `128GB` (lineup); al crear se verifica por API
    que el producto quedó con `capacity` y `color` elegidos y su SKU, y el modal
    queda con esa variante seleccionada.
  - **Compras**: la línea abre la cascada y la variante creada queda elegida.
- Capturas (`docs/qa/250-buscador-dependiente/`): `01-compras-cascada.png`,
  `02-stock-cascada.png`, `03-stock-variante-creada.png`.

## Nota para CMP

`VarianteProducto` es de la app porque compone el catálogo real (lineup +
productos) con el buscador de la biblioteca. Si CMP lo quiere como objeto
(`VarianteProducto` con props `{ productos, dependencias }`), el contrato está
listo: sugerencias por paso, reset en cascada, aviso de existente y `onCreado`.
