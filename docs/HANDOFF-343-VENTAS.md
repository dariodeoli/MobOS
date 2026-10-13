# Handoff — issue #343: REDESIGN v2 F3 acotada a Pedidos y Cotizaciones

Fecha: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Rama: `codex/mobos-nav-v2`. Checkpoint de entrada: **`2f3be6a4`**, F2 local; árbol limpio verificado antes de editar.
Estado actualizado: **PASS de la reparación acotada de foco — implementación frontend local, sin commit; verificación final 48/48 y repetición dirigida 1/1 aprobadas**. El estado anterior PARTIAL y su fallo 47/48 se conservan como evidencia histórica abajo. **F3 completa no está terminada:** Entregas, Taller y Clientes no se rediseñaron. Sin fetch/rebase, commit, push, merge, PR, cierre de issue, backend/PG, CI, publicación ni deploy. RDD apagado; sin SDD, revisión nativa, delegación ni acceso a secretos/registros productivos.

## Fuente y mapa real

Se leyeron las fuentes originales, no copias supuestas: `/Users/dariodeoli/Downloads/docs 2/redesign/REDESIGN.md`, §0 (precedencia sobre versiones anteriores), §7.3 y §7.4; `/Users/dariodeoli/Downloads/docs 2/redesign/prototype/index.html`, especialmente la vista `ventas`. Las rutas sugeridas en el documento se mapearon al código real:

| Referencia                                     | Fuente real / decisión                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §0 menú de cinco entradas y pestañas de Ventas | Shell y contexto de #341 conservados sin editar. Continúan Pedidos, Cotizaciones, Entregas, Taller y Clientes según catálogo/rol. Se mantiene el nombre Finanzas aprobado en #341.                                                                                         |
| §7.3 `/pedidos`                                | `src/components/ventas/SellerOrders.jsx`: listado, filtros, búsqueda, orden y vista rápida existentes.                                                                                                                                                                     |
| §7.3 `/pedidos/:orderId`                       | `src/components/ventas/PedidoDetalle.jsx`: detalle exclusivo por ID interno existente; no se sustituyó por un nuevo sheet sobre la lista. Mantiene contexto de URL y salida al POS.                                                                                        |
| §7.4 `/cotizaciones`                           | `src/components/ventas/SellerQuotes.jsx`: listado y diálogos existentes de crear, enlace/QR, correo, historial y vista previa.                                                                                                                                             |
| Superficies compartidas                        | `SellerSection`, `BarraModulo`, `SearchField`, `Select`, `Button`, `ResumenMetricas`, `MenuDesplegable`, `Drawer`, `Modal`, `SeccionColapsable`, `Avatar`, formatos de moneda y documentos existentes. No se reemplazó la biblioteca ni se crearon controles equivalentes. |

Reglas locales leídas: `AGENTS.md`, handoffs #341/#342, `docs/TABLAS.md` y `docs/CAMPOS.md`. La presentación §0 reemplaza los rótulos sostenidos en mayúsculas, cajas tintadas y tabla comprimida de la regla anterior de tablas; se conserva la grilla compartida entre cabecera/fila y el contrato de datos. No se inventó un registro de skills ausente.

## Decisiones de presentación

- Pedidos: panel único plano, filas separadas por líneas, nombres completos y descripciones de modelos legibles. Fecha junto al código; cliente y artículos en la misma celda de identidad; importe con ancho por contenido, sin elipsis. Serial/IMEI y cantidad salen de columnas principales, pero siguen en vista rápida y detalle; ordenar por cantidad/artículos sigue disponible.
- Cinco filtros principales: Activos, Con saldo, A crédito, Archivados y Todos. Pendientes/Parciales y las nueve claves de orden permanecen en «Más filtros y orden», accesible por teclado. Se conservan las claves originales de API y `useUrlState`, no hay un filtro ficticio de aprobaciones ni cifras inventadas.
- El resumen reutiliza el componente y los cálculos existentes; informa **En pantalla**, no un total global de tienda. Sin reemplazarlo por métricas del prototipo. No se corrigieron fórmulas ni discrepancias demo.
- Cotizaciones: seis chips principales, Borrador dentro de Abiertas y también alcanzable por selector secundario; Vencidas/Canceladas disponibles en ese mismo selector. Búsqueda demo incluye ahora descripciones reales de artículos además del número/cliente, acorde con el campo visible; consulta/paginación API intactas.
- Una acción de avance por fila: Borrador → Enviar; Enviada → Enlace/QR; Aceptada → Convertir. Aceptar manualmente sigue accesible en «Más» para Enviada; no se eliminó el handler. Enlace/QR mantiene el flujo real de preparación y copia, en lugar de simular una copia sin token listo. Correo, historial y cancelar conservan handlers y sus condiciones. Cotizaciones vencidas, cerradas o con pedido asociado no ofrecen avances/cancelación redundantes.
- `quoteActions` es una proyección pura de visibilidad, no un motor nuevo. No cambia endpoint, reglas de autorización, aprobación con código, estado, entrega, cobro, cancelación, impresión, PDF ni compartición. El pedido ya asociado conserva su etiqueta humana existente.
- Detalle: total/pagado/saldo antes de los controles, con fuentes originales; secciones plegables planas, títulos sin mayúsculas sostenidas y modelos/nombres completos. Paso de entrega conserva estados y grafo originales; saldo pendiente prioriza Cobrar sobre Avisar. No se añadió un botón que simule entregar/aprobar en demo. Notas, cliente, pagos, autorizaciones, documentos, cronología y handlers existentes permanecen.
- Tarjetas en ancho menor a 1200 px; tabla de escritorio a 1440. Texto y cantidades grandes redistribuyen el layout: no hay topes monetarios, abreviaturas ni scroll horizontal para operar desde el celular. CSS de F3 marcado explícitamente; no hay overrides de otras páginas, del shell, del portal o de la landing.
- Badges negativos sin relleno rojo lavado/rosa, tokens semánticos existentes, foco visible y botones compartidos. No se afirma una auditoría completa WCAG o de lectores de pantalla.

## Archivos de esta unidad

Todos los paths siguientes son relativos al worktree absoluto indicado arriba.

| Archivo                                   | Cambio                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ventas/SellerOrders.jsx`  | Listado plano, filtros jerárquicos, orden conservado, nombres/importes completos y vista rápida.                                   |
| `src/components/ventas/SellerQuotes.jsx`  | Tabla/tarjetas y acciones por estado, menú real, filtros y búsqueda de artículos demo; diálogos existentes.                        |
| `src/components/ventas/PedidoDetalle.jsx` | Totales, identidad y secciones planas; controles operativos conservados.                                                           |
| `src/components/ventas/ventasF3.css`      | Estilos exclusivos F3 con tokens existentes y layouts adaptables.                                                                  |
| `src/lib/ventasF3.js`                     | Visibilidad pura de acciones de cotización.                                                                                        |
| `src/lib/ventasF3.test.js`                | Cuatro tests de estados/acciones y contratos de fuentes/guards/paginación.                                                         |
| `e2e/frontend/nav-v2.frontend.spec.js`    | Trece casos F3 añadidos; los 35 anteriores permanecen **byte por byte**, comprobado contra HEAD.                                   |
| `docs/HANDOFF-342-INICIO-POS.md`          | Solo metadato inicial: el padre creó posteriormente el checkpoint F2 local `2f3be6a4`. Toda evidencia histórica permanece intacta. |
| `docs/HANDOFF-343-VENTAS.md`              | Este handoff.                                                                                                                      |

No se modificaron los catálogos de navegación, permisos, sesión/auth/tenant, guards de envío/ID/offline, fórmulas de negocio, seeds, datos demo canónicos, API/backend, manifiestos/lockfile, variables de entorno ni documentos previos de #341.

## Verificación anterior a la reparación de foco (evidencia histórica)

Normalización limitada a la función de fila/JSX del listado reescritos, estilos/helpers/tests propios y whitespace de fuentes tocadas. Se conservó el formato legacy de las funciones de negocio y del formulario de cotización no reescritos. Scripts temporales fuera de Git: `/tmp/mobos-f3-normalize.mjs`; Prettier sobre CSS/helper/tests/spec. Las dos correcciones finales de copy neutral no alteran formato ni lógica. No se reformatearon archivos ajenos.

| Comando posterior a normalización/copy neutral                                                                                                                     | Resultado observado                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                                                     | Exit 0; cero errores.                                                                                               |
| `npm run build`                                                                                                                                                    | Exit 0; warning existente de chunks >500 kB.                                                                        |
| `npm test`                                                                                                                                                         | Exit 0; **976/976**, 0 fallos (972 anteriores + cuatro nuevos).                                                     |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js` | Exit 0; **23/23** (19 anteriores + cuatro nuevos).                                                                  |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js`                                                                                          | Exit **1**; **47/48**, cero reintentos, **1,6 min**. Falló el retorno de foco al botón «Más» tras cerrar Historial. |
| `git diff --check`                                                                                                                                                 | Exit 0.                                                                                                             |

Logs de normalización: `/tmp/mobos-redesign-f3-normalize{,-final,-last}.log`.

### Fallo final y consecuencia

**Fallo principal:** `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js`, exit 1: `F3 quote primary and secondary handlers, keyboard menu and dialogs remain reachable`, assertion `await expect(more).toBeFocused()` al cerrar el modal Historial (spec línea 1067). Las otras **47 pruebas aprobaron**, incluidos los 35 casos previos y los seis escenarios aislados de importes grandes.

**Consecuencia:** la verificación frontend completa **no pasó**. Se entrega estado **partial**, no PASS general. La misma assertion aprobó en una pasada completa anterior (48/48, 1,6 min); no prueba estabilidad y no reemplaza el resultado final. No se eliminó, debilitó ni reintentó ciegamente el caso para ocultar el problema. La causa de la variación del foco requiere análisis; no se afirma un diagnóstico demostrado del componente compartido.

Se preserva el test fallido y toda la implementación para el padre. Pendiente específico: hacer determinista el retorno de foco desde Historial al disparador de acciones de su fila, de forma acotada a F3, y repetir los checks completos. No se modificaron diálogos compartidos ni páginas ajenas para forzar verde. No hay bloqueo secundario de gobierno, ni native review/SDD/attempts.

### Cobertura y límites

- Harness frontend independiente, sin PG ni servidor de aplicación real. Red externa abortada y `/api/` interceptado; los casos API-mode anteriores continúan siendo contratos ficticios explícitos, no prueba de persistencia/auth de servidor.
- Casos F3: 320/390/1440 px, claro/oscuro; lectura de pedidos/cotizaciones comparada con fuentes demo reales; filtros de saldo/pago/estado, búsqueda de cliente/modelo, orden, vacío, navegación contextual, URL de detalle y regreso conservando filtro. Panel rápido con Enter/Escape/restauración de foco; modal de creación; comprobante y controles PDF/impresión sin ejecutar impresión; menú ArrowDown/Escape; historial, enlace y vista previa; envío/aceptación/conversión/cancelación local demo con handlers reales.
- Cifras aisladas: override temporal de **filas demo existentes** en cada contexto de navegador descartable (`updateVenta`/`actualizarDemoCotizacion`), no cambio de seeds, catálogo, precio real o fórmula. Gs 100.000.000 y pagado/saldo Gs 50.000.000 en lista, vista rápida, detalle y cotización; bounds de texto y ancestros, una línea, sin elipsis ni overflow; recorte de totales visibles. Se cierra solamente el aviso transitorio causado por el override de prueba antes de capturar.
- Los 65 escenarios de estrés POS y guards de contexto/ID/offline de #341, más F2, se conservan sin reemplazarlos por mocks nuevos ni reducir la suite.
- Preflight inicial cancelado (exit 130) tras detectar dos supuestos incorrectos del test: formato esperado «Gs.» frente al `gs` real «Gs», y selector PDF ambiguo que encontraba Compartir/Descargar. Se corrigieron las assertions, no el formato de dinero ni los botones compartidos. Preflight posterior 13/13 en 14,2 s y otra pasada 13/13 en 15,0 s; esas evidencias no sustituyen la última corrida completa. Logs iniciales `/tmp/mobos-redesign-f3-browser-preflight{,2}.log` y `/tmp/mobos-redesign-f3-browser-final-preflight.log`.
- Discrepancia de demo preservada: la cotización convertida canónica de Carlos indica `MOB-0001`/`demo-p-1`, mientras Pedidos usa `AUR-*`/`demo-venta-*`. Se mantuvo la etiqueta anterior, sin inventar un vínculo a un pedido inexistente ni «reparar» los registros fuera del alcance.
- No verificado: transiciones/API/guard servidor reales, persistencia, tenant/sucursal reales, OTP/endpoints/entrega/cancelación en servidor, datos económicos, USD renderizado, dispositivo físico, impresora real, safe-area/teclado iOS, lectores de pantalla, CI/deploy/producción. Los tests locales de print-agent no equivalen a impresión física.
- Engram rechazó decisiones y descubrimientos por sesiones runtime ambiguas. No se adivinó ID, cambiaron proyectos ni cerraron sesiones ajenas; se conserva aquí el contexto.

### Evidencia fuera de Git

Capturas en `/tmp/mobos-redesign-f3-qa/`: 36 PNG, combinaciones de `{320,390,1440}` × claro/oscuro de `Pedidos`, `PedidoDetalle`, `Cotizaciones`, `Pedido100m`, `Pedido100m-totals` y `Cotizacion100m`. Se inspeccionaron visualmente listado desktop/mobile y recortes de importes. Captura full-page conserva barras fijas a la altura del viewport inicial; no es evidencia de safe-area/dispositivo físico.

Logs finales: `/tmp/mobos-redesign-f3-{lint,build,test,focused,playwright}.log`; resultados auxiliares Playwright en `/tmp/mobos-nav-v2-qa/results/`, según configuración existente que no fue modificada.

Vite propio: puerto 5291 comprobado libre antes de iniciar; sesión propia iniciada con `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`. Valor de proceso local, sin archivo `.env`. Al terminar se detuvo únicamente la sesión Vite propia mediante Ctrl+C; nunca se mató un proceso por puerto.

## Reparación final acotada de foco — 2026-10-11

### Diagnóstico y cambio

Se reprodujo antes de editar el fallo exacto: `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js --grep 'F3 quote primary and secondary handlers'`, exit **1**, **0/1**; assertion original de la línea 1067 `await expect(more).toBeFocused()` tras Escape en Historial. Log: `/tmp/mobos-f3-focus-fix/baseline.log`. No se sustituyó la evidencia histórica 47/48 por una pasada anterior favorable.

Causa: `MenuDesplegable` cierra su menú y programa el retorno al disparador mediante `requestAnimationFrame` antes de llamar al handler. El mismo click abre Historial: al desmontarse el item enfocado, `useDialogFocusTrap` puede capturar el foco del documento en vez del botón persistente. El retorno diferido del menú compite con la trampa del modal y no corrige el objetivo ya capturado. Ambos componentes compartidos se inspeccionaron **solo para diagnóstico**, sin editar fuentes, dependencias ni distribución.

Corrección exclusiva de `SellerQuotes.jsx`: `onClickCapture` en el contenedor de acciones de la fila enfoca sincrónicamente su propio `button[aria-haspopup="menu"]` cuando el objetivo pertenece a un `menuitem`. Ocurre antes del cierre del menú y de los handlers existentes; el modal captura así el disparador persistente. No cambia transiciones, handlers de negocio, datos, UI ni compartición. Sin temporizadores nuevos, reescritura compartida ni ampliación del alcance.

En el **mismo caso F3** del spec se conserva intacta la assertion fallida y se añade reapertura por ArrowDown/Enter, cierre con el botón Cerrar y otra assertion de retorno a Más. Durante la preparación del nuevo recorrido, un preflight falló porque se pulsó la segunda flecha antes del foco inicial programado por el menú; se añadió la comprobación de foco del primer item antes de navegar, sin sleeps, tiempos ampliados, reintentos ni debilitamiento. Logs: `/tmp/mobos-f3-focus-fix/fix-preflight.log` (fallo de preparación del nuevo recorrido) y `fix-preflight-final.log` (**1/1**, exit 0, 1,6 s). Todos los checks obligatorios finales siguientes aprobaron; no hubo correcciones ajenas ni bucle de reparación.

### Verificación final de esta reparación

Normalización **antes** de verificar: Prettier limitado al nuevo tag JSX y al caso F3 editado; se evitó su expansión a ancestros/funciones legacy. Tras la última normalización no se cambiaron fuentes/tests. El handoff se actualizó al recibir los resultados y se comprobó estructuralmente.

| Comando | Resultado exacto observado |
| --- | --- |
| `npm run lint` | Exit **0**, cero errores. |
| `npm run build` | Exit **0**, 3,48 s; warning existente de chunks >500 kB. |
| `npm test` | Exit **0**, **976/976**, 0 fallos/cancelados/omitidos, 16.329,963875 ms. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js` | Exit **0**, **23/23**, 0 fallos/cancelados/omitidos, 946,731917 ms. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit **0**, **48/48**, 1,5 min; workers 1, retries 0. Caso de foco 1,2 s. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js --grep 'F3 quote primary and secondary handlers'` — una repetición dirigida después de la suite completa | Exit **0**, **1/1**, 1,5 s; caso de foco 1,3 s, retries 0. |
| `git diff --check` | Exit **0**. |

Logs de esta reparación: `/tmp/mobos-f3-focus-fix/{lint,build,test,focused,playwright,playwright-repeat}.log`. Snapshots de entrada y hashes también fuera de Git en ese directorio. Se comprobó que los 35 tests F1/F2 conservan los bytes de HEAD `2f3be6a4`, que los demás bloques F3 no cambiaron y que el fallo original sigue comprobándose. Handoff #342, SellerOrders, PedidoDetalle, ventasF3.css, ventasF3.js y ventasF3.test.js son idénticos por SHA-256 a la entrada de esta reparación.

Solo se editaron `src/components/ventas/SellerQuotes.jsx`, el caso F3 de `e2e/frontend/nav-v2.frontend.spec.js` y este handoff. Un único escritor; sin delegación, SDD, revisión nativa, instalación, commit, push, fetch/rebase, backend ni deploy. `skill_resolution: paths-injected`: se leyeron los paths exactos suministrados de debug, accessibility-review y testing-strategy; registro ausente, sin estándares adicionales inventados. Copy existente en español conservado; comentarios nuevos técnicos en inglés.

Puerto 5291 verificado libre; se inició únicamente la sesión Vite propia con `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`, sin `.env`. Al terminar se detuvo exclusivamente esa sesión; no se mataron procesos por puerto.

Límites: prueba de runtime **frontend demo/mocks**, no evidencia de backend real, persistencia, servidor de autorización, CI, producción, envío externo, impresión física ni auditoría completa de accesibilidad/lector de pantalla. La suite completa y la repetición prueban los recorridos observados, no una garantía universal de estabilidad. Entregas/Taller/Clientes y la F3 completa siguen pendientes. Engram volvió a rechazar el guardado por múltiples sesiones runtime coincidentes: no se adivinaron IDs ni se cerraron sesiones ajenas; el diagnóstico y resultados quedan aquí.

## Rollback y siguiente responsable

Unidad cohesiva sin commit sobre `2f3be6a4`: retirar únicamente los tres archivos nuevos de F3 y este handoff, revertir **solo los hunks F3** de SellerOrders/SellerQuotes/PedidoDetalle y el bloque F3 añadido al spec. El metadato correcto de #342 puede conservarse. No hacer reset ni restaurar archivos completos si hay cambios concurrentes. Ningún dato, esquema o dependencia requiere rollback. Se preservan nav341/F2, guards y todos sus tests.

Padre: el retorno de foco acotado está resuelto/verificado en la sección final; pendiente spot-check y decisión separada de checkpoint/commit y verificación autenticada con backend si se habilita; luego, solo con autorización distinta, integración/CI/release/smoke. Entregas/Taller/Clientes siguen pendientes de otra unidad; este parche no cierra toda F3 ni el rediseño de la aplicación.

`skill_resolution: paths-injected` — se leyeron antes de trabajar los cuatro paths exactos suministrados: work-unit-commits, design-system, accessibility-review y testing-strategy. Registro ausente, sin estándares inventados.

## Novedades para el dueño

- Pedidos y cotizaciones se presentan con paneles más limpios, nombres completos y modelos legibles.
- Los filtros frecuentes quedan a la vista; las opciones de pago y orden adicionales siguen disponibles sin saturar el listado.
- Cada cotización muestra la acción que corresponde a su estado; historial y opciones de compartir permanecen accesibles.
- Gs 100 millones y sus saldos se leen completos en pruebas aisladas de celular y escritorio, también en oscuro.
- Es una entrega local, sin publicar ni alterar ventas reales; Entregas, Taller y Clientes no forman parte de este rediseño.

## Independent final verification — 2026-10-11

After the bounded focus correction, an independent verifier ran the focused Node suite (23/23, exit 0), full frontend Playwright suite (48/48, exit 0, zero retries), and diff whitespace check (exit 0). Original 35 browser cases remain byte-identical; the original focus assertion remains and now also covers a second keyboard open/close cycle. No severe candidate-caused findings were identified. The desktop Pedidos/Autorizaciones selector predates F3; the mobile section selector remains hidden at desktop width. These results verify only the frontend demo/mocked contracts, not production persistence or authorization. No merge, push or deployment performed.
