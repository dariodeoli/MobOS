# #257 · El inventario no figuraba en el POS

Dario: «el inventario no figura en el pos, unidades no figura en pos».

## Causa raíz (reproducida en el arnés con sesión real)

El POS lee el catálogo del **espejo local** (`getProductos()`), que se hidrata al
arrancar la app (#247: pinta al instante desde la foto y refresca en segundo
plano). Dos piezas faltaban:

1. **Al volver a la venta no se refrescaba el catálogo**: un producto creado en
   Inventario/Productos (u otra pestaña o persona) no aparecía en el POS hasta
   recargar la app. La vista de venta queda montada (oculta) y nada volvía a
   hidratarla.
2. **El espejo actualizado no repintaba**: `notify()` no tenía suscriptores, así
   que la hidratación en segundo plano dejaba el mismo catálogo viejo en
   pantalla (afectaba también a la recarga con foto local).

Extra: el refresco podía leer la **caché corta de GET (3 s)** del cliente de API,
que no se invalida si el alta viene de otra pestaña/dispositivo.

No era la query de productos/stock de INV (el endpoint devuelve todo y el
paginado por cursor está bien): el problema era del lado del POS.

## Corrección (`slot/pos`)

- `src/lib/storage.js`: `refrescarCatalogo()` (consulta fresca, sin caché de GET)
  y contador de revisión que incrementa `notify()`.
- `src/hooks/useAlmacenRevision.js`: hook de suscripción para repintar las
  pantallas que leen el espejo fuera del ciclo de estado.
- `src/components/ventas/VistaCargarVenta.jsx`: repinta con cada actualización y
  **refresca el catálogo al volver a la venta** (`activo`).
- `src/pages/PanelVendedor.jsx`: pasa `activo={vista === 'cargar'}`.

## Evidencia (e2e con sesión real + capturas)

`e2e/qa-257-inventario-pos.spec.js` (proyecto admin, 2 casos):

| Caso | Antes | Después |
|---|---|---|
| Producto de Inventario → volver al POS por SPA | ✘ no aparecía (`test-results/…/test-failed-1.png`) | ✓ aparece (`despues-pos-con-producto.png`, catálogo 13 → 14 disponibles) |
| Producto de Inventario → recargar el POS | ✓ (ya andaba) | ✓ aparece (`despues-pos-tras-recarga.png`) |

Capturas en esta carpeta (`antes-pos-sin-producto.png`, `despues-*`).
