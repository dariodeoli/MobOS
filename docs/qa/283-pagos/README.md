# #283 · «Pagos de esta venta» rediseñado

Tres cambios pedidos por Dario (27/09), todos con evidencia antes/después en
claro, oscuro y móvil:

1. **Sin cuenta predeterminada**: al tocar «+ Agregar pago» el buscador arranca
   vacío y el monto deshabilitado hasta elegir la cuenta a propósito (#272
   quitado: ya no se recuerda la última cuenta).
2. **El selector desaparece al elegir**: queda solo la cápsula de la cuenta con
   sus datos y el monto propuesto con el saldo pendiente. Cambiar de cuenta =
   eliminar el pago y agregar otro (con la ayuda visible).
3. **Sin superposiciones**: la lista del buscador pasa al flujo (deja de ser
   `absolute`), así empuja el monto y el equivalente en vez de taparlos; y la
   cápsula quedó **reordenada** con los datos rotulados: **número de cuenta**,
   **titular**, **banco/procesadora**, llave/referencia y CI/RUC, arriba el
   nombre, la moneda y el medio.

## Marcadores antes/después (`resultados-antes.json` / `resultados-despues.json`)

| Marcador | Antes | Después |
| --- | --- | --- |
| Cuenta al agregar el pago | `Caja · Guaraníes` (última usada) | vacío |
| La lista se superpone al monto | **sí** | **no** |
| Selector visible tras elegir | 1 (duplicado con la cápsula) | 0 |
| Cápsula tras elegir | 1 | 1 |
| Ayuda «eliminá este pago…» | 0 | 1 |
| Segundo pago: cuenta | `Caja · Guaraníes` (se arrastraba) | vacío |

## Capturas

En esta carpeta, con sufijo `-antes` / `-despues`:

- `claro-01-agregar-pago`, `claro-02-selector-abierto`, `claro-03-cuenta-elegida`, `claro-04-segundo-pago`
- `oscuro-…` (mismos pasos)
- `movil-…` (mismos pasos, 390×844)

## Tests

- e2e `pos-148-cobro-ux`: test nuevo «el pago arranca sin cuenta, al elegirla
  queda la cápsula y la lista no tapa el bloque (#283)» (mide la no
  superposición con las cajas reales y el orden de los rótulos) + cápsula
  rotulada en el test existente.
- e2e `pos-241-v2` y `qa-249-pos-touch`: actualizados al nuevo flujo (el combo
  desaparece al elegir; el target del buscador se mide antes de elegir).

Reproducir:

```bash
npx vite --port 5216 --strictPort &
QA_BASE_URL=http://localhost:5216 QA_ETIQUETA=despues \
  QA_OUT=docs/qa/283-pagos node scripts/qa-283-pagos.mjs
```
