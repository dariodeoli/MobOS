# Páginas públicas restantes — #403

Cobertura dedicada: Cuenta, Carrito, Producto, Informe, Remito, Alternativa, Portal del cliente y Entrada del portal. Configuración `e2e/publicas-extra.frontend.config.js`; Vite local 5304, sin backend/base ni hosts productivos.

## Criterios

| Criterio | Resultado y alcance |
| --- | --- |
| Ocho vistas × 360/390/1440 × claro/oscuro | PASS:48 casos con datos, cantidades, seguimiento y montos coherentes. Tema real de HTML y color computado, fuentes listas y transiciones terminadas. |
| Producto anónimo/autenticado | PASS: seis casos adicionales anónimos sin consultas a `/api/products`; autenticado consulta SKU y muestra precio completo. Guard existente intacto. |
| Sin scroll horizontal ni texto recortado | PASS en la matriz; se miden rangos de texto y recortes dentro de contenedores, no solo viewport. |
| Objetivos de 44 px y texto ≥12 px | PASS en los tres anchos. La superficie táctil compartida `::after` cuenta como área de activación; texto solo para lectores de pantalla no se mide como texto visual. |
| Contraste≥4.5 | PASS del texto activo con colores CSS compuestos, incluso títulos grandes; controles deshabilitados exentos. No reemplaza análisis por píxeles de imágenes decorativas. |
| Acciones por documento | PASS: detalle/comprobante de Cuenta, copiar Carrito y enlace checkout seguro, Informe sin inspección/copia sin preview/print spy, checklist y recepción de Remito, OTP incompleto y aceptar/rechazar Alternativa. Portal incluye cuatro pasos y garantía. |
| Errores | PASS: seis enlaces inválidos no muestran documento. |
| Certificado premium impreso | PASS de regresión CSS: mejoras de 12 px/wrap solo `@media screen`; al imprimir recupera 11 px/nowrap originales. No se modificaron biblioteca ni plantillas impresas. |
| Marca/WhatsApp en todas las vistas | PARCIAL global: Carrito/Informe/Alternativa ya consumen CabeceraTienda, logo público autorizado y contacto exclusivo de sucursal. Cuenta/Portal/Remito conservan contacto existente. La cobertura de marca de las otras vistas y Entrada genérica no se amplía en esta unidad. |
| API sin datos internos | PASS acotado con PostgreSQL real: Carrito/Informe/Remito/Alternativa rechazan canarios persistidos de costos, proveedor real, MOV, notas y datos de otra empresa; logos por documento/variante sin tenant elegido por query. El resto de endpoints queda pendiente, no cubierto por mocks. |
| Host real de Entrada | PARCIAL: se verifica el componente con fixture HTML dedicada; no el routing del hostname clientes real. |

## Cambios

- CTA verdes de WhatsApp, checkout y recepción usan el texto semántico `text-on-ok`, corrigiendo 2.95:1 del tema claro.
- Cuenta mantiene acciones de comprobante/garantía de 44 px; Remito y Alternativa mantienen 44 px también en escritorio.
- Nombres de productos completos en Carrito y garantías del Portal.
- Informe tiene copiar/imprimir de 44 px y un ajuste de tipografía/título exclusivo de pantalla.

La Entrada no requirió cambio de fuente: el supuesto contraste incorrecto fue una medición del fotograma intermedio al cambiar de tema en la fixture. La inicialización de tema y espera de transiciones corrige la medición, sin bajar ningún umbral.

## Evidencia local

- Baseline previo a fuentes: `/tmp/mobos403-before.log`, `/tmp/mobos403-portal-before.log`. El primer log incluye el locator de pasos corregido después y la transición inicial de Entrada; esos diagnósticos se separaron de los defectos reales antes de entregar.
- Corrida final dedicada: 66/66 (48 base + 6 anónimos + 5 acciones + 6 errores + 1 aislamiento de impresión), `/tmp/mobos403-final.log`.
- Regresiones públicas anteriores: 27/27, `/tmp/mobos403-existing.log`.
- Unitarios relacionados: 19/19 de avisos/certificado y 3/3 de reglas públicas; ESLint selectivo y diffcheck en verde. Sin suite completa, DB ni build global.
- Sin capturas; se usaron medidas JS en Playwright.

#403 permanece parcial globalmente: la ampliación posterior acredita los tres gaps concretos de marca/contacto y cuatro contratos públicos reales, no la revisión universal de las once páginas ni del routing real de Entrada.

## Novedades para el dueño

- Los enlaces de cliente muestran completos los nombres de productos que antes se recortaban.
- Los botones públicos conservan un tamaño fácil de tocar y los botones verdes se leen mejor en tema claro.
- El informe resulta más legible en pantalla y conserva su formato impreso.

## Ampliación acotada 403 / seguridad 503

- Carrito, Informe y Alternativa usan el encabezado compartido con nombre, sucursal y logo opcional. Cada imagen se obtiene desde el documento autorizado, variante light/dark y fallback a la variante existente; no se expone una ruta privada de logo ni identificadores de tenant en el DTO nuevo. Si no existe logo, el nombre sigue visible.
- Contacto reutiliza contactoPublicoSucursal y WhatsAppSucursal: solo teléfono de sucursal. Carrito/checkout ya no priorizan el teléfono general de empresa. Sin teléfono de sucursal no se inventa URL ni se recurre al cliente/empleado/tenant. Informe usa la sucursal de la unidad o, si no tiene, la de su venta correspondiente.
- Informe y logo comparten cargarUnidadInforme/elegirUnidadInforme: misma selección previa entre seriales ambiguos (venta de su tenant; si no, última verificación). No se añade otro criterio por status ni una búsqueda findFirst divergente. Alternativa comprueba pertenencia de necesidad/tenant y token de 64 hex; su link no tiene vencimiento propio en el modelo (OTP conserva su vencimiento). Carrito comparte autorización y vencimiento Postgres con su logo; revocar/vencer impide abrir ambos. Respuestas de logo no-store/nosniff.
- Hallazgo #503 reproducido RED: GET anónimo de remito devolvía notes y receivedNote persistidas. Fix aislado 3eb070a2 elimina esos campos del DTO, preserva almacenamiento, recepción pública, nota propia, auditoría e idempotencia. No clasifica notas antiguas como públicas ni borra el historial. Log previo /tmp/public403-pg-baseline.log; seguridad GREEN 11 checks en /tmp/public503-pg-final.log.
- PostgreSQL descartable y Prisma real: 117 checks PASS en backend/tests/public-pages403-pg.mjs, con canarios no vacíos persistidos en campos privados; DTOs de Carrito/Informe/Remito/Alternativa, logos/tema/otra empresa/serial ambiguo, token inválido/revocado/vencido y contacto sin fallback. Se invocan handlers reales en proceso, sin servidor Next HTTP/productivo ni API mock. Base/puerto temporales propios, limpieza en finally, sin .env ni migraciones/esquema nuevos. Log /tmp/public403-pg-final.log.
- Frontend relacionado: 26/26 PASS (18 matriz de las tres páginas ×360/390/1440 ×claro/oscuro; acciones, errores y contacto nulo), con logo servido y aserción de WhatsApp correcto. Tres negativos reforzados (404 real de logo y contacto null, nombre preservado): 3/3 PASS. Medidas JS sin overflow/recortes, targets≥44, texto≥12 y contraste≥4.5. Logs /tmp/public403-fe.log y /tmp/public403-fe-absent.log; puerto5334 y cero capturas. Otros cinco componentes no se alteran.
- Verificación adicional: 1512/1512 frontend unitarios (concurrency1, una corrida); backend 332 PASS +1 skip previo de333, incluidos dos unitarios nuevos del selector y test existente de contacto. Lint 0 errores/1 advertencia previa DeliveryOperations, FE build PASS, BE build PASS con BUILD_ID, typecheck y diff-check PASS. No se tocó CI/NOVEDADES, impresión, biblioteca, auth/sesión/snapshot ni producción.
- Límites: no se acredita branding de las restantes vistas, hostname público real, disponibilidad de WhatsApp ni entrega de mensajes. Los enlaces UI se prueban con mocks; la minimización/autoridad de datos y bytes de logos se prueba separadamente contra PostgreSQL real. El integrador debe incorporar el nuevo test PG al gate de integración existente; no se editó su CI.

Novedades para el dueño:
- Carrito, informe y alternativa muestran la tienda y su logo, con WhatsApp de la sucursal correcta cuando está configurado.
- Las notas internas de los traslados ya no se entregan en el enlace público del remito; el registro y la recepción siguen disponibles para el equipo.

## Validación del integrador, con biblioteca0.68.13

Fuente743f6f56 + gatea4c2d456. Backend332PASS+1skipSQLprevio; buildNext0conBUILD_ID. HTTP completo aislado PASS, incluida conciliaciónPrisma sin diferencias y117checks de public-pages403-pg.mjs. Navegador público completo69/69PASS, con0.68.13 instalada. QA independiente de helpers/DTO/logos/#503APPROVE,6unitarios+aserciones de contacto PASS. Sin hardware ni producción; sigue pendiente publicación. El alcance global restante de403 se conserva, no se atribuye esta prueba a11páginas con marca/contacto nuevos.
