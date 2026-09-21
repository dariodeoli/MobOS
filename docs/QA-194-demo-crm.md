# QA #194 — Demo completo: Clientes / Servicio (CRM)

Modo demo del CRM con **datos ficticios visibles** y **sin llamar al API real**.
Capturas en `docs/QA-194-demo-crm/` (1440×900, headless, app construida).

## Qué se ve en la demo (datos ficticios)

| Pantalla | Datos de ejemplo | Captura |
|---|---|---|
| Clientes (lista) | Lucía Fernández (con deuda), Distribuidora del Este S.A. (mayorista), Carlos Ramírez | `01-clientes-demo.png` |
| Ficha · Resumen | **Saldo pendiente Gs 1.500.000** desglosado (MOB-#0008), total gastado, órdenes activas, antigüedad, RUC, paga impuestos, **seguro activo 12,5%**, etiquetas, últimas órdenes + Ver todas | `02-ficha-resumen-deuda.png` |
| Ficha · Pedidos | MOB-#0008 (pendiente, saldo), MOB-#0005 y MOB-#0002 (completados) | `03-ficha-pedidos.png` |
| Ficha · Cronología | cliente creado, pedido, pago, comentario del equipo, seguimiento, autorización de crédito, garantía y cambio de tipo | `04-ficha-cronologia.png` |
| Ficha · Datos | seguro con interruptor activo y **porcentaje 12,5%** (deshabilitado en demo), etiquetas, notas, direcciones, facturación | `05-ficha-seguro.png` |
| Ficha · Estadísticas | ticket promedio, frecuencia, meses/días de mayor actividad, favoritos | `06-ficha-estadisticas.png` |
| Portal · cuenta | token `demo-…` resuelto en el navegador: saldo, vencimientos, pedidos con comprobante, direcciones (nivel completo) | `07-portal-cuenta-demo.png` |
| Portal · vitrina | pedidos y saldos del cliente demo | `08-portal-vitrina-demo.png` |
| Servicio Técnico | OS-#0001 Diagnóstico, OS-#0002 Esperando repuesto, OS-#0003 Listo, OS-#0004 Recibido; catálogo y checklists demo | `09-servicio-demo.png` |

## Verificación automática

`e2e/auth.spec.js` (proyecto `core`, sin sesión):

- `demo: la ficha del cliente abre sin sesión y no consulta el API` — ficha desde la fila y por `?cliente=`, acciones deshabilitadas, plantillas demo de WhatsApp.
- `demo: ficha con deuda, cronología, seguro, portal y servicio` — recorre la ficha sembrada (deuda, cronología, seguro 12,5%), abre el portal demo de cuenta y vitrina, entra a Servicio Técnico y **afirma que no hubo ningún pedido a `/api/customers`, `/api/message-templates`, `/api/service-*`, `/api/portal` ni `/api/public/portal`**.

## Hallazgos durante el QA (corregidos en el mismo lote)

- El token demo del portal se parseaba con doble prefijo (`demo-demo-…`) y el portal quedaba vacío.
- La pestaña Cronología en demo todavía consultaba `/api/customers/:id/timeline` (401) en vez de usar los datos ficticios.

## Observaciones (fuera del CRM)

- En demo siguen apareciendo 401 de otros dominios (presence, créditos, impresoras, avatar): ruido conocido, no bloquea el recorrido.
- Estos cambios viajan en `slot/clientes`; la demo pública recién los mostrará tras integrar y deployar (producción verificada: v1.0.126).
