# F3 · paso 5: el carrito completo del POS con el lenguaje v2 (#241)

Alcance aprobado del plan F3: **bloque de cobro y modales de venta** detrás del
flag `preview v2`. Sin cambios de lógica; el default (flag apagado) queda igual.

## Qué se hizo

- **Scope explícito**: el carrito y el cobro aplican `.tema-v2` cuando la
  preview está activa (`PasoCarrito`, `PasoCobro`), igual que el shell; los
  modales lo heredan. Números grandes (`v2-numero`) ya estaban en los totales.
- **AA del cobro** (medición real, `e2e/helpers/contraste.js`):
  - El botón principal usaba texto negro sobre el ámbar/verde/rojo oscuro del
    tema claro (2.9:1). Ahora el texto sigue el tema (`text-white dark:text-black`
    en los estados parcial/completo/sin pago).
  - Las etiquetas «Pagado»/«Pendiente» de los tiles usaban `text-mute` sobre el
    tinte del tile (4.05–4.22:1). Ahora usan el color del estado (`text-ok` /
    `text-warn`), con el mismo resultado que su valor.
- **Testid** `pos-cobro` para poder medir el bloque.

## QA antes/después (claro/oscuro · desktop 1280 / mobile 390)

Capturas con el flag **apagado** y **prendido** en `docs/rediseno/c241f3p5-*`:

| Superficie | Archivos |
|---|---|
| Cobro (parcial «No pagado») | `…-cobro.png` |
| Cobro (pago completo «Confirmar venta») | `…-cobro-completo.png` |
| Modal suspender venta | `…-modal-suspender.png` |
| Modal ventas suspendidas | `…-modal-suspendidas.png` |
| Modal producto escaneado | `…-modal-escaner.png` |
| Confirmación compartida (eliminar línea) | `…-modal-confirmacion.png` |

Cada archivo es `c241f3p5-<vista>-<tema>-v2<on|off>-<superficie>.png`.

**Contraste medido** (textos bajos de AA, exigido con el flag prendido y también
informado apagado): **0 en las 40 mediciones** del carrito, el cobro y los
modales, en claro/oscuro y 1280/390 (`pos-241-v2.spec.js`, 4/4).

## Pendiente de CMP (biblioteca)

- `Button` variantes `success` (`bg-ok text-black`) y `danger` (`bg-bad
  text-fore`) no cumplen AA en el tema claro: el botón «Eliminar línea» del
  `ConfirmDialog` mide **2.98:1** (negro sobre `#B91C1C`) y el «Confirmar venta»
  quedaba igual sobre el verde; el POS los corrige localmente en su botón
  principal (`text-white dark:text-black`). Conviene un token de texto sobre
  ok/warn/bad por tema.
- La **×** del `Modal` mide 25×36 (target 44 en mobile, #249).

## e2e

- `e2e/pos-241-v2.spec.js` (admin, 4/4): arma un split con un bloque «No pagado»,
  mide AA del carrito/cobro y de los tres modales con el flag apagado y
  prendido, y deja las capturas con `MOBOS_CAPTURAS=docs/rediseno`.
- Regresión POS: `pos-checkout` + `pos-qa-173` + `qa-249-pos-touch` + este spec
  = **30/30** (0 flaky); `npm test` 674; smoke 19.
