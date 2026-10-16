# CI230 — impresión remota, unidades y Traslados

Base exacta `0331b606`, rama aislada `codex/print-ci230`. Refs #513/#514. Sin push, producción, transporte físico ni cambios en permisos, tokens, raster o tamaño máximo.

## Causas acreditadas y cambios

1. **Comprobantes remotos: contaminación de fixtures, no pérdida de cola.** Artifacts del run38862114735/shard2 muestran POST`/api/print/jobs`201 y trabajo PENDIENTE con el puente esperado, pero destino`lan:192.0.2.99:9100`/nombre«Raster E2E» de etiquetas-unidad. El fixture remoto era predeterminado global sin sucursal; el router prioriza correctamente impresoras de la sucursal. Los dos tests ahora declaran sucursal activa/default para su impresora y restauran ambas asignaciones en finally. Conservan destino, QR exacto contra token emitido, copias, puente, un trabajo, guarda duplicado y cero diálogos.
2. **Unidades: lectura instantánea de DOM transitorio.** CI devolvió orden[] después de seleccionar, sin llegar a imprimir; retry pasó. El oráculo ahora espera con expect.poll estándar que existan las dos filas, exige el conjunto exacto de seriales y contrasta el orden de píxeles QR con el observado. No se suben timeouts ni se omite un serial.
3. **Traslados con impresora: fixture sin capacidad declarada.** El trace3 muestra el rechazo explícito«requiere ZKP8008»; ese camino sigue siendo directo, no abre selector nuevo. Se declara el perfil ZKP8008/80 del fixture, se decodifican los QR desde el raster real y se exigen captura única/cortes/copias/seriales. Se conserva recepción, ETA y disponibilidad del destino.
4. **Sin impresora: regresión real del respaldo HTML.** La factory se ejecutaba con impresora null, producía preparacion-documento y bloqueaba el respaldo HTML existente. Se agrega únicamente un retorno sin-impresora antes de factory y DESPUÉS del guarda de contexto. Así no se intenta raster ni se crea trabajo; printLabels conserva el mismo HTML80 del documento. Una impresora existente de modelo desconocido sigue rechazada y nunca cae silenciosamente al formato antiguo.

## RED → GREEN y oráculos

- `work/ci230-print-causal-red.log`: sin cambiar fuente, etiquetas-unidad seguido de los dos comprobantes reproduce2FAIL/1PASS. Se preservaron artifacts2/3 bajo `work/ci230-0331-artifact{2,3}`; sólo datos ficticios del arnés.
- `work/ci230-no-printer-red.log`: browser causal anterior al fix falla expected sin-impresora / received preparacion-documento. El test usa printLabels real, no un mock del botón.
- `work/ci230-print-browser-green.log`: **10/10 PASS**. Incluye QR real de comprobante y lote, ZKP declarada, desconocidos rechazados, ausencia de impresora sin ejecutar factory/cero jobs y HTML2etiquetas, y cambio de contexto durante búsqueda sin destino que impide tanto envío como respaldo. Se mantienen A→B/A→B→A durante raster y rechazo local→remoto.
- `work/ci230-print-targeted-green.log`: primera corrida conjunta **28PASS/1FAIL**,0flaky. El fallo fue un oráculo NUEVO de Traslados que suponía orden de creaciónA,B; el consumidor recibe el listado de inventario ordenado por status/updatedAt y usabaB,A. No falló el raster ni faltó una unidad.
- Oráculo final de Traslados obtiene el orden de entrada desde GETinventory-units independiente, lo filtra a los dos seriales y exige conjunto exacto; no llama unidadesDeTransferencia ni ordena la salida para esconder diferencias. `work/ci230-print-transfers-final.log`: **5/5 PASS**,0flaky. Los otros **24/24 casos** de Unidades+Remota ya pasaron en la corrida conjunta; quedan los29casos cubiertos en verde entre ambas ejecuciones, sin afirmar29/29 en una única corrida.
- Ejecución aislada: PG5591/API3210/WEB5404, base mobos_ci230_print, cluster `/tmp/mobos-e2e-pg-ci230-print`; teardown detuvo exclusivamente servicios propios. Backend dev propio, sin compartir .next ni tocar servidores del integrador.
- `work/ci230-print-full-fe-unit.log`: **1562/1562 PASS**, única corrida completa final. `ci230-print-unit-focused.log`:6/6 PASS. Lint0errores/1warning previo DeliveryOperations42; FEbuildPASS; node --check de los4specs y diffcheckPASS. Backend/schema no cambian; no se repiten BE/Integration globales de la base ya acreditada por root.

## Novedades para el dueño

- Sin impresora configurada, las etiquetas del lote vuelven a ofrecer el documento HTML/PDF80 con el mismo diseño y las dos unidades, sin mandar nada a un equipo.
- Las pruebas distinguen la impresora de cada sucursal y comprueban el QR y los seriales del artefacto enviado, conservando el bloqueo de duplicados y la recepción del lote.

No acredita papel/firmware real ni agrega compatibilidad de Brother, Star o TSPL. Guards/publicador del candidato siguen bajo control exclusivo del integrador.
