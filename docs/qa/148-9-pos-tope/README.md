# #148 §9 · POS: montos sobre el tope, bloqueados con el detalle

## El resto que quedaba (reporte de Finanzas en la épica)

La verificación de §9 (`docs/qa/148-9-montos-monedas.md`) dejó un pendiente para
el slot POS: los campos ya acotan y marcan el exceso (`MoneyInput` con el tope
real de las columnas de 32 bits), pero **el guardado no lo bloqueaba**. En la
demo la venta se confirmaba igual; contra el backend real, el rechazo no decía
cuál era el monto.

## La corrección

- **`src/utils/limitesVenta.js`** (+ `limitesVenta.test.js`):
  `montosFueraDeRango()` revisa precio unitario, total de línea (cantidad),
  descuentos, envío, pagos, total y pagado contra `TOPE_VENTA`
  (2.147.483.647, el límite de producto acotado a lo almacenable);
  `mensajeMontosFueraDeRango()` explica el primer monto, cuánto es el tope y
  cuántos montos más quedan fuera.
- **`FormularioVenta.guardar()`**: con cualquier monto fuera de rango **no se
  arma el pedido** y el aviso dice qué revisar (antes se seguía de largo).
- **Aviso a la vista**: los errores de validación del POS se traen a la vista
  al aparecer (si el usuario está en el cobro, el mensaje queda visible sin
  scrollear a mano).

## Evidencia (demo, sonda `scripts/qa-148-9-pos-tope.mjs`)

Precio de venta de `Gs 5.000.000.000` sobre una funda, 3 variantes (desktop
claro/oscuro y mobile claro), 0 errores de página:

| Versión | Campo marca | Bloquea | Mensaje / resultado | Captura |
|---|---|---|---|---|
| **Producción v1.0.170 (antes)** | ✅ `aria-invalid` | ❌ confirma la venta («Recibo confirmado») | sin aviso | `produccion-1.0.170/guardado-desktop-claro.jpg` |
| **Rama (después)** | ✅ | ✅ no crea el pedido (`creacion: false`) | «No se puede guardar: el precio de … (Gs 5.000.000.000) supera el máximo que el sistema puede guardar (Gs 2.147.483.647). Bajá el monto para continuar. Revisá también 1 monto más.» | `rama-148-9/guardado-desktop-claro.jpg` |
| **Producción v1.0.172 (post-deploy)** | ✅ | ✅ no crea el pedido | el mismo aviso, ya publicado | `1.0.172-produccion-postdeploy/guardado-desktop-claro.jpg` |
| **Producción v1.0.178 (post-deploy)** | ✅ | ✅ no crea el pedido | el mismo aviso, vigente en la última versión | `1.0.178-produccion-postdeploy/guardado-desktop-claro.jpg` |
| **Producción v1.0.182 (post-deploy)** | ✅ | ✅ no crea el pedido | el mismo aviso, vigente | `1.0.182-produccion-postdeploy/guardado-desktop-claro.jpg` |

Capturas por variante (`precio-sobre-tope-*`, `guardado-*`) y datos crudos en
`resultados-<etiqueta>.json`.

## e2e

`e2e/qa-148-9-pos-montos.spec.js` (proyecto admin): arma la venta con un
accesorio del seed, pone `5.000.000.000`, verifica que el campo queda marcado,
que al confirmar aparece el aviso **a la vista** (`toBeInViewport`) y que no se
crea ningún pedido.

## Alcance

El tope real sigue siendo **2.147.483.647** (columnas de 32 bits). Habilitar los
10B/99B de §9 exige migrar las columnas de dinero a BigInt: queda como unidad
cross-dominio de la épica, fuera del POS.
