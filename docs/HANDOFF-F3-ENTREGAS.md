# Handoff — F3 Entregas: presentación de asignaciones de tienda

Fecha: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Rama: `codex/mobos-nav-v2`. Entrada limpia: `514e7f65c83b5a3cc8935b4a1e289f767d3c1797`.
Estado: PASS de esta unidad acotada de presentación; verificación final completa 57/57 (48 anteriores + 9 nuevos). Unidad local sin commit, push, fetch/rebase, integración, CI, publicación ni deploy. Un único escritor, sin delegación, SDD o revisión nativa. Sin credenciales, backend, base de datos ni registros productivos.

## Fuentes y alcance

Se leyeron `AGENTS.md`, `docs/HANDOFF-343-VENTAS.md`, `docs/TABLAS.md`, `docs/CAMPOS.md` y la fuente original `/Users/dariodeoli/Downloads/docs 2/redesign/REDESIGN.md`, §0 y §7.5. La prioridad visual de §0 permite tarjetas de reparto planas en lugar de las cajas tintadas anteriores; no autoriza modificar reglas financieras ni extender este trabajo a todas las pantallas.

| Ruta modificada | Cambio exacto |
| --- | --- |
| `src/components/delivery/StoreDelivery.jsx` | Import de CSS; variante plana optativa de los chips; estructura y etiquetas accesibles de Asignaciones; dirección existente; sección de importes; controles y autorización desplegable. Encabezado accesible Entregas y descripción legible en móvil. |
| `src/components/delivery/entregasF3.css` | Archivo nuevo, selectores exclusivos de presentación de asignaciones, chips y barra de este módulo. |
| `src/lib/entregasF3.test.js` | Dos contratos nuevos; hashes de los handlers y Rendiciones de la entrada, sin depender de Git en el entorno de CI; campos/guards/testIDs y reglas CSS. |
| `e2e/frontend/nav-v2.frontend.spec.js` | Se anexan nueve casos; los 48 casos previos permanecen como prefijo idéntico byte por byte. |
| `docs/HANDOFF-F3-ENTREGAS.md` | Este recibo de alcance, decisiones, comprobaciones y limitaciones. |

No se modificaron `datos.js`, fixtures demo, el panel del repartidor, el cuerpo de Rendiciones, el backend, navegación, permisos, enums, dependencias ni otros archivos F1/F2/F3. La región anterior al render de Asignaciones (estado, efectos y handlers) y todo el cuerpo de Rendiciones son idénticos a la entrada. Los nuevos estilos no apuntan a tarjetas/diálogos de rendición ni al panel del repartidor.

## Decisiones y límites de presentación

- Tarjetas planas, bordes neutros de 1 px, radio 10 px y sin sombras. Dos columnas desde 1200 px; una a 320/390 px. Nombres/artículos/direcciones pueden envolver, no se recortan con elipsis.
- Se muestra `row.direccion`, su etiqueta y sus notas ya proyectadas por `deliveryFields`. Sin teléfono/contacto supuesto. Ausencia de dirección: «Sin dirección registrada».
- Total, falta cobrar y cobrado en la calle sin rendir permanecen separados, con valores reales y tipografía normal de 16 px; no se compactan a «100m» ni se recalculan.
- Se conservan exactamente los tres filtros de API: Sin asignar, Asignados y Todos. «En camino» sigue siendo el estado de cada pedido. No se inventan consultas/filtros «En camino» o «Para rendir»; Rendiciones permanece como acceso a la pantalla existente.
- La autorización utiliza un disclosure nativo etiquetado «Autorización», no un menú de acciones que pudiera activar el permiso al abrirse. El checkbox original permanece dentro, con el mismo estado/handler/condición; Enter/Space abre, Tab llega al checkbox, Escape cierra y devuelve el foco. La etiqueta y el disparador ofrecen un área de al menos 44 px. «Seleccionada» indica el estado del checkbox, NO una aprobación del servidor.
- Asignar/Reasignar/Liberar conservan handlers, payloads, disabled y testIDs. No se corrige el comportamiento preexistente del select asignado: muestra `row.repartidorId`, aunque el handler lee la selección nueva. El contrato de reasignación se prueba explícitamente con dos repartidores mock.
- El h1 del shell sigue diciendo «Delivery»: su catálogo/metadata queda fuera del alcance. La pestaña y el nombre accesible del módulo son Entregas.

## Invariantes financieros

El servidor no se modificó. La autorización auditada de un solo uso y la verificación transaccional siguen siendo requisitos del contrato financiero existente, no resultados demostrados por estas pruebas frontend. El cliente mantiene `allowUnpaidDelivery: true` exclusivamente cuando su checkbox está seleccionado; liberar conserva `{ assignedToId: null }`. La selección de autorización ya se retenía en la pantalla entre asignaciones/reasignaciones: no se cambió esa semántica ni se confundió con consumo/auditoría real.

Los cobros de calle siguen identificados como pendientes/sin verificar; `PENDING`, `VERIFIED`, `REJECTED`, confirmaciones, motivo de rechazo y handlers de rendición no cambian. La prueba mock observa los payloads de verificar/rechazar y que Escape cancela sin enviar. **No demuestra auditoría, consumo atómico de autorización, persistencia ni conciliación transaccional del backend**: esos controles permanecen fuera del ámbito ejecutado.

## Comprobaciones finales después de normalización

Normalización de los bloques nuevos con Prettier; se conservaron los bytes legacy de los handlers/Rendiciones y el prefijo del harness. No se aplicó formato global ni normalizadores mutantes después de iniciar las comprobaciones finales. Solo este recibo se actualiza con los resultados.

| Comando exacto | Resultado observado |
| --- | --- |
| `npm run lint` | Exit 0; cero errores. |
| `npm run build` | Exit 0; 3,72 s. Warning existente de chunks >500 kB, sin ampliación de alcance. |
| `npm test` | Exit 0; 978/978; cero fallos/cancelados/omitidos; 16.600,324625 ms. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js` | Exit 0; 25/25; cero fallos/cancelados/omitidos; 1.205,3065 ms. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0; 57/57 (48 anteriores + 9 nuevos), 1,6 min; un worker, retries 0. |
| `git diff --check` | Exit 0. |

Logs: `/tmp/mobos-redesign-delivery-qa/{lint,build,test,focused,playwright}.log`.
Capturas: `/tmp/mobos-redesign-delivery-qa/{320,390,1440}-{light,dark}-{entregas,100m}.png` (12 archivos fuera de Git). Se inspeccionaron visualmente escritorio claro y móvil oscuro además de las aserciones del navegador.

Los seis casos de presentación verifican datos reales de la demo existente (Lucía Franco, Juan Pereira y sus direcciones/artículos), filtros y selección anunciada, dos/una columnas, controles de al menos 44 px, disclosure por teclado, ambos temas y ausencia de overflow horizontal de página a 320/390/1440. Luego alteran exclusivamente una fila en el almacenamiento del navegador aislado para probar un nombre largo y total/saldo Gs 100.000.000, sin editar el fixture de negocio. Otro caso ejecuta asignación, reasignación y liberación demo. Dos casos API-mode interceptan todas las rutas API y observan payloads de asignación con/sin autorización, reasignación, liberación, rechazo HTTP 403, cancelación/confirmación de verificación y rechazo de rendición. No salen al backend.

### Evidencia histórica de preparación, conservada

- `preflight.log`: 9/9 aprobados antes de ampliar la prueba con verificar/rechazar rendiciones.
- `preflight-final.log`: 8/9, un fallo del nuevo escenario mock: al restablecer su rendición a PENDING y pulsar Actualizar, se recibió la lista vacía guardada por la caché GET corta del cliente. Se inspeccionó `src/lib/api/client.js` en lectura, sin modificarlo.
- Corrección solo del harness: recargar el navegador aislado tras reiniciar el mock, evitando sleeps, timeouts ampliados, cambios de caché o debilitamiento de aserciones. `preflight-corrected.log`: 9/9, 8,5 s. No se repararon fallos ajenos ni se ocultó la corrida fallida.

Puerto 5291 libre antes de iniciar la sesión Vite propia: `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`. Finalizada la suite, se detuvo exclusivamente la sesión propia 66822 con Ctrl-C (exit 130 de parada); puerto 5291 sin listener confirmado después. No se mataron procesos por puerto.

## Limitaciones y siguiente responsable

Prueba de frontend demo/mocks, no de backend/PG, permisos de servidor, auditoría financiera, CI, producción, impresión o envío externo. No se ejecutó auditoría completa WCAG/VoiceOver ni se afirma que todas las pantallas estén terminadas. El rediseño de Rendiciones, el panel de repartidor, Taller y Clientes siguen pendientes de otra autorización.

`skill_resolution: paths-injected` (registro ausente). Se leyeron antes de trabajar los paths exactos suministrados:
- `/Users/dariodeoli/.codex/skills/work-unit-commits/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/design-system/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/design/1.2.0/skills/accessibility-review/SKILL.md`
- `/Users/dariodeoli/.codex/plugins/cache/claude-cowork/engineering/1.2.0/skills/testing-strategy/SKILL.md`

Engram rechazó los guardados por múltiples sesiones runtime coincidentes; no se adivinaron IDs ni se cerraron sesiones ajenas. Las decisiones y evidencia quedan en este recibo.

## Rollback acotado

Retirar únicamente los hunks propios de presentación de `StoreDelivery.jsx`, el bloque de nueve casos añadido al final del spec, los nuevos `entregasF3.css`/`entregasF3.test.js` y este handoff. Mantener F1/F2/F3 anterior, handlers y cualquier modificación concurrente. No hacer reset ni restaurar archivos completos en un árbol compartido. No hay cambios de datos, esquema o dependencia que deshacer. El padre puede realizar su comprobación independiente de esta unidad y decidir un checkpoint separado; este trabajo no autoriza commit/push/deploy.

## Novedades para el dueño

- Los repartos muestran la dirección registrada, el cliente y los artículos completos en una presentación más limpia.
- En escritorio se ven dos pedidos por fila; en celular se apilan sin desplazar toda la página hacia los lados.
- El total, lo que falta cobrar y los cobros de calle sin verificar se distinguen con claridad, incluso para importes de Gs 100 millones.
- Asignar, reasignar y liberar siguen disponibles; la autorización de entrega con saldo conserva su control explícito y acceso por teclado.
- Es una mejora local sin publicar ni alterar ventas reales; Rendiciones y las demás pantallas no se presentan como rediseñadas.

## Independent final verification — 2026-10-11

Independent read-only verification against checkpoint `514e7f65`: focused Node 25/25, full frontend Playwright 57/57 with zero retries, and diff whitespace check passed. Previous 48 browser cases remain an exact prefix. Assignment/reassignment/release payloads, unpaid-authorization condition and settlement body remain unchanged; scoped CSS does not affect other modules. No severe candidate-caused findings identified. Parent inspected desktop light and mobile dark screenshots and ran the two focused presentation contracts successfully. Verification is frontend demo/mocks only; server authorization, persistence, reconciliation, CI and production are not certified. No push, merge or deployment performed.

## U5a — Rendiciones y panel del repartidor (rama codex/ui-u5-density)

- Rendiciones de la tienda, «Mis repartos» y «Mis rendiciones» del repartidor usan ahora las mismas tarjetas, chips y acciones de 44px que Entregas (`entregasF3.css`; `ChipsReparto.jsx` compartido). Listas de a 10 con «Cargar más» y «Mostrando X de Y» (bloque `shared/ListaDensa`).
- Sin cambios de acciones, permisos, endpoints ni testids: verificar/rechazar (motivo obligatorio, Esc cancela), En camino, Marcar entregado, Registrar cobro (Idempotency-Key) y Rendir.
- `entregasF3.test.js`: el hash de bytes de Rendiciones se reemplazó por contratos explícitos (verify/reject, testids, confirmación); se agregó un contrato para el panel del repartidor.
- Pruebas de navegador nuevas «U5a» (375 claro/oscuro y 1440): sin scroll horizontal, controles ≥44px, importes sin elipsis, Esc en rechazo y cobro.
- Límites: demo/mocks; Asignaciones y la tabla de pedidos no se tocaron; el panel conserva el shell existente.
