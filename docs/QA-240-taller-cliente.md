# #240 §4 — El cliente ve su equipo en el taller (portal + ficha + cronología)

Del épico #240 (*inspiración PhoneCheck*), el **modo taller** ya existía del lado
interno (PLT: rack y estaciones; INV: unidades; PRN: hoja de estación). Faltaba
la otra mitad: **el cliente no veía nada de su reparación** — ni en el portal,
ni en la ficha, ni en la cronología. Esta entrega cierra ese circuito.

## Auditoría: qué había y qué faltaba

- **Ya existía:** pipeline del taller (`RECIBIDO → … → LISTO → ENTREGADO`), alta
  con costo desglosado, checklist de recepción, WhatsApp con plantilla por
  estado y la orden vinculada al cliente (`customerId`).
- **Brecha:** el portal del cliente (`/cuenta/<token>`) listaba pedidos,
  informes y garantías, pero **no las órdenes de servicio**; la cronología de la
  ficha tampoco las mostraba, así que «¿ya está?» se respondía solo por
  teléfono/WhatsApp manual.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/lib/service-order.ts` (nuevo) | Estados del taller con su **etiqueta de cliente** (fuente única del backend: portal, cronología y auditoría) |
| `backend/app/api/portal/[token]/route.ts` | Sección **`servicios`** en la cuenta del cliente: equipo, servicio, serial, **estado con etiqueta**, recibido y entregado. Sin costos, notas, técnico ni secreto de desbloqueo |
| `backend/app/api/customers/[id]/route.ts` | `serviceOrders` en el perfil: la ficha muestra estado, fechas y precio acordado |
| `backend/app/api/service-orders/route.ts` | La auditoría del alta y del cambio de estado guarda `customerId`, `device` y `serial` (el vínculo que alimenta la cronología del cliente) |
| `backend/app/api/customers/[id]/timeline/route.ts` | Eventos **«Equipo en taller»** (con estado y serial enmascarado) y **«Estado del taller»** (`Recibido → Listo para retirar`), con ícono propio y **sin montos ni costos** |
| `src/lib/estadosServicio.js` (nuevo) | Etiquetas y tonos compartidos por la tabla interna, la ficha, el portal y la demo |
| `src/components/control/ServicioTecnico.jsx` | Usa el mapa compartido (se elimina la copia local) |
| `src/components/customers/CustomerProfile.jsx` | Bloque **Servicio técnico** en la ficha (equipo, N.º, servicio, estado, recibido, entregado, precio) + ícono de taller en la cronología |
| `src/pages/CuentaPublica.jsx` | Sección **Servicio técnico** en el portal: equipo, orden, servicio, chip de estado, recibido y entregado |
| `src/lib/demoClientes.js` | Demo: Lucía con una orden **lista para retirar**, Carlos con una **entregada** y Fernando **en diagnóstico**; ficha, cronología y portal se arman con los mismos shapes que el API |

## Decisiones (documentadas)

- **El portal muestra estado y fechas, no plata ni datos internos.** Nunca
  viajan `costPyg`, `pricePyg`, `notes`, `diagnosis`, técnico ni el secreto de
  desbloqueo; el test de integración lo verifica sobre el JSON completo.
- **Una sola fuente de estados**: `ESTADOS_SERVICIO` (front) y `ESTADO_SERVICIO`
  (back) con las mismas etiquetas; la tabla del taller sigue siendo la dueña del
  pipeline (avance y validación).
- **La cronología se alimenta de la auditoría**: las órdenes nuevas (o con
  cambios posteriores a esta versión) aparecen; las viejas no se reconstruyen
  hacia atrás. El detalle es seguro: `Equipo en taller · iPhone 13 · serial
  AUR-… · Recibido` y `… · Recibido → Listo para retirar`.
- **Demo**: las órdenes viven en el navegador, igual que el resto de la demo
  (al recargar se vuelve a los ejemplos del seed).

## Verificación

```bash
# e2e (cuenta real del harness): ficha + cronología + portal, con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  npx playwright test e2e/servicio-tecnico.spec.js --project=admin

# integración HTTP (en el arnés: ficha, cronología, portal y aislamiento)
node backend/tests/customer-service.mjs <BASE_URL> <ADMIN_TOKEN> <SELLER_TOKEN>
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-240-taller-cliente/01-ficha-servicio.png` | Ficha → Servicio técnico: `iPhone 12 · 128 GB`, `OS-#0010`, «Cambio de batería», **Listo para retirar**, recibido 23/9/2026 |
| `docs/QA-240-taller-cliente/02-cronologia-taller.png` | Cronología: «Equipo en taller · … · serial TP-M…K6W · Recibido» y «Estado del taller · … · Recibido → Listo para retirar» |
| `docs/QA-240-taller-cliente/03-portal-servicio.png` | Portal del cliente: sección «Servicio técnico» con estado y fechas |
| `e2e/servicio-tecnico.spec.js` | 4/4 (las 3 del taller + la nueva del cliente); capturas en la carpeta de arriba |
| `backend/tests/customer-service.mjs` | En el arnés completo (exit 0): ficha, cronología con el recorrido de estado, portal **sin campos internos** y aislamiento entre clientes |
| `backend/tests/service-order.test.ts` + `src/lib/estadosServicio.test.js` | Etiquetas y tonos de los 8 estados; `npm test` **625 ✓** y backend `test:unit` **71 ✓** |
| `src/lib/demoClientes.test.js` | Demo: ficha, cronología (ingreso/entrega) y portal |

## Coordinación (para INV/PRN/CMP)

- Los estados y sus etiquetas quedan en `src/lib/estadosServicio.js` y
  `backend/lib/service-order.ts`: cualquier superficie nueva (impresos, rack,
  reportes) los importa en vez de repetir el mapa.
- Si el taller suma estados, se agregan en **ambos** mapas y el test de
  etiquetas (`service-order.test.ts`) falla si alguno queda sin traducir.
