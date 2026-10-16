# #515 / #404 — caché de fotos privadas y contexto

Base66343fd0, rama codex/product-images404. Unidad independiente del candidato230 congelado. Sin backend, migraciones, permisos nuevos, consulta real, fotografía personal ni publicación.

## Hallazgo reproducido

`productImages.js` guardaba promesas de URLblob bajo la ruta de la imagen; `limpiarFotos` existía sin ningún consumidor. `FotoProducto` retenía su URL al invalidarse la sesión. Con la imagen A ya cargada, invalidar contexto por empresa, A→B→A, logout o permisos dejaba el elementoimg montado mostrando el blob anterior. RED4/4 en `/tmp/mobos-images404-red.log`.

La prueba usa React/FotoProducto/apiFetch reales con una imagen1px ficticia y respuestaHTTP interceptada. Invoca las mismas invalidaciones centrales que `storage.setContexto`/logout/denegaciones usan; no representa dos empresas reales autenticadas ni depende de IDs privados. La ausencia de nueva autorización no se interpreta como permiso para reutilizar la imagen.

## Cambio acotado

- La caché se suscribe a la frontera central de snapshots privados de502. Una invalidación incrementa la revisión local, avisa a miniaturas montadas, vacía caché y revoca URLs. No cambia snapshots ni cola offline.
- `FotoProducto` retira la imagen privada ya visible y detiene callbacks pendientes; conserva el ícono de categoría. No vuelve a solicitar automáticamente la ruta vieja. Una nueva instancia o cambio de fuente solicita bajo el contexto vigente.
- `apiFetch` ya protege respuestas que llegan después de cambiar contexto. Se agrega comprobación después de `Response.blob()` para proteger también el cuerpo tardío: no crea un objectURL de la revisión anterior.
- Un rechazo antiguo solo elimina su propia promesa: no borra la nueva descarga autorizada de la misma ruta. Dedupe, caché acotada160, lazy-load, fallback y recuperación tras error temporal permanecen.
- No se amplía `esFuenteDirecta`: data/blob/https explícitos (ejemplos públicos y preparación local) mantienen su contrato. Las fotos privadas emitidas por este API son rutas relativas autenticadas; esta unidad protege esas rutas y las URLs que genera su cargador.

## Evidencia final

13/13ChromiumPASS, viewport390x844, screenshot/trace/video desactivados; log `/tmp/mobos-images404-final.log`:

1. Imagen ya montada desaparece tras empresaA→B yA→B→A.
2. Logout, sucursal, cambio solo de rol y cambio solo de permisos.
3. `URL.revokeObjectURL` recibe la URL anterior; mismo contexto deduplica2lecturas en1GET y nuevo contexto permite otra URL autorizada.
4. Cuerpo de A retrasado hasta después de cargar nueva fotoA:0URLs viejas creadas,1URL actual,2GET totales; catch viejo no borra caché nueva.
5. Denegación real del clienteHTTP401/402/403 al cargar otra foto retira la imagen visible.
6. Dos pestañas reciben la invalidación central a través del evento storage real.
7.503temporal permite reintentar y mostrar foto sin conservar promesa rechazada.

FullFE una vez1562/1562PASS; lint0errores/1warning previo DeliveryOperations42; FEbuildexit0; diffcheckPASS. No backend/schema tocado; no DB/E2Eservidor ni repetición de suites generales. El spec queda incluido en nav-v2 y tiene configuración focal puerto5397 propia.

## Matriz #404: existente frente a pendiente

| Criterio original | Fuente actual / límite |
| --- | --- |
| Modelo ProductImage aditivo,1–N,principal,orden,variante opcional,ancho/alto,baja lógica | Existe schema/migración20270110 y APIproducts/id/images; no se reejecutan migraciones en esta unidad |
| Alta/ficha: elegir,drop,cámara | Existe GaleriaFotosProducto; demo no habilita subidas reales |
| Cuadrado/compresiónWebP | Existe prepararFotoProducto800px+mini160; recorte centrado automático. Encuadre interactivo todavía pendiente, PhotoCropper compartido existe pero galería no lo usa |
| Miniaturas en servidor | PENDIENTE: servidor valida/almacena thumb que manda cliente; no se acredita generaciónserver |
| POS/Productos/carrito | FotoProducto consumida porPasoProductos/SellerCatalog/FilaVenta. Nueva protección transversal del cargador; no se atribuye recorridoUI completo de cada consumidor a este harness |
| Cotización/página producto | No completado por esta unidad; ficha pública conserva el control de acceso403, sin producto anónimo ni nuevasURLs públicas |
| Categorías/íconos/compatibilidad | Existe categoriasAccesorio y filtros/metadata de catálogo; no se crean categorías/variantes obligatorias |
| EquiposIMEI usan foto de modelo | Referencia a producto existente; no se crean fotos porunidad |
| Storage por empresa/permisos/magic bytes/límites/otraempresa404 | Rutas/helpers existentes+backend/tests/product-images.mjs; evidencia estática/previa, no HTTPnuevo en esta unidad |
| Lazy-load/tamaño adecuado | FotoProductoIntersectionObserver y thumbUrl existente, conservados |
| Aislamiento caché privada | Corregido y acreditado por13casos de esta entrega; #515 separado del snapshotPOS502 |

#404 sigue PARCIAL. No se afirma recorte interactivo, miniaturas generadas en servidor, galería por variante, cámara iPhone física, RUC/OwnData, VoiceOver ni publicaciónApple.

## Novedades para el dueño

- Al salir o cambiar de empresa, sucursal o permisos, las fotos privadas anteriores desaparecen de inmediato.
- Una descarga vieja ya no puede volver a mostrar una foto después de cambiar de sesión.
- Las fotos actuales siguen reutilizando su descarga y pueden recuperarse de un error temporal.
