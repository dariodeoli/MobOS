# Handoff — issue #342: REDESIGN v2 F2 Inicio + POS

Fecha: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Rama: `codex/mobos-nav-v2`. Checkpoint de entrada verificado: `a33817c2` (#341, commit local). Árbol limpio al comenzar.
Estado: parche frontend cohesivo **sin commit**. Sin fetch/rebase, main, push, PR, cierre de issue, integración, CI ni deploy. RDD apagado por instrucción; sin SDD, revisión nativa ni delegación recursiva.

## Alcance y decisiones

Referencia leída: `/Users/dariodeoli/Downloads/docs 2/redesign/REDESIGN.md`, §0/7.1/7.2; `prototype/index.html`, `escritorio-inicio.png` y `celular-vender.png`. Se conservó el shell aprobado de #341, incluidos sus cinco destinos, grupos Stock, permisos y geometría de navegación/cobro.

- Inicio: cuatro indicadores en una única tira neutra, separados por bordes, 2×2 móvil/4 columnas escritorio. Valores reales completos; tipografía 22 px móvil y 26 px escritorio. Sin tarjetas individuales, sombras, gradientes ni rótulos en mayúsculas. Un solo título de página, propiedad del shell.
- Conserva `armarResumenDia`, caché local y superposición de `metricasEjecutivas` exactamente como antes. No modifica precios del catálogo, datos demo, fórmulas ni backend. Ganancia mantiene su procedencia previa; no se inventó una nueva métrica de servidor.
- Acciones reales: impresión y período; saldos pendientes del resumen y stock bajo calculado del catálogo, con sus handlers existentes. Reservas/garantías/cuotas continúan dependiendo de los datos disponibles del handler previo. No se fabricaron pedidos por aprobar, repartos ni equipos por retirar del prototipo.
- `Métricas, evolución y stock` conserva métricas secundarias, costos/créditos, evolución, ranking/comisiones, inventario, ABC y detalles de procesadoras/cuentas/conciliación del servidor. El control nativo se abre con teclado. Detalle de ventas y reporte imprimible permanecen accesibles. Se retiraron cuatro accesos rápidos duplicados; sus destinos siguen en el shell. El acceso a pendientes aparece una vez, en el bloque accionable.
- POS: catálogo real a la izquierda; cliente/carrito/cobro a la derecha. En móvil el catálogo de dos columnas precede a la venta. Se eliminó el límite de altura del catálogo, sin reemplazar sus productos/familias por markup ficticio. Las tarjetas muestran nombres, variantes, precio y stock reales.
- `PosCustomer`, exportado desde PasoProductos, reutiliza el mismo `CheckoutCustomer` y los mismos setters de cliente/facturación/formulario. No hay lógica paralela. Selector de variantes, picker IMEI/seriales, autorizaciones, listas de precios, medios/cuentas, gift cards, crédito, entrega, offline, herramientas y atajos se conservan.
- Los paneles de venta/pago y sus resúmenes quedan planos. Las notas y el contexto secundario se despliegan mediante controles nativos; nada se borra. La fecha pasó al detalle secundario y la barra del módulo solo muestra acciones, evitando competencia con «Más»/«Suspender venta» en móvil.
- No se agregaron topes monetarios ni abreviaturas: total del carrito 24 px; total/pagado/pendiente del cobro 20 px, incluidos Gs 100.000.000. La barra fija y los importes de línea conservan las reglas de #341. CSS únicamente en las raíces F2; portal, landing, auth, backend, permisos y configuración no se tocaron.

## Archivos

Todos los paths relativos siguientes corresponden al worktree absoluto indicado arriba.

| Archivo                                         | Cambio                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `src/components/control/Resumen.jsx`            | Tira KPI, acciones derivadas de datos existentes, disclosure de detalles |
| `src/components/control/inicioPosF2.css`        | Presentación F2 acotada con tokens RGB existentes, sin CSS global        |
| `src/components/ventas/FormularioVenta.jsx`     | Columna cliente/venta, contexto desplegable, toolbar compacto            |
| `src/components/ventas/venta/PasoProductos.jsx` | Catálogo real plano y exportación del cliente existente                  |
| `src/components/ventas/venta/PasoCobro.jsx`     | Nota desplegable y retiro de instrucciones redundantes                   |
| `src/components/ventas/venta/ListaVenta.jsx`    | Vacío breve; guía de compartir alcanzable por disclosure                 |
| `src/lib/inicioPosF2.test.js`                   | Tres contratos de fuentes, preservación, controles y contexto            |
| `e2e/frontend/nav-v2.frontend.spec.js`          | Once casos F2; mantiene los 24 casos y guards de #341                    |
| `docs/HANDOFF-341-NAV.md`                       | Corrección limitada de estado: checkpoint local a33817c2                 |
| `docs/HANDOFF-342-INICIO-POS.md`                | Esta entrega y evidencia                                                 |

## Verificación

Normalización **antes de los checks finales**:

```sh
npx --no-install prettier --write src/components/control/inicioPosF2.css src/lib/inicioPosF2.test.js e2e/frontend/nav-v2.frontend.spec.js
node /tmp/mobos-f2-normalize.mjs
git diff --check
```

El script normaliza la nueva función `PosCustomer` con Prettier y elimina whitespace final en las cinco fuentes propias. Preserva formato legacy fuera del cambio: no se formateó masivamente FormularioVenta ni Resumen. Última normalización de CSS/spec registrada en `/tmp/mobos-redesign-f2-normalize.log`. Sin dependencias nuevas, cambios de manifiesto/lockfile ni archivos de entorno.

| Comando final                                                                                                                             | Resultado                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `npm run lint`                                                                                                                            | Exit 0; cero errores                        |
| `npm run build`                                                                                                                           | Exit 0; warning existente de chunks >500 kB |
| `npm test`                                                                                                                                | Exit 0; 971/971, cero fallos                |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js` | Exit 0; 18/18                               |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js`                                                                 | Exit 0; 35/35, cero reintentos              |
| `git diff --check`                                                                                                                        | Exit 0                                      |

Logs finales: `/tmp/mobos-redesign-f2-{lint,build,test,focused,playwright}.log`.

Servidor exclusivo de esta ejecución, puerto comprobado libre antes de iniciarlo; se detuvo únicamente su sesión al finalizar:

```sh
VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort
```

Sin PG/backend. Interceptores del harness bloquean red externa y `/api/`; las pruebas de contratos API de #341 siguen siendo interceptaciones explícitas, no persistencia real. Los importes de prueba reutilizan `seedDemoCart`/`guardarCarrito` y productos reales de la demo en contextos descartables; no se cambiaron los precios del catálogo ni se crearon registros productivos.

Prueba renderizada F2: 320/360/390/430/1440 px, claro y oscuro. KPI comparados con `armarResumenDia` sobre las fuentes demo existentes (incluye Gs 14.280.000), fuente local/servidor protegida por contrato Node, layout 2×2/4 columnas, fuente mínima y bounds del texto, controles desplegables por teclado, ausencia de overflow/sombras, cliente antes del carrito, catálogo izquierdo en escritorio, barra móvil sin superposición con navegación y acciones «Más»/«Suspender venta» sin superposición entre sí. POS normal de Gs 100.000.000 con Gs 50.000.000 pagado y Gs 50.000.000 pendiente: strings completos, una línea, sin elipsis ni reducción de la fuente especificada.

El caso de interacción elige una variante del catálogo real (no añade antes de elegir), selecciona la ficha demo existente María González, agrega un pago, edita una nota y abre las herramientas. No simula elegir un IMEI: si se ofrece ese modal se verifica que siga exigiendo decisión explícita. Los casos anteriores de envío/ID/tenant/offline se ejecutan sin modificaciones.

Se conserva la suite extrema de #341: 65 escenarios reales de carrito hasta Gs 99.000.000.000, con sus controles de valores completos. Esa evidencia de estrés no se presenta como rango comercial normal. **No se afirma UI KPI de 100 millones renderizada**: los KPI usan los datos demo existentes; la prueba de 100 millones es del POS.

Capturas reales fuera de Git: `/tmp/mobos-redesign-f2-qa/`, 30 capturas F2: `{320,360,390,430,1440}-Inicio{,-dark}.png`, `*-POS100m{,-dark}.png` y `*-POS100m-summary{,-dark}.png`. Evidencia principal: `390-Inicio.png`, `1440-Inicio.png`, `390-POS100m.png`, `1440-POS100m.png` y sus variantes oscuras. Las capturas completas pueden mostrar los elementos fijos a la altura del viewport inicial; no equivalen a un dispositivo físico.

### Prechecks y límites honestos

- Primera prueba Node nueva: 2/3; assertion con un nombre supuesto incorrecto del guard. Se corrigió para comprobar el `orderDetailPath` existente, sin cambiar el guard. Una primera prueba de navegador se canceló (exit 130) al detectar un selector de tema con nombre incorrecto; se corrigió al nombre real. Preflight F2: 11/11. Logs iniciales `/tmp/mobos-f2-{prelint,playwright-initial,playwright-preflight}.log`. Los resultados finales de la tabla corresponden a la ejecución posterior a normalización.
- Se preservó una discrepancia preexistente: la distribución `d.medios` demo totaliza Gs 14.280.000, frente a Cobrado Gs 14.180.000. No se cambiaron sus fórmulas para hacer coincidir un dibujo. Requiere análisis de datos separado.
- El detalle secundario conserva algunos estilos/estructuras legacy; esto no pretende rediseñar todos los gráficos, listas o la aplicación completa. Los avisos de costo/crédito conservan su contenido dentro del disclosure.
- No probado: backend/guard servidor, persistencia real, conciliación/sincronización exitosa, flujo de seriales con stock real, cambio real de tenant/sucursal, impresora o dispositivo físico, teclado iOS/safe-area, VoiceOver/NVDA, UI USD, CI, release y producción. No se afirma PASS para esas capas.
- Engram rechazó el guardado por múltiples sesiones runtime activas coincidentes. No se adivinó `session_id`, no se cerraron sesiones ajenas y no se reintentó el guardado ni se cambió el proyecto para forzarlo. El handoff conserva el contexto para el padre.

## Validación independiente y corrección acotada del conteo — 2026-10-11

### Evidencia independiente previa

El padre comunicó el resultado del verificador independiente: **Node enfocado 18/18 PASS y Playwright frontend 35/35 PASS** sobre F2, con un hallazgo acotado: el acceso de stock bajo usaba la lista de presentación truncada y por eso informaba como máximo ocho productos. Estos resultados se registran con esa procedencia; no se confunden con los checks del ejecutor ni con pruebas de servidor/producción.

### Corrección única

- `Resumen.jsx`: `lowStockProducts` contiene la colección completa con el mismo filtro `num(p.stock) <= UMBRAL_STOCK_BAJO` y el mismo orden de menor stock primero. `stockBajo` sigue siendo `lowStockProducts.slice(0, 8)`, exclusivamente para el widget y el reporte existentes. El acceso accionable y su estado vacío usan la longitud completa. No se modificaron umbral, catálogo, precios, permisos, navegación ni reglas de negocio.
- `inicioPosF2.test.js`: un caso adicional ejecuta la expresión real de selección del componente con 13 productos que cumplen el filtro y uno excluido; exige total 13, lista visible de ocho, orden conservado, catálogo sin mutaciones, caso vacío y conexión del rótulo/estado al conteo completo. Es una prueba Node de la colección/contrato de fuente, no una afirmación de datos productivos.
- Solo se tocaron los dos archivos anteriores y este handoff. El resto del parche F2 y el checkpoint #341 se preservaron. Sin delegación, revisión nativa, commit, push ni deploy.

Normalización previa a todos los checks de corrección: Prettier sobre **solo la expresión de colección editada** mediante `prettier.format(..., { parser: 'babel', singleQuote: true, semi: false, printWidth: 100, trailingComma: 'all', arrowParens: 'avoid' })`; `npx --no-install prettier --write src/lib/inicioPosF2.test.js`; `git diff --check` exit 0. No se formateó Resumen completo.

| Comando posterior a la corrección                                                                                                         | Resultado exacto                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `npm run lint`                                                                                                                            | Exit 0; cero errores                              |
| `npm test`                                                                                                                                | Exit 0; **972/972**, cero fallos                  |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js` | Exit 0; **19/19** (18 anteriores + un caso nuevo) |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js`                                                                 | Exit 0; **35/35**, cero reintentos, **1,4 min**   |
| `git diff --check`                                                                                                                        | Exit 0                                            |

Logs propios: `/tmp/mobos-redesign-f2-stock-{lint,test,focused,playwright}.log`. Se comprobó libre 5291, se inició Vite exclusivo con el mismo comando frontend del apartado anterior y se detuvo únicamente su sesión al terminar. No se ejecutó otro build ni se atribuye el build previo a esta corrección. El harness conserva sus 35 casos, bloqueo de red/backend y contextos demo descartables.

Rollback solo de esta corrección: reunir de nuevo el filtro/orden/slice en `stockBajo`, devolver el rótulo y el estado vacío a esa longitud, retirar exclusivamente el caso nuevo y esta sección. No restaurar archivos completos ni retirar la implementación F2 o cambios ajenos. Engram volvió a rechazar el guardado por sesiones runtime ambiguas; sin elección de sesión, cambios de proyecto ni reintento.

**Novedad para el dueño:** el acceso de stock bajo informa todos los productos que requieren atención; el detalle sigue mostrando los ocho más urgentes.

## Rollback y siguiente responsable

Unidad no commiteada sobre `a33817c2`: quitar exclusivamente los archivos nuevos de F2 y revertir **solo sus hunks** en los archivos existentes enumerados. No usar reset ni restauraciones completas si otra persona añade cambios. Restaurar ubicación original de CheckoutCustomer, altura previa del catálogo, KPI/cards y contexto anterior del POS; mantener íntegro el checkpoint de navegación #341. No hay datos productivos, dependencias ni migraciones que revertir.

El padre conserva la decisión separada de spot-check y checkpoint local; no se creó ningún commit en esta ejecución. Integración, backend real, CI y release quedan fuera de esta entrega. `skill_resolution: paths-injected`: se leyeron los cuatro paths exactos solicitados (work-unit-commits, design-system, accessibility-review, testing-strategy), AGENTS.md y handoff #341; registro ausente, sin estándares inventados.

## Novedades para el dueño

- Inicio presenta vendido, cobrado, saldo y ganancia en una tira clara, con cifras completas.
- Las métricas y gráficos siguen disponibles al desplegar el detalle, sin saturar la portada.
- Vender separa mejor catálogo y venta; conserva productos, variantes, clientes y cobros existentes.
- Gs 100 millones, lo pagado y el saldo se leen completos en celular y escritorio, también en oscuro.
- Es una entrega local verificada; no está publicada y no creó ventas en una tienda real.
