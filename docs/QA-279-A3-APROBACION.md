# #279 · A3 — Presupuestos con aprobación autenticada (OTP + versión congelada + evidencia)

Extiende las cotizaciones actuales (enlace público + aceptar/rechazar +
conversión a pedido) con **aprobación autenticada**: el cliente revisa una
**versión congelada**, pide un **código OTP** a su correo o teléfono, lo
confirma y, recién ahí, MobOS **genera el pedido** con exactamente lo aprobado.
Todo queda con evidencia auditable (hash, fecha, método, desafío, firmante y
firma dibujada opcional). Una firma sola **no** autentica: la autenticación es
la posesión del contacto.

Referencia: `PLAN-ABASTECIMIENTO.md` §A3 (A1–A5) y #250.

## 1. Flujo

1. **Compartir** (WhatsApp/correo/QR) o el **primer acceso** al enlace congela
   una `QuoteVersion` con el contenido vigente y su hash sha256. El enlace
   siempre muestra esa versión (no el borrador vivo).
2. La tienda edita la cotización → al volver a compartir (o al primer acceso de
   un enlace sin versión) se congela una **versión nueva** si el contenido
   cambió; el cliente que tenía la página abierta recibe «hay una versión
   nueva, recargá» en lugar de aprobar algo que no vio.
3. **Pedir código** (`POST /api/quotes/public/:token/otp`): canales disponibles
   según los datos del cliente y el transporte activo. Correo: sale por la
   outbox transaccional. Teléfono: relay SMS/WhatsApp (Plataforma). El código
   vive hasheado (bcrypt), vence en 10 minutos, máximo 5 intentos, anti-spam de
   1 minuto y tope de 8 desafíos por hora.
4. **Aprobar** (`POST /api/quotes/public/:token/approve`): valida el código con
   el reloj de Postgres, consume el desafío, verifica que la versión siga siendo
   la vigente, guarda la **evidencia** y **crea el pedido** desde el snapshot.
   Nombre, documento y firma dibujada son opcionales.
5. La aceptación rápida legacy («Aceptar cotización») sigue disponible para
   enlaces ya enviados: marca `ACCEPTED` y **no** genera pedido ni evidencia.

## 2. Objetos y rutas

| Pieza | Dónde |
|---|---|
| Versión congelada / desafío / evidencia | `QuoteVersion`, `QuoteApprovalChallenge`, `QuoteApproval` (`Quote.version`) |
| Lógica pura (snapshot, hash canónico, OTP, máscaras, firma, huella) | `backend/lib/quote-approval.ts` |
| Conversión única a pedido (panel y aprobación pública) | `backend/lib/quote-conversion.ts` |
| Transporte OTP (outbox de correo; relay SMS si está configurado) | `backend/lib/otp-transport.ts` |
| Rutas públicas | `POST /api/quotes/public/:token/otp` · `POST /api/quotes/public/:token/approve` · `GET /api/quotes/public/:token` ampliado |
| Congelado al compartir | `access-token`, `email`, `message`, `PATCH` (SENT/contenido con enlace) |
| UI pública | `src/components/shared/AprobacionPresupuesto.jsx` + `CotizacionPublica.jsx` (versión, OTP, firma, evidencia) |
| UI del panel | `SellerQuotes.jsx` (el modal del enlace anuncia la aprobación con código y la versión) |

## 3. Evidencia (checks)

| Verificación | Resultado |
|---|---|
| Migración `20261229000000_quote_approvals` + `npm run db:check` | **la base coincide con el schema** |
| `npm --prefix backend run test:unit` | **114/114** + `quote-approval.test.ts: ok` |
| `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` | **PASS** · `quote-approval-otp.mjs` **39 chequeos** (OTP real descifrado de la outbox, evidencia, pedido, versión cambiada, reuso y negativos) |
| e2e `quote-approval-otp` (flujo real con la outbox del arnés + capturas) | **2/2** |
| Regresión e2e de cotizaciones y portal (`public-quote-transfer`, `qa-240-portal-cotizaciones`, `qa-260`, `qa-261`, `qa-250-cotizacion-correo` y `qa-278-cierre`) | **14/14** |
| `npm run test:e2e:smoke` | **verde (19 caminos críticos, exit 0)** |
| `npm test` (frontend) · `npm run lint` | **848/848** · **0 errores** |
| Builds FE y BE con `BUILD_ID` · `prisma:validate` | **OK** |

Capturas: `docs/qa/279-a3-aprobacion/` (revisión de versión, canal, código,
firma, evidencia y el caso «sin contacto»). Reproducir:

```sh
npx playwright test e2e/quote-approval-otp.spec.js
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

## 4. Coordinación y pendientes por dominio

- **PLT (transporte)**: para habilitar el OTP por **teléfono** hay que configurar
  `MOBOS_SMS_RELAY_URL` y `MOBOS_SMS_RELAY_TOKEN` (el backend ya postea el
  mensaje con `to`/`text`/`idempotencyKey` y el header `X-Mobos-Relay-Token`);
  sin relay el canal se informa como no disponible, nunca se finge el envío.
  El correo ya usa la outbox existente (kind `quote-approval-otp`).
- **CRM (portal)**: la cuenta del cliente ya enlaza a `/cotizacion/:token`. La
  aprobación autenticada deja `QuoteApproval` con `orderNumber`; el portal puede
  mostrar «Aprobada con código el …» leyendo `GET /api/quotes/public/:token`
  (`approval`) o su propia sección. Queda anotado para su slot.
- **DSN**: el PDF/QR de la proforma puede mencionar el código de aprobación en
  la leyenda («Aceptación en línea»); hoy el texto genérico sigue siendo válido.
- **Token del enlace**: se mantiene el token vigente (compatibilidad del QR ya
  impreso). Migrar el enlace al estándar de 64 hex + sha256 es una unidad de
  plataforma aparte (`docs/TOKENS.md`), fuera del alcance de A3.
