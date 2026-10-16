# #507 · API/persistencia de plantillas, fase 1

Base fd1135c9. Rama codex/plantillas-507-api. Esta unidad no cambia frontend, PrintPrinter, PrintJob, transporte, artefactos de agente ni publicación 229.

## Contrato para frontend

Autenticación normal requireSession. Falta sesión 401; escritura no ADMIN 403. Tenant siempre de sesión, nunca del body. Plantillas compartidas por empresa y tipo. Defaults pueden ser empresa o sucursal; sesión con branchId solo puede consultar/escribir defaults de esa sucursal, no company u otra. Sesión sin branchId puede company o sucursal activa propia. Leer plantilla ajena devuelve 404. No se conceden nuevos roles.

- `GET /api/print/templates?kind=` → `{templates:[Template],presets:[{kind,name,definition}]}`. Kind opcional; enum cerrado.
- `POST /api/print/templates` body `{kind,name,definition}` → Template directo, 201.
- `GET /api/print/templates/:id` → Template directo.
- `PATCH /api/print/templates/:id` body `{revision,name?,definition?}` → Template directo; aumenta revision, conflicto 409 si otra sesión cambió.
- `POST /api/print/templates/:id` body `{revision,action:"duplicate",name?}` → nueva Template directa, 201, revision1. O `{revision,action:"restore"}` → misma Template con definición premium incorporada del kind, conserva nombre e incrementa revision.
- `DELETE /api/print/templates/:id` body `{revision}` → `{deleted:true,id}`; archivo lógico, quita defaults que apuntan a ella. No se destruye historia.
- `GET /api/print/templates/defaults?kind=&branchId=` → `{defaults:[{kind,branchId,templateId}],effective:{[kind]:{templateId,source}}}`. Sin branchId usa sucursal de sesión; vacío solicita empresa. Incluye company y branch elegida, no todas las sucursales. `source` = branch/company/builtin; builtin tiene templateId null. Frontend resuelve builtin usando presets por kind.
- `PUT /api/print/templates/defaults` body `{kind,branchId:null|string,templateId:null|string}` → asignación directa `{kind,branchId,templateId}`. branchId explícito obligatorio; null templateId elimina override, conserva fallback. Tipo/tenant/archivo validados antes de asociar.

Template = `{id,kind,name,revision,definition,createdAt,updatedAt}`. No expone actor/tenant/archivedAt ni campos de negocio. Tipos iniciales: `comprobante`, `etiquetas-producto`, `etiquetas-stock`. Presets canónicos/paridad JS: `backend/tests/fixtures/print-templates-507.json`; producción `backend/lib/print-templates-presets.json` validado en runtime. Test exige igualdad exacta.

Definition schemaVersion1: `page:{widthMm,heightMm,orientation,margins:{top,right,bottom,left}}`, `profile:{deviceFamily,output,dpi,printableWidthMm,offsetXmm,offsetYmm}`, `elements:[{id,binding,type,xMm,yMm,widthMm,heightMm,fontSizePt,alignment,rotation,visible}]`. Ningún otro campo permitido. Sin campos para valores reales, texto libre de documento, HTML/CSS/JS, URL ni rutas locales. Solo name de configuración admite letras/números/separadores simples, 1–80.

Coordenadas/cajas físicas finales siempre dentro widthMm×heightMm; orientation0/90 no cambia alimentación ni MediaBox. Caja final incluye rotación local0/90/180/270. Márgenes y ancho imprimible acotan, no escalan silenciosamente. Elementos visibles no se superponen. Tipos text/block/logo/qr/barcode ligados a bindings específicos. Comprobante mantiene brand/documentTitle/documentNumber/items/total/nonFiscal/qr/customer/payments/warranty/date visibles; frontend conserva flow premium y semántica de ausencia real. Producto mantiene product/sku/barcode; price/brand/qr opcionales. Unidad mantiene model/serial/qr/barcode; brand/condition/battery/location/supplierCode opcionales. El motor de contenido existente sigue decidiendo qué dato aplica; una binding no autoriza ver otros datos.

Números finitos, tipo number, hasta2decimales; ancho5–216, alto10–2000 o null solo comprobante; márgenes0–40, tipografía6–48pt, 1–40elementos. QR cuadrado≥10mm, barras≥15×5mm. No acreditan escaneo físico ni reemplazan medición real del renderer. Brother: medio12–62/ancho útil≤58/alto≤1000/DPI300; 3nStar: medio25.4–115/útil≤108/alto≤1778/DPI203; Star/ZKP medio58 u80, Star203. Generic documento; Brother documento/Raster; 3nStar documento/TSPL; Star documento/Star Graphics; ZKP documento/ESC/POS. Guardar perfil no acredita soporte del agente ni prueba física.

Máximo200plantillas activas por empresa, body≤64KiB leído con límite streaming antes JSON. Defaults únicos `(tenantId,scopeKey,kind)` sin ambigüedad NULL; cambios serializados por advisory lock transaccional por empresa, con revisión en plantilla. Cambios/configuración auditados actor+fecha+tipo/revisión/campos modificados, sin nombres/valores de documentos ni tokens.

## Verificación y reproducción aislada

- `npm ci --no-audit --no-fund` dentro backend: dependencias propias; no compartir node_modules/.next.
- Cluster PG dedicado creado vacío en `work/pg507-api`, puerto5579, base ficticia mobos507; no env/prod. `prisma migrate deploy`: 233 migraciones aplicadas desde cero; nueva 20270205120000_print_templates reejecutada correctamente.
- `node backend/tests/run-print-templates.cjs`: 68 checks PASS (paridad, inyección/valores, tipos, dispositivos, geometría, rotaciones, campos premium protegidos).
- `DATABASE_URL=postgresql://dario@127.0.0.1:5579/mobos507 node backend/tests/print-templates-pg.cjs`: 54 checks HTTP/PG PASS. HTTP loopback3197, handlers reales, sesiones reales, Prisma/PG real. CRUD/lectura posterior/duplicar/restaurar/archivo, A/B, branch, roles, audit, JSON/body inválido, defaults y edición concurrente. El test exige URL dedicada antes de escribir y elimina solo tenants que creó.
- `npm --prefix backend run test:unit`: una corrida final, 332 PASS/1skip existente; además pruebas tradicionales del runner, incluyendo las nuevas validaciones. Sin suite frontend ni DB/prod.
- `npm --prefix backend run build`: exit0, `.next/BUILD_ID` creado; `npx tsc --noEmit --pretty false`: exit0. Prisma validate: válido.
- `DATABASE_URL=... npm run db:check`: base coincide con schema. SQL guardado en `work/507-db-diff.sql`: `-- This is an empty migration.`
- ESLint del repo excluye backend explícitamente; no se presenta como lint aplicado al TS. El build/typecheck son la verificación TS real de esta unidad.

## Criterios y límites

PASS: persistencia real, tipos iniciales, duplicar/renombrar/restablecer/archivar, defaults transaccionales por empresa/sucursal, revisión409, aislamiento/ADMIN/auditoría, geometría declarativa, presets/paridad, migración reejecutable y sin drift.
Pendiente del writer frontend: editor/preview/render/productivo/PDF/adopción/lotes. Pendiente #506: capability de salida real y calibración de consumibles. No hay impresión ni nuevas capacidades de transporte en esta fase; no cerrar #507 por API sola. Medidas temporales conocidas Brother25×90 y3nStar110×60, editables; código DK/área útil/calibración física pendientes.

## Novedades para el dueño

- Las plantillas y sus medidas ya pueden guardarse por empresa y recuperarse desde otro dispositivo.
- Se puede duplicar, renombrar y volver al diseño incorporado, con aviso si otra sesión editó antes.
- Cada sucursal puede elegir su plantilla predeterminada sin mezclarla con otra empresa.
- La impresión física sigue siendo una validación separada; esta entrega prepara la configuración y no envía trabajos a impresoras.
