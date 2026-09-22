# #240 ítem 3 (acceso CRM/portal) — Informe de dispositivo del cliente

Del épico #240 (*inspiración PhoneCheck*): el **informe de dispositivo** con QR,
público, con modelo, IMEI enmascarado, grado, batería, locks, garantía y quién
verificó. Esta entrega cubre el **acceso del cliente**: link público por serial +
WhatsApp desde su **ficha** y el enlace en su **cuenta/portal**. Capturas en
`docs/QA-240-informe-dispositivo/`.

## Qué había y qué faltaba

- **Datos disponibles por unidad:** serial (único por empresa), condición,
  batería, verificación física (quién/cuándo/código/cantidad), el producto, la
  venta (por `OrderItemSerial`) y la garantía por serial.
- **Faltaba:** el informe **no existía como página pública** ni había forma de
  abrirlo/compartirlo desde la ficha del cliente o su portal.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/public/units/[serial]/route.ts` (nuevo) | **Público sin sesión** (rate limit 30/min como el resto de los públicos): resuelve la empresa que vendió/verificó el equipo, y devuelve modelo, serial e **IMEI enmascarados**, condición, batería, verificación física, venta (pedido/fecha/sucursal), garantía (estado/vencimiento) y la última consulta de IMEI. Placeholders `grade`/`checklist` para INV |
| `src/pages/UnidadPublica.jsx` (nuevo) + ruta `/u/:serial` en los dos grupos públicos | La página del informe (encabezado de la tienda, secciones, **Copiar enlace** e **Imprimir**) con disclaimer “no es un certificado oficial” |
| `src/lib/demoInforme.js` (nuevo) | Paridad demo: el informe sale de los pedidos/unidades del navegador (Aurora Móviles) |
| `CustomerProfile` (Pedidos → dispositivos) | Dos accesos por equipo: **Ver informe** (copia el link y lo abre; en demo navega en la misma pestaña) y **Compartir por WhatsApp** (el mensaje lleva el link; sin teléfono, copia el enlace) |
| Portal `/cuenta` (+ payload backend y demo) | Sección **“Informes de tus equipos”** con “Ver informe” por equipo comprado (`informes: [{ serial, model, orderNumber }]`) |

## Coordinación (contrato)

- **INV:** exponer `grade` (A/B/C/D) y `checklist` (claves canónicas del módulo de
  valuación: `pantalla`, `faceid`, `reparado`, `bateria`, `camaras`, `carcasa`,
  `conectividad`, `audio`, `sensores`, `botones`) — el informe ya reserva los
  campos y los muestra cuando lleguen. También: locks (iCloud/MDM/ESN/carrier) y
  repuestos/reparaciones si los van a publicar.
- **DSN:** puede reusar la página `/u/:serial` desde el rack/inspección; el
  acceso usa los objetos compartidos (`IconAction` con `external`/`send`). Si
  prefieren **token** en vez de serial en la URL (privacidad), se cambia en un
  solo lugar (`enlaceInforme` + la ruta + el payload).
- **PRN:** el informe impreso (80/A4) puede reusar la misma página (tiene
  **Imprimir**) o sus layouts; el contenido ya está normalizado.

## Evidencia

| Captura | Qué muestra |
|---|---|
| `01-ficha-informe-acciones.png` | Ficha del cliente → Pedidos → equipo con **Ver informe**, **Compartir por WhatsApp** + Verificación IMEI y garantía |
| `02-informe-publico.png` | **Informe público** (`/u/<serial>`) del equipo vendido: modelo, serial/IMEI enmascarados, verificación, compra y disclaimer |
| `03-cuenta-informes.png` | **Cuenta del cliente**: sección “Informes de tus equipos” con “Ver informe” por equipo |
| `04-informe-demo.png` | El mismo informe en la **demo** (Aurora Móviles), con datos del navegador |

## Verificación

- Unit: `src/lib/demoInforme.test.js` **3 ✓** (informe demo, serial inexistente,
  los informes en la cuenta demo).
- e2e `e2e/qa-240-informe.spec.js` **2 ✓**: (1) cuenta real — unidad + venta con
  serial → ficha → informe público en otra pestaña → WhatsApp con el link →
  cuenta del cliente con la sección; (2) demo con datos del navegador.
- `lint` 0 · `npm test` ✓ · backend `test:unit` ✓ y `tsc` ✓ · builds FE/BE con
  `BUILD_ID` · `prisma:validate` ✓ (sin cambios de schema) · sin marcadores ·
  `test:e2e:smoke` ✓.
