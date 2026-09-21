# QA #187 — Clientes y portal público en PRODUCCIÓN

Recorrido funcional headless (Playwright, Chromium) contra
`https://app.moboss.online/demo` y los públicos de
`https://clientes.moboss.online`. **Versión desplegada verificada: v1.0.126.**

- Script reproducible: `e2e/prod/187-clientes.mjs`
  (`node e2e/prod/187-clientes.mjs`; capturas en `QA187_SHOTS`, por defecto `/tmp/qa187`).
- Capturas de esta corrida: `docs/QA-187-clientes-produccion/`.
- Sin escrituras en producción: la demo vive en `localStorage` del navegador y
  los públicos se probaron con tokens inválidos.

## Verificado (sin sesión real)

| Área | Pasos | Resultado |
|---|---|---|
| Demo Dueño | `/demo` → Dueño (PIN 3001) → menú **Clientes** | Abre la vista; tabla compacta con filtros segmentados (#166 desplegado) |
| Alta | `+ Crear cliente` → Primer nombre + Segundo nombre + teléfono → Guardar | El cliente queda en la lista (demo local) |
| Búsqueda | Escribir el nombre sin Enter | Instantánea; encuentra la fila |
| Teléfono | Ver la celda Teléfono | `+595 981 222 333` (formato único) |
| Filtros | Chips Todos / Mayoristas / Con deuda / Con crédito | Responden (grupo accesible “Filtrar clientes”) |
| Mobile | 390×844 | Sin scroll horizontal (`scrollWidth == clientWidth`) |
| Demo Vendedor | `/demo` → Vendedor (PIN 2001) → Clientes | Lista visible (QA por rol) |
| Público `/cuenta/<token inválido>` | Abrir en anónimo | “Cuenta no encontrada”, mensaje genérico, sin datos y sin scroll |
| Público `/portal/<token inválido>` | Idem | “Este enlace no es válido o venció”, sin datos |
| Público `/garantia/<token inválido>` | Idem | “Garantía no encontrada”, sin datos |
| API | `GET /api/portal/…`, `/api/public/portal/…`, `/api/public/warranty/…` con token inválido | **404** en los tres (sin enumeración) |

## No verificable sin sesión real (pasos para hacerlo)

1. **Ficha, deuda, cronología y seguro del cliente** (producción, con sesión):
   1. Entrar a `https://app.moboss.online/login` con la empresa y el PIN de un usuario con permiso.
   2. Ir a **Clientes** y abrir la ficha de un cliente con pedidos.
   3. Revisar **Resumen** (total gastado, saldo pendiente, órdenes activas), la **deuda por pedido** y **Últimas órdenes → Ver todas**.
   4. Pestaña **Cronología**: pedidos, pagos, entregas, cambios y solicitudes; probar **Cargar más**.
   5. Pestaña **Datos → Seguro del cliente**: encender el interruptor, cargar un % y verificar que la venta siguiente sume el seguro al costo (requiere rol ADMIN/GERENTE).
2. **Portal con token válido**: en la ficha → **Portal del cliente** → generar/copiar el enlace (o **Regenerar**), abrirlo sin sesión y verificar saldo, vencimientos, pedidos, **Ver comprobante**, garantías (nivel completo) y la **Nota de la tienda**.
3. **Garantía pública con token válido**: en Garantías → fila → copiar el enlace del QR y abrirlo sin sesión.

## Hallazgos y observaciones (sin bugs de producto)

- **Demo (resuelto en #189):** el clic en la fila ya abre la ficha con los datos del navegador y `?cliente=<id>` se resuelve contra la demo; la ficha avisa “Modo demo” y las acciones quedan deshabilitadas (nada pega al API real).
- **Demo:** quedan llamadas 401 a `api.moboss.online` (presence, créditos, impresoras) porque la demo no tiene sesión; no bloquean el recorrido. Ruido conocido de otros dominios.
- **Agente de impresión:** el navegador intenta `http://127.0.0.1:17890/health` (puerto del agente local); sin agente instalado falla y es el comportamiento esperado.
- **#178 (rate limit + hash en públicos):** no está desplegado en v1.0.126 (la rama `slot/clientes` lo trae). Por eso la sonda de 35 pedidos a `public/warranty` no mostró 429; se re-verifica tras integrar/deployar.
