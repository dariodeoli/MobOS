# Handoff — F3 Clientes: rediseño acotado del listado

Fecha: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Rama: `codex/mobos-nav-v2`. Entrada limpia y HEAD: `7217d6bc4ef0e07d8126ffd22291a695a39f5039`.
Estado: PASS de esta unidad local acotada. Verificaciones finales completas: 76/76 frontend (57 anteriores + 19 nuevos), 983/983 unitarios y 30/30 enfocados. Unidad local sin commit, push, fetch/rebase, integración, SDD, revisión nativa, delegación ni despliegue. Un único escritor. Sin credenciales, cambios de backend, base de datos ni registros productivos.

## Fuentes, alcance y preservación

Se leyeron `AGENTS.md`, `docs/TABLAS.md`, `docs/CAMPOS.md`, los últimos handoffs de Ventas/Entregas y la fuente original `/Users/dariodeoli/Downloads/docs 2/redesign/REDESIGN.md`, §0 y §7.7. Se inspeccionó la referencia visual del prototipo. La nota canónica de integración conserva su fecha 18-09-2026; este trabajo sigue el alcance local explícitamente autorizado, no su procedimiento de publicación.

| Ruta modificada | Cambio |
| --- | --- |
| `src/components/ventas/SellerCustomers.jsx` | Conserva `BarraModulo` y `ResumenMetricas`; descripción breve, búsqueda/chips/orden, un botón primario y acciones secundarias. Selector de Campañas fuera del render condicional para permitir el regreso. Lectura independiente, abortable y sin caché del resumen; actualización después de alta/importación confirmadas. |
| `src/components/customers/ClientesTabla.jsx` | Lista plana y tabla con nombre completo y teléfono, sin correo visible. Menú de teclado con transferencia/restauración de foco, flechas, Home/End y Escape anidado. Se mantienen acciones y selección. |
| `src/components/ventas/clientesF3.css` | Estilos exclusivos de Clientes, tokens existentes, tira de resumen y filas planas, importes completos y controles de 44 px. No cambia estilos de la ficha ni del resto del shell. |
| `src/lib/clientesF3.test.js` | Cinco contratos nuevos con hashes de los bytes protegidos de la entrada y aserciones de datos, paginación, alcance y teclado. |
| `e2e/frontend/nav-v2.frontend.spec.js` | Se anexan 19 casos efectivos. Los 57 anteriores siguen como prefijo idéntico byte por byte, sin modificar sus aserciones. |
| `docs/HANDOFF-F3-CLIENTES.md` | Este recibo de alcance, evidencias, límites y rollback. |

`CustomerProfile`, `ClienteResumenPopup`, `CustomerCommunicationCard`, los componentes compartidos, clientes/API, rutas backend, dependencias, permisos, navegación y fixtures de negocio no se modificaron. El formulario de alta y sus payloads/validación se protegen por hash; los handlers de alta/importación solo añaden la revisión del resumen tras éxito. El export general y copiar/exportar seleccionados permanecen idénticos. Se preservan unificación, búsqueda global `?q=`, enlace `?cliente=`, apertura de Datos desde el resumen rápido, listas de precios, crédito y los tres consentimientos independientes.

## Decisiones de presentación y datos

- Encabezado y filtros sin cajas extra. Crear cliente es la única acción principal del listado; importar/exportar siguen accesibles como secundarias. No se añade importación Excel ni un filtro Recientes: se mantiene el orden Recientes ya existente.
- Tira de métricas plana con separadores. A 320 px se apila para evitar recortar Gs 100.000.000; desde 390 px tiene dos columnas y desde 861 px cuatro. Tabla desde 1200 px; debajo se conservan todas las acciones en filas móviles planas. El breakpoint del shell existente no se cambia.
- Nombre/empresa completo sin elipsis ni abreviación inventada; puede envolver según el ancho. Teléfono legible. Correo permanece en ficha, resumen rápido y CSV, no en el listado. Los importes no tienen tope visual ni abreviaturas tipo «100m».
- La consulta de clientes sigue usando `limit: 50`, búsqueda/filtro/orden del servidor y cursor de la última fila para Cargar más. Los encabezados ordenan solamente las filas cargadas; sus nombres accesibles dicen «en pantalla», separados del selector «en la tienda».
- El resumen API conserva total/mayoristas/minoristas de tienda. Un fallo muestra «—» y «Resumen de tienda no disponible»: nunca sustituye el total por `rows.length`. Deuda y Por cobrar son suma de filas cargadas con alcance explícito «En pantalla»; no se inventan agregados financieros de tenant. En demo, los conteos también dicen En pantalla.
- Alta/importación confirmadas refrescan la consulta del resumen. El cliente ya invalida caché al mutar; `{ signal, cacheMs: 0 }` evita compartir una lectura en vuelo anterior y el aborto/guard evita publicar una respuesta vieja al desmontar/refrescar. No cambia ningún contrato API.
- Campañas sigue restringido a ADMIN/GERENTE fuera de demo. Su selector permanece disponible dentro de la vista de campañas. No se modifican envíos, segmentación ni reglas de consentimiento.
- Menú: al abrir mueve el foco a la primera opción (última con ArrowUp); flechas circulares, Home/End y Escape restauran el disparador. El editor de WhatsApp conserva su contenido y lógica; la captura de clic transfiere foco sin cambiar el componente compartido. Escape primero cierra ese editor y devuelve el foco a su opción, luego cierra el menú. Salir con Tab o clic exterior cierra sin robar el foco.

## Comprobaciones finales

Normalización acotada con Prettier de los bloques nuevos, CSS y tests, manteniendo los bytes legacy protegidos y el prefijo anterior del harness. Los resultados siguientes deben corresponder al candidato posterior a la restauración de los componentes compartidos. No se ejecutan normalizadores mutantes después de estos checks; solo se actualiza este recibo.

| Comando exacto | Resultado |
| --- | --- |
| `npm run lint` | Exit 0; cero errores. |
| `npm run build` | Exit 0; 3,50 s; warning existente de chunks >500 kB. |
| `npm test` | Exit 0; 983/983; cero fallos/cancelados/omitidos; 16.249,676833 ms. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js` | Exit 0; 30/30 (25 anteriores + 5 nuevos); cero fallos/cancelados/omitidos; 815,555 ms. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0; 76/76 (57 anteriores + 19 nuevos), 1,8 min; un worker, retries 0. |
| `git diff --check` | Exit 0. |

Logs: `/tmp/mobos-redesign-clientes-qa/{lint,build,test,focused,playwright}.log`.
Capturas: `/tmp/mobos-redesign-clientes-qa/{320,390,768,860,861,1440}-{light,dark}-clientes.png`, fuera de Git. Además, ocho capturas de menú/ficha a 320/1440 px en ambos temas (`*-menu.png`, `*-profile.png`), mediante script temporal con las mismas respuestas mock (`capture.log`, exit 0). Se inspeccionaron visualmente escritorio claro y móvil oscuro; las mediciones del navegador verifican el texto completo, área táctil e importes, además del overflow de página.

Los 12 casos de presentación cubren ambos temas y los seis anchos, listado/cuadrícula, acciones, menú/plantillas con teclado, ficha completa y resumen rápido. Los demás cubren dos páginas (50 + 1), 127 clientes de tienda frente a filas cargadas, suma de deuda al cargar más, orden local frente a orden/búsqueda/filtro del servidor, exportación general filtrada y CSV seleccionado, acceso a unificación, fallo de resumen, regreso de Campañas con ADMIN/GERENTE y ausencia con VENDEDOR/demo, alta con teléfono inválido, consentimientos independientes/crédito Gs 100.000.000, POST confirmado/403, importación y actualización de resumen, enlace profundo y transición a Datos. Los montos/nombres largos pertenecen exclusivamente a respuestas mock aisladas, no a seeds de negocio.

### Historial de preparación y fallo conservado

- `preflight.log` y `preflight-corrected.log`: fallo de restauración de foco al salir del editor de WhatsApp. El componente compartido detiene la propagación de clic; se resolvió en el menú de Clientes con captura de eventos y foco explícito (con fallback de foco para editor vacío), sin modificar SharedUI/WhatsAppMenu. Se interrumpió la corrida repetida `preflight-all.log` para evitar repetir el mismo defecto.
- `preflight-contracts.log`: 16/19. Tres aserciones nuevas incorrectas: cantidad absoluta de lecturas iniciales del resumen (StrictMode ejecuta efectos iniciales dos veces) y tratar Datos como botón, cuando es un tab con `aria-selected`. Corrección solo de esos contratos de harness; no se cambiaron los 57 anteriores. `preflight-final.log`: 19/19.
- `preflight-validation.log`: 3/3 con validación de teléfono y deuda de segunda página añadidas.
- `initial-test.log`: 982/983; fallo del contrato existente `la composición de módulo y el resumen de métricas son objetos (#256)`: la primera propuesta había sustituido los objetos compartidos por JSX local. Se restauraron los dos componentes con CSS acotado; no se alteró el test existente. La primera suite completa fue cancelada antes de editar y no cuenta como aprobación. `initial-{lint,build,focused,playwright}.log` conservan esa evidencia parcial.
- `shared-regression.log`: 1/1; `restored-source.log`: 5/5; `restored-frontend.log`: 19/19 después de restaurar los objetos compartidos. No hubo ciclo de reparaciones ajenas al alcance.

## Limitaciones, riesgos y siguiente responsable

Evidencia frontend demo/mocks; **no demuestra backend, persistencia, autorización de servidor, aislamiento multiempresa real, campañas/envíos, CI, producción ni impresión**. No se ejecutaron PG, builds/migraciones backend ni validaciones contra datos productivos. El gate de publicación del repo permanece sin ejecutar porque no se autorizó publicar. No se afirma auditoría WCAG completa ni prueba de VoiceOver/NVDA.

Se mantienen los comportamientos preexistentes del filtro demo Con deuda, de campañas y de las acciones de ficha; no se corrigieron ni ampliaron contratos de negocio. Los hashes de protección están ligados a este checkpoint y deben revisarse si posteriormente se autoriza cambiar esos motores.

Puerto 5291: libre antes de iniciar Vite propio mediante `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`. Finalizada la suite y las capturas, se detuvo exclusivamente la sesión propia 28999 con Ctrl-C (exit 130 de parada); puerto 5291 sin listener confirmado. Nunca se matan procesos por puerto.

`skill_resolution: paths-injected` (registro ausente). Se leyeron antes de trabajar los paths exactos suministrados:
- `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/design-system/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/accessibility-review/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`

## Rollback

Unidad no commiteada: revertir únicamente el diff de `SellerCustomers.jsx`/`ClientesTabla.jsx` a los bytes de `7217d6bc`; quitar el import y archivo nuevo `clientesF3.css`, `clientesF3.test.js` y este handoff; retirar solo el bloque anexado del harness que empieza en `// F3 Clientes: isolated frontend contracts`. No usar un reset global ni borrar los handoffs/casos/cambios F1/F2/Ventas/Entregas anteriores. No hay migración ni datos que revertir.

## Novedades para el dueño

- Clientes tiene una presentación más limpia: nombres completos, teléfonos y deuda legible; el correo continúa disponible en la ficha.
- Si no se puede obtener el total de la tienda, se informa como no disponible en lugar de mostrar un número engañoso.
- Después de crear o importar clientes, el resumen se actualiza; las preferencias de contacto y crédito se conservan.
- Las acciones funcionan con teclado y es posible volver al listado desde Campañas, respetando los permisos actuales.

## Independent final verification — 2026-10-11

Read-only verification against `7217d6bc`: focused Node 30/30 and full frontend Playwright 76/76 passed; original 57 cases remain byte-identical. No severe candidate-caused findings identified. Pagination/export scopes, profile deep links, campaign permissions, all three consents and credit fields were preserved. Summary failures do not substitute loaded rows for tenant totals; successful creation/import refreshes through the existing API. Parent inspected mobile dark and desktop light screenshots, ran five focused contracts and checked whitespace successfully. Frontend mocks do not certify backend persistence or authorization. No push, merge or deployment performed.
