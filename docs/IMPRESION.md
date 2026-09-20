# Reglas de impresión (MobOS)

Regla viva del proyecto, hermana de `docs/TOKENS.md` y `docs/AVATAR.md`. Antes de
tocar impresión (comprobantes, tickets térmicos, QR, puente remoto), seguí estas
reglas. La meta: que imprimir salga bien la primera vez y que, cuando falle, se
sepa **qué mirar en menos de un minuto**.

## 1. Caminos de impresión

| Camino | Cuándo | Qué usa |
| --- | --- | --- |
| **Directa (térmica)** | Preferido con agente/puente | ESC/POS nativo (`src/lib/printing/escpos.js`, `tickets.js`): nítido, rápido, sin diálogo. |
| **Diálogo del navegador** | Respaldo manual (A4 o térmica sin agente) | HTML del comprobante (`OrderReceipt.jsx`) impreso por `printHtml`. |

- La **vista previa del modal mide el ancho real del papel** (80 mm → 302 px,
  58 mm → 219 px). Lo que se ve es lo que sale.
- El HTML de impresión fuerza contraste real: `print-color-adjust: exact` y
  texto negro en `@media print`. Si un comprobante sale clarito, es porque se
  tocó ese bloque.
- El QR del comprobante va con corrección **H** y el módulo térmico en **7**:
  un QR chico o claro es la causa número uno de "no me lee el código".

### Documentos no fiscales (entrega, cobro y cotización)

| Documento | Se emite desde | Caminos |
| --- | --- | --- |
| **Nota de entrega** | Detalle del pedido (`/pos/pedidos/:id`) | Térmica (agente o puente) y A4 por diálogo |
| **Remisión interna** | Traslados (`/inventario/traslados`) | Térmica y A4, con firma de entrega y recepción |
| **Recibo interno** | Cobro del pedido (Pagos y comprobantes) | Térmica y A4, para un pago puntual |
| **Proforma / presupuesto** | Cotización (Enlace/QR) | Térmica y A4, sin el QR de aceptación |

- Todos llevan la leyenda visible **«Documento no fiscal»** y salen por
  `imprimirDocumentoNoFiscal` (`src/lib/printing/documentos.js`): primero la
  térmica (agente local o puente); el diálogo del navegador es solo el respaldo
  de un fallo claro. Tras encolar o un resultado incierto no se abre el diálogo.
- Los tickets ESC/POS viven en `src/lib/printing/tickets.js`; los HTML A4, en
  `src/components/shared/OrderReceipt.jsx` (mismo `styles()` que el comprobante).

## 2. Tokens del QR impreso (regla dura)

- El QR del comprobante usa el **token de impresión** del nivel
  (`impreso=true`), pedido por `tokenDeNivel()`.
- El panel **Acceso del cliente** lista y regenera **solo** los enlaces
  compartibles (`impreso=false`). Regenerar un enlace **no invalida el papel**.
- Nunca reutilices el token del panel para imprimir ni regeneres un token
  `impreso=true` salvo reimpresión explícita: el papel ya entregado moriría.
- El `Order.publicToken` histórico sigue funcionando como nivel rápido: es la
  red de seguridad de cualquier QR viejo.
- **Si un QR impreso dice "Seguimiento no encontrado"**: el token no existe, no
  es de ese pedido o fue revocado por una reimpresión/regeneración. Se reimprime
  el comprobante (genera token nuevo) y listo; no hay que tocar la base.

## 3. Cola honesta (agente y puente)

| Estado | Significado | Acción |
| --- | --- | --- |
| `pendiente` | En cola, la impresora no respondió todavía | Esperar; el agente reintenta solo. |
| `aceptado` | El transporte aceptó (TCP/CUPS), falta papel | Confirmar "Ya salió el papel" cuando salga. |
| `confirmado` | El operador vio el papel | Nada: la cola queda limpia. |
| `incierto` | No se sabe si salió (p. ej. reinicio en medio) | **No reintenta solo**: revisar y reimprimir a mano. |
| `fallido` | Agotó intentos | Revisar impresora en Configuración → Impresoras. |

- Aceptado **no** es confirmado: la UI lo dice y no inventa éxito.
- Con trabajos encolados, abrir el diálogo avisa antes (puede duplicar el
  ticket cuando el reintento llegue).
- El trabajo remoto se confirma desde Configuración → Impresoras (ahí está el
  número secreto del puente).

## 4. Errores frecuentes y qué hacer

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Al escanear el QR: "Seguimiento no encontrado" | Token revocado o de otro pedido | Reimprimir el comprobante (token de impresión nuevo). Ver §2. |
| "Imprimir con diálogo" sale clarito o lento | Contraste de impresión perdido o mucho contenido | Usar impresión directa; revisar §1 (color-adjust y texto negro). |
| La vista previa 80 mm tiene franjas blancas | Ancho de vista desalineado | `ANCHO_VISTA` de `ComprobantePreview.jsx` debe ser 302/219 px. |
| La impresora no responde | Apagada, sin red o IP cambiada | Configuración → Impresoras muestra el estado vivo y el motivo. |
| "Sin verificar" en Impresoras | El agente no puede alcanzarla | Revisar Red Local (macOS), misma red que el local, o usar el puente. |
| El puente no reclama trabajos | Token de puente vencido/revocado | Gestionar puentes y revalidar el código de vinculación. |
| Salen dos tickets | Diálogo abierto con cola pendiente | Confirmar el papel y no reabrir el diálogo (el aviso ya existe). |
| USB no imprime | La cola USB depende de CUPS/driver | Probar el test de impresión de Configuración → Impresoras. |

## 5. Verificación antes de entregar

- `npm test` (incluye `src/lib/printing/*.test.js` y `print-agent/test/*.mjs`).
- `npm run test:e2e` con `e2e/impresion-remota.spec.js` (puente, cola y UI).
- `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` si se tocó
  backend de impresión.
- Si se tocó `print-agent/`: `npm run pack:agent` y commitear
  `backend/public/print-agent/` (`npm run pack:agent:check` es el gate).
