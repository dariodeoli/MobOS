# QA #187 — Recorrido funcional del POS en producción (`/demo`)

**Superficie:** https://app.moboss.online/demo · **Versión desplegada:** v1.0.127 ·
**Método:** Playwright headless (chromium, 1440×900 + 390×844), 12 pasos ·
**Script:** `scripts/qa-187-pos-demo.mjs` · **Evidencia cruda:** `docs/qa/187/resultados.json`
(+ 19 capturas en `docs/qa/187/`).

La demo es un modo aislado en el navegador (datos ficticios, sin API de la tienda):
se recorrió el **flujo del vendedor** (PIN 2001) sin tocar datos reales.
Resultado: **12/12 pasos ejecutados, sin fallos de script**.

## ✅ Verificado en verde

- **Venta en una sola pantalla**: el buscador de productos y el total de la venta
  quedan visibles sin cambiar de pantalla (buscador a 773/900 px, total a 310/900 px);
  chip «Hoy: 21/09/2026» y barra del día en el encabezado. → `03-pos-pantalla-unica.jpg`
- **Catálogo con modelo y capacidad**: buscar «iPhone 15 Pro» sugiere
  *iPhone 15 Pro 256GB Titanio* / *…Negro*; un clic lo suma al carrito
  (Gs 6.850.000) y la tarjeta muestra variantes y stock («4 en stock»). →
  `04-catalogo-resultados.jpg`, `05-producto-agregado.jpg`
- **Carrito**: segundo producto + cantidad 2 → Gs 13.880.000 (2 productos · 3 unidades);
  descuento extra de Gs 100.000 → Gs 13.780.000 con la leyenda «Descuento − Gs 100.000»;
  **«Borrar descuento»** vuelve a Gs 13.880.000. → `06-carrito-descuento.jpg`, `07-carrito-sin-descuento.jpg`
- **Split de pagos**: pago parcial en *Caja demo · Gs* (Gs 3.000.000) → aparece
  **«Dividir saldo (Gs 10.880.000)»**; el bloque nuevo queda con el saldo precargado y se
  elige *Transferencia ficticia*; el botón principal sigue en naranja
  (**Crear pedido**) y pasa a verde (**Confirmar venta**) al cubrir el total. →
  `11-split-parcial.jpg`, `12-split-dividido.jpg`
- **Entrega**: *Delivery* con costo Gs 30.000 suma «Entrega + Gs 30.000» al total
  (Gs 13.910.000); *Retiro en tienda* deshabilita el monto. → `13-entrega-delivery.jpg`, `14-entrega-retiro.jpg`
- **Cierre de venta**: «Confirmar venta · 3 productos · Gs 13.910.000» → el carrito se
  vacía y la barra del día sube (ventas/pedidos/facturación). → `15-venta-antes-de-confirmar.jpg`, `16-venta-confirmada.jpg`
- **Móvil 390×844**: sin desborde horizontal (0 px), buscador y carrito operativos
  (agregar un producto actualiza el total). → `18-pos-movil.jpg`, `19-pos-movil-carrito.jpg`

## 🔎 Hallazgos

### 1. (Funcional · **real, corregido en esta rama**) «Dividir saldo» no precargaba el monto

**Pasos:** POS → agregar producto → *+ Agregar pago* → cuenta *Caja demo · Gs* +
monto parcial (Gs 3.000.000) → pulsar **«Dividir saldo (Gs 10.880.000)»**.
**Observado (v1.0.127):** el bloque nuevo aparecía con el **monto vacío** (el valor
precargado iba al campo legacy `monto`, que la vista con cuentas no usa; el campo
visible es `originalAmount`). **Corregido** en `src/components/ventas/FormularioVenta.jsx`
(la precarga ahora va a `originalAmount`) con regresión e2e en `e2e/pos-checkout.spec.js`
(click en «Dividir saldo» → el bloque nuevo vale Gs 20.000 ✔). → `11-split-parcial.jpg`, `12-split-dividido.jpg`

### 2. (Demo/cobertura · media) Analytics del POS no calcula en la demo: muestra «Falta sesión.»

**Pasos:** POS → botón **Analytics**. **Observado:** el modal abre pero solo muestra
`Falta sesión.`. `AnalyticsPos` pide `GET /api/orders` sin rama de demo, así que en
`/demo` no hay métricas (el encabezado del POS sí las muestra). **Sugerencia:** en
`isDemoRuntime`, armar el tablero con las ventas locales (como el resumen del día) o
mostrar un aviso de demo honesto en lugar del error técnico. → `17-analytics-modal.jpg`

### 3. (Demo/cobertura · baja) Métricas del día: una venta de 3 unidades sumó 3 «ventas · pedidos»

**Pasos:** anotar «TU DÍA» (2 ventas · 2 pedidos) → vender 2 productos / 3 unidades
(Gs 13.910.000) → «TU DÍA» queda en **5 ventas · 5 pedidos** y la facturación sube
13.880.000 (sin el costo de entrega). **Causa:** en el camino demo (sin API) la venta se
guarda **una fila por línea** (`addVenta` dentro de `for (lineas)`) y el contador usa
`hoy.length`; con sesión real `guardarOrdenApi` guarda **una** fila por pedido
(`precio` = total, con entrega). **Impacto:** solo demo (métricas engañosas). →
`03-pos-pantalla-unica.jpg`, `16-venta-confirmada.jpg`

### 4. (Demo/cobertura · baja) El buscador de clientes no encuentra clientes demo

**Pasos:** POS → campo *Cliente* → escribir «María». **Observado:** sin coincidencias
(el seed no carga clientes en `mobos:demo-customers:v1` hasta que se crea uno); la venta
se puede cerrar escribiendo un nombre nuevo (se guarda como ficha demo). **Sugerencia:**
sembrar 2–3 clientes demo para poder mostrar también la búsqueda por nombre/teléfono.
→ `08-cliente-nuevo.jpg`

### 5. (Cobertura · informativo) Borradores no se pueden ejercitar en la demo

**Pasos:** POS con productos → **Suspender venta** y **Ventas suspendidas**.
**Observado:** ambas entradas muestran el mismo aviso honesto («Las ventas suspendidas
se guardan en el servidor de tu tienda… En la demo no se guardan ni se simulan»).
Queda documentado para sesión real (ver abajo). → `09-borrador-aviso-demo.jpg`, `10-borradores-listado-demo.jpg`

## ⏳ Para cerrar con sesión real (pasos exactos)

1. **Borradores**: POS con carrito → *Suspender venta* → poner etiqueta → *Suspender*;
   en *Ventas suspendidas* ver el listado, retomar (el carrito vuelve completo) y
   compartir enlace público (el token se muestra una vez; regenerar invalida el anterior).
2. **Analytics del POS**: abrir el modal con la sesión de la tienda y verificar
   «Ventas de hoy» vs ayer, «Ticket promedio», «Top productos», «Cobros por medio»,
   «Cobros por cuenta» y el selector **Hoy / 7 días / Este mes**.
3. **Cierre real**: confirmar una venta y ver en *Mis pedidos* el número/comprobante y
   en el detalle el timeline y las acciones (cobrar saldo, nota, menciones).

## Notas de método

- Ruido de la demo (heredado de #185): 11 errores de consola, **10 respuestas 401** a la
  API real (presence/heartbeat, avatar, printers, orders) y 1 pedido fallido
  (`http://127.0.0.1:17890/health`, agente de impresión local del visitante).
- La demo **no** toca datos de la tienda: los «guardados» viven en el navegador.
