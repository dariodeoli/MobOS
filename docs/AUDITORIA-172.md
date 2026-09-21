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
| 3 | **Media** | Portal/páginas públicas | Tokens públicos legacy guardados **en claro** (cuid/UUID/base64url) y sin formato 64-hex: `Quote.publicToken`, `StockTransfer.publicToken`, `WarrantyCase.publicToken`, `CustomerPortalToken.token`, `OrderAccessToken.token`, `CommissionSettlement.verificationToken`. Un dump de esas tablas expone enlaces válidos. Los tokens nuevos del borrador sí cumplen (solo `sha256`). | **Parcial** — pedidos, liquidaciones, garantías y portal ya validan por `sha256` con backfill (ronda 1/2, slots CRM/POS/FIN). **Quedan `Quote.publicToken` y `StockTransfer.publicToken` en claro** (ruta + rotación pendientes) |
| 4 | **Media** | Portal/páginas públicas | Tres endpoints públicos sin `enforceRateLimit`: `public/orders/[token]`, `public/warranty/[token]`, `public/commission-settlements/[token]`. Portal, quotes y transfers sí lo tienen (30/min). Sin límite son superficie de scraping y fuerza bruta distribuida. | **Corregido** — los tres tienen límite (30–60/min por IP verificada) |
| 5 | **Baja** | Páginas públicas | `Order.publicToken` legacy (QR viejo, nivel `rapido`) no vence ni se revoca por separado; se mantiene por compatibilidad de comprobantes impresos. El acceso vigente (`OrderAccessToken`) sí es revocable por nivel. | **Aceptado** — `Order.publicTokenHash` + `publicTokenIssuedAt` existen; el enlace legacy se valida por hash y la rotación del QR impreso es explícita (POS/DSN) |
| 6 | **Baja** | Tokens impresos | `OrderAccessToken.impreso=true` no vence (por diseño: el papel no puede expirar) y solo se invalida con `revokeAll` (“Regenerar acceso QR”). Falta documentar el procedimiento en `docs/IMPRESION.md`. | **Corregido** — procedimiento documentado en `docs/IMPRESION.md` (§2) |
| 7 | **Baja** | API pública interna | `POST /api/errors` (sin sesión) escribe filas de hasta ~10 KB: vector de spam de almacenamiento. | **Corregido** — cupo diario por IP (300) además del minuto (30) |
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
3. **Cupo diario del reporte de errores** (`backend/app/api/errors/route.ts`):
   además de la ráfaga por minuto (30), `enforceRateLimit('errors-daily', 300,
   24 h)`; el cupo se evalúa antes del minuto, así todo intento cuenta para el
   día. Los topes se ajustan por entorno (`MOBOS_ERRORS_MINUTE_MAX` /
   `MOBOS_ERRORS_DAILY_MAX`) para las pruebas. Test:
   `backend/tests/errors-quota.test.ts`.

## Evidencia reproducible

- `node backend/tests/suspended-sales-public.mjs` → **20 checks OK**: token de
  64 hex, solo `sha256` en la base, TTL 7 días con reloj de Postgres, 410 al
  vencer, 404 al regenerar/revocar o con formato inválido, sin teléfono/notas
  internas/costos/hash en la vista, 404 entre tiendas y auditoría con actor real.
- `e2e/pos-checkout.spec.js` (#154) y `e2e/seguridad-cuenta.spec.js` siguen
  verdes en la suite completa.

## Pendientes para otros slots (a rutear por el orquestador)

- **POS/FIN (#3):** `Quote.publicToken` y `StockTransfer.publicToken` siguen en
  claro y se validan por igualdad. Patrón a seguir: `publicTokenHash` (sha256) +
  backfill en la primera lectura + rotación (ya lo hacen pedidos, garantías,
  portal y liquidaciones). Nota: el seguimiento de pedido todavía devuelve el
  `publicToken` de la garantía asociada; al rotar garantías deja de exponerse.
- **POS (#5):** el token legacy del pedido queda aceptado por compatibilidad de
  comprobantes impresos (hash + emisión registrados, rotación explícita).

## Ronda 2 (#204) — demo, sesión/PIN

### Hallazgo 12 (Media, demo) — datos ficticios persistidos en el navegador

**Síntoma:** el demo prometía “nada se guarda”, pero los módulos demo escribían
datos ficticios en `localStorage` (12 claves `mobos:demo-*`: clientes, caja,
promociones, garantías, compras, conciliación, servicio, trade-ins, tenant,
cuentas de pago, empresas, marcas de auditoría de caja) y en IndexedDB
(`mobos-demo-proofs`, comprobantes de pago). Un guardado sobrevivía a la
recarga —incluidos nombre/teléfono escritos por quien prueba— y el carrito del
POS y los pre-clientes también quedaban guardados.

**Corregido en este repo:**
- `src/lib/demoStorage.js`: almacenamiento con memoria por pestaña. En runtime
  demo (`isDemoRuntime`) **nunca** toca `localStorage`; fuera de la demo delega
  en `localStorage` (offline/legacy siguen igual). El seed arranca siempre limpio
  y al recargar se descarta todo.
- Los 12 módulos demo + `posCart`, `preClientes` y `demoProofs` (IndexedDB) usan
  el shim. El POS demo guarda el cliente nuevo con `guardarClienteDemo()`.
- También se dejaron solo en memoria las dos claves heredadas que escribía la
  sesión demo: `fono:sucursal` (la sucursal ficticia) y `fono:ultimoVendedor`
  (el último vendedor elegido en el POS).
- Verificado que la cola offline del POS (`mobos-offline`) no se activa en demo:
  el enqueue está detrás de `!esDemo` y, aunque hubiera pendientes de una sesión
  real anterior, la barrera corta el API. `guardarSnapshotCatalogo` solo corre en
  hidratación de API.
- Verificación: `e2e/demo-anonimo.spec.js`, test “la demo no deja datos en el
  navegador ni toca la base”: tres guardados (integrante, plantilla, garantía),
  0 claves `mobos:demo-*`/`fono:*` en `localStorage`, 0 bases IndexedDB de demo,
  0 llamadas al API y **conteo de filas idéntico** antes/después en
  `User`, `Order`, `Customer`, `SuspendedSale`, `WarrantyCase` y
  `MessageTemplate` (base del harness). El test de recarga confirma que el seed
  vuelve.

### Hallazgo 13 (Baja, sesión) — el bloqueo de pantalla se saltaba con F5

**Síntoma:** el bloqueo del POS (#158) vivía solo en el estado de React: una
recarga dejaba la sesión abierta sin pedir el PIN.

**Corregido:** marca `mobos:pos-bloqueado` en `sessionStorage` (muere con la
pestaña): se escribe al bloquear, se limpia al desbloquear, al cambiar de
usuario y al salir. `e2e/sesion-bloqueo.spec.js` verifica que tras F5 el PIN
sigue siendo obligatorio y que desbloqueado una recarga ya no bloquea.

### Revisión de sesión/PIN (sin cambios)

- `/api/auth/pin`: 20 intentos/15 min por IP **verificada** (`trustedClientIp`
  usa el hop derecho de `x-forwarded-for`; sin proxy confiable no limita, para
  no dejar que un header forjado elija el bucket), bloqueo por usuario a los
  `MAX_FAILED_ATTEMPTS` fallos con `lockedUntil`, bcrypt por usuario, PIN 4–6,
  auditoría en todos los caminos (`SELLER_PIN_FAILED/LOCKED/BLOCKED/VERIFIED/
  UNKNOWN/DUPLICATED`) y sesión nueva hasheada.
- Cookie de sesión: `httpOnly`, `secure` (según entorno), `SameSite=Lax`,
  `path=/`, 7 días; `Session.tokenHash` (sha256) y `revokedAt`; logout revoca en
  la base; `sameOrigin` para cookies (sin tokens en claro).
- WhatsApp/estado: el desbloqueo usa el API real (`loginSeller`), no una
  comparación local; en demo usa los PIN ficticios 2001/3001.
- **Residual aceptado:** `/api/auth/login` limita 20/15 min por IP pero no
  bloquea por cuenta (evita negación de servicio a usuarios legítimos). La
  elevación por PIN no aporta privilegio extra: requiere sesión de empresa, que
  ya es de nivel propietario.
