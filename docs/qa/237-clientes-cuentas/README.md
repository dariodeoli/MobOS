# Fuente combinada POS237 — clientes demo, foco y cuentas

Base exacta main236 `43204589a410c959cc6033c7503716a714e042bd`.
Rama `codex/pos-237-clientes-cuentas`, worktree propio. No version bump, PR, merge ni deploy. Espera revisión de root antes de PR.

## Composición

Sólo commits exclusivos de las tres ramas, preservadas intactas:

| Unidad | Draft original | HEAD original |
|---|---|---|
| Cliente demo contextual #350 | #636 | 1e192adc |
| Foco al cerrar cliente #499 | #635 | 2b1b4c0c |
| Cabecera de cuentas #632 | #633 | 36c2f264 |

Cherry-picks de siete commits sobre 432, sin conflictos de negocio. No incluye #370 ni nueva unidad #390. Mantiene las validaciones fiscales y Modal canónicos ya presentes en 236.

Al combinar #350 y #499, confirmar una ficha demo nueva ahora crea su id: el foco vuelve al botón Editar de la tarjeta guardada. Se adapta únicamente esa expectativa del test de foco, conservando Escape/cancelar al summary de contacto cuando no hay ficha creada. No se modifica el producto para acomodar la prueba.

## Verificación reproducible

- Demo/POS/checkout: `MOBOS_QA_PORT=5396 npx playwright test --config e2e/pos237-demo.frontend.config.js`.
- Foco/nested: `MOBOS_QA_PORT=5397 npx playwright test --config e2e/focus499.frontend.config.js`.
- Cuentas/docscroll/layout: `MOBOS_QA_PORT=5398 npx playwright test --config e2e/pos237-cuentas.frontend.config.js`.
- Fiscal: `e2e/qa-344-fiscal-pos.spec.js` con PG/backend/frontend propios, contratos HTTP simulados. Sin proveedor fiscal ni clientes reales.
- Builds FE/BE, tests FE/BE, lint, Prisma y dbcheck PG fresco: gates de esta fuente, no inferidos de las ramas individuales.

Los cuatro baselines conocidos de pos-layout se conservan sin editar: catálogo12/8, teléfono74.5, y inicial132/163, miniatura48/64. No afectan cuentas ni docscroll; no afirmar suite completa verde. Evidencia histórica en `docs/qa/632-cuentas/README.md`.

Capturas combinadas en `outputs/mobos-pos237-review/` de coordinación (demo y cuentas). Todas las APIs de los harness frontend se interceptan; cero writes de negocio reales, sin OwnData. Telemetría también interceptada. Las corridas PG usan datos sintéticos y clusters propios.

## Novedades para el dueño

- Guardar un cliente demo lo crea y selecciona, con ficha, direcciones y cartera coherentes durante esa demo.
- Cerrar la ficha devuelve el teclado al control correspondiente, también después de crearla.
- Las cuentas muestran nombre, tipo, moneda y estado sin pisarse y con acciones de 44 px.

#350, #499 y #632 permanecen abiertos: demo completa y lector físico tienen pendientes propios; nada publicado por esta fuente.

## Resultados de la fuente combinada

- Foco: 8 PASS (14.1s), después de adaptar la expectativa de la tarjeta nueva guardada.
- Fiscal: 5 PASS (21.1s), al primer intento, PG propio detenido al terminar.
- Cuentas/docscroll/layout: 39 PASS / 4 FAIL baseline exactos, de 43 casos. Los 8 de cuentas y 10 de cobro pasan, incluidos los 2 de documento desplazable.
- FE 1602 PASS; BE 347 PASS + 1 skip. Lint 0 errores / 1 warning previo DeliveryOperations. Builds FE/BE PASS, backend BUILD_ID `I-iuVJVrQHODgd86ryIMW`. Prisma y dbcheck PG fresco PASS, cluster detenido y eliminado.
- En dos intentos iniciales demo/POS hubo 25 PASS y un timeout antes de llegar al POS (entrada de shell/demo con ventana de5s); se conserva esa evidencia en los logs. El config combinado espera estados hasta15s, sin sleeps ni retries, y se vuelve a ejecutar sin builds ni otros Vite concurrentes. No se cambió código del producto por esos timeouts.

- Reejecución final demo/POS/checkout: **26 PASS (33.2s)**. Evidencia completa en `/tmp/mobos-pos237-demo-complete.log`; logs iniciales preservados por separado.
