# Cierre #287 · Productos y Unidades: un mismo objeto, dos vistas

Pedido de Dario: dejar de sentir Productos y Unidades como dos mundos. Se
unifica el **objeto** (el artículo de inventario) manteniendo **vistas
distintas** y sin fusionar datos.

## Propuesta de estructura (implementada)

**Modelo mental:** un artículo tiene una vista de **Producto** (atributos,
precios, stock agregado y unidades por estado) y una vista de **Unidades** (una
fila por IMEI/serial con su estado físico, ubicación y verificación).

| Pieza | Cómo queda |
|---|---|
| **Switch de vista** | `Productos ⇄ Unidades` en la barra de las dos pantallas (`VistaProductosUnidades`, sobre el `SegmentedField` compartido). Al cambiar, **el contexto viaja**: la búsqueda y, si venías de un producto, ese producto. |
| **Producto → sus unidades** | La ficha del producto («Equipos por estado») suma **«Ver unidades en Inventario»** y abre la vista de Unidades **acotada a ese producto**. |
| **Unidades → su producto** | La ficha de la unidad suma **«Ver producto»** y abre el catálogo con la ficha de ese producto ya abierta. |
| **Vista de Unidades acotada** | `?producto=<id>` filtra la tabla (y las métricas) a ese producto, con un **chip de contexto** en la barra y un botón para quitar el filtro. |
| **Catálogo del POS** | Cada fila del producto dice **«N en stock · N unidades con IMEI»** (la API de productos ahora devuelve `unitsCount` de las unidades disponibles) y al agregarla el flujo pide/elegir la unidad exacta, como ya hacía. |
| **Lo que NO cambia** | Los datos siguen separados (`Product` = variante/atributos/stock; `InventoryUnit` = serial/estado/ubicación). Ninguna pantalla pierde lo suyo: altas, importación, precios, stock por contador, IMEI, verificación, traslados, impresión. |

Para DSN: el switch usa el control compartido y vive en la `BarraModulo` de
cada módulo (sin nuevo patrón visual); el chip de contexto sigue el estilo de
los chips de la barra. Cualquier ajuste fino de color/medida se hace sobre esos
objetos, no por pantalla.

## Qué se implementó

- `src/components/shared/VistaProductosUnidades.jsx` (nuevo): el switch, con el
  contexto `q` + `producto` en las dos direcciones.
- `SellerCatalog` (Productos): renderiza el switch y entiende `?q=` y
  `?producto=` (abre la ficha del producto y limpia el parámetro).
- `Inventario` (Unidades): renderiza el switch, filtra por `?producto=` (API y
  métricas), muestra el chip del producto para quitarlo y —de paso— el buscador
  local ahora también mira el **SKU** (el placeholder ya lo prometía y la API ya
  lo buscaba: al llegar por SKU las filas desaparecían).
- `ProductoDetalle`: enlace «Ver unidades en Inventario».
- `UnidadDetalle`: enlace «Ver producto».
- `backend/app/api/products` GET: `unitsCount` (unidades AVAILABLE por variante).
- `PasoProductos` (POS): la fila muestra «N unidades con IMEI».

## Capturas

`docs/qa/287-objeto-unificado/` — antes/después (el «antes» se generó con
`QA_287_ANTES=1` sobre el código previo):

- `{antes,despues}-producto-detalle-unidades-1440-{light,dark}.png` — ficha del
  producto con sus unidades + el enlace nuevo.
- `despues-unidades-del-producto-1440-light.png` — vista de Unidades acotada,
  con el chip de contexto y el switch.
- `despues-productos-con-contexto-1440-light.png` — vuelta a Productos con la
  búsqueda conservada.
- `despues-unidad-a-producto-1440-light.png` — de la unidad a su producto.
- `{antes,despues}-pos-catalogo-unidades-1440-{light,dark}.png` — el catálogo
  del POS con «N unidades con IMEI».
- `{antes,despues}-pos-unidad-elegida-light.png` — el selector de IMEI de la
  venta.

## Tests

- e2e `e2e/qa-287-objeto-unificado.spec.js` (**2/2**): producto → unidades →
  vuelta con contexto; catálogo del POS con el conteo de unidades y el selector.
- Regla de objetos (`src/lib/objetosReglas.test.js`): el switch es compartido y
  vive en las dos vistas; los dos detalles quedan cableados.
- Afectados en verde (86 + 2): `qa-285`, `qa-286`, `qa-257`, `qa-263`,
  `pos-148-s11-sin-stock`, `inventario-unidades`, `inventario-importacion`,
  `kardex-producto`, `menu-ia`, `admin`*, `precios-listas`,
  `qa-256-composicion`, `qa-249-*`.

## Verificaciones

- `npm run lint` 0 errores · `npm run build` ✓ · `npm --prefix backend run build` ✓ con `BUILD_ID` · `prisma:validate` ✓.
- `npm test` **863/863** · backend `test:unit` **133/133** · shards OK (194/194/193).
- `rg "<<<<<<<" src backend e2e` → 0.

> \* `admin.spec.js › inventario: la unidad reservada sigue en el listado` falla
> en la base e2e local porque la unidad del seed quedó **SOLD** por corridas
> anteriores (el seed no resetea el stock de productos serializados). En base
> limpia (CI) pasa; no es de este cambio.

## Fuera de INV (reportado)

- El **catálogo del POS** y su guía inline viven en `FormularioVenta`/venta
  (POS): acá solo se mostró el conteo de unidades que aporta la API de
  productos; cualquier rediseño mayor de esa pantalla es de POS.
