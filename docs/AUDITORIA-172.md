# Auditoría de seguridad #172 — superficies públicas nuevas

Revisión autorizada por Dario (POS completo: borradores, portal, tokens).
Alcance: enlace público de borradores (#154), portal de clientes y páginas
públicas, endpoints nuevos del POS (split, caja, drafts) y tokens impresos.
Reglas de referencia: `docs/TOKENS.md`, `docs/IMPRESION.md`, `docs/AVATAR.md`.

**Convención de severidad:** Alta = exposición de datos de clientes o acciones
destructivas alcanzables; Media = defensa en profundidad o fuerza bruta viable;
Baja = higiene/abuso de recursos.

## Hallazgos

| # | Sev. | Superficie | Hallazgo | Estado |
| --- | --- | --- | --- | --- |
| 1 | **Alta** | Borrador (#154) | El enlace público no vencía: `SuspendedSale` no tenía `publicTokenExpiresAt` y el GET solo buscaba por hash. Un enlace filtrado abría el carrito (cliente, ítems, precios, totales) para siempre. | **Corregido** (este repo) |
| 2 | **Media** | Reautenticación de cuenta | `POST /api/account` no limitaba intentos; en tiendas Google acepta el **PIN del dueño** (4-6 dígitos) para habilitar 10 min de acciones sensibles (archivar/eliminar empresa, exportar datos, revocar sesiones): fuerza bruta viable desde una sesión robada. | **Corregido** (este repo) |
| 3 | **Media** | Portal/páginas públicas | Tokens públicos legacy guardados **en claro** (cuid/UUID/base64url) y sin formato 64-hex: `Quote.publicToken`, `StockTransfer.publicToken`, `Order.publicToken`, `WarrantyCase.publicToken`, `CustomerPortalToken.token`, `OrderAccessToken.token`, `CommissionSettlement.verificationToken`. Un dump de esas tablas expone enlaces válidos. Los tokens nuevos del borrador sí cumplen (solo `sha256`). | **Reportado** — plan de hash + rotación (CRM/POS/FIN) |
| 4 | **Media** | Portal/páginas públicas | Tres endpoints públicos sin `enforceRateLimit`: `public/orders/[token]`, `public/warranty/[token]`, `public/commission-settlements/[token]`. Portal, quotes y transfers sí lo tienen (30/min). Sin límite son superficie de scraping y fuerza bruta distribuida. | **Reportado** — CRM/POS/FIN |
| 5 | **Baja** | Páginas públicas | `Order.publicToken` legacy (QR viejo, nivel `rapido`) no vence ni se revoca por separado; se mantiene por compatibilidad de comprobantes impresos. El acceso vigente (`OrderAccessToken`) sí es revocable por nivel. | **Reportado** — CRM |
| 6 | **Baja** | Tokens impresos | `OrderAccessToken.impreso=true` no vence (por diseño: el papel no puede expirar) y solo se invalida con `revokeAll` (“Regenerar acceso QR”). Falta documentar el procedimiento en `docs/IMPRESION.md`. | **Reportado** — POS/DSN |
| 7 | **Baja** | API pública interna | `POST /api/errors` (sin sesión) escribe filas de hasta ~10 KB con 30 req/min por IP: vector de spam de almacenamiento. Mitigado por el límite; opcional: cupo diario por IP. | **Reportado** — PLT (mejora opcional) |
| 8 | Info | POS | `POST /api/orders` fuerza `sellerId = session.user.id`, firma `createdById/userId` en cada pago y audita `ORDER_*` con el actor real; `cash` exige `cash:manage`/`payments:manage` y audita con el actor; `payments` y `orders/[orderId]` usan `canAccessAny`/`canAccessOrder`; `normalizePayment` valida cuenta del tenant, moneda, cotización y rangos. | Sin hallazgos |
| 9 | Info | Auth/PIN | `/api/auth/pin` limita 20 intentos/15 min por IP, bloquea 5 fallos y audita (`SELLER_PIN_*`); el PIN exige sesión de empresa. `pinLength` viaja al panel solo para el auto-envío (#158), no revela el PIN. | Sin hallazgos |
| 10 | Info | Middleware | CORS con allow-list explícita (sin comodines), `Cache-Control: no-store` y headers de seguridad en todas las respuestas de `/api/*`; el salto interno regenera `x-mobos-pass`/cookies y no es forjable desde afuera. | Sin hallazgos |
| 11 | Info | Borrador | La vista pública no expone costos, teléfono/documento del cliente, notas internas ni el `payload`; la observación expuesta es la nota de entrega (pública por diseño). Verificado por test. | Sin hallazgos |

## Correcciones aplicadas

1. **Vencimiento del enlace del borrador** (`backend/app/api/suspended-sales/`):
   - Columna `SuspendedSale.publicTokenExpiresAt` (migración aditiva
     `20261108000000_suspended_sale_token_expiry`).
   - Emisión y validación con el **reloj de Postgres** (`now() + make_interval(days => 7)`,
     `"publicTokenExpiresAt" <= now()`), TTL **7 días**; el GET devuelve **410** al
     vencer y `expiresAt` en la vista (`CarritoPublico` lo muestra).
   - Límite de uso: `enforceRateLimit('suspended-public', 30/min por IP)`.
   - Revocación explícita (`PATCH { id, revoke: true }`, auditada
     `SALE_PUBLIC_LINK_REVOKED`); regenerar sigue invalidando el anterior.
2. **Reautenticación de cuenta** (`backend/app/api/account/route.ts`):
   `enforceAuthRateLimit('account-reauth', 8)` → 429 con `Retry-After`.

## Evidencia reproducible

- `node backend/tests/suspended-sales-public.mjs` → **20 checks OK**: token de
  64 hex, solo `sha256` en la base, TTL 7 días con reloj de Postgres, 410 al
  vencer, 404 al regenerar/revocar o con formato inválido, sin teléfono/notas
  internas/costos/hash en la vista, 404 entre tiendas y auditoría con actor real.
- `e2e/pos-checkout.spec.js` (#154) y `e2e/seguridad-cuenta.spec.js` siguen
  verdes en la suite completa.

## Pendientes para otros slots (a rutear por el orquestador)

- **CRM/POS/FIN (#3, #4):** hash de tokens públicos legacy + rate limit en los
  tres endpoints públicos sin límite. El patrón correcto ya existe
  (`SuspendedSale.publicTokenHash` + `docs/TOKENS.md`).
- **POS/DSN (#6):** documentar en `docs/IMPRESION.md` que el QR impreso no vence
  y cómo reimprimirlo.
- **POS (#5) y PLT opcional (#7):** evaluación de expiración del token legacy y
  cupo diario del endpoint de errores.
