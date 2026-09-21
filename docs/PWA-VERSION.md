# PWA: versión nueva y actualización del shell (#214)

Caso real (21-09): producción servía **v1.0.131** y una app abierta seguía
mostrando **v1.0.130**. La app no se actualiza sola (y está bien: una recarga
sorpresa en medio de una venta sería peor), así que ahora **avisa** y deja
actualizar en un toque.

## Cómo detecta

- Al cargar la pestaña, cada 5 minutos con la pestaña visible, y al volver a la
  pestaña o a la conexión (`src/hooks/useVersionNueva.js`).
- Compara el bundle que cargó esta pestaña (`script[type=module]` →
  `/assets/index-<hash>.js`) contra el que declara el `index.html` en vivo,
  pedido **sin caché** (`src/lib/actualizacion.js`). En dev no hay bundle
  hasheado y no se avisa.
- Si cambió, aparece el aviso «Hay una versión nueva — Recargar»
  (`src/components/app/AvisoVersion.jsx`); «Después» lo oculta en esa pestaña.

## Cómo actualiza

- «Recargar» pide `SKIP_WAITING` al service worker nuevo si está esperando y
  recarga al tomar el control (`controllerchange`), o recarga directo si no hay
  SW. Una sola recarga por gesto.
- El `sw.js` sigue con **network-first** para navegaciones y con la caché de
  catálogo del POS: **el modo offline no cambia** (#131/#168). El aviso además
  queda por debajo del bloqueo de pantalla (z-60 vs z-70).

## Cómo probarlo

```bash
npm test                                   # funciones puras de detección
npx playwright test e2e/pwa-version.spec.js --project=core
npx playwright test e2e/pos-checkout.spec.js --project=seller --grep "sin conexión"
```

Prueba manual en producción: con la app abierta, esperar el próximo deploy (o
forzar el chequeo recargando la pestaña) y usar «Recargar»; el footer debe
mostrar la versión nueva.
