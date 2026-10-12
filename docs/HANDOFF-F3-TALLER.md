# Handoff — F3 Taller: lista de reparaciones y avance verificable

Fecha: 2026-10-11. Worktree: `/Users/dariodeoli/Documents/GitHub/MobOS-nav-v2`.
Rama: `codex/mobos-nav-v2`. Entrada limpia, HEAD comprobado: `11cb29d28bf6c007874f64cf3d9f4b97e176516b` (checkpoint local de Clientes).

## Alcance y autorización

Continuación aprobada por el usuario: un único escritor, sin delegación, SDD, revisión nativa, commit, push ni deploy. Se leyeron AGENTS.md, REDESIGN.md §0/§7.14, reglas de listados y handoffs previos. Prevalece la excepción explícita del usuario sobre la referencia: no sustituir los ocho estados reales por cinco estados de negocio ni rediseñar Tablero/Garantías/Trade-In. Todo y la entrada de conversión de garantía permanecen disponibles; no se modifica navegación compartida.

Archivos propios de esta unidad:
- `src/components/control/ServicioTecnico.jsx`: encabezado, lista, pequeños ajustes del detalle y resultado explícito del avance.
- `src/components/control/tallerF3.css`: estilos exclusivos de la lista y las acciones del detalle (incluido el pie portaleado).
- `src/lib/tallerAvance.js`: clasificación de resultado de mutación, actualización y selección por lote.
- `src/lib/tallerF3.test.js`: siete contratos de regresión e invariantes.
- `e2e/frontend/nav-v2.frontend.spec.js`: once casos añadidos al final, sin modificar los 76 anteriores.
- `docs/HANDOFF-F3-TALLER.md`: este recibo.

No se modifican API/backend, motor financiero, costos de reparación aplicados una sola vez, repuestos/inventario, fixtures económicos, dependencias, componentes compartidos ni otros módulos. Los contratos comparan con el checkpoint los bytes de guardar/payloads/desglose/totales, catálogo/checklists/impresión, editor y formulario original. Las transiciones siguen procediendo exclusivamente de SIGUIENTE_SERVICIO.

## Causa raíz y corrección acotada

En el checkpoint, `avanzar` (líneas 490–511 del contexto reportado) atrapaba el error de PATCH, mostraba un toast y no devolvía resultado. `avanzarSeleccionadas` esperaba todas las llamadas, vaciaba toda la selección y anunciaba `filas.length` como órdenes avanzadas, aunque ninguna mutación hubiera sido confirmada. Además, `load` capturaba el error de GET sin comunicarlo al llamador.

Ahora cada intento devuelve `advanced`, `failed` o `skipped`. Un PATCH resuelto es la frontera de confirmación; su GET posterior es otra frontera. El GET devuelve éxito/fallo explícito y evita la caché corta (`cacheMs: 0`). Tras confirmar el PATCH se conserva el nuevo estado local, aun si falla la lectura, para no ofrecer de nuevo la misma transición. El lote elimina únicamente IDs confirmados; fallidos, terminales y seleccionados fuera de la vista permanecen seleccionados. Estos últimos no se envían ni se cuentan como avanzados. Los controles de avance y selección se bloquean durante la operación para evitar doble envío desde la interfaz; no se afirma idempotencia del servidor.

Se conserva el PATCH exacto `{ id, status }` a `/api/service-orders`, sin endpoint, transición, cargo ni semántica financiera nuevos. Un resultado confirmado se distingue de persistencia real: el mock únicamente observa respuestas y payloads, no valida una transacción de backend. Los errores son parte de la presentación: resultado persistente con `role=status`/`aria-live=polite`, más toast, sin un éxito global inventado.

### Feedback exacto probado

- Mixto: `1 orden avanzada. 1 falló; conserva la selección para reintentar.`
- Todo falla: `0 órdenes avanzadas. 2 fallaron; conserva la selección para reintentar.`
- Terminal o fuera de vista: `1 orden avanzada. 1 sin avanzar (fuera de la vista o sin estado siguiente).`
- PATCH confirmado/GET fallido: `1 orden avanzada. El cambio se guardó, pero no se pudo actualizar la lista. Actualiza antes de continuar.`

## Presentación y accesibilidad

Nueva orden es la única acción principal del encabezado; Catálogo de servicios es secundaria. Actualizar vive con las herramientas de búsqueda y filtros. Cargar catálogo sugerido se conserva dentro del catálogo cuando está vacío. Se mantienen búsqueda, filtro de etapa, filtros avanzados, todas las claves/direcciones de ordenamiento, selección visible/individual, totales de filas en pantalla, WhatsApp y los handlers originales de nueva orden/detalle.

La grilla mínima de 65 rem se sustituye por filas planas: una columna en móvil y dos desde 1100 px. Modelo y cliente completos envuelven; precio/utilidad mantienen cifras completas, incluso Gs 100.000.000. El detalle muestra la identidad sin truncar y conserva inspección, diagnóstico, costos, etapas y acciones. El modelo es un botón semántico que abre por teclado; Escape devuelve el foco. Targets de acciones/labels de selección de 44 px, usando tokens existentes en ambos temas, sin cambios del shell. No se certifica una auditoría WCAG completa ni VoiceOver/NVDA.

## Comprobaciones finales

Normalización con Prettier del código nuevo, CSS/tests y sufijo del harness. Se preservan bloques legacy de negocio y prefijo del spec; no se aplica formato global. Tras la inspección visual se amplió el ancho útil del buscador móvil antes de normalizar por última vez. Ningún normalizador mutante corre después de los checks siguientes; solo se completa este recibo.

| Comando exacto | Resultado observado |
| --- | --- |
| `npm run lint` | Exit 0; cero errores. |
| `npm run build` | Exit 0; 16,07 s; warning existente de chunks >500 kB, sin ampliar el alcance. |
| `npm test` | Exit 0; 990/990, cero fallos/cancelados/omitidos; 21.684,391125 ms. |
| `node --test src/lib/ciHarness.test.js src/lib/shellNavigation.test.js src/lib/orderDetailNavigation.test.js src/lib/inicioPosF2.test.js src/lib/ventasF3.test.js src/lib/entregasF3.test.js src/lib/clientesF3.test.js src/lib/tallerF3.test.js` | Exit 0; 37/37 (30 anteriores + 7 nuevos), cero fallos/cancelados/omitidos; 3.414,730833 ms. |
| `npx --no-install playwright test --config e2e/nav-v2.frontend.config.js` | Exit 0; 87/87 (76 anteriores + 11 nuevos), un worker, retries 0; 4,6 min. |
| `git diff --check` | Exit 0. |

Logs finales: `/tmp/mobos-redesign-taller-qa/{lint,build,test,focused,playwright}.log`.
QA adicional de teclado (`keyboard-tab.log`, exit 0): Tab recorre los seis controles del pie del detalle dentro del diálogo; Enter abre Nueva orden/detalle, Escape cierra y restaura foco. No se activan impresión ni envíos externos.
Comprobación puntual posterior: `node --test src/lib/tallerF3.test.js`, 7/7, 190,363292 ms (`spot-check.log`).
Los 76 casos anteriores son prefijo idéntico byte por byte: SHA-256 `84b409aaeadfc9e73cac76d13893cae5ad240a9472b08ed6374f2f93adf565b1`.
Capturas: `/tmp/mobos-redesign-taller-qa/{320,390,1440}-{light,dark}-{list,detail,100m}.png` y `bulk-{mixed,all-fail,terminal,nonvisible,refresh-fail}.png`, fuera de Git. Se inspeccionaron visualmente escritorio claro y móvil oscuro; el navegador verifica geometría/importe completo y ausencia de overflow horizontal de página y contenedor.

Los seis casos visuales usan los datos de demo originales, ambos temas, tres anchos, teclado en Nueva orden/detalle/acciones, búsqueda, orden, filtro avanzado y catálogo. Para el límite Gs 100 millones y nombres largos se modifica exclusivamente una orden existente en la memoria de una pestaña aislada; no se altera el fixture económico. Los cinco casos API-mode interceptan todas las rutas API y bloquean acceso externo; prueban payloads PATCH, selección retenida y feedback exacto. No son evidencia de persistencia, permisos ni backend.

### Historial de preparación y fallos conservados

- `preflight.log`: falló la búsqueda de Recepción dentro de `taller-detalle`. Se confirmó en la biblioteca existente que FormActions se monta por portal en el pie del Drawer, fuera de ese nodo. Se detuvo la corrida propia (exit 130) para no repetir la aserción incorrecta. Corrección del locator al diálogo y clase exclusiva del pie para asegurar targets de 44 px sin modificar componentes compartidos. `preflight-corrected.log`: 11/11.
- `normalized-preflight.log`: el contrato adicional de Gs 100 millones en el detalle detectó `white-space: normal` en el importe; se aplicó nowrap únicamente a cifras de costos del detalle. El contrato Node de literal PATCH detectó además que la primera normalización no había cargado `.prettierrc.json`; se repitió la normalización con la ruta real del archivo, manteniendo todos los bloques legacy protegidos. `normalized-node.log`: 7/7. `normalized-corrected.log`: 11/11.
- Una comprobación preliminar conjunta fue detenida antes de la última mejora visual del buscador; lint/build habían salido 0, pero el test interrumpido NO cuenta como aprobado. Los resultados finales corresponden exclusivamente a los logs de la tabla.

## Servidor local, límites y siguiente responsable

Puerto 5291 libre al inicio. Servidor propio: `VITE_API_URL=http://127.0.0.1:5291 npm run dev -- --host 127.0.0.1 --port 5291 --strictPort`, sesión 8878. Detenido únicamente el servidor propio con Ctrl-C (exit 130); puerto 5291 sin listener confirmado al finalizar. No se mataron procesos por puerto.

No hubo commit/push/deploy, revisión nativa ni delegación. HEAD no debe cambiar por esta unidad. El árbol se entrega sin commit, preservando trabajo previo; no se hizo reset/restore. Engram rechazó el guardado por múltiples sesiones runtime coincidentes; no se adivinaron IDs ni se cerraron sesiones ajenas. Evidencia y decisiones quedan en este handoff.

Se completa únicamente lista/encabezado/detalle acotado de Reparaciones y veracidad del avance, NO todo Taller. Tablero, Garantías, Canjes, conversión desde Todo, impresión externa, backend/PG, conciliación, CI y producción quedan fuera de esta verificación. El padre puede comprobar esta unidad y decidir el checkpoint posterior; esta entrega no autoriza publicación.

## Rollback acotado

Retirar solo los hunks propios de ServicioTecnico.jsx (presentación, import de CSS/helpers, resultados de avance y retornos/caché de load), los nuevos tallerF3.css/tallerAvance.js/tallerF3.test.js, los once casos del sufijo del spec y este recibo. Conservar todas las unidades anteriores de navegación/Inicio/Ventas/Entregas/Clientes y cualquier edición concurrente. No restaurar archivos completos ni hacer reset en un árbol compartido. No existen datos, migraciones ni dependencias que deshacer.

## Novedades para el dueño

- Las reparaciones muestran cliente y modelo completos, con importes legibles y sin desplazar la página lateralmente en celular.
- Nueva orden queda como acción principal; actualizar, buscar, filtrar y catálogo siguen disponibles.
- Avanzar varias órdenes informa solo los cambios confirmados y conserva las fallidas para reintentar.
- Si el cambio se guardó pero no se pudo actualizar la lista, se avisa explícitamente sin presentar un fallo de guardado.
- Es una mejora local de Reparaciones, todavía sin publicar; las demás vistas de Taller no se presentan como rediseñadas.

## Revisión independiente y checkpoint local

El verificador independiente confirmó 37/37 contratos y 87/87 casos de navegador, sin findings causados por el candidato. Los 76 casos previos y los bloques de negocio protegidos permanecen idénticos. Comprobó además PATCH demorado, selección bloqueada y transición siguiente tras fallo de refresco, así como Tab/Escape en el detalle. El padre repitió `node --test src/lib/tallerF3.test.js`: 7/7, e inspeccionó capturas 390 oscuro y 1440 claro. Puerto propio liberado; sin prueba de backend, CI ni producción. Recibo actualizado sin mutar el código verificado. Checkpoint local posterior; no push, merge ni deploy.
