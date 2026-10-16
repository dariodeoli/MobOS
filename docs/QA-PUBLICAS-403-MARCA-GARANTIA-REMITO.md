# #403 — marca autorizada en Garantía y Remito públicos

## Unidad y contrato

Base `87332389`; rama `codex/public-brand403`. No cambia la publicación 230 congelada.

- Garantía y Remito agregan únicamente `company: { name, logo }` a su DTO público; no exponen tenantId, nombres de proveedores, costos, hashes ni notas internas.
- Documento y `/logo` comparten resolver. La empresa sale de la fila autorizada, nunca de parámetros del navegador. Garantía conserva resolución hash/legacy y backfill solamente en su GET original; una garantía vencida continúa consultable. Remito conserva normalización de token y recepción idempotente existentes.
- Logo: light/dark con fallback de variante existente; PNG/JPEG/WebP, `nosniff`, `no-store`. Token inválido/revocado o logo ausente/inválido: 404 sin caché. La falta de logo deja nombre y documento legibles.
- La UI usa CabeceraTienda; oculta datos anteriores desde el primer render al cambiar token y descarta GET tardío. Cada URL de imagen recrea su cabecera para evitar que errores o imágenes del documento A contaminen B. Observador de tema con cleanup. Demo de garantía no consulta el logo real.

## Evidencia ejecutada

| Gate | Resultado |
| --- | --- |
| `env -u DATABASE_URL -u DIRECT_URL node backend/tests/public-pages403-pg.mjs` | 181 comprobaciones PASS; PG propio temporal/puerto automático y cleanup |
| `npx playwright test --config=e2e/public-brand403.frontend.config.js` | 10/10 PASS; Chromium local 400px, claro/oscuro, sin capturas ni red real |
| `npm test` | 1562/1562 PASS, única ejecución final |
| `npm --prefix backend run test:unit` | 332 PASS, 1 skip SQL previo; 0 fallos |
| `npm run lint` | 0 errores; warning previo DeliveryOperations.jsx:42 |
| `npm run build` | PASS |
| `env -u DATABASE_URL -u DIRECT_URL npm --prefix backend run build` | PASS; BUILD_ID presente |
| `git diff --check`; búsqueda de marcadores | PASS |

PG incluye los 117 checks anteriores y nuevos canarios: dos empresas con bytes de logos distintos; query tenantId ajena ignorada; ambas variantes y fallback; legacy32 y hash64; sufijo ÿ exacto rechazado; revocación; expiración; backfill no ejecutado por logo; MIME inseguro; ausencia de logo. Conserva pruebas de recepción/auditoría y no exposición de notas. Las primeras preparaciones fallaron por cliente Prisma no generado y fixture de traslado con sucursal origen=destino; se corrigió el arnés, sin debilitar constraints ni assertions.

Browser prueba marca/tema sin cambiar estado (garantía vencida y remito recibido), imagen 404 recuperable en otro token y cuatro carreras: GET A o imagen A demorados después de abrir B. Primera ejecución: 4 PASS/6 FAIL por escapes de selectores en test; corregidos y los diez casos finales pasaron. No hubo fallo funcional de producto en esa ronda.

## Integración y límites

- El arnés PG ya está enganchado a `backend/tests/integration-http.sh`; no se ejecutó el HTTP global en esta unidad. El nuevo spec Chromium tiene config dedicada; el integrador debe añadirlo al gate de CI correspondiente si desea ejecución automática.
- No migración, esquema, permisos de productos autenticados, configuración de producción, impresión ni builder modificados. No se prueban documentos/clientes reales, Safari físico, VoiceOver ni papel.
- #403 sigue parcial globalmente: esta evidencia cubre marca de estas dos páginas, no acredita contratos o despliegues de las otras rutas.

## Novedades para el dueño

- Garantías y remitos muestran el logo y nombre de la empresa que autorizó el enlace, con variante clara u oscura.
- Si falta la imagen, el documento continúa visible; al cambiar de enlace no se conserva la marca de la empresa anterior.
- Los enlaces y la confirmación de recepción mantienen su comportamiento anterior.
