# QA #187 — Clientes completo en PRODUCCIÓN

## Corrida vigente — v1.0.175 (26/09/2026)

`node e2e/prod/187-clientes.mjs` contra `app.moboss.online` y los públicos de
`clientes.moboss.online` (Playwright headless, sin sesión real): **22/22 pasos
OK** · **28 capturas** · la demo **no llamó al API** de clientes/portal/warranty
· públicos con token inválido **404 genéricos sin datos** · rate limit #178
activo (429 al pedido 29, con `Retry-After`). Evidencia:
`docs/QA-187-clientes-produccion-v175/` (capturas + `resultados.json` sellado
con la versión).

**Nuevo en esta corrida** (además de los 20 pasos de la base):

| # | Área | Resultado | Captura |
|---|---|---|---|
| 21 | **Ojito → resumen rápido (#236)** | KPIs de Lucía (Gs 7.750.000) y acciones WhatsApp / Ver detalle completo | `21-ojito-resumen-rapido.png` |
| 22 | **Portal cuenta demo: avisos + cotización + seguimiento** | «Tu cotización COT-#0018 vence en 2 días» · «Tu pago vence en 6 días» · «MOB-#0008 está en camino» · cotización con enlace · pasos del envío | `22-portal-cuenta-novedades.png` |
| 23 | **El pedido en detalle (#240)** | «Qué compraste» (iPhone 15 · 128 GB) y «Tus pagos de este pedido» (Gs 1.500.000) | `23-portal-pedido-detalle.png` |
| 24 | **Vitrina: seguimiento de la entrega** | pasos del envío («En camino al cliente») también en `/portal/<token>` | `24-portal-vitrina-seguimiento.png` |
| 25 | **Mi cuenta/perfil desde el avatar (#253)** | perfil + preferencias del dispositivo + sesión actual | `25-mi-perfil.png` |

### Hallazgos (no bloquean el producto)

1. **Ruta/entrada del perfil personal (#253).** La coordinación del lead pedía
   `/mi-perfil` (`shell-mi-perfil`), pero la integración que salió en v1.0.175
   conservó `/mi-cuenta` (`shell-mi-cuenta`; para el dueño abre la pestaña de
   Configuración). Ambas pantallas funcionan y muestran lo mismo; conviene
   **decidir el nombre canónico y unificar** (el dominio shell/rutas es del lead
   PLT). El verificador acepta las dos y registra la desplegada
   (`resultados.json → perfil`).
2. **Nota pública en la demo** (limitación conocida): el campo se edita en la
   ficha, pero el guardado y el render de «Nota de la tienda» en el portal
   requieren una cuenta real.
3. **Observación del verificador (no del producto):** el ítem «Clientes» del
   menú pasó a tener más de una coincidencia accesible (sidebar y menú mobile);
   el paso ahora navega directo a `/clientes` (sin depender del clic del menú).

> El popup del ojito titula «Cliente: Lucía Fernández» (no repite «Resumen
> rápido» en el cuerpo): es una decisión de diseño, no un hallazgo.

## Corrida anterior — v1.0.138 (22/09/2026)

Recorrido funcional headless (Playwright, Chromium) contra la demo pública
(`/demo` → Dueño y Vendedor), los públicos de `clientes.moboss.online` y el API
público. **Versión desplegada verificada: v1.0.138** (22/9/2026, 01:41 UTC).
Incluye la evidencia de **#221** (agregados de clientes como la cuenta real).

- Script: `e2e/prod/187-clientes.mjs` (`node e2e/prod/187-clientes.mjs`;
  capturas en `QA187_SHOTS`, por defecto esta carpeta).
- Resultado crudo: `resultados.json` — **17/17 pasos OK**, 23 capturas.
  La demo **no llamó al API de clientes/portal/warranty** y los públicos con
  token inválido no mostraron datos.
- Sin sesión real ni escrituras: la demo vive en memoria de la pestaña (#204) y
  los públicos se probaron con tokens inválidos (más el rate limit de #178).
- Evidencia #221 en detalle: `docs/QA-221-demo-clientes-prod.md` y
  `docs/QA-221-demo-clientes-prod/` (script `scripts/qa-221-clientes-produccion.mjs`).

> **Nota de versión:** la corrida original fue sobre **v1.0.137**; cuando el
> deploy **v1.0.138** (`main` en `fcf84fcb`) quedó publicado se repitió completa
> sobre esa versión (mismos 17/17). Los scripts son repetibles y sellan la
> versión que encuentren: `node e2e/prod/187-clientes.mjs` y
> `node scripts/qa-221-clientes-produccion.mjs`.

## Verificado (17/17)

| # | Área | Resultado | Captura |
|---|---|---|---|
| 1 | Entrada anónima a `/demo` + versión desplegada | **v1.0.138**, sin login, aviso de datos ficticios | `01-demo-entrada.png` |
| 2 | Listado de clientes con **agregados reales (#221)** | Lucía con **5 compras** y **Gs 7.750.000**; la cartera demo (12) con pedidos/totales | `02-clientes-agregados.png` |
| 3 | Búsqueda instantánea y filtros | “Lucía” → 1 fila · sin resultados → 0 filas · chips Todos/Mayoristas/Con deuda/Con crédito | `03-clientes-busqueda.png` |
| 4 | Alta de cliente en demo | `+ Crear cliente` → Guardar → queda en la lista (local, sin API) | `04-clientes-alta.png` |
| 5 | Ficha → **Resumen** | Total gastado Gs 7.750.000 · Saldo pendiente Gs 1.500.000 (Deuda) · Órdenes activas · Última compra 9/9/2026 · “Cliente desde” · últimas órdenes MOB-#0008/MOB-#0005 | `05-ficha-resumen.png` |
| 6 | **Deuda por pedido** | Bloque de deuda con el pedido pendiente MOB-#0008 y su saldo | `06-ficha-deuda.png` |
| 7 | **Pedidos asociados** | Historial completo (incluida MOB-#0031 **Cancelado**) y equipos con IMEI/serial (`356789012345678`) | `07-ficha-pedidos.png` |
| 8 | **Cronología** | Pedido creado, pago, comentario del equipo y garantía registrada | `08-ficha-cronologia.png` |
| 9 | **Datos → Seguro del cliente** | Interruptor activo (deshabilitado en demo) con 12,5% | `09-ficha-seguro.png` |
| 10 | **Datos → Nota pública** | Campo “Nota pública (visible al cliente)” presente y editable; “Nota interna” y **Guardar notas** bloqueados en demo | `10-ficha-nota-publica.png` |
| 11 | **Estadísticas (#221)** | 5 compras (la cancelada no cuenta) · ticket Gs 1.550.000 · frecuencia **Cada 172 días** · gasto por mes · favoritos por producto/modelo/categoría | `11-ficha-estadisticas.png` |
| 12 | **WhatsApp** | Plantilla con el nombre interpolado y `Abrir WhatsApp` → `wa.me/595981123456?text=…` | `12-whatsapp-plantilla.png` |
| 13 | **Portal del cliente (demo)**: QR y enlace por token | `/cuenta/demo-demo-cliente-lucia-rapido` | `13-portal-qr.png` |
| 14 | Portal → cuenta | Saldo **Gs 1.500.000** | `14-portal-cuenta.png` |
| 15 | Portal → vitrina (`/portal/…`) | Pedido MOB-#0008 | `15-portal-vitrina.png` |
| 16 | Portal → nivel completo | Saldo y bloques del nivel completo | `16-portal-completo.png` |
| 17 | `?cliente=<id>` abre la ficha | Con los datos demo | `17-cliente-por-url.png` |
| 18 | Servicio Técnico demo (contexto) | OS-#0001 y OS-#0002 | `18-servicio-demo.png` |
| 19 | Mobile 390×844 | Sin scroll horizontal de página; la tabla del listado scrollea dentro de su contenedor | `19-clientes-mobile.png` |
| 20 | Demo **Vendedor** | La cartera demo carga con el rol | `20-demo-vendedor.png` |

## Públicos y API (sin sesión)

| Público (token inválido) | Resultado | Captura |
|---|---|---|
| `/cuenta/token-inexistente…` | Mensaje genérico, **sin datos** ni montos | `21-publico-cuenta.png` |
| `/portal/token-inexistente…` | Idem (“no es válido o venció”) | `22-publico-vitrina.png` |
| `/garantia/token-inexistente…` | Idem (“Garantía no encontrada”) | `23-publico-garantia.png` |

- API con token inválido: **404** en `/api/portal/…`, `/api/public/portal/…` y
  `/api/public/warranty/…` (sin enumeración ni datos).
- **Rate limit (#178) verificado en producción**: superados los 30 pedidos por
  minuto por IP y ruta, el API responde **429 con `Retry-After`**.

## Nota pública (alcance verificado)

- La ficha muestra el campo **Nota pública (visible al cliente)** y lo distingue
  de la nota interna (“solo equipo, nunca visible al cliente”); en demo el
  guardado está bloqueado y la nota no se persiste.
- El render **“Nota de la tienda” en la vitrina del portal** requiere un cliente
  con nota pública: ningún seed demo la trae y el guardado necesita sesión real
  → queda en los pasos pendientes (siguiente sección). Sugerencia para una
  próxima iteración de demo: sembrar una nota pública en un cliente demo para
  poder mostrarla en la vitrina sin sesión.

## Pendiente sin sesión real (pasos documentados)

1. **Portal con token real de una venta** (requiere sesión): Clientes → ficha →
   **Portal del cliente** y generarlo; abrirlo sin sesión y verificar saldo,
   vencimientos, **Ver comprobante**, la **Nota de la tienda** y las garantías
   (nivel completo).
2. **Nota pública de punta a punta**: Datos → Nota pública → escribir →
   **Guardar notas** (con sesión) y verla como “Nota de la tienda” en la cuenta
   y la vitrina del cliente.
3. **Garantía pública con token válido**: la página `/garantia/<token>` no tiene
   modo demo; requiere sesión (Garantías → fila → copiar el enlace del QR).
   **Resuelto en la rama `slot/clientes`**: la garantía demo abre desde el
   portal con `?demo=1` y el flujo real (token válido → credencial) queda
   cubierto por `e2e/qa-240-garantia-portal.spec.js`
   (`docs/QA-240-garantia-portal.md`).
4. **Seguro del cliente afectando una venta real** (rol ADMIN/GERENTE): Datos →
   Seguro → encender y cargar % → la venta siguiente lo suma al costo.

## Hallazgos y observaciones (sin bugs de producto)

- **Cero fallos** en los 17 pasos; la demo no tocó el API real y los públicos no
  filtraron datos.
- **Observaciones de demo** (las seis de #221 siguen vigentes —ver
  `docs/QA-221-demo-clientes-prod.md`— y se suman):
  - la nota pública se edita en la ficha pero el guardado y el render de “Nota
    de la tienda” requieren cuenta real;
  - la vitrina no muestra “Nota de la tienda” porque ningún cliente demo tiene
    la nota sembrada.
