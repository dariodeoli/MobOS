# QA #187 — Clientes completo en PRODUCCIÓN (v1.0.136)

Recorrido funcional headless (Playwright, Chromium) contra la demo pública
(`/demo` → Dueño y Vendedor), los públicos de `clientes.moboss.online` y el API
público. **Versión verificada: v1.0.136.** Incluye la evidencia de **#221**
(agregados de clientes calculados como la cuenta real).

- Script: `e2e/prod/187-clientes.mjs` (`node e2e/prod/187-clientes.mjs`;
  capturas en `QA187_SHOTS`, por defecto esta carpeta).
- Resultado crudo: `resultados.json` — **16/16 pasos OK**, 22 capturas.
  La demo **no llamó al API de clientes/portal/warranty** y los públicos con
  token inválido no mostraron datos.
- Sin sesión real ni escrituras: la demo vive en `localStorage` del navegador y
  los públicos se probaron con tokens inválidos (más el rate limit de #178).
- Evidencia #221 en detalle: `docs/QA-221-demo-clientes-prod.md` y
  `docs/QA-221-demo-clientes-prod/` (script `scripts/qa-221-clientes-produccion.mjs`).

## Verificado (16/16)

| # | Área | Resultado | Captura |
|---|---|---|---|
| 1 | Entrada anónima a `/demo` + versión desplegada | **v1.0.136**, sin login, aviso de datos ficticios | `01-demo-entrada.png` |
| 2 | Listado de clientes con **agregados reales (#221)** | Lucía con **5 compras** y **Gs 7.750.000**; la cartera demo (12) con pedidos/totales | `02-clientes-agregados.png` |
| 3 | Búsqueda instantánea y filtros | “Lucía” → 1 fila · sin resultados → 0 filas · chips Todos/Mayoristas/Con deuda/Con crédito | `03-clientes-busqueda.png` |
| 4 | Alta de cliente en demo | `+ Crear cliente` → Guardar → queda en la lista (local, sin API) | `04-clientes-alta.png` |
| 5 | Ficha → **Resumen** | Total gastado Gs 7.750.000 · Saldo pendiente Gs 1.500.000 (Deuda) · Órdenes activas · Última compra 9/9/2026 · “Cliente desde” · últimas órdenes MOB-#0008/MOB-#0005 | `05-ficha-resumen.png` |
| 6 | **Deuda por pedido** | Bloque de deuda con el pedido pendiente MOB-#0008 y su saldo | `06-ficha-deuda.png` |
| 7 | **Pedidos asociados** | Historial completo (incluida MOB-#0031 **Cancelado**) y equipos con IMEI/serial (`356789012345678`) | `07-ficha-pedidos.png` |
| 8 | **Cronología** | Pedido creado, pago, comentario del equipo y garantía registrada | `08-ficha-cronologia.png` |
| 9 | **Datos → Seguro del cliente** | Interruptor activo (deshabilitado en demo) con 12,5% | `09-ficha-seguro.png` |
| 10 | **Estadísticas (#221)** | 5 compras (la cancelada no cuenta) · ticket Gs 1.550.000 · frecuencia **Cada 172 días** · gasto por mes · favoritos por producto/modelo/categoría | `10-ficha-estadisticas.png` |
| 11 | **WhatsApp** | Plantilla con el nombre interpolado y `Abrir WhatsApp` → `wa.me/595981123456?text=…` | `11-whatsapp-plantilla.png` |
| 12 | **Portal del cliente (demo)**: QR y enlace por token | `/cuenta/demo-demo-cliente-lucia-rapido` | `12-portal-qr.png` |
| 13 | Portal → cuenta | Saldo **Gs 1.500.000** | `13-portal-cuenta.png` |
| 14 | Portal → vitrina (`/portal/…`) | Pedido MOB-#0008 | `14-portal-vitrina.png` |
| 15 | Portal → nivel completo | Saldo y bloques del nivel completo | `15-portal-completo.png` |
| 16 | `?cliente=<id>` abre la ficha | Con los datos demo | `16-cliente-por-url.png` |
| 17 | Servicio Técnico demo (contexto) | OS-#0001 y OS-#0002 | `17-servicio-demo.png` |
| 18 | Mobile 390×844 | Sin scroll horizontal de página; la tabla del listado scrollea dentro de su contenedor | `18-clientes-mobile.png` |
| 19 | Demo **Vendedor** | La cartera demo carga con el rol | `19-demo-vendedor.png` |

## Públicos y API (sin sesión)

| Público (token inválido) | Resultado | Captura |
|---|---|---|
| `/cuenta/token-inexistente…` | Mensaje genérico, **sin datos** ni montos | `20-publico-cuenta.png` |
| `/portal/token-inexistente…` | Idem (“no es válido o venció”) | `21-publico-vitrina.png` |
| `/garantia/token-inexistente…` | Idem (“Garantía no encontrada”) | `22-publico-garantia.png` |

- API con token inválido: **404** en `/api/portal/…`, `/api/public/portal/…` y
  `/api/public/warranty/…` (sin enumeración ni datos).
- **Rate limit (#178) verificado en producción**: superados los 30 pedidos por
  minuto por IP y ruta, el API responde **429 con `Retry-After`** (observado en
  la corrida: `pedido429: 17`, `retryAfter: 1` con la ventana ya parcialmente
  consumida). El item quedaba pendiente de re-verificación en el reporte
  anterior (v1.0.126): **cerrado**.

## Pendiente sin sesión real (pasos documentados)

1. **Portal con token real de una venta** (requiere sesión): Clientes → ficha →
   **Portal del cliente (demo)** y generarlo; abrirlo sin sesión y verificar
   saldo, vencimientos, **Ver comprobante** y la nota de la tienda.
2. **Garantía pública con token válido**: la página `/garantia/<token>` no tiene
   modo demo; requiere sesión (Garantías → fila → copiar el enlace del QR).
3. **Seguro del cliente afectando una venta real** (rol ADMIN/GERENTE): Datos →
   Seguro → encender y cargar % → la venta siguiente lo suma al costo.

## Hallazgos y observaciones (sin bugs de producto)

- **Cero fallos** en los 16 pasos; la demo no tocó el API real y los públicos
  no filtraron datos.
- **Observaciones de demo** (todas ya reportadas en `docs/QA-221-demo-clientes-prod.md`):
  la ficha cuenta 6 pedidos contra 5 compras del listado/Estadísticas; los
  avisos de demo (“No hay pedidos, pagos, deuda, cronología ni portal” y “las
  estadísticas se calculan con las ventas reales de la tienda”) quedaron
  desactualizados; los favoritos muestran montos en Gs 0; el portal dice
  “Tienda demo” (la tienda es Aurora Móviles); y la plantilla demo de Clientes
  deja “Tu pedido  ya está…”.
