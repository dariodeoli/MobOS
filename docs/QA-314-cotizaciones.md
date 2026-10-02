# #314 · Cotizaciones — fixtures demo, modal y vista previa

Parte de la auditoría del demo v1.0.209 (02/10/2026): no había datos demo para
recorrer una cotización (detalle, aprobación ni portal público), el estado
vacío quedaba con encabezados sueltos y espacio muerto, y el modal tenía
«Consumidor final» ambiguo, controles sin etiquetas claras y una fila vacía con
Eliminar.

Los fixtures base se coordinan con PLT #324 (`src/lib/demo/cotizaciones.js`):
una cotización por etapa con Lucía y Carlos espejando la ficha. Este issue
agrega la capa de estado de la pestaña, el recorrido completo y el portal.

## Entregado

- **Fixtures en todas las etapas**: borrador, enviada, aceptada, rechazada,
  vencida y convertida; los tokens públicos coinciden con los de la ficha
  (`demo-cot-lucia`, `demo-cot-carlos`) y el borrador nunca se expone.
- **Recorrido punta a punta en demo** (`src/lib/demoCotizaciones.js` +
  `src/lib/demoCotizacionConversion.js`): crear, enviar, aceptar, cancelar y
  convertir en pedido; el pedido aparece en Mis pedidos y en la ficha del
  cliente con el vendedor de la sesión (alcance por vendedor respetado).
- **Portal público demo**: el enlace del fixture abre con `?demo=1`; la
  aprobación con código deja evidencia, convierte la cotización y la cronología
  local registra «Aprobada con código» y «Convertida en pedido».
- **Modal de nueva cotización**: etiquetas visibles (`FormField`), consumidor
  final como opción explícita (`aria-pressed`), fila inicial sin eliminar, error
  dentro del modal, confirmación al cerrar con cambios y una sola acción
  primaria. Vista previa del documento antes de guardar/enviar con el objeto
  `DocumentoImpresion`.
- **Estado vacío propio**: sin encabezados sueltos ni espacio muerto, con atajo
  a crear; las acciones por fila (Enlace/QR, Historial) también funcionan en
  demo.

Alcance: `src/lib/demo/cotizaciones.js` (token), `src/lib/demoCotizacion.js`,
`src/lib/demoCotizaciones.js`, `src/lib/demoCotizacionConversion.js`,
`src/pages/CotizacionPublica.jsx`, `src/components/shared/Cronologia.jsx`,
`src/components/shared/AprobacionPresupuesto.jsx`,
`src/components/ventas/SellerQuotes.jsx` y el re-export de `DocumentoImpresion`.

## Evidencia

| Captura | Qué muestra |
|---|---|
| `antes/demo-vacio.png` · `antes/modal-antes.png` · `antes/modal-antes-consumidor.png` | Antes: lista vacía con encabezados sueltos y modal sin etiquetas claras |
| `claro-01-lista.png` … `claro-09-historial.png` | Después (claro): fixtures por etapa, vacío, modal etiquetado, vista previa, conversión, pedido en Mis pedidos, enlace/QR, portal aprobado e historial |
| `oscuro-01-lista.png` … `oscuro-03-previa.png` | Después (oscuro): lista, modal y vista previa |
| `movil-01-lista.png` … `movil-04-portal.png` | Después (390×844): lista, modal, vista previa y portal con el bloque de aprobación |

Gate reproducible:

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-slot-clientes MOBOS_E2E_PGPORT=5587 \
  MOBOS_E2E_API_PORT=3187 MOBOS_E2E_WEB_PORT=5287 \
  MOBOS_E2E_FRONTEND=preview MOBOS_E2E_BACKEND=prod \
  npx playwright test e2e/qa-314-cotizaciones.spec.js
```

Capturas: `MOBOS_CAPTURAS=docs/QA-314-cotizaciones npx playwright test e2e/qa-314-cotizaciones.spec.js`.

## Checks de esta entrega

`npm run lint` 0 errores · `npm run build` ✓ ·
`npm --prefix backend run build` ✓ con `backend/.next/BUILD_ID`
(`hE7tfEsnvBVRJN0PvLOZY`) · `npm --prefix backend run prisma:validate` ✓ ·
`npm test` 944/944 · `npm --prefix backend run test:unit` 138/138 ·
`rg "<<<<<<<" src backend e2e` sin resultados · `npm run db:check` «la base
coincide con prisma/schema.prisma» · `npm run test:e2e:smoke` 19/19 ·
`e2e/qa-314-cotizaciones.spec.js` 4/4 (claro, oscuro y móvil) · specs del
dominio sin regresiones: 19/19 (`demo-fixtures`, `qa-240-portal-cotizaciones`,
`qa-260-cotizacion-cliente`, `qa-261-cotizacion-envio`, `public-quote-transfer`,
`qa-250-cotizacion-correo`, `documentos-no-fiscales`).
