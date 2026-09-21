# #224 — Servicio y Garantías en una sola sección

Garantías y Servicio Técnico quedaron en **un solo módulo** con distinción clara:
cada registro muestra su tipo y una garantía puede pasar al taller conservando
el historial.

## Qué cambia

- **Un ítem de menú:** “Servicio y Garantías” (antes “Servicio Técnico” +
  “Garantías”). La pantalla tiene las solapas **Todo · Servicio · Garantías**:
  las dos últimas son las pantallas de detalle de siempre; **Todo** las lista
  juntas.
- **Badge por tipo:** `Garantía` (registros del módulo de garantías) o
  `Servicio` (órdenes del taller). Una orden nacida de una garantía dice
  **“Desde garantía”**; la garantía que ya está en el taller dice **“En
  servicio”** con su número de orden (`OS-#0005`).
- **Conversión garantía → servicio:** en la fila de una garantía, “Pasar a
  servicio” crea la orden copiando cliente, equipo, serial y diagnóstico, y la
  vincula al caso (`ServiceOrder.warrantyCaseId`, migración aditiva e
  idempotente + `ON DELETE SET NULL`). Cada garantía admite una sola conversión
  (409 si se repite) y ambos registros conservan su historial.
- **API:** `POST /api/service-orders` acepta `warrantyCaseId`; `GET
  /api/service-orders` devuelve `warranty` (origen) y `GET /api/warranties`
  devuelve `serviceOrderId/Number/Status` (destino). La auditoría registra
  `SERVICE_ORDER_FROM_WARRANTY`.
- **Demo:** la solapa Todo lee los datos del navegador (`demoWarranties` +
  `demoServicio`) y la conversión también es local (nada toca la tienda real);
  el seed demo ya trae un caso convertido (`OS-#0001`) para mostrar la
  distinción.
- **Ayuda:** dos entradas nuevas en Documentación (“Pasar una garantía al
  taller” y “Servicio y garantías en una sola sección”).
- **Excepción acotada de nav (documentada):** en `src/pages/PanelVendedor.jsx`
  el ítem `garantias` sale del menú, pero sigue siendo una ruta válida
  (alias del dueño) para que `/garantias`, la documentación y los enlaces
  viejos abran la solapa de garantías. El ícono `wrench` que el menú ya
  pedía se agregó al `Icon` compartido (queda como propuesta de etiqueta/ícono
  para DSN: llave para servicio, escudo para garantía).

## Evidencia

- `qa224-todo-garantia.png` — cuenta real: la garantía recién creada en
  “Todo” con badge **Garantía**.
- `qa224-todo-servicio.png` — cuenta real: después de “Pasar a servicio”, la
  fila de la garantía dice **En servicio** y la orden creada aparece como
  **Servicio · Desde garantía** (mismo serial); un solo ítem en el menú.
- `qa224-demo-todo.png` / `qa224-demo-conversion.png` — demo: la lista con los
  dos tipos y el caso convertido en el navegador (`OS-#0005`), con el aviso
  “DEMO · NO SE GUARDÓ EN LA TIENDA”.

## Verificaciones

- `npm run lint` 0 errores.
- `npm test` 476 ✓ · `npm --prefix backend run test:unit` 71 ✓.
- Builds FE y BE exit 0 con `backend/.next/BUILD_ID` · `prisma:validate` ✓ ·
  `db:check` ✓ (“la base coincide con prisma/schema.prisma”).
- Sin marcadores de conflicto.
- e2e: `servicio y garantías: la garantía pasa al taller con su historial`
  (real, incluye el 409 del duplicado), `demo: ficha con deuda, cronología,
  seguro, portal y servicio` (demo, con la conversión local y sin llamar al API
  real), `garantías → alta en modal…`, `servicio técnico → crea la orden…`,
  `la documentación cubre clientes, garantías y servicio técnico` ✓.
- `npm run test:e2e:smoke` 7 ✓.

## Observaciones

- `e2e/servicio-tecnico.spec.js` (catálogo sugerido) tiene un flake
  **pre-existente**: se reprodujo también con el código de `origin/main`
  (stash temporal), 1 de 3 corridas, por la carrera entre el botón “Cargar
  catálogo sugerido” y la carga del catálogo. No se toca en esta rama.
- En 1280 px con todos los controles del topbar, el título de la sección se
  recorta (“Servicio y…”): es el ancho del topbar (área PLT/DSN), no la
  sección. En la demo, con menos controles, entra completo.
