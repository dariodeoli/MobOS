# QA #302 — Demo de INV: Delivery, rutas «Página no encontrada» y Abastecimiento

Auditoría del demo v1.0.209: Delivery quedaba vacío, «Compras del Centro» y
«Preparar lote» titulaban «Página no encontrada» aunque la pantalla existía, y
las pantallas de Abastecimiento eran placeholders mudos.

## Qué cambió

- **Títulos**: `/compras-centro` y `/preparar-lote` entraron a
  `src/lib/metadataPolicy.js`; ahora titulan «Compras del Centro» y «Preparar
  lote» en vez de caer al aviso de página inexistente.
- **Contenido demo**: los fixtures de #324 (PLT) llegaron al demo y cubren
  Delivery y las seis pantallas de Abastecimiento con una sola fuente
  (`src/lib/demo/delivery.js` y `src/lib/demo/abastecimiento.js`). La ronda INV
  verificó que cada ruta abre con contenido y no con un estado mudo.
- **Criterio de la auditoría**: ninguna ruta visible queda vacía ni muestra un
  error de página; todas tienen título correcto, `h1` y datos ficticios.

## Verificación

Spec: `e2e/qa-302-demo-inv.spec.js` (proyecto `core`, demo anónimo del Dueño).
Capturas: `docs/qa/302-demo-inv/` (7 rutas en 1280 + Delivery en 390).

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama> MOBOS_E2E_PGPORT=<55xx> \
MOBOS_E2E_API_PORT=<31xx> MOBOS_E2E_WEB_PORT=<52xx> \
npx playwright test e2e/qa-302-demo-inv.spec.js --project=core
```

| Test | Qué afirma |
|---|---|
| ninguna ruta de INV queda vacía ni con título de página inexistente | las 7 rutas titulan `«Módulo» · MobOS`, muestran `h1` y su contenido; sin «Página no encontrada» |
| Delivery y Abastecimiento abren con los fixtures del demo (#324) | Delivery lista el reparto AUR-0005 con Juan Pereira y saldo; las pantallas de Abastecimiento comparten CMP-AUR-0001, LOTE-AUR-0001, la recepción abierta y las métricas |

Unidad: `src/lib/metadataPolicy.test.js` cubre las seis rutas de Abastecimiento
(regresión exacta de «Compras del Centro» y «Preparar lote»).
