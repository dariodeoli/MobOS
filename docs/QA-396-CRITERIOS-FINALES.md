# #396 — auditoría completa y brechas restantes de presentación

Base exacta66343fd0; rama codex/responsive396. Fuera del candidato230 congelado: no publicación ni cambios Apple/API/datos/impresión/store350.

## Criterios

| Pedido vivo | Comprobación actual |
| --- | --- |
| Cuotas360/390, importe/Abrir pedido dentro de lista | PASS12casos360–1440/ambos temas; fixture de sesión aislada |
| Taller: barra única, filtros, acciones secundarias, etapas, selección condicional y primer contenido | PASS existente + regresión360 añadida; primera orden≤430px móvil, controles44px |
| Taller comentario antiguo:3/4cápsulas desktop | Contrato posterior#448 usa filas densas≤48px en1280/1440. Conservado; no se afirma cumplir simultáneamente ambos diseños incompatibles |
| Productos sin switch duplicado; móvil tarjetas; controles44px; tabla contenida | PASS existente; matriz ahora incluye360/390/1440 y ambos temas |
| Por comprar: estados desplazables, filtros hoja, sin introducción ni encabezado duplicado | PASS9casos de compras/filtros, conserva selección y Escape |
| Comparador Nuevos/Semi-nuevos44px | PASS matriz responsive360–1440, claro/oscuro |
| Títulos H1/H2 de Por comprar/Preparar compra/lote/Métricas/Recepción | PASS5casos específicos |
| Unidad móvil, costo/estado y ficha Ubicación | PASS:166.25px375/142.25px390, importe completo; ficha en375–1440 |
| KPI/ejes≥12px | Componentes compartidos actuales usan text-xs/ejes fontSize12; no se redujeron ni reconstruyeron gráficos |
| Portal≥12px/contraste | Evidencia de otra unidad integrada403:51casos Cuenta/Portal/otras públicas+62regresiones; docs/QA-PUBLICAS-403-RESTANTES.md. No se tocaron esas fuentes |
| Landing decorativa≥11px, información legible | Brecha RED textos9–10px; CSS eleva9→11 y10→12; IMEI labels/datos a12. GREEN360/390/1440 ambos temas, sin overflow |
| Contraste PIN/demo | PASS2001/3001/PIN usando color actual, sin cambios a autenticación |
| Atajos POS | Brecha RED3.62oscuro y contraste insuficiente claro; eliminar opacidad60%, texto/teclas12px. GREEN≥4.5 ambos temas |
| +Dirección oscuro | PASS botón existente dentro de hoja Cliente móvil y ficha desktop; ningún cambio necesario |
| Banner demo/Configuración | PASS existente: aviso contenido y siete secciones en lista con objetivos44px |

## Regresiones y límites

- Baseline45/45PASS antes de cambiar producto. Nuevas pruebas RED de landing y contraste Atajos; los primeros intentos de ampliar a Dirección detectaron selectores del harness obsoletos (el móvil usa hoja Cliente), corregidos por navegación visible soportada.
- Fuente limitada a Landing.css, ImeiVerificador y tres clases de FormularioVenta. No se alteran callbacks, pagos, descuentos, permisos, tenant ni recursos.
- No se consultó OwnData ni API productiva, no clientes/pedidos reales, no DB, Apple, impresión ni capturas nuevas. Demo/fixtures frontend con API interceptada503 y HTTPSexterno abortado.
- El test nuevo queda incluido en nav-v2.frontend.config.js y además tiene configuración focal propia. Puertos5394/5395 y output únicos/tmp/mobos-responsive396*.
- El cierre global de396 requiere resolver explícitamente el criterio visual antiguo de3/4cápsulas frente al contrato posterior448. No acredita dispositivo físico/VoiceOver/OAuth.

## Novedades para el dueño

- Los textos pequeños de la página pública y los datos de verificación IMEI se leen con más facilidad.
- Los atajos del punto de venta mantienen contraste suficiente en claro y oscuro, con teclas más legibles.
- Se conserva el trabajo ya hecho en Taller, Productos, compras y Configuración; la auditoría identifica qué está comprobado y qué cambió de criterio.

## Gates finales

-57/57frontendPASS del árbol final: `/tmp/mobos-responsive396-joined-final.log` (baseline45+12nuevos), incluyendo matriz de Taller/Productos/Comparador ampliada a360.
-FullFE una vez:1562/1562PASS, `/tmp/mobos-responsive396-unit.log`.
-Lint0errores/1warning previo DeliveryOperations42; FEbuildexit0 (warnings previos chunks/importmixto); diffcheckPASS. No backend/schema tocado y no suites DB ejecutadas.
