# #404 — encuadre interactivo de fotos de producto

Commit separado sobre395fe95b (#515 congelado), rama codex/product-images404. No cambia cachéFotos/FotoProducto, API, permisos del servidor, schema, datos reales ni publicación.

## Brecha y solución

La galería ya permitía elegir/cámara/drop, pero comprimía y subía inmediatamente con recorte central automático. No permitía elegir qué parte conservar ni cancelar antes de enviar. RED: `Recortar foto` no existía después de elegir; `/tmp/mobos-crop404-red.log`.

Ahora cada archivo validado abre PhotoCropper compartido. Se confirma individualmente, en orden. Antes de confirmar no hay upload ni cambio de principal/galería. Cancelar descarta los archivos aún pendientes; las fotos previamente confirmadas permanecen. Alta conserva archivos locales preparados para `subirFotosPendientes`; ficha usa el upload existente.

- Producto usa las opciones aditivas `cubrir` y `noAmpliar`, lado máximo800: el área visible coincide con el cuadrado que se guarda. Arrastre y zoom conservan proporciones, limitan la imagen a su área y no agrandan un recorte pequeño en el cliente.
- Perfil mantiene contain y salida512 por defecto. La escala compartida conserva el contrato anterior cuando no se pasa cubrir; hay regresión unitaria explícita.
- La imagen ya cuadrada pasa por prepararFotoProducto existente: WebP (JPEGfallback), miniatura160 y límites5MiB/12fotos. No hay segundo recorte de distinta proporción; el cuadrado existente no pierde otro borde.
- Tipos/tamaño se rechazan antes de abrir; archivo corrupto muestra error y no habilita confirmar. Los botones y slider tienen44px; no desborde a360/390/1440 claro/oscuro.
- Al cambiar producto/permisos/contexto se cierra la cola y se invalidan continuaciones. Un recorte o rechazo de orden tardío no sube ni restaura fotos viejas. Se revocan las URLs locales descartadas.
- Carga inicial, ordenar, principal y baja tienen revisión local para evitar restauración tardía después de cerrar/cambiar. No se altera su contrato HTTP ni se amplían permisos.

## Evidencia

19/19ChromiumPASS (`/tmp/mobos-crop404-functional-final.log`):

1.360/390/1440 claro/oscuro: abrir, cancelar, conservar original y ceroPOST; botones44px/sin scroll horizontal.
2.Foto rectangular ficticia verde/roja800x400: arrastrar al extremo verde, zoom, confirmar. Se decodifica el archivo multipart recibido:400x400 y centro verde independiente del preview; thumb160x160. Dos archivos producen dos confirmaciones/upload en orden y conservan principal original.
3.Alta:0archivos locales antes de confirmar,1después; ceroPOST hasta que exista producto.
4.TipoSVG,5MiB+1 yPNGcorrupta: error y ceroPOST.
5.Cambio producto, retiro permiso y cambio de contexto con recorte abierto: descartar sin upload.
6.Canvas.toBlob diferido hasta después de cambiar contexto: no sube ni revive selección.
7.PATCHorden diferido/403 tras cambio: no restaura lista anterior.
8.Cámara por filechooser soportado en Modal de alta y ficha: capturaenvironment declarada, Cancelar conserva padre y devuelve foco. Esto no acredita hardware de cámara iPhone.
9.Modo lectura: no elegir ni procesar/subir archivo.

Unitarios relacionados de foto/recortePASS; fullFE una ejecución1563/1563PASS. Lint final0errores y1warning previo DeliveryOperations42. FEbuildPASS; la extracción posterior de invalidarRevision a callback estable solo elimina warnings de hooks:19funcionales ylint se repitieron sobre ese ajuste. No se repitió fullFE tras esa extracción; integrador ejecutará gate del árbol unido. DiffcheckPASS.

## Integración y pendientes

- El spec nuevo está incluido en nav-v2 y configuración focal crop404; puerto5397, outputs/tmp propios, sin screenshots/trace/video.
- Coordinado con unidad de miniaturas de servidor: conserva multipartfile+thumbopcional. Servidor usará file autorizado para generar sus imágenes; el cuadrado elegido mantiene encuadre. Esa implementación backend no pertenece a este commit y no se atribuye a estos19casos.
- #404 continúa parcial: no se afirma galería por variante, cobertura de fotos en toda cotización/página pública, cámara física, fotos de personas ni despliegue. No se abre un producto anónimo ni se impone variante.
- No OwnData, Apple, impresiones, DB o API productiva; fixtures e imágenes puramente locales.

## Novedades para el dueño

- Podés mover y acercar cada foto para elegir qué parte guardar antes de subirla.
- Cancelar conserva tus fotos actuales; elegir varios archivos mantiene el orden de confirmación.
- Si cambiás de producto o de acceso durante la preparación, no se agrega la foto al lugar equivocado.

Ajuste final del harness: se aplica el tema mediante aplicarTema y se acredita la clase dark, no solo una preferencia guardada. Matriz final19/19 sobre360x740/390x844/1440x900; botones dentro del viewport y44px. Se descartó como evidencia de oscuro la primera corrida cuyo fixture no aplicaba esa preferencia. Build final posterior al ajuste de hooks tambiénPASS.
