# Compras: verificación #450 y ajustes de densidad #396

Base: main31760c90 (v1.0.228). Alcance: Por comprar, Preparar compra, Compras del Centro, Recepción y ayuda/estilos locales del abastecimiento. No cambia servidor, importes, permisos, tenant/sucursal, validación ni historial.

## Criterios

- #450 feedback: PASS. La implementación existente confirma IMEI agregado, duplicado y Luhn inválido; conserva la lista y permite corregirla. La prueba de cámara usa MediaStream/BarcodeDetector simulados y el componente real: rechaza el QR de impresora y luego agrega el IMEI sin reiniciar por los renders. No acredita lectura óptica ni hardware de cámara.
- #450 visibilidad: PASS. Preparar compra y detalle del Centro muestran seriales por línea, buscador y estados pendiente/recibido/verificado.
- #450 QR: PASS. QR de prueba y URL ajena se rechazan con explicación; la clasificación de unidad MobOS resuelve el serial y distingue producto/IMEI. Doce pruebas unitarias de clasificación/lotes aprobadas.
- #450 recorrido y recepción: PASS. Recepción enlaza a la compra con IMEI pendientes; dos casos HTTP/UI con base aislada confirman stock por lo recibido y completan el lote parcial sin pedir ni duplicar lo anterior. No se elimina la exigencia de IMEI.
- #396 supply: PASS. Filtros móviles en hoja con Prioridad/Centro/colas, indicador de activos, limpieza y Esc; persiste selección. Pestañas de estado en una fila desplazable. Selección usa Checkbox compartido con área44px. Botones locales mantienen44px también en tablet/escritorio.
- #396 densidad: PASS del área. El recorrido deja de ocupar varias filas en móvil, conserva visible el paso actual incluso al redimensionar y mueve las explicaciones al botón de ayuda; no agrega títulos duplicados. No cambia layout compartido.
- Responsive: PASS en360/390/768/1280 claro/oscuro, sin scroll horizontal, controles44px y paso actual visible; se espera contenido real antes de medir.

## Verificación

- `npm ci` y `npm --prefix backend ci`: PASS. Auditoría frontend informa15hallazgos (5moderados/10altos, incluidas herramientas/transitivas); backend0. No se hizo audit fix.
- `node --test src/lib/clasificarCodigo.test.js src/lib/escanerSeriales.test.js`:12/12PASS.
- Playwright frontend `compras-escaneo.frontend.spec.js`, config `e2e/nav-v2.frontend.config.js`:14/14PASS en la corrida final.
- Regresión de densidad: RED inicial con checkbox16px, botones32–36px y ausencia de hoja de filtros; GREEN después del cambio. La cámara considera el montaje doble de StrictMode y comprueba que posteriores lecturas no la reinician.
- `npm test`:1485/1485PASS, suite completa una vez. Los ajustes finales de visibilidad del paso se verificaron con los14E2E del área.
- `npm run lint`:0errores/1warning preexistente en DeliveryOperations.jsx. `npm run build`:PASS también después de los últimos ajustes de layout.
- `e2e/qa-250-escaneo-recepcion.spec.js`, subset `F5 · recepción:` y `F5 · un lote parcial`:2/2PASS,0retries. Fixture explícita: PG5598/API3198/WEB5298, base `mobos_compras450_20261015`, PGDATA `/tmp/mobos-e2e-compras450-20261015`; el harness detuvo su cluster y servidor al finalizar. Dos capturas del caso de recepción, sin nuevas capturas fuera del límite.

## Pendiente fuera del alcance

#396 sigue agrupando Taller/Cuotas/Productos/Comparador/KPI/landing/configuración; esta unidad entrega solamente abastecimiento. No se acredita escaneo físico/nativo, sonido/vibración en hardware ni impresoras. No hubo lectura de secretos ni acceso a producción. Integrador corre los gates conjuntos y publica/cierra.

## Novedades para el dueño

- En Por comprar los filtros se abren juntos y conservan lo que elegiste, dejando más espacio a los productos.
- Los controles de compras son cómodos para tocar en celular y tablet.
- El recorrido de compra muestra el paso actual sin ocupar varias filas; la ayuda conserva la explicación de cada etapa.
- Se verificó que los IMEI se vean por compra y que recibir parcialmente no duplique stock al completar el lote.
