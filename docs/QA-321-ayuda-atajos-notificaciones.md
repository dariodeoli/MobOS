# QA-321 — Ayuda por tareas, atajos y notificaciones demo

Origen: auditoría del demo v1.0.209 (issue #321).

## Qué cambió

| Hallazgo | Antes | Ahora |
|---|---|---|
| La Ayuda es enorme y por módulos, no por tareas; parte del contenido no coincide con las pantallas | Índice de 50+ entradas por módulo (con búsqueda) y sin punto de entrada por tarea | Arriba abre **«Empezá por acá»**: 5 tareas frecuentes (venta, recibir unidad, cerrar caja, traslado, consultar IMEI) con pasos y enlace directo a la pantalla; el índice por módulos sigue abajo, buscable. Se corrigieron entradas desactualizadas (bloqueo/PIN, preferencias/notificaciones, listas de precios) |
| El modal de atajos repite explicaciones y muestra «Candado»/«Chip» como si fueran teclas | `<kbd>Candado</kbd>` y `<kbd>Chip</kbd>` dentro de la lista de teclas; la nota «los atajos no funcionan…» aparecía en el modal **y** en el cheat-sheet | Las teclas reales van en `kbd`; los controles de la barra van en una sección **«Controles de la barra»** con ícono y nombre (sin tecla falsa). La nota queda una sola vez (en el cheat-sheet) |
| Notificaciones en demo sin ejemplos para evaluar | La demo no carga novedades (no toca el API) y la bandeja queda vacía | La demo sirve **4 ejemplos ficticios** (pedido sin cobrar, descuento a aprobar, orden de taller, equipo apartado que llegó), cada uno con sello **«Ejemplo»**; la bandeja aclara que no se guarda nada y cada ejemplo abre su pantalla |

## Archivos

- `src/components/app/CheatSheetAtajos.jsx` — teclas reales + controles + una sola nota.
- `src/pages/PanelVendedor.jsx` — el diálogo «?» ya no repite la nota.
- `src/components/control/Documentacion.jsx` — tareas frecuentes + entradas corregidas.
- `src/hooks/useNotificaciones.js` — `ejemplosDemo()` y modo demo sin API.
- `src/components/app/AppShell.jsx` y `PanelNotificaciones.jsx` — la demo recibe los ejemplos y los marca.
- `e2e/qa-321-ayuda.spec.js` — gate y capturas.

## Evidencia

- Capturas: `docs/qa/321-ayuda-atajos/`
  (`ayuda-tareas-desktop.png`, `ayuda-tareas-mobile.png`, `atajos-desktop.png`,
  `notificaciones-demo-desktop.png`, `-oscuro.png`, `-mobile-oscuro.png`).

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  npx playwright test e2e/qa-321-ayuda.spec.js --project=admin
```

Resultado: **3/3 en verde** (tareas + enlace, atajos sin teclas falsas,
demo con ejemplos). Los specs de Ayuda/notificaciones existentes siguen
verdes (`documentacion`, `notificaciones`, `ia-configuracion`: 15/15 en la
corrida conjunta).

## Verificaciones de entrega

- `npm run lint` → 0 errores.
- `npm run build` + `npm --prefix backend run build` → exit 0 con `BUILD_ID`.
- `npm --prefix backend run prisma:validate` → OK.
- `npm test` → 869 pass · 0 fail.
- `npm --prefix backend run test:unit` → 138 pass · 0 fail.
- `node scripts/e2e-shards.mjs --check` → shards balanceados.
