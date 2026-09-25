# Racha 1 — corrida completa (modo CI, backend prod, retries 0)

```
  ✓  437 [admin] › e2e/ruc-extraccion.spec.js:166:1 › Cuentas: documento (cédula/RUC) de la cuenta (639ms)
  ✓  438 [admin] › e2e/seguridad-cuenta.spec.js:12:3 › Seguridad de la cuenta › archivar y eliminar exigen identidad, palabra y contraseña (1.3s)
  ✓  439 [admin] › e2e/seguridad-cuenta.spec.js:61:3 › Seguridad de la cuenta › la pantalla de recuperación de empresa pide correo, contraseña y RESTORE (453ms)
  ✓  440 [admin] › e2e/seguridad-cuenta.spec.js:77:5 › Seguridad de la cuenta › acceso público › desde el acceso se llega a la recuperación de empresa (477ms)
  ✓  441 [admin] › e2e/selector-sucursal.spec.js:22:3 › selector de sucursal › con una sola sucursal es un dato informativo, no un control (509ms)
  ✓  442 [admin] › e2e/selector-sucursal.spec.js:39:3 › selector de sucursal › con varias sucursales el menú abre y cambia la activa (984ms)
  ✓  443 [admin] › e2e/servicio-tecnico.spec.js:10:1 › la orden se carga con costos desglosados y la utilidad se calcula sola (955ms)
  ✓  444 [admin] › e2e/servicio-tecnico.spec.js:61:1 › el checklist se configura por tipo de dispositivo (805ms)
  ✓  445 [admin] › e2e/servicio-tecnico.spec.js:79:1 › el WhatsApp de la orden usa la plantilla del estado con sus variables (1.4s)
  ✓  446 [admin] › e2e/servicio-tecnico.spec.js:144:1 › el cliente ve su equipo en el taller: ficha, cronología y portal (1.9s)
  ✓  447 [admin] › e2e/traslados-etiquetas-lote.spec.js:106:1 › desde el destino se reimprimen las etiquetas del lote completo (sin depender del origen) (1.3s)
  ✓  448 [admin] › e2e/traslados-etiquetas-lote.spec.js:132:1 › desde la recepción del destino se reimprime la etiqueta de una unidad (1.3s)
  ✓  449 [admin] › e2e/traslados-etiquetas-lote.spec.js:163:1 › la recepción del lote lo deja disponible en stock del destino (1.6s)
  ✓  450 [admin] › e2e/traslados-etiquetas-lote.spec.js:200:1 › el lote muestra ETA y quién despachó/recibió, y la ETA se ajusta desde la tabla (2.2s)
  ✓  451 [admin] › e2e/traslados-etiquetas-lote.spec.js:246:1 › sin impresora, el lote deja el PDF de 80 mm con las dos etiquetas (1.5s)
  ✓  452 [admin] › e2e/vendidos-comprobante-rapido.spec.js:86:1 › el ícono de Vendidos imprime el comprobante rápido (80 mm) sin abrir la ficha (1.2s)
  ✓  453 [admin] › e2e/vendidos-comprobante-rapido.spec.js:115:1 › sin agente ni impresora, el respaldo deja el PDF del comprobante en 80 mm (1.5s)
[e2e] PostgreSQL cluster stopped.
[e2e] Servidor del harness en :5204 detenido (pid 83971).

  6 skipped
  447 passed (12.0m)
```

exit code: 0
