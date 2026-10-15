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
| Marca/WhatsApp en todas las vistas | PARCIAL: Cuenta/Portal/Remito consumen el contacto existente; Carrito/Informe/Alternativa no lo consumen. Varios encabezados no consumen logo; Entrada es genérica de MobOS. No se inventan campos ni funciones. |
| API sin datos internos | NO VERIFICADO con estos mocks: requiere pruebas reales por endpoint, permisos y minimización de respuesta. Los mocks no contienen costos/proveedores/notas internas. |
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

#403 permanece parcial: esta unidad acredita UI y acciones simuladas, no minimización de API ni la identidad/contacto faltantes por página.

## Novedades para el dueño

- Los enlaces de cliente muestran completos los nombres de productos que antes se recortaban.
- Los botones públicos conservan un tamaño fácil de tocar y los botones verdes se leen mejor en tema claro.
- El informe resulta más legible en pantalla y conserva su formato impreso.
