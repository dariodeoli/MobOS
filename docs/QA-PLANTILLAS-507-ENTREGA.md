# #507 · Entrega revisada de plantillas y adopción

Fuente final revisada: `b02d2522`, sobre `origin/main 2def9930` (v229).
Rama `codex/plantillas-507-api`. Este documento no publica ni modifica la versión.

## Unidad y commits

- `95a8ce26`: persistencia real, API, defaults por empresa/sucursal y validación declarativa.
- `7d9bdc17`: editor en mm, composición y PDF exacto, adopción en Productos.
- `bdefacd2`: QR de producto canónico HTTP(S), sin datos ficticios ni esquemas inválidos.
- `e9bed995`: adopción desde Stock mixto, Taller individual/estación/lote y comprobante de Pedidos.
- `b02d2522`: exportación con dueño por intento; cambiar nivel invalida A sin bloquear B ni liberar un intento posterior.

Contratos y evidencia histórica: `backend/tests/QA-PRINT-TEMPLATES-507.md`.
Adopción, matriz browser, RED→GREEN y límites: `docs/QA-PLANTILLAS-507-UI.md`.

## Gates finales

- QA independiente mapper: **APPROVE de la fuente exacta b02d2522**, comunicado por el integrador.
- FullFE final ejecutada por integrador: **1546/1546 PASS**, log de coordinación `work/507-final-b02-unit.log`. Esta verificación sustituye el fallo de Modal hallado y corregido en la primera corrida; no se declara verde aquella corrida previa ni se repite esta suite.
- Browser relacionados: **14/14 PASS**, puerto5364, un worker, sin capturas ni API de negocio. Incluye carrera determinista de PDF real y cambio de contexto.
- Relacionados unit: `plantillas.test.js` **24/24 PASS**. Full lint final exit0 (un warning existente fuera de alcance en DeliveryOperations), ESLint de DocumentoPlantilla final exit0. Build FE final exit0 (6.12s), salida fuera del checkout `/tmp/mobos507-busy-dist`.
- Backend validado de nuevo tras rebase a2def: `npm --prefix backend run build` **exit0**, `backend/.next/BUILD_ID` nuevo **aPVaQLDWBlz0IZZqk-dca**, creado16-10-2026 02:13:08 local. Log `work/507-b02-backend-build.log`.
- `npm --prefix backend run test:unit`: **332 PASS, 1skip existente, 0fail** de333, log `work/507-b02-backend-unit.log`.
- `npm --prefix backend run prisma:validate`: esquema válido.
- PostgreSQL exclusivamente local, cluster propio `work/pg507-api`, loopback5579, base ficticia `mobos507`. `prisma migrate deploy`: **233 migraciones, ninguna pendiente**. Migración `20270205120000_print_templates` reejecutada con `ON_ERROR_STOP`, exit0.
- `DATABASE_URL=<base aislada> npm run db:check`: **exit0**, base coincide con schema. SQL real de `prisma migrate diff --script`: **`-- This is an empty migration.`** Conservado en `work/507-b02-db-diff.sql`; logs `work/507-b02-db-check.log`, `work/507-b02-migrate.log`, `work/507-b02-migration-rerun.log`.
- `git diff 95a8ce26 HEAD -- backend` vacío completo: no hubo cambios de backend posteriores. Se conserva la evidencia anterior de **54 checks HTTP/PG** y **68 de validación** sin volver a ejecutar esa integración innecesariamente. No se presenta como una nueva corrida HTTP.
- El cluster propio se detuvo tras los gates. No DB de producción, variables reales, impresión física, cambios de agente, CI, versión o despliegue.

## Alcance aprobado y límites

Las plantillas y defaults se guardan realmente por empresa/sucursal mediante el
contrato autorizado. Las salidas operativas adoptan el mismo renderer y medio
físico del editor, con cantidades, seriales completos y builder premium intactos.
Una plantilla personalizada no se envía al agente incompatible; el operador puede
volver explícitamente al formato habitual y sus guardas previas.

**#507 continúa parcial.** No se incorporan aún certificados, informes, hojas de
estación, recepciones, manifiestos, listas de compra y demás kinds no contratados.
No se acredita calibración/consumible, escaneo físico, raster/TSPL/CUPS ni soporte
nuevo del agente. El recibo de regalo conserva su salida propia. Los comprobantes
de diferentes altos se exportan individualmente. La salida por impresora sigue
pendiente de la validación física correspondiente a #506.

## Novedades para el dueño

- Podés guardar diseños con sus medidas por empresa o sucursal y usarlos en etiquetas de Productos, Stock y Taller, además del comprobante de Pedidos.
- La vista previa y el PDF conservan el tamaño elegido y el contenido completo; cambiar de diseño o de nivel durante una descarga ya no deja los controles bloqueados.
