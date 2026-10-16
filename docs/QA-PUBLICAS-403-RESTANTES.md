# #403 — cierre de brechas de legibilidad en páginas restantes

Base main2def99308454fbd92b67033e2fad5a2eb26e70da; rama codex/publicas-restantes-403. Sin backend, datos reales, OwnData, builders de impresión, Stock/Taller ni pipelines507/513/514. No publicación ni cierre del issue.

## Evidencia por página

| Vista | Fuente y cambio | Matriz360/390/1440 claro/oscuro | Identidad/contacto y límite |
|---|---|---|---|
| Cuenta | PortalUI compartido: nombre/saludo/pie con palabras largas completos |6/6PASS, detalle y Gs100m conservados |Logo autorizado por token legado32 y WhatsApp de contacto DTO. Ningún endpoint privado para logo. |
| Cotización | Nombre de cliente/pie/ítems sin truncate; aceptar usa text-on-ok; botones PDF44px también desktop |6/6PASS, Gs100m y acciones existentes conservados |Logo por documento/tema y WhatsApp de sucursal existentes. No cambia resolver/OTP/payload/condiciones. |
| Producto | Nombre largo permite partir la palabra sin perder caracteres |6/6PASS, SKU63caracteres y precio100m íntegros |Sigue requiriendo sesión: los seis negativos anónimos existentes pasan. No hay marca/contacto público autorizado en este DTO; no se hace fetch extra ni se inventa WhatsApp. |
| Garantía | CabeceraTienda compartida, sucursal/ciudad permitidas; serial largo deja de truncarse |6/6PASS, serial largo completo, fechas/cobertura presentes |WhatsApp existente de store.phone. DTO no ofrece logo/tenant público: no se inventa ruta de imagen. Logo por documento sigue pendienteAPI. |
| Informe | Sin cambio de fuente ni certificado |6/6PASS y regresión screen/print existentePASS |Marca/logo/WhatsApp ya disponibles por documento autorizado. CSS de impresión y builder sin cambios. |
| Remito | CabeceraTienda compartida con nombre de sucursal origen; destino visible comoHacia… |6/6PASS, seriales/recibir/seguimiento conservados |WhatsApp existente de sucursal origen; DTO no ofrece identidad corporativa/logo público, queda pendienteAPI. No vuelve a exponer notas internas ni se agrega fetch. |
| Portal del cliente | PortalUI compartido: nombre/saludo/pie completos |6/6PASS, orden/totales/garantías presentes |Logo por token y WhatsApp de contacto existente. No cambia permisos/niveles/datos privados. |
| Entrada | Sin cambio de fuente |6/6PASS en fixture HTML que monta componente real |Entrada genérica con marcaMobOS; carece de empresa/token y no debe inventar tienda/WhatsApp. Host/routing clientesreal no probado. |

## Reproducción y verificaciones

- npmci sin audit:exit0; sin auditfix ni cambios en dependencias.
- Matriz válida RED:51casos→24FAIL/27PASS. Detectó recortes reales de nombres/pie, modelo/serial; aceptar cotización2,95:1 en oscuro. La primera corrida se interrumpió porque la fixture de Producto devolvía404 a hidratación de sesión; la fixture válida devuelve colecciones explícitas y conserva los guards502. No es regresión de auth.
- GREEN final:51/51 en17,1s, mismo umbral de recortes/contraste.48casos de matriz +3negativos tokenlegado32con sufijoÿ. Los GET válidos usan token completo; el sufijo se envía codificado y recibe404, nunca se recorta para abrir el documento anterior.
- MedidasJS: texto visible≥12px, contraste≥4,5 con composición real de fondo, objetivos44×44incluido escritorio, sin overflow ni texto cortado; espera fuentes/transiciones. No se baja umbral para encabezados, cantidades ni precio.
- Los49/51intermedios detectaron PDF36px en escritorio; se corrigió SOLO el contenedor de acciones de la página, sin tocar CompartirPdf/builders. La corrida51/51 es posterior a ese ajuste final.
- Regresiones existentes relacionadas:62/62en18,7s. Incluyen negativosProductoanónimo, estados, acciones/remito y preservación de CSSInforme al imprimir. Se excluyen los otros tres documentos ya revisados; no se editan sus fuentes.
- Unitarios relacionados:17/17(customerPortal,portalAvisos,cotizaciones,demoGarantia). FullFE una vez:1522/1522PASS, anterior únicamente al ajuste final de44pxdel contenedor;51browser finales y lint/build validan ese ajuste. No se presenta como full posterior.
- npmrunlint:0errores,1warning previo DeliveryOperations. npmrunbuild:exit0. gitdiff--checkPASS. No pruebasDB/backend/servidor ni nuevo outputPDF/papel.
- Config dedicado e2e/publicas403-restantes.frontend.config.js, puerto5373, workers1/retries0/forbidOnlytrue, screenshots/trace/videooff, artefactos/tmp/mobos-publicas403-restantes. Regresión existente corrió con config temporal propio en5374, no se modificó configCIcompartido. Servidores propios cerrados al terminar. Cero capturas.
- Todos los endpoints están interceptados localmente; HTTPS externo abortado. No se consultó OwnData ni se usaron tokens reales. Los payloads realistas de UI NO demuestran minimización ni permisos del backend.

## #403 permanece parcial

- Falta evidencia real de payload mínimo/tenant de endpointsCuenta/Cotización/Garantía/Portal en esta unidad; los117checks previos cubren separadamenteCarrito/Informe/Remito/Alternativa y no se extienden por inferencia.
- Logos por documento de Garantía/Remito y marca/contacto autorizado de Producto requieren contrato API específico o decisión explícita de producto; no abrir tenant/logo anónimo ni reutilizar foto/contacto de cliente.
- Entrada genérica no tiene WhatsApp de tienda sin un documento que lo autorice; host de producción y disponibilidad/entregaWhatsApp no acreditados.
- Los tres documentos previosCarrito/Pedido/Alternativa siguen con evidencia229; esta unidad completa la matriz de las otrasocho, no afirma seguridad universal de11rutas por fixtures.

## Novedades para el dueño

- Los nombres largos de tienda, cliente y producto ya se pueden leer completos en cuenta, portal y cotizaciones.
- La garantía muestra el serial completo y comparte el encabezado de documentos con el remito.
- Aceptar una cotización se lee correctamente en oscuro y los botones PDF mantienen un tamaño cómodo también en escritorio.
- Los enlaces con un sufijo inválido siguen fallando; no se corrigen silenciosamente para abrir otro documento.
