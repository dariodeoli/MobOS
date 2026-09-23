# Arranque del proyecto — reglas, objetos y estado

Documento de punto de entrada para retomar MobOS en otra computadora. El detalle operativo vive en `AGENTS.md`; este archivo lo resume, lista los objetos reutilizables y deja el mapa de lo implementado y lo pendiente (issues de GitHub).

## 1. Reglas por rol

### Para todos (orquestador, agentes e implementador)
- Cada pedido vive como **issue de GitHub** (backlog canónico): la abre el orquestador y se citan commits al entregar. Nada se trabaja “de memoria”.
- **Commits convencionales**, por unidad de trabajo, sin atribución de IA. No pushear secretos ni `.env`.
- **Migraciones** aditivas, idempotentes y re-ejecutables (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, etc.). Seeds con guards por conteo + `ON CONFLICT`.
- **Regla de oro de datos**: lo que el código guarda debe existir en la base y poder mostrarse. Tras cambiar el schema o agregar una migración: `npm run db:check` hasta que no haya diferencias.
- Campos de formulario: `docs/CAMPOS.md` (invocable como **rdi**; skill `.claude/skills/rdi`; plantilla portable `docs/PLANTILLA-CAMPOS.md`).
- Impresión, tokens, avatares, tablas: `docs/IMPRESION.md`, `docs/TOKENS.md`, `docs/AVATAR.md`, `docs/TABLAS.md`; inventario de objetos: `docs/PLANTILLA-OBJETOS.md`; prueba física y aplicación de #17: `docs/IMPRESION-PRUEBA-FISICA.md` y `docs/IMPRESION-17-LAUNCHD.md`.

### Orquestador (coordinación)
- Vive en `~/.herdr/worktrees/mobos/orquestador/` (sin repo): abre issues, elige slot, briefea, sigue handovers y ordena la integración; **no** mergea, no pushea, no despliega, no edita código. Topología: `docs/TOPOLOGIA.md`.

### Worktrees (agentes)
1. Solo tu rama y tu worktree. **Nunca** merge ni push a `main` (hook `pre-push` + protección de rama).
2. `git fetch origin && git rebase origin/main` antes de empezar y antes de entregar. Si el diff neto queda vacío, la rama está superseded: se descarta y se avisa.
3. Handover: rama, `git log --oneline origin/main..HEAD`, qué hace cada commit, rutas tocadas, verificaciones y el bloque **“Novedades para el dueño”** (2–5 bullets en lenguaje de producto, ver `docs/NOVEDADES.md`).
4. **Checks de entrega** (si falla uno, no se entrega): lint 0 · build front y backend con `backend/.next/BUILD_ID` · `npm --prefix backend run prisma:validate` · `npm test` + `npm --prefix backend run test:unit` · `rg "<<<<<<<" src backend e2e` sin resultados · reglas de rutas API (solo handlers, sin slugs duplicados, toda columna/modelo nuevo con migración) · `db:check` si se tocó el esquema · `npm run test:e2e:smoke` aislado.
5. **e2e aislado por worktree** (la base y los puertos se comparten):
   `MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama>`, `MOBOS_E2E_PGPORT=<55xx>`, `MOBOS_E2E_API_PORT=<31xx>`, `MOBOS_E2E_WEB_PORT=<52xx>`. Nunca dos worktrees con los mismos valores.
   El backend arranca con `next dev`; con `MOBOS_E2E_BACKEND=prod` (lo usa CI) arranca con `next start` sobre `backend/.next/BUILD_ID` y evita la compilación por ruta (menos timeouts en corridas lentas).
   En CI la suite corre en **3 shards** (`npx playwright test --shard=n/3`, matriz del workflow): cada shard baja a ~8-10 min. Los retries están limitados a la **cuarentena de flaky**: el workflow declara la lista en `MOBOS_E2E_CUARENTENA` y `e2e/helpers/cuarentena.mjs` habilita 1 retry solo a esos specs; el reporter deja `test-results/reporte-flaky.md|json` con los tests que reintentaron o fallaron.
6. Gate rápido durante el trabajo: `npm run test:e2e:smoke` (~20 s). Suite completa: del implementador antes del release.
7. Nunca matar procesos por puerto (pueden ser de otro agente). Limpiar solo los restos propios (`pg_ctl -D /tmp/mobos-e2e-pg-<rama> stop` y sus puertos).
8. Si quedan servidores propios, matarlos al terminar: `lsof -ti :<api> :<web> | xargs kill -9`.
9. Estado raro de git (refs rotas, fetch que falla, merge ajeno en curso): **parar y avisar**, no “arreglar” por cuenta propia.
10. No se deploya. `hd`/`hdd`/`ht` son exclusivos del implementador.

### Implementador (integrador)
1. Único que toca `main`: `MOBOS_INTEGRATOR=1 git push origin main`.
2. `hd` (rápido) y `hdd`/`ht` (completo): ciclos de integración + deploy; el detalle de cada modo está en `owncoding-ui/docs/COMANDOS.md` (v0.14.11, con el **glosario en simple** para el dueño). En ambos, preámbulo: matar servidores zombies del repo y verificar que no haya otro merge en curso.
3. Integrar de a una rama por vez (backend antes que frontend), verificando siempre: lint · builds con `BUILD_ID` · `npm test` + `test:unit` · `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` · los specs afectados del dominio (`npm run test:e2e:smoke` o el subset que corresponda). El `hdd` suma la suite e2e completa (gate de release).
4. Deploy: `MOBOS_INTEGRATOR=1 npm run release:publish` (bump patch + push + webhook Coolify) y, en el modo completo, `npm run release:smoke` para verificar producción.
5. Conflictos de merge: **parar y consultar**, nunca resolver en silencio. Rama superseded: resolver del lado de main y verificar diff neto vacío.
6. `npm run db:check` contra la base de producción antes de cerrar un deploy.
7. Sincronizar checkouts locales de `main` (ff-only) después del push. Cerrar issues solo verificando por contenido contra `origin/main` (citando el commit).
8. Refs rotas: backup a `/tmp` antes de tocar y reportar todo.
9. Sin `hd`/`hdd` (`ht`) no hay deploy, salvo pedido explícito de Dario.

## 2. Objetos predeterminados (reutilizar, no reinventar)

### Formularios — `docs/CAMPOS.md`
`PhoneField` (código de país editable + número con espacios), `EmailField` (sugerencia de dominio sin romper pegado), `InstagramField` (`@` fijo, sin espacios), `CityAutocomplete` (departamento automático), `PercentField` (coma decimal, 0–100), `SerialField` (mayúsculas sin separadores), `AttachmentInput` (JPG/PNG/WebP/PDF ≤5 MiB con validación en cliente y servidor), `CurrencySelect`, `ProductCombobox`, `BancoCombobox`/`BancoLogo`, `RangoFechas`, `SelectorMedioPago`, `NumericKeypad`, `SerialUnitPicker`, `MoneyInput`/`Money`, `PinInput`, `PasswordInput`, `SearchField` (búsqueda instantánea con limpiar), `Switch`/`Toggle` (booleanos) y el kit base (`Input`, `Textarea`, `Select`, `Label`, `FormField`, `Modal`, `Drawer`, `DataTable`, `PageHeader`, `SegmentedField`, `Subtabs`, `Badge`, `EmptyState`, `Skeleton`, toasts).

### Reglas transversales ya resueltas
- **Impresión** (`docs/IMPRESION.md` + `OrderReceipt.jsx`): niveles Rápido/Completo/Detallado, formatos A4 / 80 mm / 58 mm centrados con márgenes parejos, QR por nivel, `ComprobantePreview` (Pedidos ofrece A4 y 80 mm), impresión directa vía agente (`lib/printing/agent` + pantalla Impresoras) y etiquetas.
- **Tokens** (`docs/TOKENS.md`): 64 hex, solo `sha256` en la base, un solo uso atómico, reloj de Postgres, enlaces con respaldo visible.
- **QR públicos por nivel**: pedidos, garantías, cotizaciones (aceptar/rechazar) y remitos (recepción con foto), todos con token aleatorio no enumerable y regeneración que revoca.
- **Avatares** (`docs/AVATAR.md`): componente `Avatar` (foto subida → Google → iniciales). **Tablas** (`docs/TABLAS.md`).
- **Autorizaciones** (`CustomerAuthorization` + `lib/authorizations`): mayorista, crédito, días de crédito, descuentos, precio bajo lista, ajuste de stock, anulación de pedido, gasto sobre límite, transferencia y compra a crédito; un solo uso, 24 h, máximo autorizado y evento en cronología.
- **Cronologías** (`Cronologia.jsx`): clientes, productos, proveedores, cotizaciones, compras, caja, gastos y vendedores.
- **Adjuntos** (`Attachment` + `lib/attachment-storage`): volumen `MOBOS_STORAGE_DIR` con respaldo en base; gastos, compras, pagos a proveedor, arqueo de caja y remitos.
- **Exportaciones CSV** (`/api/exports/<módulo>`): clientes, unidades, compras, caja, garantías y comisiones, respetando filtros y rol.
- **Consistencia** (`stock-consistency.mjs` + `consistency-check.mjs`): stock vs unidades, espejo de seriales de venta, caja, créditos, comisiones, promociones y garantías.
- **Plantillas de WhatsApp** por contexto (clientes, pedidos, servicio técnico) administrables en Configuración con variables e interpolación.
- **Formularios de configuración**: `shared/PanelDerecho` (contenido a la izquierda y formulario fijo a la derecha en escritorio, apilado en móvil); usado en Equipo, Sucursales, Negocio e Identidad. Densidad y objetos: `docs/PLANTILLA-OBJETOS.md` (#147).
- **Demo pública**: modo local con guardia central en el cliente del API (`request`/`apiFetch` fallan con `DEMO_MODE`), presencia/avatares/logos sin red y aviso de guardado simulado; `docs/qa/196-demo/` guarda la evidencia del recorrido.

## 3. Estado, módulos y seguridad

- **Versión en `main`**: v1.0.129+ (release/deploy exclusivo del implementador). El detalle por versión, en lenguaje de negocio, vive en **`docs/NOVEDADES.md`**.
- **Módulos nuevos**:
  - **POS (`/pos`)**: carga de venta en **una sola pantalla** con carrito en el panel derecho; **pagos divididos** (varias cuentas/medios, moneda original + cotización, equivalente en Gs. y saldo); **entrega separada del pago** (retiro/delivery con estados); **borradores** con enlace público `/carrito/<token>` (solo `sha256` en la base, TTL 7 días con reloj de Postgres, revocable y con límite de uso); botón principal por estado (Confirmar venta / Crear pedido / Crédito) y comprobantes por nivel. El slug viejo `/ventas` redirige a `/pos`.
  - **Caja y finanzas (`/finanzas/*`)**: caja con **turnos por usuario** y arqueo por denominación (`/finanzas/caja`); **cuentas de cobro** con banco/logo y predeterminada (`/finanzas/bancos`); conciliación bancaria por importación de extracto; créditos y cuotas con recordatorios por WhatsApp; comisiones liquidadas por vendedor con comprobante y verificación pública por QR.
  - **Demo público (`/demo`)**: entrada anónima por perfiles (**Vendedor 2001 / Dueño 3001**) sin login; el panel corre en **modo demo sin tocar el API real** (guarda central en el cliente, más presencia/avatares/logos sin pedidos), banner de **“datos ficticios”** y aviso de guardado simulado. Verificación reutilizable: `node scripts/verificar-demo-publico.mjs` (apunta a producción; deja capturas y `resultados.json` con la versión desplegada y el listado de red).
  - **IMEI (#193, fase 1 con mocks)**: `backend/lib/imeicheck.ts` + `GET/POST /api/imei` con **precheck** (servicio, campos y **costo antes** de ejecutar) y **checks** solo con `confirm: true` e idempotencia por `requestId` (el clic repetido no vuelve a cobrar). La respuesta cruda solo la ven ADMIN/GERENTE y el IMEI se enmascara en listados; migración `imei_check_queries`, test `backend/tests/imeicheck.test.ts`. Se usa en recepción y Trade-In, sin cargos automáticos.
  - **Novedades para el dueño**: `docs/NOVEDADES.md` acumula por versión lo publicado, contado sin jerga; todo handover y todo cierre de issue incluye el bloque **“Novedades para el dueño”** (2–5 bullets) y el integrador actualiza el registro antes del release.
- **Seguridad** (detalle y evidencia en `docs/AUDITORIA-172.md`):
  - **Cerrado**: enlace público del borrador con TTL/reloj de Postgres, 410 al vencer, revocación auditada y límite de uso; reautenticación de cuenta con tope de intentos; cupo diario de `/api/errors`; demo pública que no toca el API; CORS con allow-list explícita (incluye `clientes.moboss.online`).
  - **Pendiente (reportado a otros dominios)**: tokens públicos legacy guardados en claro (plan de hash + rotación), rate limit en `public/orders`, `public/warranty` y `public/commission-settlements`, `Order.publicToken` legacy sin vencimiento y QR impreso sin TTL (documentar en `docs/IMPRESION.md`).
- **Pendientes al día**: viven como **issues de GitHub** (backlog canónico). Relevantes abiertos: **#148** épica POS, **#169** Lote 6-C (Finanzas y Reportes), **#185–#187/#198/#199** trackers de QA y endurecimiento, **#190/#193/#194/#195** demo completa e IMEIcheck, **#85** SIFEN, **#87** operativo Coolify, **#74** subdominio del portal, **#17/#3** impresión/AEX.

## 4. Retomar en otra computadora (checklist)
1. `git clone` + `git checkout main` (o tu rama de trabajo) e instalar dependencias: `npm ci` y `npm --prefix backend ci`.
2. `bash scripts/setup-hooks.sh` (pre-push que bloquea `main`).
3. Backend: `npm --prefix backend run prisma:generate` y variables en `backend/.env` (`DATABASE_URL`, `MOBOS_APP_URL`, `MOBOS_MAINTENANCE_TOKEN`, `MOBOS_STORAGE_DIR`, llavero de cifrado).
4. Verificar la base: `npm run db:check`; para producción, el implementador corre `npm run release:smoke`.
5. Leer `AGENTS.md` completo, este archivo, `docs/TOPOLOGIA.md` y `docs/NOVEDADES.md`; el resto de las reglas por objeto está en `docs/`.
6. Antes de tocar código: `git fetch origin --prune && git rebase origin/main`; e2e con las `MOBOS_E2E_*` únicas del worktree.
7. Para verificar la demo pública: `node scripts/verificar-demo-publico.mjs` (sale 1 si algún paso falla o si la demo toca el API real).
