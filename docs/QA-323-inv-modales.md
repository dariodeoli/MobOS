# QA #323 — Modal/drawer estándar en INV

Adopción del estándar de `docs/MODALES.md` §3 en los cinco puntos de inventario
y abastecimiento que quedaban pendientes: etiquetas visibles, error junto al
campo, cierre con cambios y resultados canónicos.

## Qué se hizo

| Modal | Ruta | Cambios |
| --- | --- | --- |
| Carga rápida de unidad («recibir unidad») | `src/components/control/Inventario.jsx` | `size="formulario"` explícito y `dirty` (solo con datos que el operador cargó); labels visibles en Sucursal, Ubicación, Condición, Batería e Importe; el error de la carga pasó del `Aviso` general —que quedaba **detrás del overlay**— a `FormField error` junto al IMEI; el pie se monta con `SaveActions` dentro del diálogo |
| Recibir mercadería | `src/components/control/Compras.jsx` | `dirty` comparando las cantidades con el pendiente precargado; error de cantidad junto a cada línea con `FormField`; pie con `SaveActions`; la demo (sin campos) cierra sin confirmación |
| Incidencia de recepción | `src/components/supply/Recepcion.jsx` | `dirty` si la nota cambió; nota con `FormField error`; el resultado usa `useResultado.guardado` y el fallo `avisar.fallo('guardar')` |
| Lista de compra | `src/components/supply/ListaCompraModal.jsx` | impresión con `useResultado` (impreso/fallo) |
| Etiquetas de preparación | `src/components/supply/EtiquetasPreparacion.jsx` | impresión con `useResultado` (impreso/fallo) |

Los nombres accesibles de IMEI/Importe se mantienen (`IMEI o serial`,
`Monto del costo`) para no romper las specs históricas; las etiquetas visibles
nuevas conviven con ellos.

## Verificación

Spec: `e2e/qa-323-inv-modales.spec.js` (proyecto `core`, demo anónimo del
Dueño). Capturas: `docs/qa/323-inv-modales/`.

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama> MOBOS_E2E_PGPORT=<55xx> \
MOBOS_E2E_API_PORT=<31xx> MOBOS_E2E_WEB_PORT=<52xx> \
npx playwright test e2e/qa-323-inv-modales.spec.js --project=core
```

| Test | Qué afirma |
| --- | --- |
| recibir unidad: etiquetas visibles, error adentro y cierre con cambios | labels visibles de los cinco campos; guardar sin IMEI muestra el error **dentro** del diálogo; cerrar con datos pide «Descartar los cambios»; en 390 el pie queda visible |
| recibir mercadería usa el pie estándar y no marca cambios en la demo | el diálogo del demo tiene un solo primario (`Recibir todo`), cancelar y cierra sin confirmación de descarte |

Guardas de fuente en `src/lib/modalReglas.test.js` (bloque INV): tamaño
explícito, `dirty`, `FormField label` de los cinco campos, error junto al campo
del alta, `SaveActions` en Inventario/Compras, `FormField`+`dirty` en la
incidencia y `useResultado` en los dos modales de impresión.

Las specs que usan el alta de unidad corrieron sin regresiones por este cambio:
`inventario-unidades`, `demo-imei-conciliacion`, `ops`, `admin`,
`qa-256-composicion` y `qa-305-inventario-escritorio`. La spec de
`qa-250-buscador-dependiente` para Compras se adaptó al alta en drawer (#307) y
quedó en verde. `qa-325-roles-movil` sigue con fallos de targets < 44 ajenos a
esta adopción (Gift cards del POS y «Cargar más productos»), ya presentes en
`origin/main`.
