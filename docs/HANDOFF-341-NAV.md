# Handoff — issue #341: navegación compacta

Fecha: 2026-10-11. Rama: `codex/mobos-nav-v2`.
Base y `origin/main`: `5b42ba81db8a740513dba1eda9bce91ef84fe697`, v1.0.224.
Estado: implementación frontend sin commit; no publicación ni cierre de issue.

## Alcance y decisiones

- Cinco destinos del dueño: Inicio, Vender, Ventas, Stock y Finanzas. El mismo catálogo alimenta el lateral y la barra inferior; no existe «Más» de navegación.
- El catálogo existente sigue determinando el acceso: vendedor/gerente/caja ven Vender, Ventas y Stock; técnico entra a Taller; repartidor entra a Entregas, con acceso contextual a Rendiciones. No se modificaron permisos, modelos ni router.
- Stock muestra cuatro áreas: Inventario (unidades IMEI y productos por cantidad), Compras, Traslados y Precios. Cada área ofrece únicamente los destinos ya autorizados mediante un selector contextual; no hay una lista plana de 14 opciones. Los modelos no se fusionan.
- Selectores nativos accesibles en móvil y para los subgrupos en escritorio. Solo las áreas principales usan una fila breve de enlaces en escritorio; Inventario conserva sus grupos Stock/Movimientos/Control en optgroups y el contador de autorizaciones pendientes, sin una segunda fila horizontal de solapas. Análisis/Reportes vive en Finanzas; Promociones y Plantillas, en Ventas → Clientes.
- Sucursal y avisos permanecen visibles fuera del perfil. Se reutiliza `SelectorSucursal` y su preferencia de sesión; no se deriva la sucursal de `usuario.branchId`.
- Perfil con identidad compartida y handlers existentes: Mi perfil, Configuración, Ayuda, tema, atajos, bloqueo y salida. Configuración solo se ofrece cuando está en el catálogo autorizado. Delivery mantiene sus acciones originales, sin añadir acceso al panel de ventas ni simular handlers inexistentes.
- Sin título duplicado en el header móvil, acceso POS duplicado, fecha informativa del shell, widget «Vendido hoy» ni pie dentro de la app. La fecha operativa del formulario POS se conserva.
- Acción principal negra en claro y blanca en oscuro; estados y logo mantienen el verde semántico. Sin nuevo flag de activación. El estilo queda acotado al shell: no rediseña landing, portal, datos ni contenido del tablero.
- Navegación inferior de 56 px incluyendo borde, más safe-area; el cobro usa el mismo desplazamiento. Los diálogos ocultan controles fijos de fondo. Con foco en un campo y viewport de hasta 480 px de alto, la barra inferior se oculta y el cobro vuelve al flujo.

## Mapa completo de destinos

El código contiene **29 entradas fijas más `/ops` condicionado por su flag existente**. Se conservan ambas cosas, sin activar ni eliminar ese flag.

| Destino anterior | Ubicación nueva | URL conservada |
|---|---|---|
| Inicio | Inicio | `/resumen` |
| POS | Vender → Nueva venta | `/pos` |
| Pedidos | Ventas | `/pedidos` |
| Cotizaciones | Ventas | `/cotizaciones` |
| Promociones | Ventas → Clientes | `/promociones` |
| Plantillas | Ventas → Clientes | `/plantillas` |
| Clientes | Ventas | `/clientes` |
| Unidades (IMEI) | Stock → Inventario | `/inventario/unidades` |
| Productos (stock) | Stock → Inventario | `/productos` |
| Compras | Stock → Compras | `/compras` |
| Traslados y tránsito | Stock → Traslados | `/inventario/traslados` y `/inventario/transito` |
| Por comprar | Stock → Compras | `/abastecimiento` |
| Compras del Centro | Stock → Compras | `/compras-centro` |
| Preparar compra | Stock → Compras | `/preparacion` |
| Preparar lote | Stock → Compras | `/preparar-lote` |
| Recepción | Stock → Compras | `/recepcion` |
| Métricas de abastecimiento | Stock → Compras | `/metricas` |
| Precios | Stock → Precios | `/precios` |
| Lista por modelo | Stock → Precios | `/celulares` |
| Comparador | Stock → Precios | `/comparador` |
| Centro de Control | Stock → Precios | `/centro-control` |
| Delivery | Ventas | `/delivery` |
| Taller y garantías | Ventas; principal Taller para técnico | `/servicio`; compatibilidad `/garantias` |
| Trade-In | Ventas para dueño; Vender para vendedor | `/trade-in` |
| Autorizaciones | Ventas | `/autorizaciones` |
| Finanzas | Finanzas | `/finanzas/caja` por defecto |
| Análisis | Finanzas → Análisis | `/analisis/reportes` por defecto |
| Configuración | Perfil, con guard existente | `/configuracion/mi-cuenta` por defecto |
| Ayuda | Perfil | `/ayuda/ayuda` |
| Tablero de operaciones (condicional) | Inicio | `/ops` |

Compatibilidad intacta: **`/ventas` sigue redirigiendo a `/pos`**, no al nuevo destino principal Ventas. Mi perfil del equipo mantiene `/mi-cuenta`; el dueño conserva `/configuracion/mi-cuenta`. Delivery mantiene `/delivery/repartos` y `/delivery/rendiciones`.

Subsecciones conservadas: Inventario (unidades, taller, conteos, alertas, reservas, traslados, vendidos, tránsito, ubicaciones, compartido y eliminados; autorizaciones según capacidad); Análisis (reportes, ganancias, ganadores, asistente); Configuración (mi-cuenta, organización, equipo, comercial, seguridad, dispositivos, sistema); Finanzas (caja, gastos, bancos, conciliación, créditos, cuotas, comisiones, publicidad). El filtrado demo de créditos/cuotas/comisiones permanece: no se expusieron para satisfacer una prueba.

## Archivos de la unidad de trabajo

| Archivo | Cambio |
|---|---|
| `src/components/app/AppShell.jsx` | Shell, perfil real, lateral, header móvil y barra inferior |
| `src/components/app/SectionSelector.jsx` | Selector contextual compartido y navegación desktop proporcional |
| `src/components/app/shellNavigation.css` | Neutros acotados, acción principal, safe-area y apilamiento |
| `src/lib/shellNavigation.js` | Proyección del catálogo permitido, sin cambiar permisos |
| `src/pages/PanelVendedor.jsx` | Integración; retiro de duplicados; selectores Finanzas/Análisis |
| `src/pages/PanelDelivery.jsx` | Reutiliza principal Entregas; conserva handlers y guard |
| `src/components/control/Inventario.jsx` | Selector agrupado para subsecciones en todos los anchos; guía AEX visible |
| `src/components/control/config/NavegacionConfig.jsx` | Selector de las siete secciones existentes |
| `src/components/shared/SelectorSucursal.jsx` | Nombre visible también con una sola sucursal en móvil |
| `src/components/ventas/venta/PasoCobro.jsx` | Acción neutral, barra de dos filas y resúmenes con importes completos |
| `src/components/ventas/venta/PasoCarrito.jsx` | Total en fila propia e importes sin cortes |
| `src/components/ventas/venta/FilaVenta.jsx` | Distribución adaptable de la línea y valor completo |
| `src/components/ventas/FormularioVenta.jsx` | Guarda el contexto original antes del envío y lo verifica al abrir el detalle |
| `src/lib/orderDetailNavigation.js` | Guard puro de navegación por ID confirmado y contexto |
| `src/lib/orderDetailNavigation.test.js` | ID, rechazo, contexto y distinción de cola local |
| `src/lib/shellNavigation.test.js` | Mapeo completo, roles, compatibilidad y contratos del shell |
| `src/lib/objetosReglas.test.js` | Actualiza solo dos expectativas obsoletas: pie y navegación Configuración |
| `e2e/nav-v2.frontend.config.js` | Arnés independiente sin PG ni backend |
| `e2e/frontend/nav-v2.frontend.spec.js` | Pruebas Playwright frontend demo |
| `docs/HANDOFF-341-NAV.md` | Este handoff |

## Verificación

Dependencias instaladas con `npm ci` (exit 0); sin cambios en manifiestos ni lockfile. Reportó 15 vulnerabilidades (5 moderadas, 10 altas); no se ejecutó `npm audit fix` fuera del alcance.

Normalización: Prettier únicamente sobre archivos nuevos/reescritos de esta unidad; los cambios localizados en fuentes antiguas conservan su estilo y evitan una normalización masiva. `git diff --check` sin errores.

| Comando | Resultado final |
|---|---|
| `npm run lint` | Exit 0; sin errores |
| `npm run build` | Exit 0; advertencia de chunks de más de 500 kB |
| `npm test` | Exit 0; 968/968, 0 fallos, después de la corrección de agrupación/importes/contexto |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js` | Exit 0; 15/15 |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0; 24/24 (1,1 min), cero reintentos, después de normalizar fuentes |

Para repetir Playwright: iniciar `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort` en este worktree y ejecutar el comando indicado. No usar la configuración principal, que inicia PostgreSQL/backend. El arnés demo aborta tráfico HTTPS externo y responde 503 a `/api/`; los cinco casos de contrato API interceptan todos los endpoints localmente y devuelven respuestas ficticias explícitas. Los módulos Vite bajo `/src/lib/api/` no se interceptan. El valor VITE_API_URL es solo de proceso y apunta al Vite propio, no se creó ni modificó ningún archivo de entorno. El spec independiente vive en `e2e/frontend/`, separado del inventario de specs del arnés backend existente.

Cobertura observada: dueño a 320/360/390/430/1440 px; cinco roles adicionales a 390 px; nombres de sucursal/avisos; cero overflow horizontal; selector Stock y URLs contextuales; guard de Configuración para no propietarios; un solo h1; perfil/Escape/restauración de foco; Configuración/Ayuda/atajos; cambio claro/oscuro con color computado del botón; confirmación de salida y cancelación; bloqueo; búsqueda global; modal dentro del viewport; cobro y barra inferior completos sin superposición; viewport reducido con foco para simular teclado; `/ventas` compatible.

Capturas fuera de Git: `/tmp/mobos-nav-v2-qa/`, con `{320,360,390,430,1440}-{inicio,perfil,pos}.png`, cinco `role-*.png`, `390-pos-dark.png` y `390-bloqueo.png`. Logs: `/tmp/mobos-nav-v2-{install,lint,build,test,playwright,focused}.log`.

**No probado / bloqueado por el arnés frontend:** backend real, guard servidor, cambio real de empresa/sucursal, envío/conciliación de pedidos, créditos/cuotas/comisiones, datos reales de `/ops`, sesión remota y cierre remoto efectivo. Tampoco teclado físico/iOS, VoiceOver/NVDA ni safe-area de un dispositivo real. No se realizó setup PG, pruebas de backend, native review/assess, CI, publicación ni smoke productivo. No se afirma PASS para esas capas.

### Corrección acotada del hallazgo independiente — 2026-10-11

- La verificación frontend independiente detectó que el formulario de guía AEX en Traslados tenía accidentalmente `hidden ... lg:flex`. Se restauró únicamente su clase original `flex flex-wrap items-center gap-1`; las clases desktop-only de `grupos-inventario` y `tabs-inventario` se conservaron.
- Se agregó una prueba de regresión en `src/lib/shellNavigation.test.js`: verifica la clase del formulario conectado a `guardarGuia` y que ambas navegaciones sigan ocultas en móvil y visibles en escritorio. Primero falló con la clase accidental (5/6); después pasó junto al harness enfocado (11/11). La ejecución original, antes de esta corrección, había registrado 963/963 pruebas, 10/10 enfocadas y 12/12 Playwright en 16.5 s; la verificación independiente registró 12/12 en 12.1 s.
- La prueba nueva es un contrato de fuente, no una prueba de envío AEX: la demo no contiene filas de traslados y el arnés mantiene bloqueado el backend. El flujo real «Agregar guía → Guardar/Cancelar» continúa pendiente de una prueba con datos autorizados; no se crearon fixtures ni se modificaron datos, permisos o backend para simularlo.
- Normalización limitada al test tocado con `npx --no-install prettier --write src/lib/shellNavigation.test.js` (sin cambios adicionales). El JSX antiguo conserva su formato; no se reformateó Inventario completo. Se repitieron lint (exit 0), build frontend (exit 0, advertencia de chunks >500 kB), `npm test` (964/964) y Playwright frontend (12/12, 12.3 s). Logs de esta corrección: `/tmp/mobos-nav-v2-correction-{lint,build,test,playwright}.log`.
- No hubo otras correcciones, commits, push, rebase, fetch, SDD ni revisión nativa. Se inició Vite propio en `127.0.0.1:5291` y se finalizó únicamente su PID. Rollback de esta corrección: revertir solo la clase del formulario, la prueba agregada y esta actualización del handoff, sin retirar las demás modificaciones de la unidad.

## Corrección única de agrupación y dos requisitos nuevos — 2026-10-11

- Se corrigió la presentación sin modificar los catálogos autorizados, URLs, roles ni guards: Análisis en Finanzas; Promociones/Plantillas bajo Clientes en Ventas; Stock en Inventario/Compras/Traslados/Precios. El técnico sigue autorizado únicamente a Taller. Los roles limitados muestran solo los subgrupos no vacíos de su catálogo. El mapa de 29 destinos y `/ops` se conserva.
- Se eliminó `truncate` del total fijo y se separó el total de los botones. Total/Pagado/Pendiente del cobro usan filas completas; el total del carrito ocupa su propia fila, y la línea puede redistribuirse. Los strings numéricos permanecen sin cortes, elipsis ni abreviaturas. No se alteraron `gs`, formatos USD, fórmulas ni límites monetarios. La prueba independiente de agrupación anterior y su corrección AEX se conservan; esta tanda no lanzó otra revisión ni amplió el alcance.
- Prueba de la app realmente renderizada: 65 escenarios de carrito, usando Gs 0, Gs 180.000, Gs 100.000.000, Gs 1.000.000.000 y Gs 99.000.000.000 a 320/360/390/430/1440 px, sin pago/con pago parcial/pago completo donde aplica. Se mide `Range.getBoundingClientRect()` del texto, el contenedor y sus ancestros con clipping; se exige una línea, ausencia de ellipsis, y límites completos. También se verifican importes de línea, subtotal, botones, tiles y barra fija, cero overflow y no superposición con la navegación. Las fixtures usan `guardarCarrito` y el catálogo demo reales en contextos de navegador descartables; no se evalúa ni reemplaza código fuente ni se escribe en producción.
- Confirmación: se conserva la validación existente del ID y la espera de 1,5 s. La navegación automática abre `/pedidos/<id interno>` solo si siguen activos el POS y la empresa/sucursal/usuario originales capturados **antes** del envío. El guard no cambia la cola, la idempotencia ni el vaciado del carrito.
- Prueba de los handlers reales: dos casos demo (éxito y cambio de tenant en la espera) y cinco casos API-mode interceptados (ID confirmado, respuesta sin ID, rechazo HTTP 422, cambio de tenant en la espera, error de red que queda pendiente). El éxito usa el ID interno, no el número público. **Una entrada offline `cola-*` es pendiente, no un pedido persistido**: no abre detalle ni fabrica `ordenId`; solo una confirmación real posterior puede aportar ese ID. La prueba observa IndexedDB local descartable. No se afirma persistencia del servidor ni se rediseña la sincronización.
- Pruebas preliminares detectaron supuestos erróneos del arnés: POS sigue montado al navegar, carrito sin pagos no muestra el resumen secundario pagado/pendiente y el error HTTP usa `message`. Se corrigieron las fixtures y assertions sin tocar esos comportamientos existentes ni borrar pruebas. Los logs preliminares están en `/tmp/mobos-nav-v2-correction2-{playwright-initial,focused-browser,browser-proof}.log`.
- Logs finales: `/tmp/mobos-nav-v2-correction2-{lint,build,test,focused-node,playwright}.log`. Normalización solo de archivos nuevos/reescritos propios; las fuentes legacy conservan su formato con hunks locales. No hay dependencias nuevas ni cambios de manifiesto/lockfile. El servidor Vite pertenece a esta corrida y se detiene solo por su sesión/PID.
- Evidencia más reciente: `/tmp/mobos-nav-v2-qa/large-{320,360,390,430,1440}-{100000000,1000000000,99000000000}.png`, además de `large-cart-*`, `large-summary-*` y `large-checkout-*` (este último solo en móvil). Los recortes de 320 y 1440 px permiten revisar las cifras sin reducir una captura larga.
- Alcance no probado: persistencia/API y autorizaciones de servidor reales, envío AEX con traslados reales, sincronización offline exitosa/reconciliación en servidor, sesión/cambio de empresa reales, uso USD renderizado con valores grandes, teclado físico/safe-area iOS y lectores de pantalla. Los tests unitarios existentes de moneda se ejecutan en `npm test`, pero no equivalen a una prueba de UI USD. No se ejecutaron backend/PG/CI/deploy/smoke productivo.

## Rollback y entrega

Rollback de esta unidad: retirar los archivos nuevos enumerados y revertir **solo sus hunks** en los archivos existentes contra la base indicada; no usar reset ni restaurar archivos completos si otro agente agregó cambios. No hay migraciones, datos ni dependencias nuevas que revertir. Esto restaura el shell anterior, los selectores y el desplazamiento anterior del cobro. Rutas y permisos quedan intactos en ambas versiones.

Pendiente del padre/integrador: spot-check, pruebas autenticadas con backend cuando esté disponible y decisiones separadas de commit/PR/integración/CI/release/smoke. Ninguna de ellas se ejecutó ni quedó autorizada por esta implementación. RDD permanece apagado.

`skill_resolution: paths-injected` — se leyeron los cuatro paths exactos solicitados (work-unit-commits, design-system, accessibility-review y testing-strategy), más AGENTS.md completo y documentación local. Registro ausente: no se inventaron estándares de proyecto.

## Novedades para el dueño

### Validación independiente final — 11/10/2026

- Verificador independiente: Node enfocado **15/15** y Playwright frontend **24/24**, sin cambios de código.
- Confirmadas las agrupaciones aprobadas y **65 escenarios PYG renderizados** entre 320 y 1440 px, con montos completos y sin superposición del cobro con la navegación.
- Confirmados los casos frontend de ID persistido, rechazo/ID ausente, cambio de empresa y cola offline. El servidor Vite propio se detuvo al finalizar.
- Esto no acredita persistencia real del servidor, comportamiento en dispositivo físico ni presentación USD. Sin commit, push, integración o deploy.

- El menú principal mantiene cinco accesos claros y Stock se organiza en Inventario, Compras, Traslados y Precios.
- Los reportes quedan en Finanzas; las promociones y mensajes, junto a Clientes en Ventas.
- La sucursal y los avisos siguen a la vista; las acciones personales quedan en el perfil.
- Los totales grandes se muestran completos, también en celular, sin superponer el cobro y la navegación.
- Al confirmar un pedido se abre su detalle; un cambio de empresa durante la espera cancela la apertura y una venta offline pendiente no se presenta como confirmada.
