# Empezá acá — MobOS

Todo lo que necesita saber una persona o un agente que llega nuevo (o que cambia
de computadora): cómo se trabaja, quién hace qué, qué objetos ya existen para no
inventar nada, cómo se verifica y qué está pendiente. Los documentos detallados
están enlazados al final de cada sección.

---

## 1. Qué es y cómo está armado

- **MobOS**: sistema de ventas, stock, caja, clientes y posventa para tiendas de
  celulares. Front en React + Vite, API en Next.js + Prisma/PostgreSQL.
- **Rutas visibles**: `app.moboss.online` (panel), `clientes.moboss.online`
  (portal: `/cuenta/:token`, `/portal/:token`, `/pedidos/:token`),
  `moboss.online` (landing), `api.moboss.online` (API), **`/demo`** (demo pública
  anónima), `/status` (estado) y las páginas públicas por token:
  `/pedidos/:token` (canónica; `/pedido/:token` y `/p/:token` redirigen),
  `/carrito/:token` (borrador compartido), `/garantia/:token`,
  `/cotizacion/:token`, `/remito/:token`, `/u/:serial`.
- **Módulos nuevos**: POS (`/pos`, una pantalla con split y entrega separada),
  caja y finanzas (`/finanzas/*`), demo pública (`/demo`, sin API real), IMEI
  (`/api/imei`, fase 1 con mocks) y el registro `docs/NOVEDADES.md` para el
  dueño. Detalle y estado: `docs/ARRANQUE.md`.
- **Comandos**: `npm run dev` · `npm test` · `npm run lint` · `npm run build` ·
  `npm run test:e2e:smoke` · `npm run test:e2e` · `npm run db:check` ·
  `npm --prefix backend run test:unit` · `npm --prefix backend run build` ·
  `npm --prefix backend run prisma:validate` · `npm run pack:agent` ·
  `npm run release:prepare|publish|smoke` · `node scripts/verificar-demo-publico.mjs`.
- **Docs**: `AGENTS.md` (reglas), `docs/CAMPOS.md` (campos), `docs/PLANTILLA-CAMPOS.md`,
  `docs/PLANTILLA-AGENTS.md`, `docs/PLANTILLA-OBJETOS.md`, `docs/TABLAS.md`,
  `docs/TOKENS.md`, `docs/IMPRESION.md`, `docs/AVATAR.md`, `docs/BACKUP.md`,
  `docs/REDISENO.md`, `docs/NOVEDADES.md` (novedades por versión para el dueño).

## 2. Reglas de trabajo (resumen; el detalle está en `AGENTS.md`)

- **Worktree = agente.** Cada agente trabaja **solo** en su worktree y su rama;
  pushea a `origin/<su-rama>`.
- **`main` es del integrador.** Ningún agente mergea, edita ni pushea a `main`.
  El hook `pre-push` lo bloquea salvo `MOBOS_INTEGRATOR=1`. Instalarlo una vez
  por checkout: `bash scripts/setup-hooks.sh`.
- **Antes de tocar archivos**: `git fetch origin --prune && git rebase origin/main`.
  Trabajar sobre `main` viejo es la causa número uno de reparaciones.
- **Conflictos de merge**: se resuelven en la rama propia; si hay trabajo real en
  conflicto, **se para y se consulta**. Nunca en silencio.
- **Commits**: uno por unidad de trabajo, convencionales, sin atribución de IA,
  sin bump de versión. Nunca secretos ni `.env`.
- **Entrega (handover)**: pushear la rama y avisar con rama, `git log --oneline
  origin/main..HEAD`, qué hace cada commit, rutas tocadas y resultado de cada check.
- **"Integrado" se verifica por contenido** contra `origin/main`
  (`git merge-base --is-ancestor <sha> origin/main` + `git show origin/main:<ruta>`),
  nunca de memoria.
- **Estado raro de git** (refs rotas, un merge ajeno en curso, la rama del
  worktree cambiada por otro agente): **parar y avisar**. No borrar ni "arreglar"
  refs por cuenta propia.
- **e2e**: aislar siempre con `MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama>`,
  `MOBOS_E2E_PGPORT=55xx`, `MOBOS_E2E_API_PORT=31xx`, `MOBOS_E2E_WEB_PORT=52xx`
  únicos. Nunca dos worktrees con los mismos valores. No matar procesos por puerto
  (pueden ser de otro agente).

## 3. El integrador (dueño del release)

**Hace**: correr `hd` (rápido: matar zombies del repo, `fetch --prune`,
integrar **una rama por vez**, backend antes que frontend; verificar con lint,
builds, tests e integración **+ los specs afectados**; pushear `main` con
`MOBOS_INTEGRATOR=1` y releasear) o `hdd`/`ht` (completo: lo anterior + suite
e2e completa, CI verde, `npm run release:smoke` y cierre de issues **solo
después de verificar por contenido**). El detalle de cada modo —y el glosario en
simple para el dueño— está en `owncoding-ui/docs/COMANDOS.md` (v0.14.11).
**No hace**: resolver conflictos en silencio, integrar sin verificar, tocar ramas
de otros sin avisar.

**Los agentes NO deployan.** El deploy es exclusivo del integrador con
`npm run release:publish` (bump de patch + push + webhook de Coolify).

## 4. Checks obligatorios antes de entregar (si falla uno, no se entrega)

1. `npm run lint` con 0 errores.
2. `npm run build` **y** `npm --prefix backend run build` exit 0 con
   `backend/.next/BUILD_ID` creado (el build falla aunque imprima "Compiled successfully").
3. `npm --prefix backend run prisma:validate`.
4. `npm test` y `npm --prefix backend run test:unit` en verde.
5. `rg "^<{7}" src backend e2e` sin resultados (marcadores de conflicto).
6. Si tocaste API/esquema: no exportar símbolos que no sean handlers, no duplicar
   slugs dinámicos, toda columna/modelo nuevo exige su **migración aditiva,
   idempotente y re-ejecutable**; seeds con guards por conteo + `on conflict do
   nothing` (nunca "si el dato no existe, salir"). Después: `npm run db:check`.
7. Si tocaste `print-agent/`: `npm run pack:agent` y commitear
   `backend/public/print-agent/` (gate anti-drift: `npm run pack:agent:check`).

## 5. Objetos predeterminados (usar antes de crear)

Regla madre: **buscar antes de crear**; si existe, se reutiliza; si falta, se crea
en el módulo compartido y se adopta en todos los lugares. Hay **tests de aserción
de fuente** (`src/lib/camposReglas.test.js`) que fallan si alguien reimplementa un
campo suelto.

| Necesidad | Objeto | Ruta |
| --- | --- | --- |
| Correo | `EmailField` (sugiere dominios) | `src/components/shared/EmailField.jsx` |
| Teléfono | `PhoneField` (+ `parseTelefono`) | `src/components/shared/PhoneField.jsx` |
| Serial / IMEI | `SerialField`, `SerialTexto` | `src/components/shared/` |
| Porcentaje | `PercentField` | `src/components/shared/PercentField.jsx` |
| RUC / CI | `RucField` (+ extractor) | `src/components/shared/RucField.jsx` |
| Ciudad | `CityAutocomplete` | `src/components/shared/CityAutocomplete.jsx` |
| Moneda | `MoneyInput`, `Money`, `CurrencySelect` | `src/components/ui`, `src/components/shared/` |
| Instagram | `InstagramField` | `src/components/shared/` |
| Contraseña / PIN | `PasswordInput`, `PinInput` (asteriscos) | `src/components/ui/index.jsx` |
| Patrón 3×3 | `PatronDesbloqueo` | `src/components/shared/PatronDesbloqueo.jsx` |
| Esquema del equipo | `EsquemaEquipo` | `src/components/shared/EsquemaEquipo.jsx` |
| Subir archivos/fotos | `AttachmentInput` (input oculto + botón en español), `PhotoCropper` | `src/components/shared/` |
| Avatares de personas | `ActorAvatar` | `src/components/customers/ActorAvatar.jsx` |
| Botones, inputs, modal, badges, tablas, estados | kit base | `src/components/ui/index.jsx` |
| Selección en lote | `BarraLote` + `seleccionLote` | `src/components/shared/`, `src/lib/` |
| Impresión | `OrderReceipt`, `servicioImpresion`, `printing/tickets`, `printing/agent` | `src/components/shared/`, `src/lib/` |
| Campos de servicio | `servicioChecklist` | `src/lib/servicioChecklist.js` |
| Logo / prompt de logo | `logoPrompt`, `tenantLogo` | `src/lib/` |
| Recorte y compresión de fotos | `recorte`, `imagen` | `src/utils/` |
| Roles y permisos | `roles` (front), `auth` (API) | `src/lib/roles.js`, `backend/lib/auth.ts` |
| Cifrado de secretos | `secret-crypto` (PIN/patrón del equipo) | `backend/lib/secret-crypto.ts` |
| Números de pedido / servicio | `order-number`, `service-number` | `backend/lib/` |

Reglas transversales: label arriba, error **o** hint (nunca ambos),
`aria-invalid`/`aria-describedby`, error con `role="alert"`, validar en `blur`,
obligatorio con `required` real, **el backend revalida siempre**. Colores solo
desde tokens (`src/index.css` + `tailwind.config.js`), nunca `#hex` ni estilos
inline salvo valores dinámicos. Todo control mutante nace con gate de rol y el
backend revalida; los campos sensibles llegan en `null` a quien no puede verlos.

## 6. Base de datos y datos críticos

- Migraciones **aditivas, idempotentes y re-ejecutables** (`ADD COLUMN IF NOT
  EXISTS`, `DROP INDEX IF EXISTS` + recrear). `CREATE TABLE IF NOT EXISTS` sobre
  algo ya creado es **no-op** y deja columnas afuera.
- Después de cambiar el esquema o agregar una migración: `npm run db:check`
  (compara la base real contra `schema.prisma` y muestra el SQL que falta).
- En producción, el integrador corre `db:check` **antes** de dar por cerrado un deploy.
- Dinero: idempotencia, snapshots inmutables de comprobantes
  (`Order.receiptSnapshot`), transiciones monotónicas; si un dato no está
  disponible se informa, no se inventa.

## 7. Entornos y seguridad

- **Secretos**: solo en el gestor de variables del entorno (Coolify). Nunca en
  Git, frontend, logs ni documentación. `backend/.env` está gitignoreado.
- **Sesiones**: cookies HttpOnly; roles y permisos en el servidor; multi-tenant
  por `tenantId` en cada consulta; anti-enumeración; rate limits; auditoría
  (`AuditLog`) en accesos, permisos, ajustes, acciones financieras y bajas.
- **Cifrado**: los secretos operativos (PIN/patrón del equipo) se guardan con
  `backend/lib/secret-crypto.ts` (AES-256-GCM con el llavero del entorno, AAD
  atado a la fila); solo los roles definidos los ven.
- Personas: identidad por ID, avatar compartido (`Avatar`/`ActorAvatar`), fotos
  comprimidas y recortadas antes de subir.
- **Seguridad restante** (auditoría `docs/AUDITORIA-172.md`):
  - **Cerrado**: enlace público del borrador con TTL/reloj de Postgres, 410 al
    vencer, revocación auditada y límite de uso; reautenticación de cuenta con
    tope de intentos; cupo diario de `/api/errors`; demo pública sin llamadas al
    API real; CORS con allow-list explícita (incluye `clientes.moboss.online`).
  - **Pendiente (dominios CRM/POS/FIN)**: tokens públicos legacy guardados en
    claro (plan de hash + rotación); rate limit en `public/orders`,
    `public/warranty` y `public/commission-settlements`; `Order.publicToken`
    legacy sin vencimiento; QR impreso sin TTL (documentar en
    `docs/IMPRESION.md`).

## 8. Pendientes al día de hoy

Los pendientes viven como **issues de GitHub** (backlog canónico). Al día de esta
actualización, lo abierto relevante es:

- **#148** Épica POS completo (spec de Dario) y **#169** Lote 6-C (Finanzas y
  Reportes): rediseño por lotes en curso.
- **Trackers de QA**: **#185/#187** recorridos en producción por módulos,
  **#198** verificación post-deploy del demo público, **#199** ola de
  endurecimiento (e2e estable, accesibilidad, docs y cierres por dominio).
- **Demo**: **#190/#194/#195** datos de demo al día por dominio (INV) y
  **#196** verificación técnica (script `scripts/verificar-demo-publico.mjs`).
- **IMEI**: **#193** IMEIcheck (fase 1 con mocks ya en `main`; fase 2 con
  proveedor real y sin cargos automáticos).
- **Infra/proyectos**: **#87** volumen `MOBOS_STORAGE_DIR` + scheduler en
  Coolify, **#74** subdominio del portal con rewrite, **#85** SIFEN
  (facturación electrónica), **#17** impresión launchd/CUPS, **#3** AEX.
- Cierres por dominio: los issues entregados se cierran **solo tras verificar
  por contenido contra `origin/main`** (citando el commit), como fija
  `AGENTS.md`.

## 9. Arrancar en una computadora nueva

1. Clonar el repo e instalar: `npm install` y `npm --prefix backend install`.
2. Crear `backend/.env` con las variables del entorno (pedirlas al dueño; nunca
   versionarlas). Mínimas: `DATABASE_URL`, `MOBOS_APP_URL`, correo, AEX, llavero
   de cifrado.
3. Instalar hooks: `bash scripts/setup-hooks.sh`.
4. Verificar herramientas: `gh auth status` (issues), `npm run prisma:validate` y
   `npm --prefix backend run prisma:generate`.
5. Chequeo rápido: `npm run lint`, `npm test`, `npm run build`.
6. Para e2e locales: exportar las `MOBOS_E2E_*` únicas de tu worktree.
7. Antes de tocar código: `git fetch origin --prune && git rebase origin/main`.

## 10. Impresión (resumen)

Agente local `print-agent/` (ESC/POS, USB/LAN) + página
`Configuración → Estado de impresión` + tickets (`printing/tickets.js`) y hojas
(`OrderReceipt`, `servicioImpresion`). Reglas y diagnóstico: `docs/IMPRESION.md`.
El artefacto distribuible vive en `backend/public/print-agent/` y se regenera con
`npm run pack:agent`.
