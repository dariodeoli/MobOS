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
