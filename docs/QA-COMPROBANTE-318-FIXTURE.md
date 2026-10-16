# Comprobante #318 — selección inequívoca del pedido demo

Base: eb61d6fd493307c8fa8f140c1c9c700fd81c0ef2. Relacionado con #402 y #451, sin cambios de producto.

## Causa y prueba independiente

El seed canónico `src/lib/demo/ventas.js` conserva `demo-venta-extra-1` como AUR-0004, María González, un iPhone 15 Pro Max 256GB Titanio Natural y total/pagos Gs 7.250.000. La misma clienta también tiene AUR-0001, iPhone 15 Pro 256GB Titanio, Gs 6.850.000. El test buscaba solamente la primera fila de María; el reloj y el orden de ventas hacen que abra AUR-0001. El log CI388451-shard2 muestra un recibo internamente coherente de AUR-0001, no pérdida de datos del pedido AUR-0004.

## Corrección y criterios

- PASS: seleccionar exactamente `Abrir pedido AUR-0004`, comprobar unicidad, cliente, producto e importe en la fila antes de abrirla.
- PASS: mantener oracle literal independiente del HTML/renderizador: empresa/sucursal, cliente, número público AUR-0004, producto exacto, total Gs 7.250.000, un ítem y ausencia de Consumidor final.
- PASS: aplicar esas verificaciones también a A4, 80 mm y móvil; conservar los checks de geometría, cabecera/pie fijos, scroll y resultado de impresión.
- PASS: esperar el contenido del iframe durante su reconstrucción de formato; una fase transitoria sin body no produce una excepción fuera del polling.
- No cambios a runtime, datos, permisos, dinero, empresa ni impresoras. No se acredita impresión física.

## Verificación

- Oracle Node sobre ventasDemoLegacy con reloj 2026-10-16T03:05:00Z: IDs/número/producto/total/pagos exactos y múltiples pedidos de María, PASS.
- `node --test src/lib/printing/ventaComprobante.test.js`: 7/7 PASS.
- Playwright frontend aislado, puerto 5367, output /tmp/mobos-comprobante318-browser-final, cuatro casos qa-318: 4/4 PASS, sin backend/PG. Dependencias existentes reutilizadas mediante enlace local, sin instalación ni modificación del paquete.
- Config local temporal solo para ejecutar el spec frontend, no forma parte del commit. No suite completa ni builds por cambio exclusivo de prueba y carga de la Mac; integrador realizará gates finales.

## Novedades para el dueño

- La revisión del comprobante identifica el pedido correcto aunque un cliente tenga varias compras.
- Se comprueban los mismos datos completos en A4, ticket de 80 mm y pantalla móvil.
