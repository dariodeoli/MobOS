# #404 — miniaturas en cotizaciones y ficha protegida

Unidad sobre `d9923230`, rama `codex/product-consumers404`. Fetch verificó origin/main=`2def99308454fbd92b67033e2fad5a2eb26e70da`; rebase indicó up-to-date y conservó la base pendiente. Fuera de candidatos230/231 congelados; no push/release/version.

## Inventario y decisión de diseño

| Consumidor/criterio | Estado observado y alcance |
| --- | --- |
| POS y lista Productos | Ya usan FotoProducto; no modificados ni acreditados de nuevo con esta unidad |
| Crear cotización | Ya muestra FotoProducto36 del artículo elegido en SellerQuotes, conservado. No se cambia selector ni formulario |
| Lista/resumen de cotización | Brecha corregida: una miniatura36 del **primer artículo con productId** en el orden recibido. Producto resuelto exclusivamente por ID en el catálogo autorizado actual; no se infiere por descripción. Resto de artículos/cliente/precio/acciones conservan orden/texto |
| Artículo libre/sinproductId | No se inventa relación ni foto aunque tenga el mismo nombre que un producto. Si el vinculado no tiene foto/catálogo, FotoProducto conserva su fallback sin consultas nuevas para buscarlo |
| Vista previa documental de cotización | DocumentoImpresion compartido permanece intacto; no se agrega foto al PDF/impreso en esta unidad |
| Cotización pública | DTO público sólo description/quantity/precios; sin imagen autorizada. Pendiente contrato específico; no se enchufa una URL privada en página anónima |
| Producto abierto por QR | Brecha corregida usando FotoProducto64 y thumbUrl/imageUrl ya existentes. Sigue protegido por estado de sesión y consulta de catálogo autenticada; no se crea portal público nuevo |
| Carrito y demás consumidores | No modificados ni declarados completos por esta unidad |
| Categorías y compatibilidad | Código ya existente: seis categorías Láminas/Cases/Cables/Cargadores/Audio/Otros con iconos en categoriasAccesorio; chips/filtros y compatibilidad en POS/SellerCatalog, edición en ProductoDetalle. No se cambian ni se afirma QA funcional nueva para esos flujos |

La elección de una sola imagen por cotización evita añadir una galería a la lista y no convierte la foto actual del catálogo en evidencia histórica del documento. No hay cambios de importe, IDs, DTO, costos, permisos, carga/recorte, backend, caché515 ni impresión.

## Verificación ejecutada

- Baseline exacta restaurada temporalmente sólo en las dos fuentes propias: **2/2 RED** por miniatura ausente, lista de cotizaciones y producto390claro. Se restauraron los cambios automáticamente. Log `/tmp/mobos-consumers404-baseline-red.log`. Una primera exploración mezcló la segunda carga con fuente ya actualizada: no se utiliza como baseline.
- `npx playwright test --config=e2e/product-consumers404.frontend.config.js`: **19/19 PASS** final, `/tmp/mobos-consumers404-green.log`.
-12casos en app real con APIs simuladas:360/390/1440, clase clara/oscura acreditada, ambos consumidores. Foto decodificada, nombre largo y123.456.789 completos, sin overflow/recorte textual, acciones/link preservados. No vínculos por coincidencia de nombre y un único GET de foto privada.
- Anónimo: cero consultas al catálogo y cero bytes privados; aviso de login conservado.
- Foto404: fallback conserva nombre e importe en ambos consumidores.
-4casos de invalidación515: cada consumidor con imagen visible y respuesta de imagen demorada; se oculta y no reaparece tras respuesta antigua. Reutiliza FotoProducto sin cambiar su lazy-load/caché/API ni auth.
- `npm run lint`:0errores/1warning previo DeliveryOperations.jsx:42; `npm run build`:PASS; diffcheckPASS. Sin cambios backend/schema.
- `npm test` único: **1562PASS/1FAIL real** por ciHarness: import Sharp top-level de fotos-producto.spec.js ya presente en la base impide Playwright --list si sólo están instaladas dependencias root (también afecta CIFrontend). Log `/tmp/mobos-consumers404-unit.log`. El integrador corregirá esa dependencia por separado; instalar backend aquí no acredita resolver CI. No se ejecutó ningún retest usando esa instalación como supuesta solución, no se cambia el spec ajeno y no se repite fullsuite ni se declara totalmente verde.

## Integración y límites

La config dedicada usa puerto5416, workers1/retries0/forbidOnly y cero capturas/trace/video. El integrador decide el enganche al gate CI; no se modificaron workflows/config compartida. Todas las fotos y cuentas del arnés son ficticias, con red API simulada y HTTPS externo bloqueado. No DB, producción, OwnData, cámara real, Apple ni captura adicional. #404 sigue parcial por los consumidores públicos/documentales y criterios no acreditados arriba.

## Novedades para el dueño

- Las cotizaciones muestran una referencia visual del primer producto vinculado sin ocupar espacio con una galería adicional.
- Al abrir el QR de un producto con sesión, ahora se ve su foto junto al nombre y sus datos.
- Si la foto falta o cambia el acceso, el nombre y los precios siguen legibles y la imagen anterior no queda visible.
