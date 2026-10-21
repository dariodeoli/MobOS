# #550 — agente de impresión opcional

La vista previa de reportes consultaba el agente al montar aunque estuviera
cerrada. Sin configuración también intentaba descubrir localhost. Un rechazo
se repetía después de cinco segundos entre consumidores.

La consulta del reporte ahora empieza al abrirlo. Sin impresora ni token no
se consulta el agente automáticamente; la detección explícita de Configuración
(`forzar: true`) sigue funcionando. Las peticiones simultáneas comparten el
sondeo y un fallo se conserva durante 60 segundos. La caché distingue contexto,
URL y token. La impresión por diálogo del navegador conserva su respaldo.

Validación local con proveedor HTTP simulado; ninguna prueba física:

- `node --test src/lib/printing/healthAgente.test.js`: 4 PASS.
- `npm test`: 1606 PASS.
- `npm --prefix backend run test:unit`: 347 PASS, 1 omitido.
- `npm run lint`: 0 errores, 1 advertencia previa.
- Builds frontend y backend exitosos, `backend/.next/BUILD_ID` presente.
- Prisma validate y `npm run db:check`: esquema conciliado con 237 migraciones
  aplicadas exclusivamente a un cluster PostgreSQL temporal y detenido al terminar.
- Playwright focal: reporte cerrado, apertura, fallback y reapertura durante
  enfriamiento; ruta localhost interceptada sin contactar una impresora.

Preparado en rama; esta evidencia no acredita integración ni publicación.

## Corrección de las regresiones de CI (#550 y #646)

La CI del primer PR detectó un alcance incorrecto de la guardia: también
suprimía la consulta de salud al imprimir con una impresora elegida por el
llamador y sin configuración global guardada. Eso desviaba documentos hacia
el camino remoto en lugar de enviar el trabajo al agente local. Se separó la
observación pasiva de una acción explícita de impresión; esta última permite
consultar el agente sin configuración global guardada.
No se cambiaron las expectativas de trabajos ni los mocks para esconder la regresión.

También se fijó el reloj del test de garantía #240 en la fecha de su fixture
(#646): su fecha de garantía vencía el21/10/2026 y dependía del reloj del equipo.
El reloj se restaura con el hook de limpieza del contexto del test, incluso
si una aserción falla. El comportamiento productivo no cambió por esa prueba.

Verificación de esta corrección:

- Helper de salud:5 PASS, incluida impresión explícita sin configuración global.
- Frontend unit:1608 PASS; backend unit:347 PASS y1 omitido.
- Playwright print513:10 PASS (envío local, copias, invalidación de contexto,
  rechazo tardío y respaldo); print550:1 PASS (reporte cerrado y agente ausente).
- Builds frontend/backend con BUILD_ID, Prisma y lint sin errores.
- db:check contra PostgreSQL descartable de este worktree: coincide con schema.
- Playwright de documentos/informes/recepción/cierre:23 PASS al primer intento,
  contra ese cluster aislado y con el agente interceptado, sin impresión física
  ni consultas de producción.

Novedades para el dueño:

- Los reportes cerrados dejan de buscar una impresora local.
- Al solicitar una impresión se conserva la detección del agente y sus copias.
- Si no hay agente, sigue disponible el respaldo del navegador.


## Revisión del candidato239: agente recién iniciado

La revisión detectó otro caso: después de una consulta fallida, la caché negativa
podía demorar durante un minuto una impresión explícita aunque el agente ya
hubiera arrancado. La acción explícita ahora vuelve a consultar sólo cuando la
salud guardada es negativa. La observación pasiva conserva los60 segundos de
enfriamiento, la salud positiva conserva cinco segundos y solicitudes simultáneas
siguen compartiendo una petición en curso.

Se agregó una regresión de helper y otra de navegador con el ciclo agente ausente
→ agente disponible → impresión local inmediata. Ambos fallaron antes del arreglo
(helper no reintentaba; navegador devolvía ok:false y no enviaba el trabajo).
Las expectativas no se redujeron y toda la red local fue interceptada; ninguna
impresora física se contactó.
