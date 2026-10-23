# Rediseño del POS de MobOS (diseño a ciegas)

Prototipo clickeable: `docs/pos-rediseno/prototipo.html` (abrir en el navegador; `#demo` salta el PIN y precarga una venta). Capturas `01`–`04` en esta carpeta.

## Principios
1. **Una pantalla, un trabajo.** Vender = elegir productos y cobrar. Todo lo demás (cliente, descuento, entrega, nota) es opcional y vive en chips, nunca en pasos obligatorios.
2. **El total y el botón Cobrar siempre visibles**, en escritorio y en celular.
3. **Pulgar primero.** Objetivos de 44 px o más, acciones principales abajo, hojas inferiores en vez de pantallas nuevas.
4. **Cobro honesto y por partes.** El número grande es siempre «Falta cobrar»; cada pago parcial baja ese número hasta cero.
5. **Lo raro no estorba, pero está a un toque:** crédito con aprobación, gift card, cotización, venta en espera.
6. Tokens y componentes de MobOS (claro/oscuro, Space Grotesk + Inter, verde de marca). Campos según `docs/CAMPOS.md`: dinero con separador de miles, IMEI normalizado, cliente solo con nombre y teléfono.

## Layout
- **Escritorio (≥900 px, 1280×720 o más):** barra superior (buscar/escanear, en espera, tema, vendedor) · catálogo con categorías a la izquierda · **ticket fijo de 410 px** a la derecha (cliente, líneas, opciones, totales, Cobrar). Sin scroll de página.
- **Celular (390×844):** catálogo en 2 columnas + barra flotante «N ítems · Ver venta · Gs.» → el ticket sube como pantalla completa con Cobrar al pie. El cobro es una pantalla completa de una sola columna.

## Estados del flujo
`PIN vendedor → Venta (vacía → con ítems) → Cobro (falta > 0 → falta = 0) → Éxito → Nueva venta`
Salidas laterales: **en espera** (estaciona y limpia), **cotización** (no descuenta stock ni cobra), volver del cobro a la venta sin perder el carrito.

## Decisiones clave
- **Equipos con IMEI:** tocar el modelo abre la lista de unidades en stock (o escanear). Una línea = una unidad; no hay cantidad. Pegar o escanear un IMEI de 15 dígitos en el buscador lo agrega directo. Accesorios: tocar suma cantidad.
- **Cliente opcional**, por defecto «Consumidor final». Un cliente mayorista cambia todos los precios a mayorista al instante y lo señala. Alta rápida: nombre + teléfono.
- **Cobro dividido paso a paso:** elegir medio → monto precargado con lo que falta → «Agregar pago» → el panel se reinicia con el nuevo saldo. Cada pago se puede quitar.
- **Efectivo Gs.:** botones de billete («Exacto», redondeos) y vuelto en vivo. **Efectivo US$:** cotización editable, equivalente en Gs. y vuelto en guaraníes.
- **Transferencia:** cuentas del negocio con Titular, Cuenta y Alias copiables con un toque; comprobante opcional.
- **Crédito/fiado:** exige cliente, muestra límite y deuda, vencimiento por chips (7/15/30/60 días). Si supera el límite aparece el bloqueo y solo avanza con **PIN de administrador**.
- **Envío (retiro, delivery, encomienda)** suma el costo al total; la dirección se pide solo cuando aplica.
- **Éxito:** vuelto grande para entregar, recibo, Imprimir y WhatsApp, y «Nueva venta» como acción principal.

## Fuera del prototipo (a definir en la implementación)
Impresión real y cola (`docs/IMPRESION.md`), validación de cupones y gift cards contra el backend, aprobación de crédito con registro de auditoría, permisos por rol y descuentos máximos por vendedor.
