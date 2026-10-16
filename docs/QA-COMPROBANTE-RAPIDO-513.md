# Comprobante rápido de Vendidos — #513 / #402

Unidad posterior a 230/231, base `d9923230`, rama `codex/print-restantes-513`.
Inicio: fetch y rebase sobre `origin/main` `2def9930`, sin conflictos, conservando la base pendiente. Sin push, release, impresión física ni servicios externos.

## Causa y cambio acotado

`impresionStock.printQuickReceipt` enviaba `ticketComprobante` ESC/POS monoespaciado aunque el respaldo/previsualización usaba `OrderReceipt` premium. El RED lee los bytes realmente enviados al agente y falla al encontrar comandos del formatter antiguo, no imágenes raster (`Comando inesperado en 11: 27`).

Ahora construye una sola vez `buildOrderReceiptHtml` nivel rápido y usa exactamente ese HTML para `ticketsDesdeHtml` o el respaldo manual autorizado. No reconstruye el documento después de fallar el transporte. La búsqueda de consumidores exactos de `ticketComprobante` en `src` deja solamente la declaración legacy, sin llamadas de producto; recepción usa otro builder y queda fuera de esta unidad.

La revisión de contexto se captura antes del primer await del hook, incluyendo `inventoryUnits.list` que completa el pedido ausente en la fila resumida. Se conserva hasta pedir el token impreso y preparar HTML/raster. El consumidor descarta mensajes del contexto anterior. El agente existente vuelve a validar antes de enviar o intentar el fallback remoto. A→B→A también invalida la revisión.

## Criterios acreditados

| Criterio | Resultado / evidencia |
| --- | --- |
| Mismo diseño rápido premium | PASS: comparación exacta del HTML capturado por el renderer con el builder común; conserva título, documento no fiscal y Gs 1.000.000. |
| QR real desde píxeles enviados | PASS: parser independiente GS v 0 + jsQR decodifica `/pedidos/<token32>` exacto; no se modifica, recorta ni normaliza el token. |
| Local, remoto, copias y duplicado | PASS: un trabajo, corte único, dos copias en fixture focal; conflicto remoto no dispara respaldo ni reimpresión automática. Remoto usa API interceptada, no hardware ni cola productiva. |
| Contexto en order/token/logo | PASS: tres carreras A→B→A sin envíos ni diálogo. Un POST de token ya iniciado no se presenta como cancelable. |
| Contexto durante fallo local | PASS: cambia A→B→A con respuesta local retenida; no encola remotamente ni abre respaldo. |
| Contexto antes de resolver unidad | PASS con PG/API aislados: retiene GET real `inventory-units`, cambia A→B→A; cero POST `access-tokens`, cero trabajos, cero feedback viejo; nuevo intento imprime correctamente. |
| Sin impresora / desconocida | PASS: ausencia conserva HTML manual de 80 mm; modelo desconocido rechaza explícitamente sin formatter antiguo ni respaldo automático. |
| Vendidos sin abrir ficha | PASS con PG: un raster, QR del token emitido por API, copia única, importes intactos, fila visible y ningún diálogo de ficha. |

## Verificaciones y límites

- RED: `work/print-restantes-red.log`, contra la fuente anterior al parche.
- Browser sin DB: 8/8 (`work/print-restantes-browser-green.log`) + caso nuevo de fallback contextual 1/1 (`work/print-restantes-fallback-context.log`), configuración `e2e/quick-receipt513.frontend.config.js`, puerto 5405.
- PG 5592 / API 3211 / web 5406: primera corrida 2/3; el tercer caso falló por la nueva aserción de test `copies` en vez del contrato local `copias`. Corregida exclusivamente esa propiedad, retest afectado 1/1 PASS (`work/print-restantes-pg.log`, `work/print-restantes-pg-raster-retest.log`). Los tres casos quedan acreditados entre ambas corridas, no una corrida conjunta 3/3. Harness detenido al terminar.
- Full FE ejecutado una vez: 1562 PASS / 1 FAIL (`work/print-restantes-unit.log`). Único fallo heredado `ciHarness.test.js`: distribución de shards sin asignar `fotos-producto.spec.js`; no se alteró CI ni fotos para ocultarlo. Integrador informado.
- Lint: 0 errores, 1 warning previo `DeliveryOperations.jsx:42`; build FE exit 0 (`work/print-restantes-lint.log`, `work/print-restantes-build.log`). Backend/API/schema sin cambios; no se repitieron suites BE ni bases compartidas.
- Impresión directa mantiene la capacidad declarada existente: ZKTeco ZKP8008 de 80 mm. No acredita Brother, Star, TSPL, impresoras desconocidas, DPI físicos ni calidad del rollo. Esas salidas necesitan su perfil/transporte correspondiente (#506).
- Sin acceso a pedidos reales, OwnData, LAN, puentes instalados ni producción. El QR usa fixtures ficticias y tokens generados solamente en PostgreSQL aislado.
- Ubicación, remisión, regalo, recepción y otras hojas no se migran aquí. #402/#513 no se declaran cerrados globalmente por esta unidad.

## Novedades para el dueño

- El comprobante rápido de Vendidos conserva el diseño premium al enviarlo a la impresora compatible, con el mismo QR e importes de su documento HTML.
- Cambiar de empresa mientras se prepara una impresión cancela ese intento; sin impresora configurada se mantiene el respaldo manual del mismo diseño.
