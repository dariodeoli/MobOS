# #499 — retorno de foco del editor de cliente POS

Fuente de auditoría: 880ebc11, rama propia `codex/499-cliente-modal-focus`.
No modifica la fuente candidata 236. Rebase y draft con diff exclusivo pendientes de main 236.

## Hallazgo y corrección

El summary de contacto y el botón de editar cliente se desmontan al abrir el Modal POS. Al cerrarlo, el Modal compartido encuentra su disparador desconectado y el foco queda en BODY. Reproducido para cliente nuevo con Escape, Cerrar y Confirmar.

CheckoutCustomer conserva refs al sucesor lógico de esos controles y, tras el cierre y cleanup del Modal, devuelve el foco al botón Editar datos del cliente (existente) o al summary de contacto (nuevo). No cambia selección ni identidad, ni el Modal compartido. Consumidores inline no participan de esta restauración.

## Evidencia local aislada

- 6 regresiones nuevas: nuevo/existente por Escape, botón Cerrar/Cerrar edición y Confirmar; se espera el render y se afirma el control enfocado.
- 2 contratos anidados existentes #499: 390px y dark 1440px, único aria-modal activo, Tab/Shift+Tab contenidos, Escape cierra sólo hijo, retorno a Agregar identidad.
- Runtime frontend demo, todas las rutas API interceptadas, HTTPS bloqueado; cero writes de negocio. Telemetría también interceptada, sin writes reales ni proveedor fiscal.
- 18 casos POS existentes PASS (20.3s).
- 8 casos de foco PASS (10.7s); FE 1598 PASS; lint 0 errores (warning DeliveryOperations preexistente); build FE PASS.
- Backend/schema sin cambios; gates completos de fuente 880 permanecen como evidencia previa, no se presentan como reejecución de esta unidad.

Ejecutar: `MOBOS_QA_PORT=5393 npx playwright test --config e2e/focus499.frontend.config.js`.
Los seis casos nuevos se incluyen además en el config frontend general de CI.

## Novedades para el dueño

- Cerrar la ficha del cliente devuelve el teclado al control de edición correspondiente.
- Las ventanas fiscales anidadas conservan el foco y anuncian una sola ventana modal activa.
- Sigue pendiente probar lectores de pantalla físicos en web y móvil; esta unidad no cierra #499 ni implica deploy.
