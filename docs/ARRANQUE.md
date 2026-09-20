# Arranque del proyecto — reglas, objetos y estado

Documento de punto de entrada para retomar MobOS en otra computadora. El detalle operativo vive en `AGENTS.md`; este archivo lo resume, lista los objetos reutilizables y deja el mapa de lo implementado y lo pendiente (issues de GitHub).

## 1. Reglas por rol

### Para todos (agentes e implementador)
- Cada pedido vive como **issue de GitHub** (backlog canónico): se reclama al empezar y se citan commits al entregar. Nada se trabaja “de memoria”.
- **Commits convencionales**, por unidad de trabajo, sin atribución de IA. No pushear secretos ni `.env`.
- **Migraciones** aditivas, idempotentes y re-ejecutables (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, etc.). Seeds con guards por conteo + `ON CONFLICT`.
- **Regla de oro de datos**: lo que el código guarda debe existir en la base y poder mostrarse. Tras cambiar el schema o agregar una migración: `npm run db:check` hasta que no haya diferencias.
- Campos de formulario: `docs/CAMPOS.md` (invocable como **rdi**; skill `.claude/skills/rdi`; plantilla portable `docs/PLANTILLA-CAMPOS.md`).
- Impresión, tokens, avatares, tablas: `docs/IMPRESION.md`, `docs/TOKENS.md`, `docs/AVATAR.md`, `docs/TABLAS.md`; inventario de objetos: `docs/PLANTILLA-OBJETOS.md`.

### Worktrees (agentes)
1. Solo tu rama y tu worktree. **Nunca** merge ni push a `main` (hook `pre-push` + protección de rama).
2. `git fetch origin && git rebase origin/main` antes de empezar y antes de entregar. Si el diff neto queda vacío, la rama está superseded: se descarta y se avisa.
3. Handover: rama, `git log --oneline origin/main..HEAD`, qué hace cada commit, rutas tocadas y verificaciones.
4. **6 checks de entrega** (si falla uno, no se entrega): lint 0 · build front y backend con `backend/.next/BUILD_ID` · `npm --prefix backend run prisma:validate` · `npm test` + `npm --prefix backend run test:unit` · `rg "<<<<<<<" src backend e2e` sin resultados · reglas de rutas API (solo handlers, sin slugs duplicados, toda columna/modelo nuevo con migración).
5. **e2e aislado por worktree** (la base y los puertos se comparten):
   `MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama>`, `MOBOS_E2E_PGPORT=<55xx>`, `MOBOS_E2E_API_PORT=<31xx>`, `MOBOS_E2E_WEB_PORT=<52xx>`. Nunca dos worktrees con los mismos valores. En este worktree (mos-03): `5440 / 3003 / 5176`.
6. Gate rápido durante el trabajo: `npm run test:e2e:smoke` (~20 s). Suite completa: del implementador antes del release.
7. Nunca matar procesos por puerto (pueden ser de otro agente). Limpiar solo los restos propios (`pg_ctl -D /tmp/mobos-e2e-pg-<rama> stop` y sus puertos).
8. Si quedan servidores propios, matarlos al terminar: `lsof -ti :<api> :<web> | xargs kill -9`.
9. Estado raro de git (refs rotas, fetch que falla, merge ajeno en curso): **parar y avisar**, no “arreglar” por cuenta propia.
10. No se deploya. `ht` es exclusivo del implementador.

### Implementador (integrador)
1. Único que toca `main`: `MOBOS_INTEGRATOR=1 git push origin main`.
2. `ht`: ciclo de integración + deploy (preámbulo: matar servidores zombies del repo y verificar que no haya otro merge en curso).
3. Integrar de a una rama por vez (backend antes que frontend), verificando siempre: lint · builds con `BUILD_ID` · `npm test` + `test:unit` · `MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh` · `npm run test:e2e:smoke`. Con todo integrado: suite e2e completa (gate de release).
4. Deploy: `MOBOS_INTEGRATOR=1 npm run release:publish` (bump patch + push + webhook Coolify) y `npm run release:smoke` para verificar producción.
5. Conflictos de merge: **parar y consultar**, nunca resolver en silencio. Rama superseded: resolver del lado de main y verificar diff neto vacío.
6. `npm run db:check` contra la base de producción antes de cerrar un deploy.
7. Sincronizar checkouts locales de `main` (ff-only) después del push. Cerrar issues solo verificando por contenido contra `origin/main` (citando el commit).
8. Refs rotas: backup a `/tmp` antes de tocar y reportar todo.
9. Sin `ht` no hay deploy, salvo pedido explícito de Dario.

## 2. Objetos predeterminados (reutilizar, no reinventar)

### Formularios — `docs/CAMPOS.md`
`PhoneField` (código de país editable + número con espacios), `EmailField` (sugerencia de dominio sin romper pegado), `InstagramField` (`@` fijo, sin espacios), `CityAutocomplete` (departamento automático), `PercentField` (coma decimal, 0–100), `SerialField` (mayúsculas sin separadores), `AttachmentInput` (JPG/PNG/WebP/PDF ≤5 MiB con validación en cliente y servidor), `CurrencySelect`, `ProductCombobox`, `RangoFechas`, `SelectorMedioPago`, `NumericKeypad`, `SerialUnitPicker`, `MoneyInput`/`Money`, `PinInput`, `PasswordInput`, y el kit base (`Input`, `Textarea`, `Select`, `Label`, `FormField`, `Modal`, `Drawer`, `DataTable`, `PageHeader`, `Badge`, `EmptyState`, `Skeleton`, toasts).

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

## 3. Estado y pendientes

- **Versión en `main`**: v1.0.109+ (release/deploy exclusivo del implementador).
- **Implementado y mergeado (últimas tandas)**: pedidos (tabla sin scroll, búsqueda y filtros server-side, códigos `PREFIX-#0001`, usuario real en pagos, estado “Listo p/ enviar”), comprobantes y QR por nivel, pantalla de carga premium, listas de precios por cliente/categoría con escalones, portal del cliente por QR, búsqueda global ampliada, cronologías, adjuntos, exportaciones, autorizaciones con límites por empresa, consistencia.
- **Última tanda (MOS-03)**:
  - **Campañas de recompra (#82)**: `GET/POST /api/customers/segments` (ADMIN/GERENTE) con segmentos SQL `inactivos6m`, `mayoristasDormidos` y `deudoresAlDia` (tope 200). En Clientes, pestaña **Campañas** con selección de destinatarios, vista previa de la plantilla CUSTOMERS, envío por `wa.me` de a uno y marca `marketingContactedAt` en la ficha (respeta `acceptsWhatsappMarketing`). El segmento `cumpleanos` queda pendiente: `Customer` todavía no tiene fecha de nacimiento.
  - **Búsqueda difusa (#84)**: `pg_trgm` + índices GIN en `Product.name`, `Customer.name`, `Order.orderNumber` y `OrderItemSerial.serial`. Medición del arnés (`backend/tests/pg-trgm.mjs`, 20.000 filas): `ILIKE '%texto%'` ~6,4 ms → ~0,6 ms (~10×); alta de a una fila sin penalidad medible y carga masiva ~25 ms → ~103 ms. Se conservan los índices por la ganancia de lectura.
  - **USB directo del agente (#96/#23)**: detrás de `usb: true` en `config.json` o `--usb`; detección por VID/PID, escritura ESC/POS directa y fallback automático USB → CUPS → LAN. `/health` reporta `usb: { disponible, vid, pid, transporte }` y `/diagnostico` el motivo cuando no está disponible. `node-usb` es dependencia opcional: sin ella el agente arranca igual. Lógica y cadena de transporte probadas sin hardware (`print-agent/test/usb.test.mjs`); falta la prueba física con la ZKP8008 (`print-agent/USB-DIRECTO.md`).
- **Pendiente en el backlog** (issues de GitHub): #81 cobranzas por WhatsApp · #83 liquidación de comisiones con comprobante · #85 SIFEN (facturación electrónica) · #86 POS offline-first · #87 operativo Coolify (volumen `MOBOS_STORAGE_DIR` + scheduler con `MOBOS_MAINTENANCE_TOKEN`) · #88 este compendio.
- **Otros issues abiertos de otros agentes**: #21 logo de empresa (variantes), #22 foto de perfil, #24 checklists de Servicio Técnico, #56 comisiones en Finanzas, #60–#65 mejoras de auditoría, #66 bug de la página de pedido del cliente.

## 4. Retomar en otra computadora (checklist)
1. `git clone` + `git checkout main` (o tu rama de trabajo) e instalar dependencias: `npm ci` y `npm --prefix backend ci`.
2. `bash scripts/setup-hooks.sh` (pre-push que bloquea `main`).
3. Backend: `npm --prefix backend run prisma:generate` y variables en `backend/.env` (`DATABASE_URL`, `MOBOS_APP_URL`, `MOBOS_MAINTENANCE_TOKEN`, `MOBOS_STORAGE_DIR`).
4. Verificar la base: `npm run db:check` y `npm run release:smoke` para producción.
5. Leer `AGENTS.md` completo y este archivo; el resto de las reglas por objeto está en `docs/`.
